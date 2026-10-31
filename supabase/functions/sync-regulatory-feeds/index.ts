import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sources = [
  {
    key: "kasneb",
    name: "KASNEB",
    feedUrl: "https://www.kasneb.or.ke/rss.xml",
    host: "www.kasneb.or.ke",
  },
  {
    key: "tveta",
    name: "TVETA",
    feedUrl: "https://www.tveta.go.ke/feed/",
    host: "www.tveta.go.ke",
  },
  {
    key: "helb",
    name: "HELB",
    feedUrl: "https://www.helb.co.ke/feed/",
    host: "www.helb.co.ke",
  },
  {
    key: "icpak",
    name: "ICPAK",
    feedUrl: "https://www.icpak.com/feed/",
    host: "www.icpak.com",
  },
] as const;

const allowedRoles = ["super_admin", "admissions_admin", "academic_admin"];
const maxFeedBytes = 2_000_000;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json({ ok: true }, 200);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Regulatory feed sync is missing Supabase configuration.");
    return json({ error: "The official-source sync service is not configured." }, 503);
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to sync official sources." }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return json({ error: "Your session is invalid or expired." }, 401);
  }

  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (rolesError) {
    console.error("Could not verify regulatory feed sync role:", rolesError.message);
    return json({ error: "Could not verify your staff access." }, 500);
  }
  if (!(userRoles ?? []).some(({ role }) => allowedRoles.includes(role))) {
    return json({ error: "You do not have permission to sync regulatory sources." }, 403);
  }

  const results = await Promise.all(sources.map((source) => syncSource(supabase, source)));
  const succeeded = results.filter((result) => result.status === "success").length;
  return json({ results, succeeded, failed: results.length - succeeded }, 200);
});

async function syncSource(
  supabase: ReturnType<typeof createClient>,
  source: (typeof sources)[number],
) {
  try {
    const response = await fetch(source.feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "User-Agent": "ProfiaInstituteRegulatoryFeed/1.0 (+https://profiainstitute.ac.ke)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Official feed returned HTTP ${response.status}.`);
    if (new URL(response.url).hostname.toLowerCase() !== source.host) {
      throw new Error("The official feed redirected outside its verified agency domain.");
    }
    const xml = await readLimitedText(response, maxFeedBytes);

    const items = [
      ...new Map(parseRssItems(xml, source).map((item) => [item.article_url, item])).values(),
    ];
    if (items.length) {
      const { error } = await supabase
        .from("regulatory_source_updates")
        .upsert(items, { onConflict: "source_key,article_url" });
      if (error) throw new Error(`Could not save official updates: ${error.message}`);
    }

    const checkedAt = new Date().toISOString();
    const { error: syncError } = await supabase.from("regulatory_feed_syncs").upsert(
      {
        source_key: source.key,
        source_name: source.name,
        feed_url: source.feedUrl,
        last_attempted_at: checkedAt,
        last_successful_at: checkedAt,
        status: "success",
        items_received: items.length,
        error_message: null,
      },
      { onConflict: "source_key" },
    );
    if (syncError) throw new Error(`Could not record sync status: ${syncError.message}`);
    return { source: source.name, status: "success", items: items.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The official feed could not be read.";
    const { error: syncError } = await supabase.from("regulatory_feed_syncs").upsert(
      {
        source_key: source.key,
        source_name: source.name,
        feed_url: source.feedUrl,
        last_attempted_at: new Date().toISOString(),
        status: "error",
        error_message: message.slice(0, 500),
      },
      { onConflict: "source_key" },
    );
    if (syncError) {
      console.error(`Could not record ${source.name} feed failure:`, syncError.message);
    }
    console.error(`${source.name} official feed sync failed:`, message);
    return { source: source.name, status: "error", error: message };
  }
}

function parseRssItems(xml: string, source: (typeof sources)[number]) {
  const records = [
    ...xml.matchAll(/<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item\s*>/gi),
  ];
  return records.slice(0, 30).flatMap((record) => {
    const item = record[1];
    if (!item) return [];
    const title = readXmlTag(item, "title");
    const rawUrl = readXmlTag(item, "link");
    if (!title || !rawUrl) return [];
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== source.host) return [];

    const rawSummary =
      readXmlTag(item, "encoded") ?? readXmlTag(item, "description") ?? readXmlTag(item, "summary");
    const dateValue = readXmlTag(item, "pubDate") ?? readXmlTag(item, "published");
    const date = dateValue ? new Date(dateValue) : null;
    const summary = rawSummary ? plainText(rawSummary).slice(0, 1500) : null;
    return [
      {
        source_key: source.key,
        source_name: source.name,
        title: plainText(title).slice(0, 300),
        article_url: url.toString(),
        summary: summary || null,
        published_at: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        fetched_at: new Date().toISOString(),
      },
    ];
  });
}

async function readLimitedText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("Official feed exceeds the size limit.");
  if (!response.body) throw new Error("Official feed returned an empty response.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Official feed exceeds the size limit.");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function readXmlTag(xml: string, tag: string) {
  const match = xml.match(
    new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}\\s*>`, "i"),
  );
  return match?.[1] ? decodeXml(match[1].trim()) : null;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, value: string) => {
      const namedEntities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      const lower = value.toLowerCase();
      if (lower in namedEntities) return namedEntities[lower]!;
      const codePoint = lower.startsWith("#x")
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    });
}

function plainText(value: string) {
  return decodeXml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
