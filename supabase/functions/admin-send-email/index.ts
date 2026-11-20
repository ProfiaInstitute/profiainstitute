import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";
import { createFeeReceipt, createFeeStatement } from "../_shared/fee-documents.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = ["super_admin", "admissions_admin"];
const maxAttachments = 10;
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxTotalBytes = 15 * 1024 * 1024;
const hasControlCharacters = (value: string) =>
  /[\r\n]/.test(value) || value.includes(String.fromCharCode(0));

type ShareDocument = {
  id: string;
  kind:
    | "student_document"
    | "application_document"
    | "admission_letter"
    | "fee_statement"
    | "fee_receipt";
  label: string;
  fileName: string;
  courseId?: string;
};

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
    console.error("Admin email sharing is not configured.");
    return json({ error: "Email sharing is unavailable. Contact the system administrator." }, 503);
  }
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to send email." }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, token);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .in("role", allowedRoles);
  if (rolesError) {
    console.error("Could not verify email sharing permissions:", rolesError.message);
    return json({ error: "Could not verify your email permissions." }, 500);
  }
  if (!roles?.length)
    return json({ error: "You are not allowed to send email from this portal." }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: "Invalid request body." }, 400);
    body = parsed;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const studentId = body["studentId"];
  if (typeof studentId !== "string" || !isUuid(studentId))
    return json({ error: "Select a valid student record." }, 400);
  const studentResult = await supabase
    .from("students")
    .select(
      "id,user_id,application_id,course_id,student_number,first_name,middle_name,last_name,email",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (studentResult.error || !studentResult.data) {
    console.error("Could not load student for email sharing:", studentResult.error?.message);
    return json({ error: "The student record could not be found." }, 404);
  }

  if (body["action"] === "list") {
    const result = await listShareableDocuments(supabase, studentResult.data);
    if (!result.ok) return json({ error: result.error }, 500);
    return json({ documents: result.documents }, 200);
  }
  if (body["action"] !== "send") return json({ error: "Choose an email action." }, 400);

  const to = typeof body["to"] === "string" ? body["to"].trim() : "";
  const subject = typeof body["subject"] === "string" ? body["subject"].trim() : "";
  const message = typeof body["message"] === "string" ? body["message"].trim() : "";
  const documentIds = body["documents"];
  const stagedPaths = body["stagedFiles"];
  if (!isEmail(to)) return json({ error: "Enter a valid recipient email address." }, 400);
  if (!subject || subject.length > 200)
    return json({ error: "Enter a subject of 1–200 characters." }, 400);
  if (hasControlCharacters(subject))
    return json({ error: "The email subject cannot contain line breaks." }, 400);
  if (message.length > 10_000)
    return json({ error: "The email message must be 10,000 characters or fewer." }, 400);
  if (!Array.isArray(documentIds) || documentIds.length > maxAttachments)
    return json({ error: "Select no more than 10 existing documents." }, 400);
  if (!Array.isArray(stagedPaths) || stagedPaths.length > maxAttachments)
    return json({ error: "Attach no more than 10 files from your computer." }, 400);

  const selectedDocuments: ShareDocument[] = [];
  for (const value of documentIds) {
    if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["kind"] !== "string")
      return json({ error: "One of the selected documents is invalid." }, 400);
    if (
      !["student_document", "application_document", "fee_statement", "fee_receipt"].includes(
        value["kind"],
      )
    ) {
      return json({ error: "One of the selected documents is not available for sharing." }, 400);
    }
    selectedDocuments.push({
      id: value["id"],
      kind: value["kind"] as ShareDocument["kind"],
      label: "",
      fileName: "",
    });
  }

  const selectedPaths: string[] = [];
  for (const value of stagedPaths) {
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      !value.startsWith(`${authData.user.id}/`) ||
      value.split("/").includes("..") ||
      value.includes("\\")
    ) {
      return json({ error: "One of the uploaded files is invalid." }, 400);
    }
    selectedPaths.push(value);
  }
  if (selectedDocuments.length + selectedPaths.length === 0 && !message)
    return json({ error: "Add a message or attach at least one document." }, 400);
  if (selectedDocuments.length + selectedPaths.length > maxAttachments)
    return json({ error: "Select no more than 10 attachments in total." }, 400);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SCHOOL_EMAIL_FROM");
  if (!apiKey || !sender) {
    console.error("Email sharing requires RESEND_API_KEY and SCHOOL_EMAIL_FROM.");
    return json(
      { error: "Email delivery is not configured. Contact the system administrator." },
      503,
    );
  }

  const { data: recentAttempts, error: attemptsError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("actor_id", authData.user.id)
    .eq("action", "admin_email_send")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(20);
  if (attemptsError) {
    console.error("Could not check the email sending limit:", attemptsError.message);
    return json({ error: "Could not check the email sending limit." }, 500);
  }
  if ((recentAttempts?.length ?? 0) >= 20)
    return json({ error: "Email sending limit reached. Try again later." }, 429);

  const { data: auditEntry, error: auditError } = await supabase
    .from("audit_logs")
    .insert({
      actor_id: authData.user.id,
      action: "admin_email_send",
      entity: "student",
      entity_id: studentId,
      details: {
        recipient: to,
        subject,
        attachment_count: selectedDocuments.length + selectedPaths.length,
      },
    })
    .select("id")
    .single();
  if (auditError || !auditEntry) {
    console.error("Could not record email sharing attempt:", auditError?.message);
    return json({ error: "Could not record this email request." }, 500);
  }

  try {
    const attachments: StagedAttachment[] = [];
    for (const document of selectedDocuments) {
      const attachment = await getDocumentAttachment(supabase, studentResult.data, document);
      attachments.push(attachment);
    }
    for (const path of selectedPaths) {
      const { data: file, error } = await supabase.storage
        .from("email-share-staging")
        .download(path);
      if (error || !file) throw new Error("An uploaded attachment could not be read.");
      attachments.push(await toAttachment(path.split("/").pop() ?? "document", file));
    }
    const totalBytes = attachments.reduce(
      (total, attachment) => total + Math.floor((attachment.content.length * 3) / 4),
      0,
    );
    if (totalBytes > maxTotalBytes)
      return json({ error: "Attachments must total 15 MB or less." }, 413);
    if (attachments.some((attachment) => attachment.content.length > maxAttachmentBytes * 1.4))
      return json({ error: "Each attachment must be 5 MB or smaller." }, 413);

    const emailHtml = message
      ? `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(message).replaceAll("\n", "<br>")}</div>`
      : "<p>Please find the attached documents from Profia Institute.</p>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject,
        text: message || "Please find the attached documents from Profia Institute.",
        html: emailHtml,
        attachments,
      }),
    });
    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 500);
      throw new Error(`The email provider returned ${response.status}: ${providerMessage}`);
    }
    const { error: auditUpdateError } = await supabase
      .from("audit_logs")
      .update({
        details: { recipient: to, subject, attachment_count: attachments.length, status: "sent" },
      })
      .eq("id", auditEntry.id);
    if (auditUpdateError)
      console.error("Could not record email delivery status:", auditUpdateError.message);
    return json({ success: true }, 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("Could not send admin email:", reason);
    const { error: auditUpdateError } = await supabase
      .from("audit_logs")
      .update({
        details: { recipient: to, subject, status: "failed", error: reason.slice(0, 300) },
      })
      .eq("id", auditEntry.id);
    if (auditUpdateError)
      console.error("Could not record email failure:", auditUpdateError.message);
    return json(
      { error: "Could not send this email. Check the recipient and attachments, then try again." },
      502,
    );
  } finally {
    if (selectedPaths.length) {
      const { error } = await supabase.storage.from("email-share-staging").remove(selectedPaths);
      if (error) console.error("Could not remove temporary email attachments:", error.message);
    }
  }
});

