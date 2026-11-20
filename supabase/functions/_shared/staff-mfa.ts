import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StaffMfaClient = ReturnType<typeof createClient<any>>;

export type StaffMfaCheck =
  { allowed: true } | { allowed: false; status: 403 | 500; error: string };

export async function checkStaffMfa(
  supabase: StaffMfaClient,
  userId: string,
  accessToken: string,
): Promise<StaffMfaCheck> {
  try {
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("Could not verify staff roles for MFA enforcement:", rolesError.message);
      return {
        allowed: false,
        status: 500,
        error: "Could not verify staff security requirements.",
      };
    }

    if (!roles?.some((role) => role.role !== "student")) return { allowed: true };

    const { data, error } = await supabase.auth.getClaims(accessToken);
    if (error) {
      console.error("Could not verify the staff MFA assurance level:", error.message);
      return {
        allowed: false,
        status: 500,
        error: "Could not verify staff security requirements.",
      };
    }
    if (data.claims?.aal !== "aal2") {
      return {
        allowed: false,
        status: 403,
        error: "Staff accounts must complete multi-factor authentication before continuing.",
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error(
      "Could not verify staff MFA requirements:",
      error instanceof Error ? error.message : String(error),
    );
    return {
      allowed: false,
      status: 500,
      error: "Could not verify staff security requirements.",
    };
  }
}
