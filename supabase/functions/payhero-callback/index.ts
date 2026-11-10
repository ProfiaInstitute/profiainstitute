import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createFeeReceipt } from "../_shared/fee-documents.ts";
import { loadPayHeroCredentials, type PayHeroCredentials } from "../_shared/payhero.ts";

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
  if (!supabaseUrl || !serviceRoleKey) {
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
    findValue(callback, ["ExternalReference", "external_reference", "externalReference"]) ??
    findValue(callback, ["CheckoutRequestID", "checkout_request_id"]);
  if (!reference) return json({ error: "Payment reference is missing." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let credentials: PayHeroCredentials | null;
  try {
    credentials = await loadPayHeroCredentials(supabase);
  } catch (error) {
    console.error("Could not load PayHero callback settings:", errorMessage(error));
    return json({ error: "Could not load payment verification settings." }, 500);
  }
  if (!credentials) {
    console.error("PayHero callback verification is not configured.");
    return json({ error: "Payment verification is not configured." }, 503);
  }
  if (reference.startsWith("PRF-HOLIDAY-")) {
    return await handleHolidayPayment(supabase, reference, callback, credentials);
  }

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
  if (!isOnlineCoursePayment && !isFeePayment) {
    const holidayPayment = await findHolidayPayment(supabase, reference);
    if (holidayPayment.error) {
      console.error("Could not find PayHero holiday payment:", holidayPayment.error);
      return json({ error: "Could not find the holiday program payment." }, 500);
    }
    if (holidayPayment.data) {
      return await handleHolidayPayment(supabase, reference, callback, credentials);
    }
  }
  if (payment.error) {
    console.error("Could not find PayHero payment:", payment.error);
    return json({ error: "Could not find the payment." }, 500);
  }
  if (!isOnlineCoursePayment && !isFeePayment)
    return json({ received: true, verified: false }, 200);
  if (!payment.data) return json({ received: true, verified: false }, 200);

  const providerReference =
    "provider_reference" in payment.data
      ? payment.data.provider_reference
      : findValue(payment.data.raw, ["provider_reference"]);
  if (!providerReference) {
    console.error("PayHero payment has no saved provider reference:", payment.data.reference);
    return json({ error: "The payment reference is not ready for verification." }, 409);
  }
  const callbackAmount = findValue(callback, ["Amount", "amount"]);
  if (callbackAmount !== null && Number(callbackAmount) !== Number(payment.data.amount)) {
    console.error("PayHero callback amount did not match the pending payment.");
    return json({ error: "The callback payment amount did not match the amount due." }, 409);
  }

  let verificationResponse: Response;
  try {
    verificationResponse = await fetch(
      `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(providerReference)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
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
  const verifiedReference = findValue(verified, ["reference"]);
  if (verifiedReference !== providerReference) {
    console.error("PayHero status response reference did not match the pending payment.");
    return json({ error: "The payment reference did not match." }, 409);
  }

  const status = normalizeStatus(findValue(verified, ["status", "Status", "payment_status"]));
  const resultCode = findValue(verified, ["ResultCode", "result_code", "resultCode"]);
  const verifiedAmount = findValue(verified, ["amount", "Amount"]);
  if (verifiedAmount !== null && Number(verifiedAmount) !== Number(payment.data.amount)) {
    console.error("PayHero status amount did not match the pending payment.");
    return json({ error: "The verified payment amount did not match the amount due." }, 409);
  }
  const mpesaReceiptNumber = findValue(verified, [
    "MpesaReceiptNumber",
    "mpesa_receipt_number",
    "third_party_reference",
    "provider_reference",
  ]);
  if (isSuccessful(status, resultCode)) {
    if (!hasSuccessfulResponse(verified)) {
      console.error("PayHero did not report a successful transaction for the callback.");
      return json({ error: "PayHero has not confirmed this payment yet." }, 502);
    }

    if (isOnlineCoursePayment) {
      const { error: ledgerError } = await supabase.from("payments").upsert(
        {
          student_id: payment.data.student_id,
          amount: payment.data.amount,
          method: "M-Pesa",
          provider: "payhero",
          reference: payment.data.reference,
          status: "confirmed",
          paid_at: new Date().toISOString(),
          raw: {
            verified: true,
            verified_status: status,
            payment_type: "online_course",
            provider_reference: providerReference,
            ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
          },
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
          raw: {
            verified_status: status,
            verified: true,
            ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
          },
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
          method: "M-Pesa",
          raw: {
            verified: true,
            verified_status: status,
            payment_type: "student_fees",
            provider_reference: providerReference,
            provider_checkout_id: findValue(payment.data.raw, ["provider_checkout_id"]),
            ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
          },
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
    const { data: ledgerPayment, error: ledgerReadError } = await supabase
      .from("payments")
      .select("raw")
      .eq("id", ledgerPaymentId)
      .eq("status", "confirmed")
      .maybeSingle();
    if (ledgerReadError || !ledgerPayment) {
      console.error(
        "Could not load the verified payment ledger entry:",
        ledgerReadError?.message ?? "Payment was not found.",
      );
      return json({ error: "The payment was verified, but could not be recorded." }, 500);
    }
    const ledgerRaw =
      ledgerPayment.raw &&
      typeof ledgerPayment.raw === "object" &&
      !Array.isArray(ledgerPayment.raw)
        ? ledgerPayment.raw
        : {};
    const { error: receiptDetailsError } = await supabase
      .from("payments")
      .update({
        method: "M-Pesa",
        raw: {
          ...ledgerRaw,
          verified: true,
          verified_status: status,
          provider_reference: providerReference,
          ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
        },
      })
      .eq("id", ledgerPaymentId)
      .eq("status", "confirmed");
    if (receiptDetailsError) {
      console.error("Could not save verified M-Pesa receipt details:", receiptDetailsError.message);
      return json(
        { error: "The payment was verified, but its receipt details could not be saved." },
        500,
      );
    }
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

async function handleHolidayPayment(
  supabase: ReturnType<typeof createClient>,
  reference: string,
  callback: unknown,
  credentials: PayHeroCredentials,
) {
  const paymentResult = await findHolidayPayment(supabase, reference);
  if (paymentResult.error) {
    console.error("Could not find PayHero holiday payment:", paymentResult.error);
    return json({ error: "Could not find the holiday program payment." }, 500);
  }
  const payment = paymentResult.data;
  if (!payment) return json({ received: true, verified: false }, 200);
  if (!payment.provider_reference) {
    console.error("Holiday payment has no saved PayHero reference:", payment.reference);
    return json({ error: "The payment reference is not ready for verification." }, 409);
  }

  const callbackAmount = findValue(callback, ["Amount", "amount"]);
  if (callbackAmount !== null && Number(callbackAmount) !== Number(payment.amount)) {
    console.error("PayHero holiday callback amount did not match the pending payment.");
    return json({ error: "The callback payment amount did not match the amount due." }, 409);
  }

  let verificationResponse: Response;
  try {
    verificationResponse = await fetch(
      `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(payment.provider_reference)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Could not verify PayHero holiday callback:", errorMessage(error));
    return json({ error: "Could not verify payment status with PayHero." }, 502);
  }
  if (!verificationResponse.ok) {
    console.error("PayHero holiday status check returned HTTP", verificationResponse.status);
    return json({ error: "PayHero has not confirmed this payment yet." }, 502);
  }

  const verified = await verificationResponse.json().catch(() => null);
  if (findValue(verified, ["reference"]) !== payment.provider_reference) {
    console.error("PayHero holiday status reference did not match the pending payment.");
    return json({ error: "The payment reference did not match." }, 409);
  }
  const status = normalizeStatus(findValue(verified, ["status", "Status", "payment_status"]));
  const resultCode = findValue(verified, ["ResultCode", "result_code", "resultCode"]);
  const verifiedAmount = findValue(verified, ["amount", "Amount"]);
  if (verifiedAmount !== null && Number(verifiedAmount) !== Number(payment.amount)) {
    console.error("PayHero holiday verification amount did not match the pending payment.");
    return json({ error: "The verified payment amount did not match the amount due." }, 409);
  }
  const receipt = findValue(verified, [
    "MpesaReceiptNumber",
    "mpesa_receipt_number",
    "third_party_reference",
  ]);

  if (isSuccessful(status, resultCode)) {
    if (!hasSuccessfulResponse(verified)) {
      console.error("PayHero did not report a successful holiday transaction.");
      return json({ error: "PayHero has not confirmed this payment yet." }, 502);
    }
    const { error } = await supabase.rpc("confirm_holiday_program_payment", {
      p_payment_id: payment.id,
      p_verified_status: status,
      p_mpesa_receipt_number: receipt,
    });
    if (error) {
      console.error("Could not record verified holiday payment:", error.message);
      return json({ error: "Payment was verified, but could not be recorded." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  if (isFailed(status, resultCode)) {
    const { error } = await supabase
      .from("holiday_program_payments")
      .update({
        status: "failed",
        raw: { verified: true, verified_status: status, payment_type: "holiday_program" },
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (error) {
      console.error("Could not record failed holiday payment:", error.message);
      return json({ error: "The failed payment status could not be recorded." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  return json({ received: true, verified: false }, 200);
}

async function findOnlinePayment(supabase: ReturnType<typeof createClient>, reference: string) {
  const query = supabase
    .from("online_course_payments")
    .select("id,student_id,reference,amount,status,provider_checkout_id,provider_reference")
    .in("status", ["pending", "confirmed"]);
  const { data, error } = reference.startsWith("PRF-ONLINE-")
    ? await query.eq("reference", reference).maybeSingle()
    : await query.eq("provider_checkout_id", reference).maybeSingle();
  return { data, error: error?.message ?? null };
}

async function findHolidayPayment(supabase: ReturnType<typeof createClient>, reference: string) {
  const query = supabase
    .from("holiday_program_payments")
    .select("id,reference,amount,status,provider_reference,provider_checkout_id")
    .in("status", ["pending", "confirmed"]);
  const { data, error } = reference.startsWith("PRF-HOLIDAY-")
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown PayHero verification error.";
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

function hasSuccessfulResponse(value: unknown) {
  return Boolean(
    value && typeof value === "object" && "success" in value && value.success === true,
  );
}

function isFailed(status: string, resultCode: string | null) {
  return (
    ["failed", "cancelled", "canceled", "rejected", "declined", "expired"].includes(status) ||
    (resultCode !== null && resultCode !== "0")
  );
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
