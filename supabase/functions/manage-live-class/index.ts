import { RoomServiceClient } from "npm:livekit-server-sdk@2.20.1";
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

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in to manage this class." }, 401);

  let body: { action?: unknown; sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The live-class request is not valid JSON." }, 400);
  }
  if (
    (body.action !== "start" && body.action !== "end" && body.action !== "cancel") ||
    typeof body.sessionId !== "string" ||
    !uuidPattern.test(body.sessionId)
  ) {
    return json({ error: "The live-class request is incomplete." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("Live class manager is missing Supabase configuration.");
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

  const { data: canManage, error: permissionError } = await userClient.rpc(
    "can_manage_live_class",
    { _session_id: body.sessionId },
  );
  if (permissionError) {
    console.error("Could not verify live-class management access:", permissionError.message);
    return json({ error: "Could not verify your access to manage this class." }, 500);
  }
  if (!canManage) return json({ error: "You are not assigned to manage this class." }, 403);

  const { data: session, error: sessionError } = await serviceClient
    .from("live_class_sessions")
    .select("id,room_name,status,started_at")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Could not load live class:", sessionError.message);
    return json({ error: "Could not load this live class. Please retry." }, 500);
  }
  if (!session) return json({ error: "This live class is no longer available." }, 404);

  const action = body.action;
  if (action === "start") {
    if (session.status !== "scheduled") {
      return json({ error: "Only a scheduled class can be started." }, 409);
    }
    if (!liveKitConfig()) {
      console.error("LiveKit Cloud credentials are not configured.");
      return json(
        { error: "Live classes are not configured yet. Contact the Institute administrator." },
        503,
      );
    }
    const { data: updated, error } = await serviceClient
      .from("live_class_sessions")
      .update({ status: "live", started_at: new Date().toISOString(), ended_at: null })
      .eq("id", session.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Could not start live class:", error.message);
      return json({ error: "Could not start this class. Please retry." }, 500);
    }
    if (!updated)
      return json(
        { error: "The class changed while you were managing it. Refresh and retry." },
        409,
      );
    return json({ status: "live" });
  }

  const shouldEnd = action === "end";
  const permittedStatuses = shouldEnd ? ["live", "ended"] : ["scheduled", "live", "cancelled"];
  if (!permittedStatuses.includes(session.status)) {
    return json({ error: "This class can no longer be changed to that status." }, 409);
  }

  if (session.status !== (shouldEnd ? "ended" : "cancelled")) {
    const nextStatus = shouldEnd ? "ended" : "cancelled";
    const endedAt = session.status === "live" ? new Date().toISOString() : null;
    const { data: updated, error } = await serviceClient
      .from("live_class_sessions")
      .update({ status: nextStatus, ended_at: endedAt })
      .eq("id", session.id)
      .eq("status", session.status)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Could not end live class:", error.message);
      return json({ error: "Could not update this class. Please retry." }, 500);
    }
    if (!updated)
      return json(
        { error: "The class changed while you were managing it. Refresh and retry." },
        409,
      );
  }

  if (!session.started_at && session.status === "scheduled") {
    return json({ status: "cancelled" });
  }
  if (!session.started_at && session.status === "cancelled") {
    return json({ status: "cancelled" });
  }

  const liveKit = liveKitConfig();
  if (!liveKit) {
    console.error("The class is closed in Profia, but LiveKit credentials are unavailable.");
    return json(
      {
        error:
          "The class is closed, but participants could not be disconnected because LiveKit is not configured.",
      },
      503,
    );
  }

  try {
    const roomService = new RoomServiceClient(liveKit.httpUrl, liveKit.apiKey, liveKit.apiSecret);
    const rooms = await roomService.listRooms([session.room_name]);
    if (rooms.some((room) => room.name === session.room_name)) {
      await roomService.deleteRoom(session.room_name);
    }
  } catch (error) {
    console.error(
      "The class is closed in Profia, but LiveKit could not disconnect room participants:",
      error instanceof Error ? error.message : String(error),
    );
    return json(
      {
        error:
          "The class is closed in Profia, but LiveKit could not disconnect participants. Retry ending the class.",
      },
      502,
    );
  }

  return json({ status: shouldEnd ? "ended" : "cancelled" });
});

function liveKitConfig() {
  const url = Deno.env.get("LIVEKIT_URL");
  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "wss:" && endpoint.protocol !== "https:") return null;
  return {
    httpUrl: url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:"),
    apiKey,
    apiSecret,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
