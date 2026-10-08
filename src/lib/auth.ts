import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admissions_admin" | "academic_admin" | "content_admin" | "student";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admissions_admin: "Admissions Admin",
  academic_admin: "Academic Admin",
  content_admin: "Content Admin",
  student: "Student",
};

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export function useRoles(userId?: string | null) {
  return useQuery({
    queryKey: ["my_roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function can(roles: AppRole[] | undefined, allowed: AppRole[]) {
  if (!roles) return false;
  return roles.includes("super_admin") || roles.some((r) => allowed.includes(r));
}
