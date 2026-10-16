import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return mpesaResponse(1, "Method not allowed.");
  if (!hasValidCallbackToken(request)) return mpesaResponse(1, "Unauthorized callback.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedShortcode = Deno.env.get("MPESA_BUSINESS_SHORTCODE");
  if (!supabaseUrl || !serviceRoleKey || !expectedShortcode) {
    console.error("M-Pesa C2B payment confirmation is not configured.");
    return mpesaResponse(1, "Payment confirmation is not configured.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return mpesaResponse(1, "Invalid callback JSON.");
  }

  const callback = getCallback(payload);
  const transactionId = getText(callback.TransID)?.trim();
  const shortcode = getText(callback.BusinessShortCode)?.trim();
  const studentReference = getText(callback.BillRefNumber)?.trim();
  const amount = Number(callback.TransAmount);
  const phoneNumber = getText(callback.MSISDN);
  if (
    !transactionId ||
    !shortcode ||
    !studentReference ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return mpesaResponse(1, "Incomplete payment confirmation.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: receiptError } = await supabase.from("mpesa_c2b_receipts").upsert(
    {
      transaction_id: transactionId,
      business_shortcode: shortcode,
      student_reference: studentReference,
      amount,
      phone_number: phoneNumber,
      status: "unmatched",
      raw: payload,
    },
    { onConflict: "transaction_id", ignoreDuplicates: true },
  );
  if (receiptError) {
    console.error("Could not save M-Pesa C2B receipt:", receiptError.message);
    return mpesaResponse(1, "Could not save the payment confirmation.");
  }

  const { data: storedReceipt, error: storedReceiptError } = await supabase
    .from("mpesa_c2b_receipts")
    .select("business_shortcode,student_reference,amount")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (
    storedReceiptError ||
    !storedReceipt ||
    storedReceipt.business_shortcode !== shortcode ||
    storedReceipt.student_reference !== studentReference ||
    Number(storedReceipt.amount) !== amount
  ) {
    console.error(
      "M-Pesa transaction reference conflicts with a previously received receipt:",
      storedReceiptError?.message ?? transactionId,
    );
    return mpesaResponse(0, "Received for reconciliation.");
  }

  if (shortcode !== expectedShortcode) {
    console.error("M-Pesa C2B receipt used an unexpected business shortcode.");
    return mpesaResponse(0, "Received for reconciliation.");
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("student_number", studentReference)
    .maybeSingle();
  if (studentError) {
    console.error("Could not match M-Pesa receipt to student:", studentError.message);
    return mpesaResponse(1, "Could not match the payment to a student.");
  }
  if (!student) {
    console.error("M-Pesa receipt has no matching student:", transactionId);
    return mpesaResponse(0, "Received for reconciliation.");
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .upsert(
      {
        student_id: student.id,
        amount,
        method: "M-Pesa Paybill",
        provider: "safaricom-daraja",
        reference: transactionId,
        status: "confirmed",
        paid_at: new Date().toISOString(),
        raw: { business_shortcode: shortcode, student_reference: studentReference },
      },
      { onConflict: "provider,reference", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (paymentError) {
    console.error("Could not record matched M-Pesa payment:", paymentError.message);
    return mpesaResponse(1, "Could not record the confirmed payment.");
  }

  let paymentId = payment?.id;
  if (!paymentId) {
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id,student_id")
      .eq("provider", "safaricom-daraja")
      .eq("reference", transactionId)
      .maybeSingle();
    if (existingPaymentError || existingPayment?.student_id !== student.id) {
      console.error(
        "Could not verify the previously recorded M-Pesa payment:",
        existingPaymentError?.message ?? "Student does not match.",
      );
      return mpesaResponse(1, "Could not verify the recorded payment.");
    }
    paymentId = existingPayment.id;
  }

  const { error: receiptUpdateError } = await supabase
    .from("mpesa_c2b_receipts")
    .update({ status: "matched", payment_id: paymentId })
    .eq("transaction_id", transactionId);
  if (receiptUpdateError) {
    console.error("Could not mark M-Pesa receipt as matched:", receiptUpdateError.message);
    return mpesaResponse(1, "Payment recorded; receipt reconciliation is pending.");
  }

  return mpesaResponse(0, "Accepted.");
});

function getCallback(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const body = root.Body;
  if (body && typeof body === "object") {
    const c2b = (body as Record<string, unknown>).stkCallback;
    if (c2b && typeof c2b === "object") return c2b as Record<string, unknown>;
  }
  return root;
}

function getText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function hasValidCallbackToken(request: Request) {
  const token = Deno.env.get("MPESA_C2B_CALLBACK_TOKEN");
  return Boolean(token) && new URL(request.url).searchParams.get("token") === token;
}

function mpesaResponse(resultCode: number, resultDesc: string) {
  return new Response(JSON.stringify({ ResultCode: resultCode, ResultDesc: resultDesc }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
