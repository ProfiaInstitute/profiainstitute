import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createFeeReceipt } from "../_shared/fee-documents.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const username = Deno.env.get("PAYHERO_API_USERNAME");
  const password = Deno.env.get("PAYHERO_API_PASSWORD");
  if (!supabaseUrl || !serviceRoleKey || !username || !password) {
    console.error("PayHero callback verification is not configured.");
    return json({ error: "Payment verification is not configured." }, 503);
  }

  let callback: unknown;
  try {
    callback = await request.json();
  } catch {
    return json({ error: "Invalid callback JSON." }, 400);
  }
  const reference =
    findValue(callback, ["external_reference", "externalReference", "reference"]) ??
    findValue(callback, ["CheckoutRequestID", "checkout_request_id"]);
  if (!reference) return json({ error: "Payment reference is missing." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let isOnlineCoursePayment = reference.startsWith("PRF-ONLINE-");
  let isFeePayment = reference.startsWith("PRF-FEE-");
  let payment = isOnlineCoursePayment
    ? await findOnlinePayment(supabase, reference)
    : isFeePayment
      ? await findFeePayment(supabase, reference)
      : await findOnlinePayment(supabase, reference);
  if (!isOnlineCoursePayment && !isFeePayment) {
    if (payment.error) {
      console.error("Could not find PayHero payment:", payment.error);
      return json({ error: "Could not find the payment." }, 500);
    }
    if (payment.data) {
      isOnlineCoursePayment = true;
    } else {
      payment = await findFeePayment(supabase, reference);
      isFeePayment = Boolean(payment.data);
    }
  }
  if (payment.error) {
    console.error("Could not find PayHero payment:", payment.error);
    return json({ error: "Could not find the payment." }, 500);
  }
  if (!isOnlineCoursePayment && !isFeePayment)
    return json({ received: true, verified: false }, 200);
  if (!payment.data) return json({ received: true, verified: false }, 200);

  let verificationResponse: Response;
  try {
    verificationResponse = await fetch(
      `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(payment.data.reference)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Could not verify PayHero callback:", errorMessage(error));
    return json({ error: "Could not verify payment status with PayHero." }, 502);
  }
  if (!verificationResponse.ok) {
    console.error("PayHero status check returned HTTP", verificationResponse.status);
    return json({ error: "PayHero has not confirmed this payment yet." }, 502);
  }
  const verified = await verificationResponse.json().catch(() => null);
  const verifiedExternalReference = findValue(verified, [
    "external_reference",
    "externalReference",
  ]);
  const verifiedAmount = findValue(verified, ["amount", "Amount", "transaction_amount"]);
  if (verifiedExternalReference && verifiedExternalReference !== payment.data.reference) {
    console.error("PayHero status response reference did not match the pending payment.");
    return json({ error: "The payment reference did not match." }, 409);
  }
  if (verifiedAmount === null || Number(verifiedAmount) !== Number(payment.data.amount)) {
    console.error("PayHero status response amount did not match the pending payment.");
    return json({ error: "The verified payment amount did not match the amount due." }, 409);
  }

  const status = normalizeStatus(findValue(verified, ["status", "Status", "payment_status"]));
  const resultCode = findValue(verified, ["ResultCode", "result_code", "resultCode"]);
  if (isSuccessful(status, resultCode)) {
    if (isOnlineCoursePayment) {
      const { error: ledgerError } = await supabase.from("payments").upsert(
        {
          student_id: payment.data.student_id,
          amount: payment.data.amount,
          method: "PayHero M-Pesa STK",
          provider: "payhero",
          reference: payment.data.reference,
          status: "confirmed",
          paid_at: new Date().toISOString(),
          raw: { verified: true, verified_status: status, payment_type: "online_course" },
        },
        { onConflict: "provider,reference", ignoreDuplicates: true },
      );
      if (ledgerError) {
        console.error(
          "Could not record verified PayHero payment in the student ledger:",
          ledgerError.message,
        );
        return json({ error: "The payment was verified, but could not be recorded." }, 500);
      }
      const { error: updateError } = await supabase
        .from("online_course_payments")
        .update({
          status: "confirmed",
          paid_at: new Date().toISOString(),
          raw: { verified_status: status, verified: true },
        })
        .eq("id", payment.data.id)
        .eq("status", "pending");
      if (updateError) {
        console.error("Could not confirm verified PayHero payment:", updateError.message);
        return json({ error: "The payment was verified, but could not be recorded." }, 500);
      }
    } else if (payment.data.status === "pending") {
      const { error: updateError } = await supabase
        .from("payments")
        .update({
          status: "confirmed",
          paid_at: new Date().toISOString(),
          raw: { verified: true, verified_status: status, payment_type: "student_fees" },
        })
        .eq("id", payment.data.id)
        .eq("status", "pending");
      if (updateError) {
        console.error("Could not confirm verified PayHero fee payment:", updateError.message);
        return json({ error: "The payment was verified, but could not be recorded." }, 500);
      }
    }

    const ledgerPaymentId = isOnlineCoursePayment
      ? await findLedgerPaymentId(supabase, payment.data.student_id, payment.data.reference)
      : payment.data.id;
    if (!ledgerPaymentId)
      return json({ error: "Confirmed payment could not be located in the ledger." }, 500);
    try {
      await createFeeReceipt(supabase, ledgerPaymentId);
    } catch (error) {
      console.error("Could not create receipt for confirmed PayHero payment:", errorMessage(error));
      return json({ error: "Payment confirmed, but receipt generation is pending." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  if (isFailed(status, resultCode)) {
    const table = isOnlineCoursePayment ? "online_course_payments" : "payments";
    const { error: updateError } = await supabase
      .from(table)
      .update({ status: "failed", raw: { verified_status: status, verified: true } })
      .eq("id", payment.data.id)
      .eq("status", "pending");
    if (updateError) {
      console.error("Could not record failed PayHero payment:", updateError.message);
      return json({ error: "The failed payment status could not be recorded." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  return json({ received: true, verified: false }, 200);
});

async function findOnlinePayment(supabase: ReturnType<typeof createClient>, reference: string) {
  const query = supabase
    .from("online_course_payments")
    .select("id,student_id,reference,amount,status,provider_checkout_id")
    .in("status", ["pending", "confirmed"]);
  const { data, error } = reference.startsWith("PRF-ONLINE-")
    ? await query.eq("reference", reference).maybeSingle()
    : await query.eq("provider_checkout_id", reference).maybeSingle();
  return { data, error: error?.message ?? null };
}

async function findFeePayment(supabase: ReturnType<typeof createClient>, reference: string) {
  const query = supabase
    .from("payments")
    .select("id,student_id,reference,amount,status,raw")
    .eq("provider", "payhero")
    .in("status", ["pending", "confirmed"]);
  const { data, error } = reference.startsWith("PRF-FEE-")
    ? await query.eq("reference", reference).maybeSingle()
    : await query.eq("raw->>provider_checkout_id", reference).maybeSingle();
  return { data, error: error?.message ?? null };
}

async function findLedgerPaymentId(
  supabase: ReturnType<typeof createClient>,
  studentId: string,
  reference: string,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("id,student_id")
    .eq("provider", "payhero")
    .eq("reference", reference)
    .maybeSingle();
  if (error || data?.student_id !== studentId) {
    console.error(
      "Could not verify PayHero ledger payment:",
      error?.message ?? "Student does not match.",
    );
    return null;
  }
  return data.id;
}

function findValue(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    if (keys.includes(key) && (typeof item === "string" || typeof item === "number"))
      return String(item);
    const nested = findValue(item, keys);
    if (nested) return nested;
  }
  return null;
}

function normalizeStatus(status: string | null) {
  return (
    status
      ?.trim()
      .toLowerCase()
      .replaceAll(/[\s_-]+/g, "") ?? ""
  );
}

function isSuccessful(status: string, resultCode: string | null) {
  return (
    ["success", "successful", "completed", "paid", "confirmed"].includes(status) ||
    resultCode === "0"
  );
}

function isFailed(status: string, resultCode: string | null) {
  return (
    ["failed", "cancelled", "canceled", "rejected", "declined", "expired"].includes(status) ||
    (resultCode !== null && resultCode !== "0")
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown PayHero verification error.";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