async function listShareableDocuments(
  supabase: ReturnType<typeof createClient>,
  student: {
    id: string;
    application_id: string | null;
    course_id: string | null;
  },
): Promise<{ ok: true; documents: ShareDocument[] } | { ok: false; error: string }> {
  const [studentDocs, applicationDocs, payments, enrollments, onlineEnrollments] =
    await Promise.all([
      supabase
        .from("student_documents")
        .select("id,document_type,file_name")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false }),
      student.application_id
        ? supabase
            .from("application_documents")
            .select("id,doc_type,file_name")
            .eq("application_id", student.application_id)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("payments")
        .select("id,paid_at")
        .eq("student_id", student.id)
        .eq("status", "confirmed")
        .order("paid_at", { ascending: false })
        .limit(20),
      supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", student.id)
        .eq("status", "active"),
      supabase
        .from("online_course_enrollments")
        .select("course_id")
        .eq("student_id", student.id)
        .eq("status", "active"),
    ]);

  const error =
    studentDocs.error ??
    applicationDocs.error ??
    payments.error ??
    enrollments.error ??
    onlineEnrollments.error;
  if (error) {
    console.error("Could not list documents for email sharing:", error.message);
    return { ok: false, error: "Could not load the student's available documents." };
  }

  const courseIds = [
    ...new Set([
      ...(student.course_id ? [student.course_id] : []),
      ...(enrollments.data ?? []).map((row) => row.course_id as string),
      ...(onlineEnrollments.data ?? []).map((row) => row.course_id as string),
    ]),
  ];
  const activeCourseIds = new Set([
    ...(enrollments.data ?? []).map((row) => row.course_id as string),
    ...(onlineEnrollments.data ?? []).map((row) => row.course_id as string),
  ]);
  const courseQuery = courseIds.length
    ? await supabase.from("courses").select("id,title").in("id", courseIds)
    : { data: [], error: null };
  if (courseQuery.error) {
    console.error(
      "Could not load courses for admission letter options:",
      courseQuery.error.message,
    );
    return { ok: false, error: "Could not load the student's enrolled courses." };
  }
  const courseNames = new Map((courseQuery.data ?? []).map((course) => [course.id, course.title]));

  const documents: ShareDocument[] = [
    ...(studentDocs.data ?? []).map((document) => ({
      id: document.id,
      kind: "student_document" as const,
      label: `${document.document_type}: ${document.file_name}`,
      fileName: document.file_name,
    })),
    ...(applicationDocs.data ?? []).map((document) => ({
      id: document.id,
      kind: "application_document" as const,
      label: `${document.doc_type}: ${document.file_name ?? "Application document"}`,
      fileName: document.file_name ?? "application-document",
    })),
  ];

  documents.push({
    id: student.id,
    kind: "fee_statement",
    label: "Current fee statement",
    fileName: "Profia-fee-statement.pdf",
  });
  for (const payment of payments.data ?? []) {
    documents.push({
      id: payment.id,
      kind: "fee_receipt",
      label: `Fee receipt · ${new Date(payment.paid_at).toLocaleDateString("en-KE")}`,
      fileName: "Profia-fee-receipt.pdf",
    });
  }
  for (const courseId of activeCourseIds) {
    documents.push({
      id: courseId,
      kind: "admission_letter",
      label: `Admission letter · ${courseNames.get(courseId) ?? "Enrolled course"}`,
      fileName: "admission-letter.docx",
      courseId,
    });
  }
  return { ok: true, documents };
}

