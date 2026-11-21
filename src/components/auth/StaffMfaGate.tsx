import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { requiresStaffMfa, signOutWithAudit, useRoles, useUser } from "@/lib/auth";
import { clearTrustedMfa, markMfaTrusted, readTrustedMfa } from "@/lib/staff-mfa-trust";

export function StaffMfaGate({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const rolesQuery = useRoles(user?.id);
  const staffRequired = requiresStaffMfa(rolesQuery.data);
  const [loading, setLoading] = useState(false);
  const [aal2, setAal2] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshMfaState = useCallback(async () => {
    if (!user || !staffRequired) return;
    setLoading(true);
    setError(null);
    try {
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assurance.error) throw assurance.error;
      if (factors.error) throw factors.error;
      const verifiedNow = assurance.data.currentLevel === "aal2";
      if (verifiedNow) markMfaTrusted(user.id);
      setAal2(verifiedNow || readTrustedMfa(user.id));
      setFactorId(factors.data.totp.find((factor) => factor.status === "verified")?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify your MFA status.");
    } finally {
      setLoading(false);
    }
  }, [staffRequired, user]);

  useEffect(() => {
    void refreshMfaState();
  }, [refreshMfaState]);

  async function beginEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of factors.totp.filter((item) => item.status !== "verified")) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Profia Institute staff",
      });
      if (enrollError) throw enrollError;
      if (!data.totp) throw new Error("The authenticator setup could not be created.");
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start MFA enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.replace(/\D/g, ""),
      });
      if (verifyError) throw verifyError;
      setCode("");
      setQrCode(null);
      setSecret(null);
      await refreshMfaState();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The authenticator code was not accepted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (user) clearTrustedMfa(user.id);
    const result = await signOutWithAudit("global");
    if (result.error) {
      setError(
        result.signedOut
          ? `Signed out, but activity recording was incomplete: ${result.error.message}`
          : `Could not sign out: ${result.error.message}`,
      );
    }
  }

  if (!user) return <>{children}</>;
  if (rolesQuery.error) {
    return (
      <SecurityMessage
        title="Could not verify your staff security"
        detail={rolesQuery.error.message}
        onRetry={() => void rolesQuery.refetch()}
        onSignOut={() => void signOut()}
      />
    );
  }
  if (rolesQuery.isLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">Checking staff security…</p>
      </div>
    );
  }
  if (!staffRequired || aal2) return <>{children}</>;
  if (error && !factorId && !qrCode) {
    return (
      <SecurityMessage
        title="Could not verify your staff security"
        detail={error}
        onRetry={() => void refreshMfaState()}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-muted/30 px-4 py-10">
      <section
        className="w-full max-w-lg space-y-5 rounded-2xl border bg-card p-6 shadow-card sm:p-8"
        aria-labelledby="staff-mfa-title"
      >
        <div>
          <p className="eyebrow">Secure staff access</p>
          <h1 id="staff-mfa-title" className="mt-2 text-2xl font-bold text-brand">
            Multi-factor authentication required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Staff accounts must verify with an authenticator app before using the portal.
          </p>
        </div>

        {qrCode && (
          <div className="space-y-3 rounded-xl border bg-background p-4">
            <p className="text-sm font-medium">Scan this QR code with an authenticator app.</p>
            <img className="mx-auto h-48 w-48" src={qrCode} alt="Authenticator setup QR code" />
            {secret && (
              <p className="break-all text-xs text-muted-foreground">
                Manual setup key: <span className="font-mono">{secret}</span>
              </p>
            )}
          </div>
        )}

        {factorId ? (
          <form onSubmit={(event) => void verifyCode(event)} className="space-y-3">
            <label htmlFor="staff-mfa-code" className="text-sm font-medium">
              {qrCode
                ? "Enter the 6-digit code to finish setup"
                : "Enter your 6-digit authenticator code"}
            </label>
            <Input
              id="staff-mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <Button className="w-full" type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : qrCode ? "Enable MFA" : "Verify and continue"}
            </Button>
          </form>
        ) : (
          <Button
            className="w-full"
            type="button"
            onClick={() => void beginEnrollment()}
            disabled={busy}
          >
            {busy ? "Preparing setup…" : "Set up authenticator"}
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" type="button" variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Lost your authenticator? Contact the institute administrator through a verified channel
          for a supervised reset. Never share your password or setup key.
        </p>
      </section>
    </div>
  );
}

function SecurityMessage({
  title,
  detail,
  onRetry,
  onSignOut,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-semibold text-brand">{title}</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {detail}
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
          <Button type="button" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
