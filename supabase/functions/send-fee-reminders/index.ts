import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const maxRecipients = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasControlCharacters = (value: string) =>
  /[\r\n]/.test(value) || value.includes(String.fromCharCode(0));

type Student = {
  id: string;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  if (!supabaseUrl || !serviceRoleKey || !apiKey || !sender) {
    console.error("Fee reminders require Supabase service credentials and Resend configuration.");
    return json(
      { error: "Email delivery is not configured. Contact the system administrator." },
      503,
    );
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to send fee reminders." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin");
  if (rolesError) {
    console.error("Could not verify fee reminder permissions:", rolesError.message);
    return json({ error: "Could not verify your email permissions." }, 500);
  }
  if (!roles?.length) return json({ error: "Only super admins can send fee reminders." }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: "Invalid request body." }, 400);
    body = parsed;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const studentIds = body["studentIds"];
  const subject = typeof body["subject"] === "string" ? body["subject"].trim() : "";
  const message = typeof body["body"] === "string" ? body["body"] : "";
  const extraInfo = typeof body["extraInfo"] === "string" ? body["extraInfo"].trim() : "";
  if (
    !Array.isArray(studentIds) ||
    studentIds.length < 1 ||
    studentIds.length > maxRecipients ||
    studentIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))
  ) {
    return json({ error: `Select between 1 and ${maxRecipients} valid students.` }, 400);
  }
  if (new Set(studentIds).size !== studentIds.length) {
    return json({ error: "Each student can only be selected once." }, 400);
  }
  if (!subject || subject.length > 200 || hasControlCharacters(subject)) {
    return json({ error: "Enter an email subject of 1–200 characters without line breaks." }, 400);
  }
  if (!message.trim() || message.length > 10_000) {
    return json({ error: "Enter an email message of 1–10,000 characters." }, 400);
  }
  if (extraInfo.length > 3_000) return json({ error: "Extra information is too long." }, 400);

  const { data: recentAttempts, error: attemptsError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("actor_id", authData.user.id)
    .eq("action", "fee_balance_reminder")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(100);
  if (attemptsError) {
    console.error("Could not check the fee reminder sending limit:", attemptsError.message);
    return json({ error: "Could not check the email sending limit." }, 500);
  }
  if ((recentAttempts?.length ?? 0) + studentIds.length > 100) {
    return json({ error: "Fee reminder sending limit reached. Try again later." }, 429);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const studentId of studentIds as string[]) {
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id,student_number,first_name,middle_name,last_name,email")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError || !student) {
      failed += 1;
      errors.push(`Student ${studentId}: record unavailable.`);
      continue;
    }

    const [feesResult, paymentsResult] = await Promise.all([
      supabase.from("fees").select("amount").eq("student_id", studentId),
      supabase
        .from("payments")
        .select("amount")
        .eq("student_id", studentId)
        .eq("status", "confirmed"),
    ]);
    if (feesResult.error || paymentsResult.error) {
      failed += 1;
      errors.push(`${student.student_number}: could not calculate the balance.`);
      continue;
    }
    const billed = (feesResult.data ?? []).reduce((total, fee) => total + Number(fee.amount), 0);
    const paid = (paymentsResult.data ?? []).reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );
    const balance = billed - paid;
    if (balance <= 0 || !emailPattern.test(student.email.trim())) {
      skipped += 1;
      errors.push(
        balance <= 0
          ? `${student.student_number}: no outstanding balance.`
          : `${student.student_number}: no valid email address on record.`,
      );
      continue;
    }

    const studentName = [student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(" ");
    const values: Record<string, string> = {
      student_name: studentName,
      student_number: student.student_number,
      billed: formatKes(billed),
      paid: formatKes(paid),
      balance: formatKes(balance),
      extra_info: extraInfo,
    };
    const renderedSubject = renderTemplate(subject, values).trim();
    const renderedMessage = renderTemplate(message, values).trim();
    const messageWithExtraInfo =
      extraInfo && !message.includes("{extra_info}")
        ? `${renderedMessage}\n\n${extraInfo}`
        : renderedMessage;
    if (!renderedSubject || renderedSubject.length > 200 || hasControlCharacters(renderedSubject)) {
      failed += 1;
      errors.push(`${student.student_number}: rendered subject is invalid.`);
      continue;
    }

    const { data: auditEntry, error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        actor_id: authData.user.id,
        action: "fee_balance_reminder",
        entity: "student",
        entity_id: student.id,
        details: {
          recipient: student.email,
          subject: renderedSubject,
          balance,
          status: "pending",
        },
      })
      .select("id")
      .single();
    if (auditError || !auditEntry) {
      failed += 1;
      errors.push(`${student.student_number}: could not record the email attempt.`);
      continue;
    }

    try {
      const emailHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(messageWithExtraInfo).replaceAll("\n", "<br>")}</div>`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          from: sender,
          to: [student.email.trim()],
          subject: renderedSubject,
          text: messageWithExtraInfo,
          html: emailHtml,
        }),
      });
      if (!response.ok) {
        const providerMessage = (await response.text()).slice(0, 300);
        throw new Error(`Resend returned ${response.status}: ${providerMessage}`);
      }
      sent += 1;
      const { error: auditUpdateError } = await supabase
        .from("audit_logs")
        .update({
          details: {
            recipient: student.email,
            subject: renderedSubject,
            balance,
            status: "sent",
          },
        })
        .eq("id", auditEntry.id);
      if (auditUpdateError)
        console.error("Could not record email status:", auditUpdateError.message);
    } catch (error) {
      failed += 1;
      errors.push(`${student.student_number}: email delivery failed.`);
      const reason = error instanceof Error ? error.message : "Email delivery failed.";
      console.error(`Fee reminder delivery failed for ${student.student_number}:`, reason);
      const { error: auditUpdateError } = await supabase
        .from("audit_logs")
        .update({
          details: {
            recipient: student.email,
            subject: renderedSubject,
            balance,
            status: "failed",
            error: reason.slice(0, 300),
          },
        })
        .eq("id", auditEntry.id);
      if (auditUpdateError)
        console.error("Could not record email failure:", auditUpdateError.message);
    }
  }

  return json({ sent, failed, skipped, errors: errors.slice(0, 10) }, 200);
});

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(
    /\{(student_name|student_number|billed|paid|balance|extra_info)\}/g,
    (_match, key: string) => values[key] ?? "",
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatKes(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
