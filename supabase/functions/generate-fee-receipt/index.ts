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
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Fee receipt generation is not configured.");
    return json({ error: "Fee receipts are unavailable. Contact the accounts office." }, 503);
  }
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to download your receipt." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const paymentId = body && typeof body === "object" && "paymentId" in body ? body.paymentId : null;
  if (typeof paymentId !== "string" || !paymentId.trim())
    return json({ error: "A payment ID is required." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,user_id,student_number,first_name,middle_name,last_name,email")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (studentError || !student)
    return json({ error: "Your student account could not be found." }, 403);

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("id", paymentId)
    .eq("student_id", student.id)
    .eq("status", "confirmed")
    .maybeSingle();
  if (paymentError) {
    console.error("Could not verify receipt ownership:", paymentError.message);
    return json({ error: "Could not verify this payment." }, 500);
  }
  if (!payment) return json({ error: "Confirmed payment was not found." }, 404);

  try {
    const path = await createFeeReceipt(supabase, payment.id);
    const { data: signedFile, error: signedUrlError } = await supabase.storage
      .from("fee-documents")
      .createSignedUrl(path, 300, { download: "fee-receipt.pdf" });
    if (signedUrlError) {
      console.error("Could not create fee receipt download link:", signedUrlError.message);
      return json({ error: "Receipt created, but its download link could not be prepared." }, 500);
    }
    return json({ success: true, signedUrl: signedFile.signedUrl }, 200);
  } catch (error) {
    console.error("Could not generate fee receipt:", errorMessage(error));
    return json({ error: "Could not generate your receipt. Please retry." }, 500);
  }
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown fee receipt error.";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
