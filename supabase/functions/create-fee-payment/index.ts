import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  describePayHeroRejection,
  loadPayHeroCredentials,
  normalizeKenyanPhoneForPayHero,
  type PayHeroSupabaseClient,
  type PayHeroCredentials,
} from "../_shared/payhero.ts";

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
    console.error("PayHero fee payment is not configured.");
    return json(
      { error: "Online fee payments are not configured. Contact the accounts office." },
      503,
    );
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to pay your fees." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);

  let credentials: PayHeroCredentials | null;
  try {
    credentials = await loadPayHeroCredentials(supabase);
  } catch (error) {
    console.error("Could not load PayHero fee payment settings:", errorMessage(error));
    return json({ error: "Could not load online fee payment settings. Please retry." }, 500);
  }
  if (!credentials) {
    console.error("PayHero fee payment is not configured.");
    return json(
      { error: "Online fee payments are not configured. Contact the accounts office." },
      503,
    );
  }

  let body: { amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The payment request is not valid JSON." }, 400);
  }
  if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
    return json({ error: "Enter a whole-number amount greater than zero." }, 400);
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,first_name,last_name,phone")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (studentError || !student)
    return json({ error: "Your student account could not be found." }, 403);

  const [{ data: charges, error: chargesError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("fees").select("amount").eq("student_id", student.id),
      supabase.from("payments").select("amount,status").eq("student_id", student.id),
    ]);
  if (chargesError || paymentsError) {
    console.error(
      "Could not calculate fee balance:",
      chargesError?.message ?? paymentsError?.message,
    );
    return json({ error: "Could not calculate your fee balance. Please retry." }, 500);
  }
  const billed = (charges ?? []).reduce((sum, fee) => sum + Number(fee.amount), 0);
  const paid = (payments ?? [])
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = Math.floor(billed - paid);
  if (balance <= 0) return json({ error: "There is no outstanding fee balance to pay." }, 409);
  if (body.amount > balance)
    return json(
      { error: `Payment amount cannot exceed your outstanding balance of KES ${balance}.` },
      409,
    );
  if ((payments ?? []).some((payment) => payment.status === "pending"))
    return json(
      { error: "A fee payment is already awaiting confirmation. Wait before retrying." },
      409,
    );

  const phone = normalizeKenyanPhoneForPayHero(student.phone ?? "");
  if (!phone) {
    return json(
      { error: "Add a valid Kenyan mobile number to your student profile before paying." },
      400,
    );
  }

  const reference = `PRF-FEE-${crypto.randomUUID()}`;
  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      student_id: student.id,
      amount: body.amount,
      method: "PayHero M-Pesa STK",
      provider: "payhero",
      reference,
      status: "pending",
      raw: { payment_type: "student_fees" },
    })
    .select("id,reference,amount")
    .single();
  if (insertError || !payment) {
    if (insertError?.code === "23505")
      return json(
        { error: "A fee payment is already awaiting confirmation. Wait before retrying." },
        409,
      );
    console.error("Could not create fee payment:", insertError?.message);
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
        amount: body.amount,
        phone_number: phone,
        channel_id: credentials.channelId,
        provider: "m-pesa",
        external_reference: payment.reference,
        customer_name: `${student.first_name} ${student.last_name}`.trim(),
        callback_url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/payhero-callback`,
      }),
    });
  } catch (error) {
    await markPaymentFailed(supabase, payment.id, errorMessage(error));
    return json({ error: "Could not connect to PayHero. No payment was confirmed." }, 502);
  }

  const gatewayBody = await gatewayResponse.json().catch(() => null);
  if (!gatewayResponse.ok || !isAcceptedResponse(gatewayBody)) {
    const rejection = describePayHeroRejection(gatewayResponse.status, gatewayBody);
    await markPaymentFailed(supabase, payment.id, rejection);
    console.error("PayHero fee payment request failed:", rejection);
    return json({ error: rejection }, 502);
  }

  const checkoutId = findValue(gatewayBody, [
    "CheckoutRequestID",
    "checkout_request_id",
    "checkout_id",
  ]);
  const providerReference = findValue(gatewayBody, ["reference"]);
  if (!providerReference) {
    await markPaymentFailed(supabase, payment.id, "PayHero response did not include a reference.");
    console.error("PayHero accepted a fee request without returning its transaction reference.");
    return json(
      { error: "PayHero returned an incomplete payment response. Please contact support." },
      502,
    );
  }
  const { error: updateError } = await supabase
    .from("payments")
    .update({
      raw: {
        payment_type: "student_fees",
        request_accepted: true,
        provider_checkout_id: checkoutId,
        provider_reference: providerReference,
      },
    })
    .eq("id", payment.id)
    .eq("status", "pending");
  if (updateError) {
    console.error("Could not save PayHero fee checkout identifier:", updateError.message);
    return json(
      {
        error:
          "PayHero accepted the request, but its status could not be saved. Contact support before retrying.",
      },
      500,
    );
  }
  return json({ success: true, reference: payment.reference, amount: payment.amount }, 200);
});

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

async function markPaymentFailed(supabase: PayHeroSupabaseClient, id: string, reason: string) {
  const { error } = await supabase
    .from("payments")
    .update({ status: "failed", raw: { payment_type: "student_fees", error: reason } })
    .eq("id", id)
    .eq("status", "pending");
  if (error) console.error("Could not mark failed PayHero fee payment:", error.message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown PayHero request error.";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
