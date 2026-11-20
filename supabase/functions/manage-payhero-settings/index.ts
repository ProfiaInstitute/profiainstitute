import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";
import { loadPayHeroCredentials } from "../_shared/payhero.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("PayHero settings service configuration is incomplete.");
    return json({ error: "PayHero settings are unavailable." }, 500);
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in as a Super Admin to manage PayHero." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user)
    return json({ error: "Your admin session is invalid or expired." }, 401);
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, accessToken);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  const { data: callerRole, error: roleError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleError) {
    console.error("Could not verify PayHero settings manager role:", roleError.message);
    return json({ error: "Could not verify Super Admin access." }, 500);
  }
  if (!callerRole) return json({ error: "Only a Super Admin can manage PayHero settings." }, 403);

  let body: { action?: unknown; username?: unknown; password?: unknown; channelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The PayHero settings request is not valid JSON." }, 400);
  }

  if (body.action === "read") {
    const { data, error } = await supabase
      .from("payhero_settings")
      .select("api_username,channel_id")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      console.error("Could not read PayHero settings:", error.message);
      return json({ error: "Could not load PayHero settings." }, 500);
    }
    let configured = Boolean(data);
    if (!configured) {
      try {
        configured = Boolean(await loadPayHeroCredentials(supabase));
      } catch (loadError) {
        console.error("Could not check PayHero deployment configuration:", errorMessage(loadError));
        return json({ error: "Could not load PayHero settings." }, 500);
      }
    }
    return json(
      {
        success: true,
        configured,
        savedInAdmin: Boolean(data),
        username: data?.api_username ?? "",
        channelId: data?.channel_id ?? "",
      },
      200,
    );
  }

  if (body.action !== "save")
    return json({ error: "Choose a valid PayHero settings action." }, 400);
  if (
    typeof body.username !== "string" ||
    !body.username.trim() ||
    body.username.length > 256 ||
    typeof body.channelId !== "string" ||
    !body.channelId.trim() ||
    body.channelId.length > 16 ||
    !/^\d+$/.test(body.channelId.trim()) ||
    !Number.isSafeInteger(Number(body.channelId.trim())) ||
    Number(body.channelId.trim()) <= 0 ||
    (body.password !== undefined &&
      (typeof body.password !== "string" || body.password.length > 512))
  ) {
    return json({ error: "Enter a valid PayHero username, password, and channel ID." }, 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("payhero_settings")
    .select("api_password")
    .eq("id", true)
    .maybeSingle();
  if (existingError) {
    console.error("Could not load current PayHero settings:", existingError.message);
    return json({ error: "Could not save PayHero settings." }, 500);
  }
  const password =
    typeof body.password === "string" && body.password.length > 0
      ? body.password
      : existing?.api_password;
  if (!password)
    return json({ error: "Enter the PayHero API password to configure the integration." }, 400);

  const { error: saveError } = await supabase.from("payhero_settings").upsert(
    {
      id: true,
      api_username: body.username.trim(),
      api_password: password,
      channel_id: body.channelId.trim(),
      updated_by: authData.user.id,
    },
    { onConflict: "id" },
  );
  if (saveError) {
    console.error("Could not save PayHero settings:", saveError.message);
    return json({ error: "Could not save PayHero settings." }, 500);
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: authData.user.id,
    action: "payhero_settings_updated",
    entity: "payhero_settings",
    entity_id: "true",
  });
  if (auditError) console.error("Could not record PayHero settings update:", auditError.message);

  return json({ success: true }, 200);
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown PayHero configuration error.";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
