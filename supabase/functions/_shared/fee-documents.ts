import { PDFDocument, degrees, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPayHeroCredentials, type PayHeroCredentials } from "./payhero.ts";

const bucket = "fee-documents";

type Student = {
  id: string;
  user_id: string | null;
  course_id?: string | null;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
};

type FeeDocumentSettings = {
  institutionName: string;
  logoUrl: string;
  phones: string[];
  email: string;
  address: string;
  paymentMethods: string;
  accountDetails: string;
};

type Fee = { description: string; amount: number; due_date: string | null; created_at: string };
type Payment = {
  id: string;
  amount: number;
  method: string;
  provider: string | null;
  reference: string | null;
  paid_at: string;
  status: string;
  raw: unknown;
};

type AdminClient = ReturnType<typeof createClient>;

export async function createFeeReceipt(supabase: AdminClient, paymentId: string) {
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,student_id,amount,method,provider,reference,paid_at,status,raw")
    .eq("id", paymentId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? "Confirmed payment was not found.");
  }

  let paymentMethod = payment.provider === "payhero" ? "M-Pesa" : payment.method;
  let paymentRaw = payment.raw;
  let mpesaReference =
    payment.provider === "payhero" ? getMpesaReference(paymentRaw) : payment.reference;
  if (payment.provider === "payhero" && !mpesaReference) {
    mpesaReference = await lookupPayHeroReceiptReference(supabase, payment);
    if (mpesaReference) {
      paymentRaw = { ...asRecord(paymentRaw), mpesa_receipt_number: mpesaReference };
    }
  }

  if (payment.provider === "payhero") {
    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({ method: paymentMethod, raw: paymentRaw })
      .eq("id", paymentId)
      .eq("status", "confirmed");
    if (paymentUpdateError)
      throw new Error(`Could not update PayHero receipt details: ${paymentUpdateError.message}`);
  }

  const [{ data: fees, error: feesError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("fees")
        .select("description,amount,due_date,created_at")
        .eq("student_id", payment.student_id),
      supabase
        .from("payments")
        .select("id,amount,method,provider,reference,paid_at,status,raw")
        .eq("student_id", payment.student_id)
        .eq("status", "confirmed"),
    ]);
  if (feesError || paymentsError)
    throw new Error(
      feesError?.message ?? paymentsError?.message ?? "Could not load account summary.",
    );

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,user_id,course_id,student_number,first_name,middle_name,last_name,email")
    .eq("id", payment.student_id)
    .single();
  if (studentError || !student) throw new Error(studentError?.message ?? "Student was not found.");
  const documentSettings = await loadFeeDocumentSettings(supabase, student.course_id ?? null);

  const receiptPayment = {
    ...payment,
    method: paymentMethod,
    raw: paymentRaw,
    receipt_reference: mpesaReference,
  };
  const pdf = await buildFeePdf({
    type: "receipt",
    student,
    documentSettings,
    payment: receiptPayment,
    fees: (fees ?? []) as Fee[],
    payments: (payments ?? []) as Payment[],
  });
  const path = `${student.id}/receipts/${payment.id}.pdf`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new Error(`Could not save payment receipt: ${uploadError.message}`);

  const { error: documentError } = await supabase.from("fee_documents").upsert(
    {
      student_id: student.id,
      payment_id: payment.id,
      document_type: "receipt",
      storage_path: path,
    },
    { onConflict: "payment_id" },
  );
  if (documentError)
    throw new Error(`Could not register payment receipt: ${documentError.message}`);

  if (student.user_id) {
    const reference = mpesaReference ? ` M-Pesa reference: ${mpesaReference}.` : "";
    const { error: notificationError } = await supabase.from("notifications").upsert(
      {
        user_id: student.user_id,
        title: "Fee payment received",
        body: `Your payment of KES ${Number(payment.amount).toLocaleString("en-KE")} has been confirmed.${reference} Your receipt is available in Fees & Payments.`,
        category: "fees",
        reference_id: payment.id,
      },
      { onConflict: "user_id,category,reference_id", ignoreDuplicates: true },
    );
    if (notificationError)
      throw new Error(`Could not notify student: ${notificationError.message}`);
  }
  return path;
}

