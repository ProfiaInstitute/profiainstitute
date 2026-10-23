import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createFeeStatementTemplate } from "../_shared/fee-documents.ts";

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
    console.error("Statement template generation is not configured.");
    return json({ error: "Statement templates are unavailable." }, 503);
  }
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in as a Super Admin to download templates." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const courseId = body && typeof body === "object" && "courseId" in body ? body.courseId : null;
  if (typeof courseId !== "string" || !courseId.trim())
    return json({ error: "Select a course for the statement template." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user)
    return json({ error: "Your admin session is invalid or expired." }, 401);
  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleError) {
    console.error("Could not verify statement template access:", roleError.message);
    return json({ error: "Could not verify Super Admin access." }, 500);
  }
  if (!role) return json({ error: "Only Super Admins can generate templates." }, 403);

  const { data: savedSettings, error: settingsError } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "fees.statement_templates")
    .maybeSingle();
  if (settingsError) {
    console.error("Could not load statement template settings:", settingsError.message);
    return json({ error: "Could not load statement template settings." }, 500);
  }
  const allTemplates =
    savedSettings?.value && typeof savedSettings.value === "object"
      ? (savedSettings.value as Record<string, unknown>)
      : {};
  const template =
    allTemplates[courseId] && typeof allTemplates[courseId] === "object"
      ? (allTemplates[courseId] as Record<string, unknown>)
      : {};
  const paymentMethods =
    typeof template.payment_methods === "string" ? template.payment_methods : "";
  const accountDetails =
    typeof template.account_details === "string" ? template.account_details : "";

  try {
    const path = await createFeeStatementTemplate(supabase, courseId, {
      paymentMethods,
      accountDetails,
    });
    const { data: signedFile, error: signedUrlError } = await supabase.storage
      .from("fee-documents")
      .createSignedUrl(path, 300, { download: "fee-statement-template.pdf" });
    if (signedUrlError) {
      console.error("Could not create statement template link:", signedUrlError.message);
      return json({ error: "Template created, but download could not be prepared." }, 500);
    }
    return json({ success: true, signedUrl: signedFile.signedUrl }, 200);
  } catch (error) {
    console.error(
      "Could not generate statement template:",
      error instanceof Error ? error.message : "Unknown template error.",
    );
    return json({ error: "Could not generate the statement template." }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
