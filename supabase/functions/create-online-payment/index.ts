import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const paymentStages = ["tuition_30", "tuition_balance", "certificate_fee", "exam_fee"] as const;
type PaymentStage = (typeof paymentStages)[number];

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const username = Deno.env.get("PAYHERO_API_USERNAME");
  const password = Deno.env.get("PAYHERO_API_PASSWORD");
  const channelId = Deno.env.get("PAYHERO_CHANNEL_ID");
  if (!supabaseUrl || !serviceRoleKey || !username || !password || !channelId) {
    return json(
      { error: "Online payments are not configured. Contact the Institute before retrying." },
      503,
    );
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to pay for an online course." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is invalid or expired." }, 401);

  let body: { enrollmentId?: unknown; stage?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The payment request is not valid JSON." }, 400);
  }
  if (
    typeof body.enrollmentId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.enrollmentId) ||
    typeof body.stage !== "string" ||
    !paymentStages.includes(body.stage as PaymentStage)
  ) {
    return json({ error: "Choose a valid online course payment." }, 400);
  }
  const stage = body.stage as PaymentStage;

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("online_course_enrollments")
    .select("id,student_id,course_id,tuition_fee,certificate_fee,exam_fee,status")
    .eq("id", body.enrollmentId)
    .eq("status", "active")
    .maybeSingle();
  if (enrollmentError || !enrollment)
    return json({ error: "The selected online course enrollment could not be found." }, 404);
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,user_id,student_number,first_name,last_name,phone")
    .eq("id", enrollment.student_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (studentError || !student)
    return json({ error: "You are not authorized to pay for this enrollment." }, 403);

  const { data: payments, error: paymentsError } = await supabase
    .from("online_course_payments")
    .select("amount,stage,status")
    .eq("enrollment_id", enrollment.id);
  if (paymentsError) {
    console.error("Could not check online course payments:", paymentsError.message);
    return json({ error: "Could not check your online course balance." }, 500);
  }
  const confirmed = payments?.filter((payment) => payment.status === "confirmed") ?? [];
  const tuitionPaid = confirmed
    .filter((payment) => payment.stage === "tuition_30" || payment.stage === "tuition_balance")
    .reduce((total, payment) => total + Number(payment.amount), 0);
  const initialTarget = Math.ceil(Number(enrollment.tuition_fee) * 0.3);
  let amount: number;
  if (stage === "tuition_30") {
    amount = initialTarget - tuitionPaid;
    if (amount <= 0) return json({ error: "The first tuition installment is already paid." }, 409);
  } else if (stage === "tuition_balance") {
    if (tuitionPaid < initialTarget)
      return json({ error: "Pay the first 30% tuition installment before the balance." }, 409);
    amount = Number(enrollment.tuition_fee) - tuitionPaid;
    if (amount <= 0) return json({ error: "Tuition is already paid in full." }, 409);
  } else {
    if (tuitionPaid < Number(enrollment.tuition_fee))
      return json({ error: "Pay the full tuition before examination or certificate fees." }, 409);
    const fee = stage === "certificate_fee" ? Number(enrollment.certificate_fee) : Number(enrollment.exam_fee);
    if (fee <= 0) return json({ error: "There is no fee configured for this payment stage." }, 409);
    if (confirmed.some((payment) => payment.stage === stage))
      return json({ error: "This fee has already been paid." }, 409);

    const { data: lessons, error: lessonsError } = await supabase
      .from("online_course_lessons")
      .select("id")
      .eq("course_id", enrollment.course_id)
      .eq("published", true);
    if (lessonsError) {
      console.error("Could not verify course completion:", lessonsError.message);
      return json({ error: "Could not verify course completion." }, 500);
    }
    const lessonIds = lessons?.map((lesson) => lesson.id) ?? [];
    if (!lessonIds.length) return json({ error: "Course lessons must be published before final fees are due." }, 409);
    const { data: progress, error: progressError } = await supabase
      .from("online_lesson_progress")
      .select("lesson_id")
      .eq("student_id", student.id)
      .in("lesson_id", lessonIds);
    if (progressError || new Set(progress?.map((item) => item.lesson_id)).size !== lessonIds.length)
      return json({ error: "Complete all published course lessons before paying final fees." }, 409);
    amount = fee;
  }

  const pendingPayment = payments?.some((payment) => payment.status === "pending");
  if (pendingPayment)
    return json({ error: "A payment is already awaiting confirmation. Wait before starting another." }, 409);
  const phone = normalizeKenyanPhone(student.phone ?? "");
  if (!phone) return json({ error: "Add a valid Kenyan mobile number to your student profile before paying." }, 400);

  const reference = `PRF-ONLINE-${crypto.randomUUID()}`;
  const { data: payment, error: insertError } = await supabase
    .from("online_course_payments")
    .insert({
      enrollment_id: enrollment.id,
      student_id: student.id,
      course_id: enrollment.course_id,
      stage,
      amount,
      reference,
      status: "pending",
      provider: "payhero",
    })
    .select("id,reference,amount")
    .single();
  if (insertError || !payment) {
    console.error("Could not create online payment:", insertError?.message);
    return json({ error: "Could not create a payment request. Please retry." }, 500);
  }

  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch("https://backend.payhero.co.ke/api/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.ceil(Number(payment.amount)),
        phone_number: phone,
        channel_id: channelId,
        provider: "m-pesa",
        external_reference: payment.reference,
        customer_name: `${student.first_name} ${student.last_name}`.trim(),
        transaction_description: `${stage.replaceAll("_", " ")} · ${student.student_number}`,
        callback_url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/payhero-callback`,
      }),
    });
  } catch (error) {
    await markPaymentFailed(supabase, payment.id, errorMessage(error));
    return json({ error: "Could not connect to PayHero. No payment was confirmed." }, 502);
  }

  const gatewayBody = await gatewayResponse.json().catch(() => null);
  if (!gatewayResponse.ok) {
    await markPaymentFailed(
      supabase,
      payment.id,
      `PayHero returned HTTP ${gatewayResponse.status}.`,
    );
    console.error("PayHero payment request failed:", gatewayResponse.status);
    return json({ error: "PayHero could not start the payment. Please retry or contact support." }, 502);
  }

  const checkoutId = findValue(gatewayBody, ["CheckoutRequestID", "checkout_request_id", "checkout_id"]);
  const { error: updateError } = await supabase
    .from("online_course_payments")
    .update({ provider_checkout_id: checkoutId, raw: { request_accepted: true } })
    .eq("id", payment.id);
  if (updateError) {
    console.error("Could not save PayHero checkout identifier:", updateError.message);
    return json({ error: "PayHero accepted the request, but its status could not be saved. Contact support before retrying." }, 500);
  }
  return json({ success: true, reference: payment.reference, amount: payment.amount }, 200);
});

function normalizeKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `254${digits.slice(1)}` : digits.startsWith("7") || digits.startsWith("1") ? `254${digits}` : digits;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
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

async function markPaymentFailed(
  supabase: ReturnType<typeof createClient>,
  id: string,
  reason: string,
) {
  const { error } = await supabase
    .from("online_course_payments")
    .update({ status: "failed", raw: { error: reason } })
    .eq("id", id)
    .eq("status", "pending");
  if (error) console.error("Could not mark failed PayHero payment:", error.message);
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
