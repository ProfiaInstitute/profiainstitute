import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const maxAttachments = 10;
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxTotalBytes = 15 * 1024 * 1024;
const hasControlCharacters = (value: string) =>
  /[\r\n]/.test(value) || value.includes(String.fromCharCode(0));

type StagedAttachment = {
  filename: string;
  content: string;
  content_type: string;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Contact message replies are not configured.");
    return json(
      { error: "Message replies are unavailable. Contact the system administrator." },
      503,
    );
  }
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to reply to messages." }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);
  const actorId = authData.user.id;

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId)
    .in("role", ["super_admin", "admissions_admin"]);
  if (rolesError) {
    console.error("Could not verify contact message reply permissions:", rolesError.message);
    return json({ error: "Could not verify your message permissions." }, 500);
  }
  if (!roles?.length) return json({ error: "You are not allowed to reply to messages." }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: "Invalid request body." }, 400);
    body = parsed;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const messageId = body["messageId"];
  const subject = typeof body["subject"] === "string" ? body["subject"].trim() : "";
  const replyBody = typeof body["body"] === "string" ? body["body"].trim() : "";
  const stagedValue = body["stagedFiles"];
  if (typeof messageId !== "string" || !isUuid(messageId)) {
    return json({ error: "The selected contact message is invalid." }, 400);
  }
  if (!subject || subject.length > 200 || hasControlCharacters(subject)) {
    return json({ error: "Enter an email subject of 1–200 characters without line breaks." }, 400);
  }
  if (!replyBody || replyBody.length > 10_000) {
    return json({ error: "Enter a reply of 1–10,000 characters." }, 400);
  }
  if (!Array.isArray(stagedValue) || stagedValue.length > maxAttachments) {
    return json({ error: "Attach no more than 10 files." }, 400);
  }

  const stagedPaths: string[] = [];
  for (const value of stagedValue) {
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      !value.startsWith(`${actorId}/`) ||
      value.split("/").includes("..") ||
      value.includes("\\")
    ) {
      return json({ error: "One of the uploaded files is invalid." }, 400);
    }
    stagedPaths.push(value);
  }

  const { data: message, error: messageError } = await supabase
    .from("contact_messages")
    .select("id,name,email,subject")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) {
    console.error("Could not load contact message for reply:", messageError.message);
    return json({ error: "Could not load the selected message." }, 500);
  }
  if (!message) return json({ error: "The selected contact message no longer exists." }, 404);
  const recipient = typeof message.email === "string" ? message.email.trim() : "";
  if (!isEmail(recipient)) {
    return json({ error: "This message has no valid sender email address to reply to." }, 400);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  if (!apiKey || !sender) {
    console.error("Contact message replies require RESEND_API_KEY and SCHOOL_EMAIL_FROM.");
    return json(
      { error: "Email delivery is not configured. Contact the system administrator." },
      503,
    );
  }

  const { data: recentReplies, error: limitError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("actor_id", actorId)
    .eq("action", "admin_contact_message_reply")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(20);
  if (limitError) {
    console.error("Could not check the contact reply sending limit:", limitError.message);
    return json({ error: "Could not check the email sending limit." }, 500);
  }
  if ((recentReplies?.length ?? 0) >= 20) {
    return json({ error: "Email sending limit reached. Try again later." }, 429);
  }

  const { data: auditEntry, error: auditError } = await supabase
    .from("audit_logs")
    .insert({
      actor_id: actorId,
      action: "admin_contact_message_reply",
      entity: "contact_message",
      entity_id: messageId,
      details: { recipient, subject, attachment_count: stagedPaths.length, status: "pending" },
    })
    .select("id")
    .single();
  if (auditError || !auditEntry) {
    console.error("Could not record contact message reply:", auditError?.message);
    return json({ error: "Could not record this reply request." }, 500);
  }

  const { data: replyRecord, error: replyRecordError } = await supabase
    .from("contact_message_replies")
    .insert({
      message_id: messageId,
      sender_id: actorId,
      subject,
      body: replyBody,
      attachment_names: stagedPaths.map((path) =>
        safeFileName(path.split("/").pop() ?? "attachment"),
      ),
      status: "pending",
    })
    .select("id")
    .single();
  if (replyRecordError || !replyRecord) {
    console.error("Could not save contact message reply:", replyRecordError?.message);
    return json({ error: "Could not save this reply." }, 500);
  }

  try {
    const attachments: StagedAttachment[] = [];
    for (const path of stagedPaths) {
      const { data: file, error } = await supabase.storage
        .from("email-share-staging")
        .download(path);
      if (error || !file) throw new Error("An uploaded attachment could not be read.");
      attachments.push(await toAttachment(path.split("/").pop() ?? "attachment", file));
    }
    const totalBytes = attachments.reduce((total, attachment) => {
      return total + Math.floor((attachment.content.length * 3) / 4);
    }, 0);
    if (totalBytes > maxTotalBytes) {
      throw new Error("Attachments must total 15 MB or less.");
    }
    if (attachments.some((attachment) => attachment.content.length > maxAttachmentBytes * 1.4)) {
      throw new Error("Each attachment must be 5 MB or smaller.");
    }

    const emailHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(replyBody).replaceAll("\n", "<br>")}</div>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        subject,
        text: replyBody,
        html: emailHtml,
        attachments,
      }),
    });
    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 500);
      throw new Error(`The email provider returned ${response.status}: ${providerMessage}`);
    }

    const sentAt = new Date().toISOString();
    const { error: saveReplyError } = await supabase
      .from("contact_message_replies")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", replyRecord.id);
    let deliveryWarning: string | null = null;
    if (saveReplyError) {
      console.error("Email was sent, but reply status could not be saved:", saveReplyError.message);
      deliveryWarning =
        "The email was delivered, but the reply status could not be saved. Refresh the message before replying again.";
    }
    const { error: messageUpdateError } = await supabase
      .from("contact_messages")
      .update({ status: "responded" })
      .eq("id", messageId);
    if (messageUpdateError) {
      console.error(
        "Email was sent, but message status could not be updated:",
        messageUpdateError.message,
      );
      deliveryWarning ??=
        "The email was delivered, but the message status could not be updated. Refresh the message before replying again.";
    }
    const { error: auditUpdateError } = await supabase
      .from("audit_logs")
      .update({
        details: {
          recipient,
          subject,
          attachment_count: attachments.length,
          status: "sent",
        },
      })
      .eq("id", auditEntry.id);
    if (auditUpdateError) {
      console.error("Could not record contact reply delivery status:", auditUpdateError.message);
    }
    return json(
      {
        success: true,
        warning: deliveryWarning,
        reply: {
          id: replyRecord.id,
          message_id: messageId,
          sender_id: actorId,
          subject,
          body: replyBody,
          attachment_names: stagedPaths.map((path) =>
            safeFileName(path.split("/").pop() ?? "attachment"),
          ),
          status: "sent",
          created_at: sentAt,
          sent_at: sentAt,
        },
      },
      200,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("Could not send contact message reply:", reason);
    await supabase
      .from("contact_message_replies")
      .update({ status: "failed" })
      .eq("id", replyRecord.id);
    await supabase
      .from("audit_logs")
      .update({ details: { recipient, subject, status: "failed", error: reason.slice(0, 300) } })
      .eq("id", auditEntry.id);
    return json(
      { error: "Could not send this reply. Check the message and attachments, then try again." },
      502,
    );
  } finally {
    if (stagedPaths.length) {
      const { error } = await supabase.storage.from("email-share-staging").remove(stagedPaths);
      if (error) console.error("Could not remove temporary reply attachments:", error.message);
    }
  }
});

async function toAttachment(fileName: string, file: Blob): Promise<StagedAttachment> {
  if (file.size > maxAttachmentBytes) throw new Error("Each attachment must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return {
    filename: safeFileName(fileName),
    content: btoa(binary),
    content_type: file.type || "application/octet-stream",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function safeFileName(value: string): string {
  return (
    Array.from(value, (character) =>
      /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? "-" : character,
    )
      .join("")
      .slice(0, 180) || "attachment"
  );
}

function escapeHtml(value: string): string {
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
