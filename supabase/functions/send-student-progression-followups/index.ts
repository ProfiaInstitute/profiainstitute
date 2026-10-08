import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !sender || !publicSiteUrl) {
    console.error("Student follow-up email configuration is incomplete.");
    return json({ error: "Email service is not configured." }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Forbidden." }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: messages, error: claimError } = await supabase.rpc(
    "claim_due_progression_followups",
    { _limit: 50 },
  );
  if (claimError) {
    console.error("Could not claim student follow-up emails:", claimError.message);
    return json({ error: "Could not claim due follow-up emails." }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const message of messages ?? []) {
    const nextLevelUrl = `${publicSiteUrl.replace(/\/$/, "")}/admission?course=${encodeURIComponent(message.next_course_id)}`;
    const text = message.message
      .replaceAll("{student_name}", message.student_name)
      .replaceAll("{student_number}", message.student_number)
      .replaceAll("{next_course}", message.next_course)
      .replaceAll("{enrolment_link}", nextLevelUrl);
    let deliveryError: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.id,
        },
        body: JSON.stringify({
          from: sender,
          to: [message.student_email],
          subject: message.subject,
          text: `${text}\n\nContinue your studies: ${nextLevelUrl}\n\nStudent number: ${message.student_number}`,
        }),
      });
      if (!response.ok) {
        deliveryError = `Email provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`;
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Email provider request failed.";
    }

    const { error: updateError } = await supabase.rpc("complete_progression_followup", {
      _followup_id: message.id,
      _sent: deliveryError === null,
      _error: deliveryError,
    });
    if (updateError) {
      console.error("Could not record follow-up delivery status:", updateError.message);
      failed++;
    } else if (deliveryError) {
      console.error(`Follow-up email ${message.id} failed: ${deliveryError}`);
      failed++;
    } else {
      sent++;
    }
  }

  return json({ claimed: messages?.length ?? 0, sent, failed }, 200);
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
