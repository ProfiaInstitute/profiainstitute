import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

export function PasswordResetPage({
  destination,
  onComplete,
  forced = false,
}: {
  destination: string;
  onComplete: () => void;
  forced?: boolean;
}) {
  const { user, loading } = useUser();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const minLength = forced ? 12 : 8;
    if (password.length < minLength) {
      setError(`Use a password with at least ${minLength} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      if (forced) {
        const { error: completionError } = await supabase.functions.invoke("manage-system-users", {
          body: { action: "complete_password_reset", newPassword: password },
        });
        if (completionError) throw completionError;
      } else {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      }
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw refreshError;
      }
      toast.success("Password updated");
      onComplete();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : reason && typeof reason === "object" && "message" in reason
            ? String(reason.message)
            : "Could not finish updating your password.";
      setError(
        forced
          ? `Your password may have been saved, but the required reset could not be completed: ${message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-card"
      >
        <KeyRound className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-brand">Reset your password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loading
              ? "Checking your secure reset link…"
              : user
                ? "Choose a new password to continue."
                : "This reset link has expired or is invalid. Request a new reset email and open the latest link."}
          </p>
        </div>
        {user && (
          <>
            <label className="block space-y-1.5 text-sm font-medium">
              New password
              <span className="relative block">
                <Input
                  type={visible ? "text" : "password"}
                  required
                  minLength={forced ? 12 : 8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Confirm new password
              <Input
                type={visible ? "text" : "password"}
                required
                minLength={forced ? 12 : 8}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {user ? (
          <Button className="w-full" disabled={saving || loading}>
            {saving ? "Saving password…" : "Save password"}
          </Button>
        ) : (
          <Button asChild className="w-full">
            <a href={destination}>Return to sign in</a>
          </Button>
        )}
      </form>
    </main>
  );
}
