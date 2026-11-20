import {
  WebhookReceiver,
  type WebhookEvent as LiveKitWebhookEvent,
} from "npm:livekit-server-sdk@2.20.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!liveKitApiKey || !liveKitApiSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("LiveKit webhook is missing provider or Supabase configuration.");
    return json({ error: "Webhook is not configured." }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Missing webhook signature." }, 401);

  let event: LiveKitWebhookEvent;
  try {
    const body = await request.text();
    event = await new WebhookReceiver(liveKitApiKey, liveKitApiSecret).receive(body, authorization);
  } catch (error) {
    console.error(
      "LiveKit webhook signature verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ error: "Invalid webhook signature." }, 401);
  }

  if (
    (event.event !== "participant_joined" && event.event !== "participant_left") ||
    !event.room?.name ||
    !event.participant?.identity
  ) {
    return json({ received: true });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: sessionError } = await supabase
    .from("live_class_sessions")
    .select("id,facilitator_id")
    .eq("room_name", event.room.name)
    .maybeSingle();
  if (sessionError) {
    console.error("Could not match LiveKit room to a class:", sessionError.message);
    return json({ error: "Could not match this room to a live class." }, 500);
  }
  if (!session) return json({ received: true });

  const userId = event.participant.identity;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "Invalid participant identity." }, 400);
  }

  let error: { message: string } | null = null;
  if (event.event === "participant_joined") {
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) {
      console.error("Could not resolve LiveKit participant role:", rolesError.message);
      return json({ error: "Could not verify the participant role." }, 500);
    }

    const roleNames = (roles ?? []).map(({ role }) => role);
    const participantRole =
      session.facilitator_id === userId
        ? "facilitator"
        : roleNames.some((role) => role === "super_admin" || role === "academic_admin")
          ? "admin"
          : "student";
    ({ error } = await supabase.rpc("record_live_class_join", {
      _session_id: session.id,
      _user_id: userId,
      _participant_role: participantRole,
    }));
  } else {
    ({ error } = await supabase.rpc("record_live_class_leave", {
      _session_id: session.id,
      _user_id: userId,
    }));
  }

  if (error) {
    console.error("Could not save LiveKit attendance event:", error.message);
    return json({ error: "Could not save the attendance event." }, 500);
  }
  return json({ received: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
