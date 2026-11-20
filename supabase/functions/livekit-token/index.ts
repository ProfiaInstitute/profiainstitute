import { AccessToken, TrackSource } from "npm:livekit-server-sdk@2.20.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in to join this class." }, 401);

  let body: { sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The live-class request is not valid JSON." }, 400);
  }
  if (typeof body.sessionId !== "string" || !uuidPattern.test(body.sessionId)) {
    return json({ error: "The live-class request is incomplete." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("Live class token service is missing Supabase configuration.");
    return json(
      { error: "Live classes are not configured. Contact the Institute administrator." },
      503,
    );
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: authData, error: authError } = await serviceClient.auth.getUser(accessToken);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);

  const mfaCheck = await checkStaffMfa(serviceClient, authData.user.id, accessToken);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  const { data: session, error: sessionError } = await serviceClient
    .from("live_class_sessions")
    .select("id,room_name,status,facilitator_id")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Could not load live class:", sessionError.message);
    return json({ error: "Could not load this live class. Please retry." }, 500);
  }
  if (!session) return json({ error: "This live class is no longer available." }, 404);

  const { data: canJoin, error: accessError } = await userClient.rpc("can_join_live_class", {
    _session_id: session.id,
  });
  if (accessError) {
    console.error("Could not verify live-class access:", accessError.message);
    return json({ error: "Could not verify your access to this class." }, 500);
  }
  if (!canJoin) return json({ error: "You are not enrolled in this live class." }, 403);
  if (session.status !== "live") {
    return json({ error: "The facilitator has not started this class yet." }, 409);
  }

  const liveKitUrl = Deno.env.get("LIVEKIT_URL");
  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    console.error("LiveKit Cloud credentials are not configured.");
    return json(
      { error: "Live classes are not configured yet. Contact the Institute administrator." },
      503,
    );
  }
  try {
    const endpoint = new URL(liveKitUrl);
    if (endpoint.protocol !== "wss:" && endpoint.protocol !== "https:") {
      throw new Error("LiveKit URL must use a secure protocol.");
    }
  } catch (error) {
    console.error(
      "LiveKit Cloud URL is invalid:",
      error instanceof Error ? error.message : String(error),
    );
    return json(
      { error: "Live classes have an invalid provider URL. Contact the Institute administrator." },
      503,
    );
  }

  const { data: roles, error: rolesError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (rolesError) {
    console.error("Could not verify the live-class participant role:", rolesError.message);
    return json({ error: "Could not verify your role for this class." }, 500);
  }

  const roleNames = (roles ?? []).map(({ role }) => role);
  const isAdmin = roleNames.some((role) => role === "super_admin" || role === "academic_admin");
  const isFacilitator = session.facilitator_id === authData.user.id;

  const [{ data: profile, error: profileError }, { data: student, error: studentError }] =
    await Promise.all([
      serviceClient.from("profiles").select("full_name").eq("id", authData.user.id).maybeSingle(),
      serviceClient
        .from("students")
        .select("first_name,last_name")
        .eq("user_id", authData.user.id)
        .maybeSingle(),
    ]);
  if (profileError || studentError) {
    console.error(
      "Could not load the live-class participant name:",
      profileError?.message ?? studentError?.message,
    );
    return json({ error: "Could not load your participant profile." }, 500);
  }

  const studentName = [student?.first_name, student?.last_name].filter(Boolean).join(" ");
  const name = studentName || profile?.full_name || authData.user.email || "Profia participant";
  const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: authData.user.id,
    name,
    ttl: "15m",
  });
  token.addGrant({
    roomJoin: true,
    room: session.room_name,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canPublishSources:
      isFacilitator || isAdmin
        ? [
            TrackSource.CAMERA,
            TrackSource.MICROPHONE,
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ]
        : [TrackSource.CAMERA, TrackSource.MICROPHONE],
  });

  let jwt: string;
  try {
    jwt = await token.toJwt();
  } catch (error) {
    console.error(
      "Could not create a LiveKit access token:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ error: "Could not start the live class. Please retry." }, 500);
  }

  return json({ serverUrl: liveKitUrl, token: jwt });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
