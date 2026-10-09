import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  let query = supabase
    .from("online_course_payments")
    .select("id,reference,amount,status,provider_checkout_id")
    .eq("status", "pending");
  query = reference.startsWith("PRF-ONLINE-")
    ? query.eq("reference", reference)
    : query.eq("provider_checkout_id", reference);
  const { data: payment, error: paymentError } = await query.maybeSingle();
  if (paymentError) {
    console.error("Could not find PayHero payment:", paymentError.message);
    return json({ error: "Could not find the payment." }, 500);
  }
  if (!payment) return json({ received: true, verified: false }, 200);

  let verificationResponse: Response;
  try {
    verificationResponse = await fetch(
      `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(payment.reference)}`,
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
  const verifiedExternalReference = findValue(verified, ["external_reference", "externalReference"]);
  const verifiedAmount = findValue(verified, ["amount", "Amount", "transaction_amount"]);
  if (verifiedExternalReference && verifiedExternalReference !== payment.reference) {
    console.error("PayHero status response reference did not match the pending payment.");
    return json({ error: "The payment reference did not match." }, 409);
  }
  if (verifiedAmount === null || Number(verifiedAmount) !== Number(payment.amount)) {
    console.error("PayHero status response amount did not match the pending payment.");
    return json({ error: "The verified payment amount did not match the amount due." }, 409);
  }

  const status = normalizeStatus(findValue(verified, ["status", "Status", "payment_status"]));
  const resultCode = findValue(verified, ["ResultCode", "result_code", "resultCode"]);
  if (isSuccessful(status, resultCode)) {
    const { error: updateError } = await supabase
      .from("online_course_payments")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        raw: { verified_status: status, verified: true },
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (updateError) {
      console.error("Could not confirm verified PayHero payment:", updateError.message);
      return json({ error: "The payment was verified, but could not be recorded." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  if (isFailed(status, resultCode)) {
    const { error: updateError } = await supabase
      .from("online_course_payments")
      .update({
        status: "failed",
        raw: { verified_status: status, verified: true },
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (updateError) {
      console.error("Could not record failed PayHero payment:", updateError.message);
      return json({ error: "The failed payment status could not be recorded." }, 500);
    }
    return json({ received: true, verified: true }, 200);
  }

  return json({ received: true, verified: false }, 200);
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

function normalizeStatus(status: string | null) {
  return status?.trim().toLowerCase().replaceAll(/[\s_-]+/g, "") ?? "";
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