export async function createFeeStatement(supabase: AdminClient, student: Student) {
  const [{ data: fees, error: feesError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("fees")
        .select("description,amount,due_date,created_at")
        .eq("student_id", student.id)
        .order("created_at"),
      supabase
        .from("payments")
        .select("id,amount,method,provider,reference,paid_at,status,raw")
        .eq("student_id", student.id)
        .eq("status", "confirmed")
        .order("paid_at"),
    ]);
  if (feesError || paymentsError)
    throw new Error(
      feesError?.message ?? paymentsError?.message ?? "Could not load fee statement.",
    );

  const documentSettings = await loadFeeDocumentSettings(supabase, student.course_id ?? null);
  let courseTitle: string | undefined;
  if (student.course_id) {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("title")
      .eq("id", student.course_id)
      .maybeSingle();
    if (courseError) throw new Error(`Could not load course details: ${courseError.message}`);
    courseTitle = course?.title ?? undefined;
  }
  const pdf = await buildFeePdf({
    type: "statement",
    student,
    documentSettings,
    courseTitle,
    fees: (fees ?? []) as Fee[],
    payments: (payments ?? []) as Payment[],
  });
  const path = `${student.id}/statements/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not save fee statement: ${uploadError.message}`);

  const { error: documentError } = await supabase.from("fee_documents").insert({
    student_id: student.id,
    document_type: "statement",
    storage_path: path,
  });
  if (documentError) {
    const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
    if (cleanupError)
      console.error("Could not clean up an unregistered fee statement:", cleanupError.message);
    throw new Error(`Could not register fee statement: ${documentError.message}`);
  }
  return path;
}

export async function createFeeStatementTemplate(
  supabase: AdminClient,
  courseId: string,
  template: { paymentMethods: string; accountDetails: string },
) {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id,title,school_id,schools(name)")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course) throw new Error(courseError?.message ?? "Course was not found.");

  const documentSettings = await loadFeeDocumentSettings(supabase, courseId, template);
  const pdf = await buildFeePdf({
    type: "template",
    student: {
      id: "",
      user_id: null,
      student_number: "[Admission number]",
      first_name: "[Student full name]",
      middle_name: null,
      last_name: "",
      email: "[Student email]",
    },
    documentSettings,
    courseTitle: course.title,
    schoolName:
      course.schools && typeof course.schools === "object" && "name" in course.schools
        ? String(course.schools.name)
        : "",
    fees: [],
    payments: [],
  });
  const path = `templates/${course.id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not save statement template: ${uploadError.message}`);
  return path;
}

