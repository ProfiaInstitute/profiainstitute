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
    console.error("M-Pesa C2B validation is not configured.");
    return mpesaResponse(1, "Payment validation is not configured.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return mpesaResponse(1, "Invalid callback JSON.");
  }

  const callback = getCallback(payload);
  const shortcode = getText(callback.BusinessShortCode);
  const studentReference = getText(callback.BillRefNumber)?.trim();
  if (!shortcode || shortcode !== expectedShortcode || !studentReference) {
    return mpesaResponse(1, "Invalid paybill or student reference.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: student, error } = await supabase
    .from("students")
    .select("id")
    .eq("student_number", studentReference)
    .maybeSingle();
  if (error) {
    console.error("Could not validate M-Pesa student reference:", error.message);
    return mpesaResponse(1, "Could not validate the student reference.");
  }
  if (!student) return mpesaResponse(1, "Student reference not found.");
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