async function getDocumentAttachment(
  supabase: ReturnType<typeof createClient>,
  student: {
    id: string;
    application_id: string | null;
    course_id: string | null;
    student_number: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
    user_id: string | null;
  },
  document: ShareDocument,
): Promise<StagedAttachment> {
  if (document.kind === "fee_statement") {
    const { data: existingStatement, error: existingStatementError } = await supabase
      .from("fee_documents")
      .select("storage_path")
      .eq("student_id", student.id)
      .eq("document_type", "statement")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingStatementError)
      throw new Error(
        `Could not load the current fee statement: ${existingStatementError.message}`,
      );
    if (existingStatement?.storage_path) {
      const { data, error } = await supabase.storage
        .from("fee-documents")
        .download(existingStatement.storage_path);
      if (!error && data) return await toAttachment("Profia-fee-statement.pdf", data);
      console.error(
        "Could not load the saved fee statement; generating a fresh copy:",
        error?.message,
      );
    }
    const newPath = await createFeeStatement(supabase, student);
    const { data, error } = await supabase.storage.from("fee-documents").download(newPath);
    if (error || !data) throw new Error("The fee statement could not be generated.");
    return await toAttachment("Profia-fee-statement.pdf", data);
  }
  if (document.kind === "fee_receipt") {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id")
      .eq("id", document.id)
      .eq("student_id", student.id)
      .eq("status", "confirmed")
      .maybeSingle();
    if (paymentError || !payment)
      throw new Error("A selected payment receipt is no longer available.");
    const path = await createFeeReceipt(supabase, payment.id, { notifyStudent: false });
    const { data, error } = await supabase.storage.from("fee-documents").download(path);
    if (error || !data) throw new Error("A payment receipt could not be generated.");
    return await toAttachment("Profia-fee-receipt.pdf", data);
  }

  let bucket: string;
  let path: string;
  let fileName: string;
  if (document.kind === "student_document") {
    const { data, error } = await supabase
      .from("student_documents")
      .select("file_path,file_name")
      .eq("id", document.id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (error || !data) throw new Error("A selected student document is no longer available.");
    bucket = "student-documents";
    path = data.file_path;
    fileName = data.file_name;
  } else if (document.kind === "application_document") {
    const { data, error } = await supabase
      .from("application_documents")
      .select("file_path,file_name,application_id")
      .eq("id", document.id)
      .maybeSingle();
    if (error || !data || data.application_id !== student.application_id)
      throw new Error("A selected application document is no longer available.");
    bucket = "application-docs";
    path = data.file_path;
    fileName = data.file_name ?? "application-document";
  } else {
    throw new Error("This document must be prepared in the student portal.");
  }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Could not load ${fileName}.`);
  return await toAttachment(fileName, data);
}

async function toAttachment(fileName: string, file: Blob): Promise<StagedAttachment> {
  if (file.size > maxAttachmentBytes) throw new Error("Each attachment must be 5 MB or smaller.");
  return {
    filename: safeFileName(fileName),
    content: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    content_type: file.type || mimeFromName(fileName),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function mimeFromName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "doc") return "application/msword";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/octet-stream";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
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
