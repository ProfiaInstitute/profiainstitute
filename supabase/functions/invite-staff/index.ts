import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const staffRoles = [
  "super_admin",
  "admissions_admin",
  "academic_admin",
  "content_admin",
  "facilitator",
] as const;
type StaffRole = (typeof staffRoles)[number];

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!supabaseUrl || !serviceRoleKey || !publicSiteUrl) {
    console.error("Staff invitation configuration is incomplete.");
    return json({ error: "The staff invitation service is not configured." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in as a Super Admin to invite staff." }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user)
    return json({ error: "Your admin session is invalid or expired." }, 401);
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, accessToken);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  const { data: roleRecord, error: roleError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleError) {
    console.error("Could not verify staff inviter role:", roleError.message);
    return json({ error: "Could not verify Super Admin access." }, 500);
  }
  if (!roleRecord) return json({ error: "Only a Super Admin can invite staff." }, 403);

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The invitation request is not valid JSON." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (typeof role !== "string" || !staffRoles.includes(role as StaffRole)) {
    return json({ error: "Choose a valid staff role." }, 400);
  }

  if (role === "facilitator") {
    const { error: roleSchemaError } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "facilitator")
      .limit(1);
    if (roleSchemaError) {
      console.error("Could not verify the facilitator role in the database:", {
        code: roleSchemaError.code,
        message: roleSchemaError.message,
      });
      return json(
        {
          error:
            "Facilitator support is not ready in the database. Apply migration 0029_student_facilitator_portal.sql, then retry.",
        },
        503,
      );
    }
  }

  let redirectTo: string;
  try {
    redirectTo = new URL(
      role === "facilitator" ? "/facilitator?setupPassword=1" : "/admin?setupPassword=1",
      publicSiteUrl,
    ).toString();
  } catch {
    console.error("PUBLIC_SITE_URL is not a valid URL.");
    return json({ error: "The staff invitation redirect URL is not configured correctly." }, 500);
  }

  const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: { staff_role: role },
    },
  );
  if (inviteError || !invitation.user) {
    console.error(
      "Could not send staff invitation:",
      inviteError?.message ?? "No invited user returned.",
    );
    return json(
      {
        error: inviteError?.message.toLowerCase().includes("already registered")
          ? "An account already exists for this email. Ask the staff member to sign in, or use another email address."
          : (inviteError?.message ?? "The invitation was not created."),
      },
      400,
    );
  }

  const { error: insertRoleError } = await supabase.from("user_roles").insert({
    user_id: invitation.user.id,
    role: role as StaffRole,
  });
  if (insertRoleError) {
    console.error("Could not assign the invited staff role:", {
      code: insertRoleError.code,
      message: insertRoleError.message,
    });
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError)
      console.error("Could not remove incomplete staff invitation:", cleanupError.message);
    const missingFacilitatorRole =
      role === "facilitator" &&
      (insertRoleError.code === "22P02" ||
        /invalid input value for enum|facilitator.*not.*valid/i.test(insertRoleError.message));
    return json(
      {
        error: missingFacilitatorRole
          ? "Facilitator support is not ready in the database. Apply migration 0029_student_facilitator_portal.sql, then retry."
          : "The invitation was created, but the selected staff role could not be assigned.",
      },
      500,
    );
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: authData.user.id,
    action: "invite_staff",
    entity: "user_roles",
    entity_id: invitation.user.id,
    details: { email, role },
  });
  if (auditError)
    console.error("Could not record staff invitation in the audit log:", auditError.message);

  return json({ success: true }, 200);
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
