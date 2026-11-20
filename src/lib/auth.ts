import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "admissions_admin"
  | "academic_admin"
  | "content_admin"
  | "student"
  | "facilitator";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admissions_admin: "Admissions Admin",
  academic_admin: "Academic Admin",
  content_admin: "Content Admin",
  student: "Student",
  facilitator: "Facilitator",
};

export function requiresStaffMfa(roles: AppRole[] | undefined) {
  return roles?.some((role) => role !== "student") ?? false;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "INITIAL_SESSION") return;
      setUser(session?.user ?? null);
      setError(null);
      setLoading(false);
    });

    void supabase.auth
      .getSession()
      .then(async ({ data: sessionData, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) {
          setError(sessionError);
          setUser(null);
          return;
        }
        if (!sessionData.session) {
          setUser(null);
          return;
        }
        const { data: userData, error: userError } = await supabase.auth.getUser(
          sessionData.session.access_token,
        );
        if (!mounted) return;
        if (userError) {
          setError(userError);
          setUser(null);
          return;
        }
        setUser(userData.user);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(
          reason instanceof Error ? reason : new Error("Could not read the sign-in session."),
        );
        setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return { user, loading, error };
}

export function useRoles(userId?: string | null) {
  return useQuery({
    queryKey: ["my_roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function can(roles: AppRole[] | undefined, allowed: AppRole[]) {
  if (!roles) return false;
  return roles.includes("super_admin") || roles.some((r) => allowed.includes(r));
}

export async function signOutWithAudit(
  scope: "global" | "local" | "others" = "global",
): Promise<{ error: Error | null; signedOut: boolean }> {
  const [auditResult, presenceResult] = await Promise.allSettled([
    supabase.rpc("log_auth_event", { _event: "sign_out" }),
    supabase.rpc("remove_my_presence"),
  ]);
  const { error: signOutError } = await supabase.auth.signOut({ scope });
  if (signOutError) return { error: signOutError, signedOut: false };

  const loggingErrors = [auditResult, presenceResult].flatMap((result) => {
    if (result.status === "rejected") {
      return [result.reason instanceof Error ? result.reason.message : String(result.reason)];
    }
    return result.value.error ? [result.value.error.message] : [];
  });
  return {
    error: loggingErrors.length
      ? new Error(`Could not fully record sign-out activity: ${loggingErrors.join("; ")}`)
      : null,
    signedOut: true,
  };
}
