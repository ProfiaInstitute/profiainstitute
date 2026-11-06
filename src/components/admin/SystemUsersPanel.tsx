import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useUser, type AppRole } from "@/lib/auth";

type SystemUser = {
  userId: string;
  email: string | null;
  fullName: string;
  roles: string[];
  accountType: string;
  studentNumber: string | null;
  status: string;
  createdAt: string;
  passwordResetRequired: boolean;
};

function responseError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "The system user request failed.";
}

export function SystemUsersPanel() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();
  const [search, setSearch] = useState("");
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({});
  const usersQuery = useQuery({
    queryKey: ["admin", "system-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ accounts: SystemUser[] }>(
        "manage-system-users",
        { body: { action: "list" } },
      );
      if (error) throw error;
      if (!data || !Array.isArray(data.accounts)) {
        throw new Error("The system user service returned an invalid account list.");
      }
      return data.accounts;
    },
  });
  const resetMutation = useMutation({
    mutationFn: async ({
      userId,
      temporaryPassword,
    }: {
      userId: string;
      temporaryPassword: string;
    }) => {
      if (temporaryPassword.length < 12) {
        throw new Error("Temporary passwords must contain at least 12 characters.");
      }
      const { error } = await supabase.functions.invoke("manage-system-users", {
        body: { action: "reset_password", userId, temporaryPassword },
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      setTemporaryPasswords((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
      toast.success("Temporary password set", {
        description:
          "Share it with the user securely. They will be required to set a new password at their next sign-in.",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "system-users"] });
    },
    onError: (error) =>
      toast.error("Could not reset account password", { description: responseError(error) }),
  });
  const users = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (usersQuery.data ?? []).filter(
      (user) =>
        !needle ||
        [user.fullName, user.email ?? "", user.studentNumber ?? "", user.accountType, ...user.roles]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle),
    );
  }, [search, usersQuery.data]);

  if (usersQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading system users…</p>;
  if (usersQuery.error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
      >
        Could not load system users: {responseError(usersQuery.error)}
        <Button
          className="ml-3"
          size="sm"
          variant="outline"
          onClick={() => void usersQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold text-brand">System users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Students, facilitators, and administrators. Setting a temporary password requires the user
          to choose and confirm a new password before continuing to their dashboard.
        </p>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search system users"
            className="pl-9"
            placeholder="Search name, email, student number, or role"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {users.length ? (
        users.map((user) => {
          const password = temporaryPasswords[user.userId] ?? "";
          return (
            <article
              key={user.userId}
              className="space-y-3 rounded-xl border bg-card p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-brand">{user.fullName || "Unnamed account"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {user.email ?? "No email"}
                    {user.studentNumber ? ` · ${user.studentNumber}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Account created {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{user.accountType}</Badge>
                    <Badge variant={user.status === "active" ? "default" : "secondary"}>
                      {user.status}
                    </Badge>
                    {user.roles.map((role) => (
                      <Badge key={role} variant="outline">
                        {ROLE_LABELS[role as AppRole] ?? role}
                      </Badge>
                    ))}
                    {user.passwordResetRequired && (
                      <Badge variant="secondary">Password change required</Badge>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
                  Temporary access password
                  <Input
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    disabled={user.userId === currentUser?.id}
                    onChange={(event) =>
                      setTemporaryPasswords((current) => ({
                        ...current,
                        [user.userId]: event.target.value,
                      }))
                    }
                    placeholder="At least 12 characters"
                  />
                </label>
                <Button
                  className="self-end"
                  variant="outline"
                  disabled={
                    user.userId === currentUser?.id ||
                    password.length < 12 ||
                    resetMutation.isPending
                  }
                  loading={resetMutation.isPending}
                  onClick={() =>
                    resetMutation.mutate({ userId: user.userId, temporaryPassword: password })
                  }
                >
                  <KeyRound />
                  {user.userId === currentUser?.id
                    ? "Use account settings"
                    : "Set temporary password"}
                </Button>
              </div>
            </article>
          );
        })
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No system users match that search.
        </p>
      )}
    </section>
  );
}
