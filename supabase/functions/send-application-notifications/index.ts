import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApplicationNotification = {
  id: string;
  channel: "email" | "whatsapp";
  recipient: string;
  subject: string | null;
  attempts: number;
  payload: Record<string, unknown>;
};

type StudentLearningNotification = {
  id: string;
  channel: "email" | "whatsapp";
  recipient: string;
  subject: string;
  attempts: number;
  payload: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notification-scope, x-notification-scheduler-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Student notification service configuration is incomplete.");
    return json({ error: "Notification service is not configured." }, 500);
  }
  const learningEmailOnly = request.headers.get("x-notification-scope") === "learning-email-only";
  const schedulerSecret = Deno.env.get("LEARNING_NOTIFICATIONS_CRON_SECRET");
  const schedulerAuthorized =
    learningEmailOnly &&
    !!schedulerSecret &&
    request.headers.get("x-notification-scheduler-secret") === schedulerSecret;
  const serviceRoleAuthorized = request.headers.get("Authorization") === `Bearer ${serviceRoleKey}`;
  if (!serviceRoleAuthorized && !schedulerAuthorized) {
    return json({ error: "Forbidden." }, 403);
  }

  const requestServiceRoleKey = schedulerAuthorized
    ? (request.headers.get("apikey") ?? serviceRoleKey)
    : serviceRoleKey;
  const client = createClient(supabaseUrl, requestServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let claimed: ApplicationNotification[] = [];
  if (!learningEmailOnly) {
    const { data, error } = await client.rpc("claim_application_notifications", { _limit: 50 });
    if (error) {
      console.error("Could not claim admission notifications:", error.message);
      return json({ error: "Could not claim admission notifications." }, 500);
    }
    claimed = (data ?? []) as ApplicationNotification[];
  }

  let sent = 0;
  let failed = 0;
  const failures: { id: string; channel: string; error: string }[] = [];
  for (const notification of claimed) {
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

  const { data: learningNotifications, error: learningClaimError } = await client.rpc(
    "claim_student_learning_notifications",
    { _limit: 50 },
  );
  if (learningClaimError) {
    console.error("Could not claim student learning notifications:", learningClaimError.message);
    return json(
      {
        claimed: claimed.length,
        sent,
        failed,
        failures,
        error: "Could not claim student learning notifications.",
      },
      500,
    );
  }

  for (const notification of (learningNotifications ?? []) as StudentLearningNotification[]) {
    let deliveryError: string | null = null;
    try {
      if (notification.channel === "email") {
        await sendStudentLearningEmail(notification);
      } else if (notification.channel === "whatsapp") {
        await sendStudentLearningWhatsApp(notification);
      } else {
        throw new Error("Unsupported student learning notification channel.");
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Notification delivery failed.";
    }

    const { error: completionError } = await client.rpc("complete_student_learning_notification", {
      _notification_id: notification.id,
      _sent: deliveryError === null,
      _error: deliveryError,
    });
    if (completionError) {
      console.error(
        `Could not record learning notification ${notification.id}:`,
        completionError.message,
      );
      failures.push({
        id: notification.id,
        channel: notification.channel,
        error: `Could not record delivery status: ${completionError.message}`,
      });
      failed++;
    } else if (deliveryError) {
      console.error(`Student learning notification ${notification.id} failed: ${deliveryError}`);
      failures.push({ id: notification.id, channel: notification.channel, error: deliveryError });
      failed++;
    } else {
      sent++;
    }
  }

  return json(
    {
      claimed: claimed.length + (learningNotifications?.length ?? 0),
      sent,
      failed,
      failures,
    },
    200,
  );
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
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "profia_admission_update";
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "WhatsApp delivery requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
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

async function sendStudentLearningEmail(notification: StudentLearningNotification) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!apiKey || !sender || !siteUrl) {
    throw new Error(
      "Email delivery requires RESEND_API_KEY, SCHOOL_EMAIL_FROM, and PUBLIC_SITE_URL.",
    );
  }

  const name = payloadText(notification.payload, "student_name");
  const notificationType = payloadText(notification.payload, "notification_type");
  const title = payloadText(notification.payload, "content_title");
  const course = payloadText(notification.payload, "course_title");
  const unit = payloadOptionalText(notification.payload, "unit_title");
  const score = payloadOptionalText(notification.payload, "score");
  const grade = payloadOptionalText(notification.payload, "grade");
  const portalUrl = new URL(payloadText(notification.payload, "portal_path"), siteUrl).toString();
  const schedule = learningSchedule(notification.payload);
  const announcement = learningAnnouncement(notificationType, title, course, unit, score, grade);
  const emailTemplate = renderStudentLearningEmail({
    name,
    notificationType,
    title,
    course,
    unit,
    score,
    grade,
    schedule,
    portalUrl,
  });
  const text = [
    `Hello ${name},`,
    "",
    announcement,
    unit ? `Unit: ${unit}` : "",
    schedule,
    notificationType === "result" && score !== null ? `Score: ${score}%` : "",
    notificationType === "result" && grade !== null ? `Grade: ${grade}` : "",
    "",
    `${emailTemplate.action}: ${portalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: ["Bearer", apiKey].join(" "),
      "Content-Type": "application/json",
      "Idempotency-Key": notification.id,
    },
    body: JSON.stringify({
      from: sender,
      to: [notification.recipient],
      subject: notification.subject,
      text,
      html: emailTemplate.html,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Email provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
}

function renderStudentLearningEmail(details: {
  name: string;
  notificationType: string;
  title: string;
  course: string;
  unit: string | null;
  score: string | null;
  grade: string | null;
  schedule: string;
  portalUrl: string;
}) {
  const template = learningEmailPresentation(details.notificationType);
  const e = escapeHtml;
  const logoUrl = "https://www.profiainstitute.com/_next/static/media/logo.0114ddc1.png";
  const detailRows = [
    `<tr><td style="padding:12px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #eee8e8">Course</td><td align="right" style="padding:12px 0;color:#29232a;font-size:14px;font-weight:600;border-bottom:1px solid #eee8e8">${e(details.course)}</td></tr>`,
    details.unit
      ? `<tr><td style="padding:12px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #eee8e8">Unit</td><td align="right" style="padding:12px 0;color:#29232a;font-size:14px;font-weight:600;border-bottom:1px solid #eee8e8">${e(details.unit)}</td></tr>`
      : "",
    details.schedule
      ? `<tr><td style="padding:12px 0;color:#6b7280;font-size:13px${details.notificationType === "result" ? "" : ";border-bottom:1px solid #eee8e8"}">${e(template.scheduleLabel)}</td><td align="right" style="padding:12px 0;color:#29232a;font-size:14px;font-weight:600${details.notificationType === "result" ? "" : ";border-bottom:1px solid #eee8e8"}">${e(details.schedule.replace(/\.$/, ""))}</td></tr>`
      : "",
  ].filter(Boolean);
  const resultSummary =
    details.notificationType === "result" && (details.score !== null || details.grade !== null)
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0;background:#f6f3ee;border:1px solid #e8e1dc;border-radius:10px"><tr>${details.score !== null ? `<td width="${details.grade !== null ? "50%" : "100%"}" style="padding:16px 18px"><div style="font-size:12px;color:#625b58;text-transform:uppercase;letter-spacing:1px">Score</div><div style="margin-top:5px;font-size:24px;line-height:30px;font-weight:700;color:#680915">${e(details.score)}%</div></td>` : ""}${details.grade !== null ? `<td width="${details.score !== null ? "50%" : "100%"}" style="padding:16px 18px;${details.score !== null ? "border-left:1px solid #e8e1dc;" : ""}"><div style="font-size:12px;color:#625b58;text-transform:uppercase;letter-spacing:1px">Grade</div><div style="margin-top:5px;font-size:24px;line-height:30px;font-weight:700;color:#680915">${e(details.grade)}</div></td>` : ""}</tr></table>`
      : "";
  const previewText = `${template.heading} — ${details.title}`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${e(template.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#282525">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e8e1dc;border-radius:12px;overflow:hidden">
          <tr><td align="center" style="padding:28px 24px 20px;border-bottom:4px solid #e56b32">
            <a href="https://www.profiainstitute.com" style="text-decoration:none"><img src="${e(logoUrl)}" width="150" alt="Profia Institute" style="display:block;width:150px;height:auto;border:0"></a>
          </td></tr>
          <tr><td style="padding:32px 32px 36px">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6">Hello ${e(details.name)},</p>
            <h1 style="margin:0 0 16px;color:#680915;font-size:24px;line-height:1.3">${e(template.heading)}</h1>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.6">${e(template.description)}</p>
            <div style="margin:0 0 24px;padding:16px 18px;border-left:3px solid #e56b32;background:#f6f3ee">
              <div style="font-size:11px;line-height:16px;color:#625b58;text-transform:uppercase;letter-spacing:1px">${e(template.itemLabel)}</div>
              <div style="margin-top:5px;color:#282525;font-size:17px;line-height:24px;font-weight:700">${e(details.title)}</div>
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px">${detailRows.join("")}</table>
            ${resultSummary}
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 0"><tr><td align="center" bgcolor="#680915" style="border-radius:6px">
              <a href="${e(details.portalUrl)}" style="display:inline-block;padding:14px 24px;border:1px solid #680915;border-radius:6px;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:700">${e(template.action)}</a>
            </td></tr></table>
            <p style="margin:24px 0 0;color:#625b58;font-size:13px;line-height:1.6">If the button does not work, copy and paste this link into your browser:</p>
            <p style="margin:8px 0 0;overflow-wrap:anywhere;font-size:13px;line-height:1.6"><a href="${e(details.portalUrl)}" style="color:#680915">${e(details.portalUrl)}</a></p>
          </td></tr>
          <tr><td align="center" style="padding:18px 24px;background:#680915;color:#fff;font-size:12px;line-height:1.6">
            Profia Institute · Homa Bay, Kenya<br><a href="https://www.profiainstitute.com" style="color:#fff">www.profiainstitute.com</a><br>This is an automated learning notification.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { html, action: template.action };
}

function learningEmailPresentation(notificationType: string) {
  switch (notificationType) {
    case "cat":
      return {
        eyebrow: "NEW CAT",
        heading: "A new CAT is available",
        description: "A continuous assessment test has been added to your course.",
        itemLabel: "Assessment",
        scheduleLabel: "Schedule",
        action: "Open student portal",
      };
    case "cat_open":
      return {
        eyebrow: "CAT NOW OPEN",
        heading: "Your CAT is now open",
        description: "You can now access and complete this continuous assessment test.",
        itemLabel: "Assessment",
        scheduleLabel: "Closes",
        action: "Open CAT",
      };
    case "result":
      return {
        eyebrow: "RESULTS",
        heading: "Your results are ready",
        description: "Your published assessment result is now available in the student portal.",
        itemLabel: "Assessment result",
        scheduleLabel: "Unit",
        action: "View results",
      };
    case "assignment":
      return {
        eyebrow: "NEW ASSIGNMENT",
        heading: "A new assignment is available",
        description: "A new assignment has been published for your course.",
        itemLabel: "Assignment",
        scheduleLabel: "Deadline",
        action: "View assignment",
      };
    default:
      throw new Error(`Unsupported learning email notification type: ${notificationType}`);
  }
}

async function sendStudentLearningWhatsApp(notification: StudentLearningNotification) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const templateName =
    Deno.env.get("WHATSAPP_LEARNING_TEMPLATE_NAME") ?? "profia_learning_published";
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!accessToken || !phoneNumberId || !siteUrl) {
    throw new Error(
      "WhatsApp learning notifications require WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and PUBLIC_SITE_URL.",
    );
  }

  const notificationType = payloadText(notification.payload, "notification_type");
  const portalUrl = new URL(payloadText(notification.payload, "portal_path"), siteUrl).toString();
  const parameters = [
    payloadText(notification.payload, "student_name"),
    notificationType === "cat" || notificationType === "cat_open" ? "CAT" : "Assignment",
    payloadText(notification.payload, "content_title"),
    payloadText(notification.payload, "course_title"),
    learningSchedule(notification.payload),
    portalUrl,
  ];
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: ["Bearer", accessToken].join(" "),
        "Content-Type": "application/json",
        "Idempotency-Key": notification.id,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(notification.recipient),
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

function learningSchedule(payload: Record<string, unknown>) {
  const notificationType = payloadText(payload, "notification_type");
  const opensAt = payloadOptionalText(payload, "opens_at");
  const closesAt = payloadOptionalText(payload, "closes_at");
  if (notificationType === "result") return "";
  if (notificationType === "cat_open") {
    return `The CAT is now open${closesAt ? ` and closes ${formatKenyaDateTime(closesAt)}` : ""}.`;
  }
  if (notificationType === "cat") {
    return `Opens ${formatKenyaDateTime(opensAt)} and closes ${formatKenyaDateTime(closesAt)}.`;
  }
  return closesAt
    ? `Submission deadline: ${formatKenyaDateTime(closesAt)}.`
    : "Check the student portal for the submission deadline.";
}

function learningAnnouncement(
  notificationType: string,
  title: string,
  course: string,
  unit: string | null,
  score: string | null,
  grade: string | null,
) {
  if (notificationType === "cat_open") return `Your CAT "${title}" is now open for ${course}.`;
  if (notificationType === "cat") {
    return `A new CAT "${title}" has been uploaded for ${course}${unit ? `, unit ${unit}` : ""}.`;
  }
  if (notificationType === "result") {
    const resultDetails = [
      score === null ? null : `Score: ${score}%`,
      grade === null ? null : `Grade: ${grade}`,
    ].filter((value): value is string => value !== null);
    return `Your results for ${unit ?? title} in ${course} are available.${resultDetails.length ? ` ${resultDetails.join(". ")}.` : ""}`;
  }
  return `A new assignment "${title}" has been published for ${course}${unit ? `, unit ${unit}` : ""}.`;
}

function formatKenyaDateTime(value: string | null) {
  if (!value) return "immediately";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Notification contains an invalid date.");
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Admission notification is missing ${key}.`);
  }
  return value.trim();
}

function payloadOptionalText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Notification contains an invalid ${key}.`);
  }
  return value;
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
