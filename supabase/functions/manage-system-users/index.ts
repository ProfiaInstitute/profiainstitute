import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkStaffMfa } from "../_shared/staff-mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "list" | "reset_password" | "complete_password_reset";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("System user management configuration is incomplete.");
    return json({ error: "The system user service is not configured." }, 500);
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in to continue." }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user)
    return json({ error: "Your session is invalid or expired." }, 401);
  const mfaCheck = await checkStaffMfa(supabase, authData.user.id, accessToken);
  if (!mfaCheck.allowed) return json({ error: mfaCheck.error }, mfaCheck.status);

  let body: {
    action?: unknown;
    userId?: unknown;
    temporaryPassword?: unknown;
    newPassword?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "The account-management request is not valid JSON." }, 400);
  }
  const action = body.action;
  if (action === "complete_password_reset") {
    if (authData.user.app_metadata?.password_reset_required !== true) {
      return json({ error: "This account does not require a temporary-password reset." }, 400);
    }
    if (
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 12 ||
      body.newPassword.length > 128
    ) {
      return json({ error: "Your new password must be between 12 and 128 characters." }, 400);
    }
    const { data: challenge, error: challengeError } = await supabase
      .from("password_reset_challenges")
      .select("password_salt,password_hash")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (challengeError) {
      console.error("Could not verify the temporary password:", challengeError.message);
      return json(
        { error: "Could not verify your password reset. Contact an administrator." },
        500,
      );
    }
    if (!challenge) {
      return json(
        { error: "The temporary password reset has expired. Contact an administrator." },
        400,
      );
    }
    const submittedHash = await hashPassword(body.newPassword, hexToBytes(challenge.password_salt));
    if (constantTimeEqual(submittedHash, challenge.password_hash)) {
      return json({ error: "Choose a new password different from your temporary password." }, 400);
    }
    const appMetadata = { ...authData.user.app_metadata, password_reset_required: false };
    const { error } = await supabase.auth.admin.updateUserById(authData.user.id, {
      password: body.newPassword,
      app_metadata: appMetadata,
    });
    if (error) {
      console.error("Could not complete forced password reset:", error.message);
      return json({ error: "Could not save your new password." }, 500);
    }
    const { error: deleteChallengeError } = await supabase
      .from("password_reset_challenges")
      .delete()
      .eq("user_id", authData.user.id);
    if (deleteChallengeError) {
      console.error(
        "Could not delete the completed password reset challenge:",
        deleteChallengeError.message,
      );
      return json(
        { error: "Your password was changed, but reset cleanup failed. Contact an administrator." },
        500,
      );
    }
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: authData.user.id,
      action: "complete_temporary_password_reset",
      entity: "auth.users",
      entity_id: authData.user.id,
    });
    if (auditError) console.error("Could not audit password reset completion:", auditError.message);
    return json({ success: true }, 200);
  }

  const { data: callerRole, error: roleError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleError) {
    console.error("Could not verify Super Admin access:", roleError.message);
    return json({ error: "Could not verify Super Admin access." }, 500);
  }
  if (!callerRole) return json({ error: "Only a Super Admin can manage system users." }, 403);

  if (action === "list") return await listSystemUsers(supabase);
  if (action !== "reset_password") {
    return json({ error: "Choose a valid system user action." }, 400);
  }
  if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
    return json({ error: "Select a valid system user." }, 400);
  }
  if (body.userId === authData.user.id) {
    return json({ error: "Use Account settings to change your own password." }, 400);
  }
  if (
    typeof body.temporaryPassword !== "string" ||
    body.temporaryPassword.length < 12 ||
    body.temporaryPassword.length > 128
  ) {
    return json({ error: "Temporary passwords must be between 12 and 128 characters." }, 400);
  }

  const { data: target, error: targetError } = await supabase.auth.admin.getUserById(body.userId);
  if (targetError || !target.user) {
    return json({ error: "The selected system user was not found." }, 404);
  }
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16));
  const passwordSaltHex = bytesToHex(passwordSalt);
  const temporaryPasswordHash = await hashPassword(body.temporaryPassword, passwordSalt);
  const { error: challengeError } = await supabase.from("password_reset_challenges").upsert(
    {
      user_id: body.userId,
      password_salt: passwordSaltHex,
      password_hash: temporaryPasswordHash,
    },
    { onConflict: "user_id" },
  );
  if (challengeError) {
    console.error("Could not create temporary password reset challenge:", challengeError.message);
    return json({ error: "Could not prepare the password reset. Try again." }, 500);
  }
  const { error: updateError } = await supabase.auth.admin.updateUserById(body.userId, {
    password: body.temporaryPassword,
    app_metadata: {
      ...target.user.app_metadata,
      password_reset_required: true,
    },
  });
  if (updateError) {
    const { error: cleanupError } = await supabase
      .from("password_reset_challenges")
      .delete()
      .eq("user_id", body.userId);
    if (cleanupError) {
      console.error("Could not clean up failed password reset challenge:", cleanupError.message);
    }
    console.error("Could not set a temporary account password:", updateError.message);
    return json({ error: updateError.message }, 400);
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: authData.user.id,
    action: "set_temporary_password",
    entity: "auth.users",
    entity_id: body.userId,
    details: { password_reset_required: true },
  });
  if (auditError) console.error("Could not audit temporary password reset:", auditError.message);
  return json({ success: true }, 200);
});

