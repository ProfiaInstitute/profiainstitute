import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PayHeroCredentials = {
  username: string;
  password: string;
  channelId: number;
};

export async function loadPayHeroCredentials(
  supabase: ReturnType<typeof createClient>,
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

function parseChannelId(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const channelId = Number(trimmed);
  return Number.isSafeInteger(channelId) && channelId > 0 ? channelId : null;
}
