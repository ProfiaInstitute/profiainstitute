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
type Action = "list" | "suspend" | "reactivate" | "delete";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Staff management configuration is incomplete.");
    return json({ error: "The staff management service is not configured." }, 500);
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in as a Super Admin to manage staff." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user)
    return json({ error: "Your admin session is invalid or expired." }, 401);
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, accessToken);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  const { data: callerRole, error: callerRoleError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (callerRoleError) {
    console.error("Could not verify staff manager role:", callerRoleError.message);
    return json({ error: "Could not verify Super Admin access." }, 500);
  }
  if (!callerRole) return json({ error: "Only a Super Admin can manage staff accounts." }, 403);

  let body: { action?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The staff management request is not valid JSON." }, 400);
  }
  const action = body.action;
  if (!["list", "suspend", "reactivate", "delete"].includes(String(action))) {
    return json({ error: "Choose a valid staff management action." }, 400);
  }
  if (action === "list") return await listAccounts(supabase);
  if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
    return json({ error: "A valid staff account is required." }, 400);
  }
  if (body.userId === authData.user.id)
    return json({ error: "You cannot suspend or delete your own Super Admin account." }, 400);

  const { data: targetRoles, error: targetRoleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", body.userId);
  if (targetRoleError) {
    console.error("Could not load target staff roles:", targetRoleError.message);
    return json({ error: "Could not verify the selected account's roles." }, 500);
  }
  if (targetRoles?.some((record) => record.role === "student"))
    return json({ error: "Student accounts cannot be managed from the staff directory." }, 400);
  if (targetRoles?.some((record) => record.role === "super_admin"))
    return json({ error: "Super Admin accounts cannot be suspended or deleted here." }, 400);

  if (action === "delete") {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(body.userId);
    if (deleteError) {
      console.error("Could not delete staff account:", deleteError.message);
      return json({ error: deleteError.message }, 400);
    }
    const { error: rolesError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", body.userId);
    const { error: profileError } = await supabase.from("profiles").delete().eq("id", body.userId);
    if (rolesError || profileError) {
      console.error("Deleted auth user but could not clean all staff records:", {
        roles: rolesError?.message,
        profile: profileError?.message,
      });
      return json(
        { error: "The account was deleted, but some profile data needs administrator cleanup." },
        500,
      );
    }
  } else {
    const { error: updateError } = await supabase.auth.admin.updateUserById(body.userId, {
      ban_duration: action === "suspend" ? "876000h" : "none",
    });
    if (updateError) {
      console.error("Could not update staff account status:", updateError.message);
      return json({ error: updateError.message }, 400);
    }
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: authData.user.id,
    action: `staff_${action}`,
    entity: "auth.users",
    entity_id: body.userId,
  });
  if (auditError) console.error("Could not record staff management action:", auditError.message);

  return json({ success: true }, 200);
});

async function listAccounts(supabase: ReturnType<typeof createClient>) {
  const accounts = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      console.error("Could not list Auth accounts:", error.message);
      return json({ error: "Could not load staff accounts." }, 500);
    }
    if (data.users.length === 0) break;
    const userIds = data.users.map((user) => user.id);
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);
    if (rolesError) {
      console.error("Could not load staff roles:", rolesError.message);
      return json({ error: "Could not load staff roles." }, 500);
    }
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (profilesError) {
      console.error("Could not load staff profiles:", profilesError.message);
      return json({ error: "Could not load staff profiles." }, 500);
    }

    const rolesByUser = new Map<string, StaffRole[]>();
    for (const row of roleRows ?? []) {
      if (row.role === "student") continue;
      if (!staffRoles.includes(row.role as StaffRole)) continue;
      const roles = rolesByUser.get(row.user_id) ?? [];
      roles.push(row.role as StaffRole);
      rolesByUser.set(row.user_id, roles);
    }
    const profileByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    accounts.push(
      ...data.users.flatMap((user) => {
        const allRoles = (roleRows ?? []).filter((row) => row.user_id === user.id);
        if (allRoles.some((row) => row.role === "student")) return [];
        const profile = profileByUser.get(user.id);
        const roles = rolesByUser.get(user.id) ?? [];
        const isSuspended =
          !!user.banned_until && new Date(user.banned_until).getTime() > Date.now();
        const status = isSuspended ? "suspended" : user.email_confirmed_at ? "active" : "pending";
        return [
          {
            user_id: user.id,
            email: profile?.email ?? user.email ?? null,
            full_name: profile?.full_name || String(user.user_metadata?.full_name ?? ""),
            roles,
            status,
            created_at: user.created_at,
          },
        ];
      }),
    );
    if (data.users.length < 100) break;
    if (page === 100) return json({ error: "Too many accounts to load in one request." }, 503);
  }
  return json({ accounts }, 200);
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