async function buildFeePdf({
  type,
  student,
  payment,
  fees,
  payments,
  documentSettings,
  courseTitle,
  schoolName,
}: {
  type: "receipt" | "statement" | "template";
  student: Student;
  payment?: Payment & { receipt_reference?: string | null };
  fees: Fee[];
  payments: Payment[];
  documentSettings: FeeDocumentSettings;
  courseTitle?: string;
  schoolName?: string;
}) {
  const logoResponse = await fetch(documentSettings.logoUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!logoResponse.ok)
    throw new Error(`Could not load institute logo (HTTP ${logoResponse.status}).`);
  const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = isPng(logoBytes)
    ? await document.embedPng(logoBytes)
    : isJpeg(logoBytes)
      ? await document.embedJpg(logoBytes)
      : null;
  if (!logo) throw new Error("The institute badge must be a PNG or JPEG image.");
  const pageSize: [number, number] = [595.28, 841.89];
  const navy = rgb(0.08, 0.2, 0.38);
  const muted = rgb(0.35, 0.39, 0.45);
  const black = rgb(0.11, 0.13, 0.16);
  let page = document.addPage(pageSize);
  let y = 0;

  const addPage = () => {
    page = document.addPage(pageSize);
    drawHeader();
  };
  const drawHeader = () => {
    const logoSize = 42;
    const logoScale = Math.min(logoSize / logo.width, logoSize / logo.height);
    const logoWidth = logo.width * logoScale;
    const logoHeight = logo.height * logoScale;
    page.drawImage(logo, {
      x: 42,
      y: 780 + (logoSize - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
    });
    page.drawText(safeText(documentSettings.institutionName), {
      x: 94,
      y: 804,
      size: 12,
      font: bold,
      color: navy,
    });
    page.drawText(safeText(documentSettings.address), {
      x: 94,
      y: 786,
      size: 8,
      font,
      color: muted,
    });
    page.drawText(
      type === "receipt"
        ? "FEE PAYMENT RECEIPT"
        : type === "template"
          ? "FEE STATEMENT TEMPLATE"
          : "STUDENT FEE STATEMENT",
      {
        x: 42,
        y: 721,
        size: 17,
        font: bold,
        color: navy,
      },
    );
    if (type === "receipt") drawPaidStamp();
    y = 691;
  };
  const drawPaidStamp = () => {
    const red = rgb(0.72, 0.12, 0.16);
    page.drawEllipse({
      x: 493,
      y: 797,
      xScale: 42,
      yScale: 23,
      borderColor: red,
      borderWidth: 2,
    });
    page.drawText("PAID", {
      x: 470,
      y: 792,
      size: 15,
      font: bold,
      color: red,
      rotate: degrees(-10),
    });
  };
  const ensureSpace = (height = 22) => {
    if (y < 55 + height) addPage();
  };
  const line = (label: string, value: string) => {
    const valueLines = wrapText(safeText(value), font, 10, 372);
    const lineHeight = 14;
    ensureSpace(Math.max(22, valueLines.length * lineHeight + 4));
    page.drawText(safeText(label), { x: 44, y, size: 9, font: bold, color: muted });
    valueLines.forEach((valueLine, index) => {
      page.drawText(valueLine, {
        x: 170,
        y: y - index * lineHeight,
        size: 10,
        font,
        color: black,
      });
    });
    y -= Math.max(19, valueLines.length * lineHeight + 4);
  };
  const section = (title: string) => {
    ensureSpace(30);
    y -= 7;
    page.drawText(safeText(title), { x: 44, y, size: 11, font: bold, color: navy });
    y -= 20;
  };
  const tableRow = (left: string, right: string, isHeader = false) => {
    ensureSpace(23);
    page.drawText(safeText(left).slice(0, 72), {
      x: 44,
      y,
      size: isHeader ? 8 : 9,
      font: isHeader ? bold : font,
      color: isHeader ? muted : black,
    });
    const text = safeText(right);
    const width = (isHeader ? bold : font).widthOfTextAtSize(text, isHeader ? 8 : 9);
    page.drawText(text, {
      x: 551 - width,
      y,
      size: isHeader ? 8 : 9,
      font: isHeader ? bold : font,
      color: isHeader ? muted : black,
    });
    y -= 19;
  };

  drawHeader();
  if (type !== "template") {
    const studentName = [student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(" ");
    line("Student name", studentName);
    line("Admission number", student.student_number);
    line("Email", student.email);
  }

  if (type === "template") {
    if (schoolName) line("School", schoolName);
    line("Course", courseTitle ?? "[Course name]");
    line("Student name", "[Student full name]");
    line("Admission number", "[Admission number]");
    line("Email / phone", "[Student email and phone]");
    line("Statement period", "[Start date] to [End date]");
    section("Fee charges");
    tableRow("Description", "Amount (KES)", true);
    tableRow("[Fee item]", "[Amount]");
    tableRow("Total billed", "[Total billed]");
    section("Payments received");
    tableRow("Date / method / reference", "Amount (KES)", true);
    tableRow("[Payment details]", "[Amount]");
    section("Account balance");
    line("Total paid", "[Total paid]");
    line("Outstanding balance", "[Balance]");
  } else if (type === "receipt" && payment) {
    line("Payment date", new Date(payment.paid_at).toLocaleString("en-KE"));
    const transactionReference =
      payment.receipt_reference ??
      (payment.provider === "payhero" ? "Not available" : (payment.reference ?? payment.id));
    line(
      payment.provider === "payhero" ? "M-Pesa transaction reference" : "Transaction reference",
      transactionReference,
    );
    line("Payment method", payment.provider === "payhero" ? "M-Pesa" : payment.method);
    section("Payment details");
    tableRow("Description", "Amount (KES)", true);
    tableRow("School fees payment", formatAmount(payment.amount));
    y -= 5;
    section("Account summary");
    const billed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    const paid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
    const chronologicalPayments = [...payments].sort(
      (left, right) =>
        new Date(left.paid_at).getTime() - new Date(right.paid_at).getTime() ||
        left.id.localeCompare(right.id),
    );
    const paymentIndex = chronologicalPayments.findIndex((item) => item.id === payment.id);
    if (paymentIndex < 0)
      throw new Error("The confirmed payment is missing from its account ledger.");
    const paidAtReceipt = chronologicalPayments
      .slice(0, paymentIndex + 1)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const remainingBalance = Math.max(0, billed - paidAtReceipt);
    line("Total billed", `KES ${formatAmount(billed)}`);
    line("Total paid", `KES ${formatAmount(paid)}`);
    line(
      "Balance after payment",
      remainingBalance === 0 ? "NULL" : `KES ${formatAmount(remainingBalance)}`,
    );
    line("Payment status", "PAID");
    line("Amount paid", `KES ${formatAmount(payment.amount)}`);
  } else {
    line("Statement generated", new Date().toLocaleString("en-KE"));
    if (courseTitle) line("Course", courseTitle);
    section("Charges");
    tableRow("Charge description", "Amount (KES)", true);
    for (const fee of fees) tableRow(fee.description, formatAmount(fee.amount));
    const billed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    tableRow("Total billed", formatAmount(billed));
    section("Confirmed payments");
    tableRow("Reference / method", "Amount (KES)", true);
    for (const item of payments) {
      const raw = asRecord(item.raw);
      const reference =
        item.provider === "payhero"
          ? (getMpesaReference(raw) ?? "M-Pesa reference not available")
          : (item.reference ?? item.method);
      const method = item.provider === "payhero" ? "M-Pesa" : item.method;
      tableRow(
        `${reference} / ${method} · ${new Date(item.paid_at).toLocaleDateString("en-KE")}`,
        formatAmount(item.amount),
      );
    }
    const paid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
    tableRow("Total paid", formatAmount(paid));
    section("Outstanding balance");
    line("Balance", `KES ${formatAmount(Math.max(0, billed - paid))}`);
    if (paid > billed) line("Credit", `KES ${formatAmount(paid - billed)}`);
  }

  section("Official payment methods");
  for (const detail of documentSettings.paymentMethods.split(/\r?\n/).filter(Boolean))
    line("Payment method", detail);
  if (documentSettings.accountDetails.trim()) {
    section("School payment accounts");
    for (const detail of documentSettings.accountDetails.split(/\r?\n/).filter(Boolean))
      line("Account details", detail);
  }
  section("School contacts");
  if (documentSettings.phones.length) line("Phone", documentSettings.phones.join(" / "));
  if (documentSettings.email) line("Email", documentSettings.email);
  if (documentSettings.address) line("Address", documentSettings.address);

  return await document.save();
}

async function loadFeeDocumentSettings(
  supabase: AdminClient,
  courseId: string | null,
  override?: { paymentMethods: string; accountDetails: string },
): Promise<FeeDocumentSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key,value")
    .in("key", ["general", "fees.statement_templates"]);
  if (error) throw new Error(`Could not load school statement settings: ${error.message}`);
  const settings = new Map((data ?? []).map((row) => [row.key, asRecord(row.value)]));
  const general = settings.get("general") ?? {};
  const templates = settings.get("fees.statement_templates") ?? {};
  const byCourse = courseId ? asRecord(templates[courseId]) : {};
  const paymentMethods = override?.paymentMethods ?? stringValue(byCourse.payment_methods);
  return {
    institutionName: stringValue(general.institution_name) || "Profia Institute",
    logoUrl: resolveLogoUrl(
      Deno.env.get("FEE_RECEIPT_LOGO_URL") ??
        stringValue(general.logo_url) ??
        "https://www.profiainstitute.com/favicon.png",
    ),
    phones: Array.isArray(general.phones)
      ? general.phones.filter((phone): phone is string => typeof phone === "string")
      : [],
    email: stringValue(general.email) ?? "",
    address: stringValue(general.address) ?? stringValue(general.location) ?? "",
    paymentMethods: paymentMethods || "PayHero M-Pesa STK push from the Student Portal",
    accountDetails: override?.accountDetails ?? stringValue(byCourse.account_details) ?? "",
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function wrapText(
  value: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  maxWidth: number,
) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function resolveLogoUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://www.profiainstitute.com${value}`;
  return "https://www.profiainstitute.com/favicon.png";
}

function safeText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ");
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getMpesaReference(raw: unknown): string | null {
  const record = asRecord(raw);
  for (const key of ["mpesa_receipt_number", "MpesaReceiptNumber", "third_party_reference"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

async function lookupPayHeroReceiptReference(
  supabase: AdminClient,
  payment: Payment & { raw: unknown },
): Promise<string | null> {
  let credentials: PayHeroCredentials | null = null;
  try {
    credentials = await loadPayHeroCredentials(supabase);
  } catch (error) {
    console.error("Could not load PayHero settings to backfill receipt reference:", error);
    return null;
  }
  if (!credentials) return null;

  const raw = asRecord(payment.raw);
  const lookupReference =
    (typeof raw.provider_reference === "string" && raw.provider_reference) ||
    (typeof raw.provider_checkout_id === "string" && raw.provider_checkout_id) ||
    payment.reference;
  if (!lookupReference) return null;

  let response: Response;
  try {
    response = await fetch(
      `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(lookupReference)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    console.error("Could not retrieve historic PayHero receipt reference:", error);
    return null;
  }
  if (!response.ok) {
    console.error("Historic PayHero receipt lookup returned HTTP", response.status);
    return null;
  }

  const verified = await response.json().catch((error) => {
    console.error("Could not parse historic PayHero receipt lookup:", error);
    return null;
  });
  const record = asRecord(verified);
  if (
    record.success !== true ||
    String(record.status ?? "").toUpperCase() !== "SUCCESS" ||
    record.reference !== lookupReference ||
    (record.amount !== undefined && Number(record.amount) !== Number(payment.amount))
  ) {
    console.error("Historic PayHero receipt lookup did not verify the payment.");
    return null;
  }
  const receiptReference =
    (typeof record.third_party_reference === "string" && record.third_party_reference) ||
    (typeof record.provider_reference === "string" && record.provider_reference);
  if (!receiptReference) return null;

  const updatedRaw = { ...raw, mpesa_receipt_number: receiptReference };
  const { error } = await supabase
    .from("payments")
    .update({ raw: updatedRaw, method: "M-Pesa" })
    .eq("id", payment.id)
    .eq("status", "confirmed");
  if (error) {
    console.error("Could not save historic PayHero receipt reference:", error.message);
    throw new Error(`Could not save M-Pesa receipt reference: ${error.message}`);
  }
  return receiptReference;
}

function formatAmount(value: number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
