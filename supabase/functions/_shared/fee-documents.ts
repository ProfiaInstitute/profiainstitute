import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bucket = "fee-documents";

type Student = {
  id: string;
  user_id: string | null;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
};

type Fee = { description: string; amount: number; due_date: string | null; created_at: string };
type Payment = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
  status: string;
};

type AdminClient = ReturnType<typeof createClient>;

export async function createFeeReceipt(supabase: AdminClient, paymentId: string) {
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,student_id,amount,method,reference,paid_at,status")
    .eq("id", paymentId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? "Confirmed payment was not found.");
  }

  const [{ data: fees, error: feesError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("fees")
        .select("description,amount,due_date,created_at")
        .eq("student_id", payment.student_id),
      supabase
        .from("payments")
        .select("id,amount,method,reference,paid_at,status")
        .eq("student_id", payment.student_id)
        .eq("status", "confirmed"),
    ]);
  if (feesError || paymentsError)
    throw new Error(
      feesError?.message ?? paymentsError?.message ?? "Could not load account summary.",
    );

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,user_id,student_number,first_name,middle_name,last_name,email")
    .eq("id", payment.student_id)
    .single();
  if (studentError || !student) throw new Error(studentError?.message ?? "Student was not found.");

  const { data: existing, error: existingError } = await supabase
    .from("fee_documents")
    .select("id,storage_path")
    .eq("payment_id", paymentId)
    .eq("document_type", "receipt")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (!existing) {
    const pdf = await buildFeePdf({
      type: "receipt",
      student,
      payment,
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
  }

  if (student.user_id) {
    const reference = payment.reference ? ` Reference: ${payment.reference}.` : "";
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
  return existing?.storage_path ?? `${student.id}/receipts/${payment.id}.pdf`;
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
        .select("id,amount,method,reference,paid_at,status")
        .eq("student_id", student.id)
        .eq("status", "confirmed")
        .order("paid_at"),
    ]);
  if (feesError || paymentsError)
    throw new Error(
      feesError?.message ?? paymentsError?.message ?? "Could not load fee statement.",
    );

  const pdf = await buildFeePdf({
    type: "statement",
    student,
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

async function buildFeePdf({
  type,
  student,
  payment,
  fees,
  payments,
}: {
  type: "receipt" | "statement";
  student: Student;
  payment?: Payment;
  fees: Fee[];
  payments: Payment[];
}) {
  const logoUrl =
    Deno.env.get("FEE_RECEIPT_LOGO_URL") ?? "https://www.profiainstitute.com/favicon.png";
  const logoResponse = await fetch(logoUrl, { signal: AbortSignal.timeout(10_000) });
  if (!logoResponse.ok)
    throw new Error(`Could not load institute logo (HTTP ${logoResponse.status}).`);
  const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedPng(logoBytes);
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
    page.drawImage(logo, { x: 42, y: 786, width: 115, height: 27 });
    page.drawText("PROFIA INSTITUTE", { x: 42, y: 758, size: 9, font: bold, color: navy });
    page.drawText(type === "receipt" ? "FEE PAYMENT RECEIPT" : "STUDENT FEE STATEMENT", {
      x: 42,
      y: 721,
      size: 17,
      font: bold,
      color: navy,
    });
    y = 691;
  };
  const ensureSpace = (height = 22) => {
    if (y < 55 + height) addPage();
  };
  const line = (label: string, value: string) => {
    ensureSpace();
    page.drawText(safeText(label), { x: 44, y, size: 9, font: bold, color: muted });
    page.drawText(safeText(value), { x: 170, y, size: 10, font, color: black });
    y -= 19;
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
  const studentName = [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");
  line("Student name", studentName);
  line("Student number", student.student_number);
  line("Email", student.email);

  if (type === "receipt" && payment) {
    line("Payment date", new Date(payment.paid_at).toLocaleString("en-KE"));
    line("Transaction reference", payment.reference ?? payment.id);
    line("Payment method", payment.method);
    section("Payment details");
    tableRow("Description", "Amount (KES)", true);
    tableRow("School fees payment", formatAmount(payment.amount));
    y -= 5;
    section("Account summary");
    const billed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    const paid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
    line("Total billed", `KES ${formatAmount(billed)}`);
    line("Total paid", `KES ${formatAmount(paid)}`);
    line("Remaining balance", `KES ${formatAmount(Math.max(0, billed - paid))}`);
    line("Payment status", "CONFIRMED");
    line("Amount received", `KES ${formatAmount(payment.amount)}`);
  } else {
    line("Statement generated", new Date().toLocaleString("en-KE"));
    section("Charges");
    tableRow("Charge description", "Amount (KES)", true);
    for (const fee of fees) tableRow(fee.description, formatAmount(fee.amount));
    const billed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    tableRow("Total billed", formatAmount(billed));
    section("Confirmed payments");
    tableRow("Reference / method", "Amount (KES)", true);
    for (const item of payments) {
      tableRow(
        `${item.reference ?? item.method} · ${new Date(item.paid_at).toLocaleDateString("en-KE")}`,
        formatAmount(item.amount),
      );
    }
    const paid = payments.reduce((sum, item) => sum + Number(item.amount), 0);
    tableRow("Total paid", formatAmount(paid));
    section("Outstanding balance");
    line("Balance", `KES ${formatAmount(Math.max(0, billed - paid))}`);
    if (paid > billed) line("Credit", `KES ${formatAmount(paid - billed)}`);
  }

  return await document.save();
}

function safeText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ");
}

function formatAmount(value: number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
