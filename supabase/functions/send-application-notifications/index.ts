import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApplicationNotification = {
  id: string;
  channel: "email" | "whatsapp";
  recipient: string;
  subject: string | null;
  attempts: number;
  payload: Record<string, unknown>;
};

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
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Admission notification service configuration is incomplete.");
    return json({ error: "Notification service is not configured." }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Forbidden." }, 403);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await client.rpc("claim_application_notifications", {
    _limit: 50,
  });
  if (claimError) {
    console.error("Could not claim admission notifications:", claimError.message);
    return json({ error: "Could not claim admission notifications." }, 500);
  }

  let sent = 0;
  let failed = 0;
  const failures: { id: string; channel: string; error: string }[] = [];
  for (const notification of (claimed ?? []) as ApplicationNotification[]) {
    let deliveryError: string | null = null;
    try {
      if (notification.channel === "email") {
        await sendEmail(notification);
      } else if (notification.channel === "whatsapp") {
        await sendWhatsApp(notification);
      } else {
        throw new Error("Unsupported notification channel.");
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Notification delivery failed.";
    }

    const { error: completionError } = await client.rpc("complete_application_notification", {
      _notification_id: notification.id,
      _sent: deliveryError === null,
      _error: deliveryError,
    });
    if (completionError) {
      console.error(`Could not record notification ${notification.id}:`, completionError.message);
      failures.push({
        id: notification.id,
        channel: notification.channel,
        error: `Could not record delivery status: ${completionError.message}`,
      });
      failed++;
    } else if (deliveryError) {
      console.error(`Admission notification ${notification.id} failed: ${deliveryError}`);
      failures.push({
        id: notification.id,
        channel: notification.channel,
        error: deliveryError,
      });
      failed++;
    } else {
      sent++;
    }
  }
  return json({ claimed: claimed?.length ?? 0, sent, failed, failures }, 200);
});

async function sendEmail(notification: ApplicationNotification) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!apiKey || !sender || !siteUrl) {
    throw new Error(
      "Email delivery requires RESEND_API_KEY, SCHOOL_EMAIL_FROM, and PUBLIC_SITE_URL.",
    );
  }

  const name = payloadText(notification.payload, "student_name");
  const applicationNumber = payloadText(notification.payload, "application_number");
  const emailAddress = payloadText(notification.payload, "email");
  const status = payloadText(notification.payload, "application_status");
  const portalUrl = new URL("/student", siteUrl).toString();
  const supportWhatsApp = payloadText(notification.payload, "school_whatsapp");
  const statusMessage =
    status === "accepted"
      ? "Your application has been accepted."
      : "Your admission has been confirmed.";
  const subject = notification.subject ?? "Your Profia Institute admission update";
  const text = [
    `Hello ${name},`,
    "",
    statusMessage,
    `Application reference: ${applicationNumber}`,
    "",
    "To access your student portal, sign up or sign in at the link below using the same email address you entered on your application:",
    emailAddress,
    portalUrl,
    "",
    "If you already have an account, sign in with that email address. Please confirm the email address through the confirmation message before signing in.",
    "",
    `Need help? WhatsApp Profia Institute at +${supportWhatsApp}.`,
  ].join("\n");
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>${escapeHtml(statusMessage)} Your application reference is <strong>${escapeHtml(applicationNumber)}</strong>.</p>`,
    "<p>To access your student portal, sign up or sign in using the same email address you entered on your application:</p>",
    `<p><strong>${escapeHtml(emailAddress)}</strong></p>`,
    `<p><a href="${escapeHtml(portalUrl)}">Open the Profia student portal</a></p>`,
    "<p>If you already have an account, sign in with that email address. Confirm your email address through the confirmation message before signing in.</p>",
    `<p>Need help? WhatsApp Profia Institute at +${escapeHtml(supportWhatsApp)}.</p>`,
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": notification.id,
    },
    body: JSON.stringify({
      from: sender,
      to: [notification.recipient],
      subject,
      text,
      html,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Email provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
}

async function sendWhatsApp(notification: ApplicationNotification) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
  if (!accessToken || !phoneNumberId || !templateName) {
    throw new Error(
      "WhatsApp delivery requires WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TEMPLATE_NAME.",
    );
  }

  const recipient = normalizePhone(notification.recipient);
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!siteUrl) throw new Error("WhatsApp delivery requires PUBLIC_SITE_URL.");
  const parameters = [
    payloadText(notification.payload, "student_name"),
    payloadText(notification.payload, "application_number"),
    payloadText(notification.payload, "application_status"),
    payloadText(notification.payload, "email"),
    new URL("/student", siteUrl).toString(),
    `+${payloadText(notification.payload, "school_whatsapp")}`,
  ];
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": notification.id,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: "body",
              parameters: parameters.map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `WhatsApp provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Admission notification is missing ${key}.`);
  }
  return value.trim();
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("The applicant phone number is not valid for WhatsApp delivery.");
  }
  return digits;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
