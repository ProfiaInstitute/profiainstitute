import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PayHeroCredentials = {
  username: string;
  password: string;
  channelId: number;
};

// The service-role client is intentionally schema-agnostic for Edge Function table access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PayHeroSupabaseClient = ReturnType<typeof createClient<any>>;

export async function loadPayHeroCredentials(
  supabase: PayHeroSupabaseClient,
): Promise<PayHeroCredentials | null> {
  const { data, error } = await supabase
    .from("payhero_settings")
    .select("api_username,api_password,channel_id")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const channelId = parseChannelId(data.channel_id);
    if (channelId === null) throw new Error("The saved PayHero channel ID is invalid.");
    return {
      username: data.api_username,
      password: data.api_password,
      channelId,
    };
  }

  const username = Deno.env.get("PAYHERO_API_USERNAME");
  const password = Deno.env.get("PAYHERO_API_PASSWORD");
  const configuredChannelId = Deno.env.get("PAYHERO_CHANNEL_ID");
  if (!username || !password || !configuredChannelId) return null;
  const channelId = parseChannelId(configuredChannelId);
  if (channelId === null) throw new Error("The PayHero deployment channel ID is invalid.");
  return { username, password, channelId };
}

export function describePayHeroRejection(status: number, value: unknown) {
  const detail = findRejectionDetail(value);
  if (detail) return `PayHero rejected the STK push (HTTP ${status}): ${detail}`;
  return `PayHero rejected the STK push (HTTP ${status}). Check the saved API credentials, channel ID, and registered mobile number.`;
}

export function normalizeKenyanPhoneForPayHero(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0")
    ? `254${digits.slice(1)}`
    : digits.startsWith("7") || digits.startsWith("1")
      ? `254${digits}`
      : digits;
  if (!/^254[17]\d{8}$/.test(normalized)) return null;
  return `0${normalized.slice(3)}`;
}

function findRejectionDetail(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") return depth > 0 ? sanitizeRejectionDetail(value) : null;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const detail = findRejectionDetail(item, depth + 1);
      if (detail) return detail;
    }
    return null;
  }

  const entries = Object.entries(value);
  const rejectionKeys = ["error_message", "message", "error", "errors", "detail", "description"];
  for (const [key, item] of entries) {
    if (!rejectionKeys.includes(key.toLowerCase())) continue;
    const detail = typeof item === "string" ? item : findRejectionDetail(item, depth + 1);
    if (detail) return sanitizeRejectionDetail(detail);
  }
  for (const [key, item] of Object.entries(value)) {
    if (rejectionKeys.includes(key.toLowerCase())) continue;
    if (!item || typeof item !== "object") continue;
    const detail = findRejectionDetail(item, depth + 1);
    if (detail) return detail;
  }

  return null;
}

function sanitizeRejectionDetail(detail: string) {
  return Array.from(detail, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
    .join("")
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[redacted]")
    .replace(/\b(?:254|0)?[17]\d{8}\b/g, "[mobile number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function parseChannelId(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const channelId = Number(trimmed);
  return Number.isSafeInteger(channelId) && channelId > 0 ? channelId : null;
}
