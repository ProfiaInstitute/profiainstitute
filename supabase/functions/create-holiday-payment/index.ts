import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  describePayHeroRejection,
  loadPayHeroCredentials,
  normalizeKenyanPhoneForPayHero,
  type PayHeroCredentials,
  type PayHeroSupabaseClient,
} from "../_shared/payhero.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type HolidayApplication = {
  id: string;
  confirmation_code: string;
  phone: string;
  guardian_phone: string | null;
  applicant_name: string;
  amount_due: number;
  deposit_amount: number;
  payment_status: string;
  status: string;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Holiday program payment service is not configured.");
    return json({ error: "Online payments are not configured. Contact the Institute." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: "The payment request is invalid." }, 400);
    body = parsed;
  } catch {
    return json({ error: "The payment request is not valid JSON." }, 400);
  }

  const action = body.action;
  const confirmationCode =
    typeof body.confirmationCode === "string" ? body.confirmationCode.trim().toUpperCase() : "";
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone : "";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!/^[A-Z0-9]{10}$/.test(confirmationCode) || !contactPhone.trim()) {
    return json(
      { error: "A valid application confirmation code and contact phone are required." },
      400,
    );
  }
  if (action !== "initiate" && action !== "status") {
    return json({ error: "Choose a valid payment action." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: application, error: applicationError } = await supabase
    .from("holiday_program_applications")
    .select(
      "id,confirmation_code,phone,guardian_phone,applicant_name,amount_due,deposit_amount,payment_status,status",
    )
    .eq("confirmation_code", confirmationCode)
    .maybeSingle();
  if (applicationError) {
    console.error("Could not load holiday program application:", applicationError.message);
    return json({ error: "Could not verify this application. Please retry." }, 500);
  }
  if (
    !application ||
    normalizeContactPhone(contactPhone) !== normalizeContactPhone(application.phone)
  ) {
    return json({ error: "The application details could not be verified." }, 404);
  }

  if (action === "status") {
    if (!reference) return json({ error: "A payment reference is required." }, 400);
    return await paymentStatus(supabase, application, reference);
  }

  if (application.status === "rejected" || application.status === "withdrawn") {
    return json({ error: "This application is no longer eligible for payment." }, 409);
  }

  let credentials: PayHeroCredentials | null;
  try {
    credentials = await loadPayHeroCredentials(supabase);
  } catch (error) {
    console.error("Could not load holiday PayHero settings:", errorMessage(error));
    return json({ error: "Could not load payment settings. Please retry." }, 500);
  }
  if (!credentials) {
    console.error("PayHero holiday program payments are not configured.");
    return json({ error: "Online payments are not configured. Contact the Institute." }, 503);
  }

  const paymentPhoneValue = typeof body.paymentPhone === "string" ? body.paymentPhone : "";
  const payerPhone = normalizeKenyanPhoneForPayHero(paymentPhoneValue);
  if (!payerPhone) {
    return json({ error: "Enter a valid Kenyan M-Pesa mobile number." }, 400);
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("holiday_program_payments")
    .select("amount,status,reference,provider_reference,provider_checkout_id")
    .eq("application_id", application.id);
  if (paymentsError) {
    console.error("Could not check holiday payment history:", paymentsError.message);
    return json({ error: "Could not check the application payment balance." }, 500);
  }
  const confirmedTotal = (payments ?? [])
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pendingPayment = (payments ?? []).find((payment) => payment.status === "pending");
  if (pendingPayment) {
    return json(
      {
        success: true,
        reference: pendingPayment.reference,
        amount: pendingPayment.amount,
        status: "pending",
        message: "A payment is already awaiting confirmation.",
      },
      200,
    );
  }

  const remaining = Math.floor(Number(application.amount_due) - confirmedTotal);
  if (remaining <= 0) {
    return json({ error: "This holiday program application is fully paid." }, 409);
  }

  let amount: number;
  if (body.paymentType === "deposit") {
    amount = Math.ceil(Number(application.deposit_amount) - confirmedTotal);
    if (amount <= 0) {
      return json({ error: "The required deposit has already been paid." }, 409);
    }
  } else if (body.paymentType === "custom") {
    if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
      return json({ error: "Enter a whole-number amount greater than zero." }, 400);
    }
    amount = body.amount;
  } else {
    return json({ error: "Choose the deposit or a custom payment amount." }, 400);
  }

  if (amount > remaining) {
    return json({ error: `Payment cannot exceed the remaining balance of KES ${remaining}.` }, 409);
  }

  const paymentPhone = payerPhone;
  const referenceValue = `PRF-HOLIDAY-${crypto.randomUUID()}`;
  const { data: payment, error: insertError } = await supabase
    .from("holiday_program_payments")
    .insert({
      application_id: application.id,
      reference: referenceValue,
      amount,
      payer_phone: paymentPhone,
      raw: { payment_type: "holiday_program" },
    })
    .select("id,reference,amount")
    .single();
  if (insertError?.code === "23505") {
    const { data: existingPayment, error: existingError } = await supabase
      .from("holiday_program_payments")
      .select("reference,amount,status")
      .eq("application_id", application.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existingError) {
      console.error("Could not load existing holiday payment:", existingError.message);
      return json({ error: "A payment request is already being processed." }, 409);
    }
    if (existingPayment) {
      return json(
        {
          success: true,
          reference: existingPayment.reference,
          amount: existingPayment.amount,
          status: existingPayment.status,
        },
        200,
      );
    }
  }
  if (insertError || !payment) {
    console.error("Could not create holiday payment:", insertError?.message);
    return json({ error: "Could not create a payment request. Please retry." }, 500);
  }

  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch("https://backend.payhero.co.ke/api/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: payment.amount,
        phone_number: paymentPhone,
        channel_id: credentials.channelId,
        provider: "m-pesa",
        external_reference: payment.reference,
        customer_name: application.applicant_name,
        callback_url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/payhero-callback`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    await markPaymentFailed(supabase, payment.id, errorMessage(error));
    return json({ error: "Could not connect to PayHero. No payment was confirmed." }, 502);
  }

  const gatewayBody = await gatewayResponse.json().catch(() => null);
  if (!gatewayResponse.ok || !isAcceptedResponse(gatewayBody)) {
    const rejection = describePayHeroRejection(gatewayResponse.status, gatewayBody);
    await markPaymentFailed(supabase, payment.id, rejection);
    console.error("PayHero holiday payment request failed:", rejection);
    return json({ error: rejection }, 502);
  }

  const providerReference = findValue(gatewayBody, ["reference"]);
  const checkoutId = findValue(gatewayBody, [
    "CheckoutRequestID",
    "checkout_request_id",
    "checkout_id",
  ]);
  if (!providerReference) {
    await markPaymentFailed(supabase, payment.id, "PayHero response did not include a reference.");
    console.error(
      "PayHero accepted a holiday request without returning its transaction reference.",
    );
    return json(
      { error: "PayHero returned an incomplete payment response. Please contact support." },
      502,
    );
  }

  const { error: updateError } = await supabase
    .from("holiday_program_payments")
    .update({
      provider_reference: providerReference,
      provider_checkout_id: checkoutId,
      raw: {
        payment_type: "holiday_program",
        request_accepted: true,
        provider_reference: providerReference,
        provider_checkout_id: checkoutId,
      },
    })
    .eq("id", payment.id)
    .eq("status", "pending");
  if (updateError) {
    console.error("Could not save holiday PayHero checkout identifier:", updateError.message);
    return json(
      {
        error: "PayHero accepted the request, but its status could not be saved. Contact support.",
      },
      500,
    );
  }

  return json(
    { success: true, reference: payment.reference, amount: payment.amount, status: "pending" },
    200,
  );
});

async function paymentStatus(
  supabase: PayHeroSupabaseClient,
  application: HolidayApplication,
  reference: string,
) {
  const { data: payment, error: paymentError } = await supabase
    .from("holiday_program_payments")
    .select("reference,amount,status,mpesa_receipt_number")
    .eq("application_id", application.id)
    .eq("reference", reference)
    .maybeSingle();
  if (paymentError) {
    console.error("Could not load holiday payment status:", paymentError.message);
    return json({ error: "Could not check payment status. Please retry." }, 500);
  }
  if (!payment) return json({ error: "Payment reference was not found." }, 404);

  const { data: payments, error: paymentsError } = await supabase
    .from("holiday_program_payments")
    .select("amount,status")
    .eq("application_id", application.id)
    .eq("status", "confirmed");
  if (paymentsError) {
    console.error("Could not calculate holiday payment balance:", paymentsError.message);
    return json({ error: "Could not check payment status. Please retry." }, 500);
  }
  const totalPaid = (payments ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  return json(
    {
      success: true,
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      receipt: payment.mpesa_receipt_number,
      totalPaid,
      amountDue: Number(application.amount_due),
      remaining: Math.max(0, Number(application.amount_due) - totalPaid),
      applicationPaymentStatus: application.payment_status,
    },
    200,
  );
}

async function markPaymentFailed(supabase: PayHeroSupabaseClient, id: string, reason: string) {
  const { error } = await supabase
    .from("holiday_program_payments")
    .update({
      status: "failed",
      raw: { payment_type: "holiday_program", error: reason.slice(0, 500) },
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) console.error("Could not mark failed holiday payment:", error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeContactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  return digits;
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

function isAcceptedResponse(value: unknown) {
  return Boolean(
    value && typeof value === "object" && "success" in value && value.success === true,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown PayHero payment error.";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
