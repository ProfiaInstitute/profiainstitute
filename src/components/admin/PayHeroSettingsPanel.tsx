import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type PayHeroSettings = {
  configured: boolean;
  savedInAdmin: boolean;
  username: string;
  channelId: string;
};

export function PayHeroSettingsPanel() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin", "payhero-settings"],
    queryFn: async (): Promise<PayHeroSettings> => {
      const { data, error } = await supabase.functions.invoke("manage-payhero-settings", {
        body: { action: "read" },
      });
      if (error) throw error;
      if (!data?.success)
        throw new Error(
          data?.error ??
            "The deployed manage-payhero-settings Edge Function is not serving the PayHero settings API. Deploy the project function from supabase/functions/manage-payhero-settings.",
        );
      return {
        configured: Boolean(data.configured),
        savedInAdmin: Boolean(data.savedInAdmin),
        username: typeof data.username === "string" ? data.username : "",
        channelId: typeof data.channelId === "string" ? data.channelId : "",
      };
    },
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setUsername(settingsQuery.data.username);
    setChannelId(settingsQuery.data.channelId);
  }, [settingsQuery.data]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-payhero-settings", {
        body: { action: "save", username, password, channelId },
      });
      if (error) {
        let description = error.message;
        if ("context" in error && error.context instanceof Response) {
          const responseBody = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof responseBody?.error === "string") description = responseBody.error;
        }
        toast.error("Could not save PayHero settings", { description });
        return;
      }
      if (!data?.success) {
        toast.error("Could not save PayHero settings", {
          description: data?.error ?? "The settings service returned an unexpected response.",
        });
        return;
      }
      setPassword("");
      toast.success("PayHero settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "payhero-settings"] });
    } catch (error) {
      toast.error("Could not save PayHero settings", {
        description: error instanceof Error ? error.message : "The request could not be completed.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-brand">PayHero payment integration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the PayHero account used for student fee and online-course STK pushes and
          payment reconciliation. Credentials are stored server-side and never shown here.
        </p>
      </div>
      {settingsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading PayHero settings…</p>
      ) : settingsQuery.error ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Could not load PayHero settings: {settingsQuery.error.message}
          </p>
          <Button type="button" variant="outline" onClick={() => settingsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-lg border p-3 text-sm">
            <span
              className={`font-medium ${settingsQuery.data?.configured ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {settingsQuery.data?.savedInAdmin
                ? "Configured from Admin"
                : settingsQuery.data?.configured
                  ? "Using existing deployment configuration"
                  : "Not configured"}
            </span>
            <p className="mt-1 text-muted-foreground">
              PayHero confirms each transaction before a student account is credited.
            </p>
          </div>
          <form className="space-y-4" onSubmit={saveSettings}>
            <label className="block space-y-1.5 text-sm font-medium">
              PayHero API username
              <Input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={256}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              PayHero API password
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required={!settingsQuery.data?.savedInAdmin}
                placeholder={
                  settingsQuery.data?.savedInAdmin ? "Leave blank to keep the saved password" : ""
                }
                maxLength={512}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              PayHero channel ID
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                required
                maxLength={16}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Use the channel connected to the Institute’s M-Pesa Paybill.
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save PayHero settings"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
