import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Reminder = {
  id: string;
  channel: "email" | "whatsapp";
  recipient: string;
  attempts: number;
  payload: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-regulatory-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const secret = Deno.env.get("REGULATORY_REMINDER_CRON_SECRET");
  const providedSecret = request.headers.get("x-regulatory-cron-secret");
  if (!secret || !providedSecret || !constantTimeEqual(secret, providedSecret)) {
    return json({ error: "Forbidden." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Regulatory reminder worker is missing Supabase configuration.");
    return json({ error: "Reminder delivery is not configured." }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  const availableChannels: Reminder["channel"][] = [];
  if (Deno.env.get("RESEND_API_KEY") && Deno.env.get("SCHOOL_EMAIL_FROM") && siteUrl) {
    availableChannels.push("email");
  }
  if (
    Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") &&
    siteUrl
  ) {
    availableChannels.push("whatsapp");
  }
  if (!availableChannels.length) {
    console.error("Regulatory reminder worker has no configured delivery channel.");
    return json({ error: "No reminder delivery channel is configured." }, 503);
  }
  const { data: reminders, error: claimError } = await supabase.rpc(
    "claim_regulatory_deadline_reminders",
    { _limit: 50, _channels: availableChannels },
  );
  if (claimError) {
    console.error("Could not claim regulatory deadline reminders:", claimError.message);
    return json({ error: "Could not claim regulatory reminders." }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const reminder of (reminders ?? []) as Reminder[]) {
    let deliveryError: string | null = null;
    try {
      if (reminder.channel === "email") {
        await sendEmail(reminder);
      } else if (reminder.channel === "whatsapp") {
        await sendWhatsApp(reminder);
      } else {
        throw new Error("Unsupported regulatory reminder channel.");
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Reminder delivery failed.";
    }

    const { error: completionError } = await supabase.rpc("complete_regulatory_deadline_reminder", {
      _reminder_id: reminder.id,
      _sent: deliveryError === null,
      _error: deliveryError,
    });
    if (completionError) {
      console.error(
        `Could not record regulatory reminder ${reminder.id}:`,
        completionError.message,
      );
      failed++;
    } else if (deliveryError) {
      console.error(`Regulatory reminder ${reminder.id} failed:`, deliveryError);
      failed++;
    } else {
      sent++;
    }
  }

  return json({ claimed: reminders?.length ?? 0, sent, failed }, 200);
});

async function sendEmail(reminder: Reminder) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!apiKey || !sender || !siteUrl) {
    throw new Error(
      "Email reminder delivery requires RESEND_API_KEY, SCHOOL_EMAIL_FROM, and PUBLIC_SITE_URL.",
    );
  }

  const name = payloadText(reminder.payload, "admin_name");
  const title = payloadText(reminder.payload, "title");
  const agency = payloadText(reminder.payload, "agency");
  const dueDate = payloadText(reminder.payload, "due_date");
  const daysBefore = payloadNumber(reminder.payload, "days_before");
  const dateText = formatDate(dueDate);
  const timing = reminderTiming(daysBefore);
  const portalUrl = new URL("/admin", siteUrl).toString();
  const referenceUrl = payloadOptionalText(reminder.payload, "reference_url");
  const text = [
    `Hello ${name},`,
    "",
    `${timing}: ${title} (${agency}).`,
    `Deadline: ${dateText}.`,
    referenceUrl ? `Official reference: ${referenceUrl}` : "",
    `Open the admin workspace: ${portalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p><strong>${escapeHtml(timing)}:</strong> ${escapeHtml(title)} (${escapeHtml(agency)}).</p>`,
    `<p>Deadline: ${escapeHtml(dateText)}.</p>`,
    referenceUrl ? `<p><a href="${escapeHtml(referenceUrl)}">Open official reference</a></p>` : "",
    `<p><a href="${escapeHtml(portalUrl)}">Open the admin workspace</a></p>`,
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": reminder.id,
    },
    body: JSON.stringify({
      from: sender,
      to: [reminder.recipient],
      subject: `Regulatory deadline ${timing.toLowerCase()}: ${title}`,
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

async function sendWhatsApp(reminder: Reminder) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!accessToken || !phoneNumberId || !siteUrl) {
    throw new Error(
      "WhatsApp reminders require WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and PUBLIC_SITE_URL.",
    );
  }
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
  const templateName =
    Deno.env.get("WHATSAPP_REGULATORY_TEMPLATE_NAME") ?? "profia_regulatory_deadline_reminder";
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const title = payloadText(reminder.payload, "title");
  const agency = payloadText(reminder.payload, "agency");
  const daysBefore = payloadNumber(reminder.payload, "days_before");
  const referenceUrl =
    payloadOptionalText(reminder.payload, "reference_url") ?? new URL("/admin", siteUrl).toString();
  const parameters = [
    payloadText(reminder.payload, "admin_name"),
    title,
    agency,
    `${formatDate(payloadText(reminder.payload, "due_date"))} (${reminderTiming(daysBefore)})`,
    referenceUrl,
  ];
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": reminder.id,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(reminder.recipient),
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
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

function reminderTiming(daysBefore: number) {
  if (daysBefore === 0) return "Due today";
  return `Due in ${daysBefore} day${daysBefore === 1 ? "" : "s"}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Reminder contains an invalid due date.");
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "long",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Regulatory reminder is missing ${key}.`);
  }
  return value.trim();
}

function payloadOptionalText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Regulatory reminder contains an invalid ${key}.`);
  }
  return value;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Regulatory reminder contains an invalid ${key}.`);
  }
  return value;
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.length === 9) return `254${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  throw new Error("Regulatory reminder contains an invalid phone number.");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
