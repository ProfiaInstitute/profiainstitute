import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// HELB omits this verified Sectigo issuer from its TLS chain.
const helbIssuerCertificate = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQLBo8dulD3d3/GRsxiQrtcTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgT1YgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEApkMtJ3R06jo0fceI0M52B7K+TyMeGcv2BQ5AVc3j
lYt76TvHIu/nNe22W/RJXX9rWUD/2GE6GF5x0V4bsY7K3IeJ8E7+KzG/TGboySfD
u+F52jqQBbY62ofhYjMeiAbLI02+FqwHeM8uIrUtcX8b2RCxF358TB0NHVccAXZc
FYgZndZCeXxjuca7pJJ20LLUnXtgXcjAE1vY4WvbReW0W6mkeZyNGdmpTcFs5Y+s
yy6LtE5Zocji9J9NlNnReox2RWVyEXpA1ChZ4gqN+ZpVSIQ0HBorVFbBKyhdZyEX
gZgNSNtBRwxqwIzJePJhYd4ZUhO1vk+/uP3nwDk0p95q/j7naXNCSvESnrHPypaB
WRK066nKfPRPi9m9kIOhMdYfS8giFRTcdgL24Ycilj7ecAK9Trh0VbjwouJ4WH+x
bt47u68ZFCD/ac55I0DNHkCpaPruj6e9Rmr7K46wZDAYXuEAqB7tGG/jd6JAA+H2
O44CV98NRsU213f1kScIZntNAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQU42Z0u3BojSxdTg6mSo+bNyKcgpIw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgIw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
BZXWDHWC3cubb/e1I1kzi8lPFiK/ZUoH09ufmVOrc5ObYH/XKkWUexSPqRkwKFKr
7r8OuG+p7VNB8rifX6uopqKAgsvZtZsq7iAFw04To6vNcxeBt1Eush3cQ4b8nbQR
MQLChgEAqwhuXp9P48T4QEBSksYav7+aFjNySsLYlPzNqVM3RNwvBdvp6vgDtGwc
xlKQZVuuNVIaoYyls8swhxDeSHKpRdxRauTLZ+pl+wGvy0pnrLEJGSz9mOEmfbod
e/XopR2NGqaHJ6bIjyxPu6UtyQGI26En7UAEozACrHz06Nx2jTAY9E6NeB6XuobE
wLK025ZRmvglcURG1BrV24tGHHTgxCe8M3oGlpUSMTKQ2dkgljZVYt+gKdFtWELZ
MuRdi+X3XsrR8LFz+aLUiDRfQqhmw3RxjIyVKvvu9UPYY1nsvxYmFnUSeM+2q1z/
iPUry+xDY9MC6+IhleKT094VKdFVp7LXH42+wvU+17lRolQ2mK2N/nBLVBwaIhib
QXw4VYKwB86Bc6eS6iqsc94KEgD/U4VsjmgfhK+Xp4NM+VYzTTa3QeV3p8xOM0cw
q1p8oZFA+OBcz3FYWpDIe5j0NWKlw9hXsTyPY/HeZUV59akskSOSRSmDfe8wJDPX
58uB9/7lud0G3x0pxQAcffP0ayKavNwDTw4UfJ34cEw=
-----END CERTIFICATE-----`;

const helbHttpClient = Deno.createHttpClient({ caCerts: [helbIssuerCertificate] });

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
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, token);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

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
      ...(source.key === "helb" ? { client: helbHttpClient } : {}),
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