async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 310_000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Invalid password reset salt.");
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function listSystemUsers(supabase: ReturnType<typeof createClient>) {
  const accounts = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      console.error("Could not list Auth accounts:", error.message);
      return json({ error: "Could not load system users." }, 500);
    }
    if (!data.users.length) break;
    const userIds = data.users.map((user) => user.id);
    const [rolesResult, profilesResult, studentsResult] = await Promise.all([
      supabase.from("user_roles").select("user_id,role").in("user_id", userIds),
      supabase.from("profiles").select("id,full_name,email").in("id", userIds),
      supabase
        .from("students")
        .select("user_id,student_number,first_name,middle_name,last_name,status")
        .in("user_id", userIds),
    ]);
    if (rolesResult.error || profilesResult.error || studentsResult.error) {
      console.error("Could not load system user details:", {
        roles: rolesResult.error?.message,
        profiles: profilesResult.error?.message,
        students: studentsResult.error?.message,
      });
      return json({ error: "Could not load system user roles and profiles." }, 500);
    }
    const rolesByUser = new Map<string, string[]>();
    for (const role of rolesResult.data ?? []) {
      const current = rolesByUser.get(role.user_id) ?? [];
      current.push(role.role);
      rolesByUser.set(role.user_id, current);
    }
    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
    const students = new Map(
      (studentsResult.data ?? []).map((student) => [student.user_id, student]),
    );
    accounts.push(
      ...data.users.map((user) => {
        const student = students.get(user.id);
        const profile = profiles.get(user.id);
        const roles = rolesByUser.get(user.id) ?? [];
        return {
          userId: user.id,
          email: profile?.email ?? user.email ?? null,
          fullName:
            [student?.first_name, student?.middle_name, student?.last_name]
              .filter(Boolean)
              .join(" ") ||
            profile?.full_name ||
            String(user.user_metadata?.full_name ?? ""),
          roles,
          accountType: student
            ? "student"
            : roles.includes("facilitator")
              ? "facilitator"
              : roles.some((role) => role.endsWith("_admin"))
                ? "admin"
                : roles.includes("super_admin")
                  ? "admin"
                  : "other",
          studentNumber: student?.student_number ?? null,
          status:
            student?.status ??
            (user.banned_until && new Date(user.banned_until).getTime() > Date.now()
              ? "suspended"
              : user.email_confirmed_at
                ? "active"
                : "pending"),
          createdAt: user.created_at,
          passwordResetRequired: user.app_metadata?.password_reset_required === true,
        };
      }),
    );
    if (data.users.length < 100) break;
    if (page === 100) return json({ error: "Too many accounts to load in one request." }, 503);
  }
  accounts.sort(
    (a, b) => a.fullName.localeCompare(b.fullName) || (a.email ?? "").localeCompare(b.email ?? ""),
  );
  return json({ accounts }, 200);
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
