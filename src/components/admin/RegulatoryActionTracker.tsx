import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

const agencies = [
  "KASNEB",
  "TVETA",
  "HELB",
  "ICPAK",
  "NITA",
  "KRA/eTIMS",
  "eCitizen",
  "Other",
] as const;

const categories = [
  "Exam",
  "Accreditation",
  "Student funding",
  "Tax and invoicing",
  "Government service",
  "Other",
] as const;

const statuses = ["pending", "in_progress", "submitted", "completed"] as const;

const feedSources = [
  { key: "kasneb", name: "KASNEB", url: "https://www.kasneb.or.ke/" },
  { key: "tveta", name: "TVETA", url: "https://www.tveta.go.ke/" },
  { key: "helb", name: "HELB", url: "https://www.helb.co.ke/" },
  { key: "icpak", name: "ICPAK", url: "https://www.icpak.com/" },
];

const portalOnlySources = [
  { name: "NITA", url: "https://www.nita.go.ke/" },
  { name: "KRA eTIMS", url: "https://www.kra.go.ke/online-services/etims" },
  { name: "eCitizen", url: "https://accounts.ecitizen.go.ke/en/" },
];

type ActionDraft = {
  agency: string;
  category: string;
  title: string;
  details: string;
  due_date: string;
  status: string;
  reference_url: string;
  notes: string;
};

const emptyDraft: ActionDraft = {
  agency: "KASNEB",
  category: "Exam",
  title: "",
  details: "",
  due_date: "",
  status: "pending",
  reference_url: "",
  notes: "",
};

function localDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((localDate(value).getTime() - today.getTime()) / 86_400_000);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function RegulatoryActionTracker() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [draft, setDraft] = useState<ActionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const actionsQuery = useQuery({
    queryKey: ["admin", "regulatory-action-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulatory_action_items")
        .select("*")
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const updatesQuery = useQuery({
    queryKey: ["admin", "regulatory-source-updates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulatory_source_updates")
        .select("id,source_key,source_name,title,article_url,summary,published_at,fetched_at")
        .order("published_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
  const syncStatusQuery = useQuery({
    queryKey: ["admin", "regulatory-feed-syncs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulatory_feed_syncs")
        .select(
          "source_key,last_attempted_at,last_successful_at,status,items_received,error_message",
        );
      if (error) throw error;
      return data;
    },
  });
  const syncFeeds = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-regulatory-feeds", {
        body: {},
      });
      if (error) {
        let message = error.message;
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") message = response.error;
        }
        throw new Error(message);
      }
      if (!data || !Array.isArray(data.results)) {
        throw new Error("The official-source sync returned an unexpected response.");
      }
      return data as {
        results: { source: string; status: string; items?: number; error?: string }[];
        succeeded: number;
        failed: number;
      };
    },
    onSuccess: async (result) => {
      if (result.failed) {
        const failures = result.results
          .filter((source) => source.status !== "success")
          .map((source) => `${source.source}: ${source.error ?? "sync failed"}`)
          .join("; ");
        toast.warning(`Fetched ${result.succeeded} of ${result.results.length} sources`, {
          description: failures,
        });
      } else {
        toast.success("Official agency updates refreshed", {
          description: result.results
            .map((source) => `${source.source}: ${source.items ?? 0} updates`)
            .join(" · "),
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "regulatory-source-updates"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "regulatory-feed-syncs"] }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not fetch official agency updates", { description: error.message }),
  });
  const saveAction = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: ActionDraft }) => {
      const payload = {
        agency: values.agency,
        category: values.category,
        title: values.title.trim(),
        details: values.details.trim() || null,
        due_date: values.due_date,
        status: values.status,
        reference_url: values.reference_url.trim() || null,
        notes: values.notes.trim() || null,
      };
      if (id) {
        const { error } = await supabase
          .from("regulatory_action_items")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("regulatory_action_items")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editingId ? "Action updated" : "Action added");
      setDraft(emptyDraft);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "regulatory-action-items"] });
    },
    onError: (error) => toast.error("Could not save this action", { description: error.message }),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("regulatory_action_items")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "regulatory-action-items"] });
    },
    onError: (error) =>
      toast.error("Could not update action status", { description: error.message }),
  });
  const deleteAction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("regulatory_action_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Action deleted");
      await queryClient.invalidateQueries({ queryKey: ["admin", "regulatory-action-items"] });
    },
    onError: (error) => toast.error("Could not delete action", { description: error.message }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.due_date) {
      toast.error("Enter an action name and due date.");
      return;
    }
    if (draft.reference_url.trim()) {
      try {
        const url = new URL(draft.reference_url);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          toast.error("Reference links must use http or https.");
          return;
        }
      } catch {
        toast.error("Enter a valid reference URL.");
        return;
      }
    }
    saveAction.mutate({ id: editingId, values: draft });
  }

  if (actionsQuery.isLoading) {
    return (
      <div role="status" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
        Loading regulatory and exam actions…
      </div>
    );
  }
  if (actionsQuery.error) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold text-brand">Could not load the action register</h2>
        <p className="mt-2 text-sm text-destructive">{actionsQuery.error.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm migration <code>0038_regulatory_action_tracker.sql</code> has been applied.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void actionsQuery.refetch()}>
          Retry
        </Button>
      </section>
    );
  }

  const actions = actionsQuery.data ?? [];
  const openActions = actions.filter((action) => action.status !== "completed");
  const overdueCount = openActions.filter((action) => daysUntil(action.due_date) < 0).length;
  const dueSoonCount = openActions.filter((action) => {
    const days = daysUntil(action.due_date);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-primary/30 bg-cream p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold text-brand">Regulatory & exam action register</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track exam windows, accreditation renewals, student-funding deadlines, tax-invoice
              tasks, and government-service follow-ups. This register does not submit information to
              or synchronize with agency portals.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 text-sm">
        <p className="font-semibold text-brand">Automatic deadline reminders</p>
        <p className="mt-1 text-muted-foreground">
          Once the reminder migration and scheduled worker are configured, staff receive reminders
          30, 7, and 1 day before an open action is due, and again on its due date. Academic admins
          receive exam/accreditation reminders; admissions admins receive funding reminders; tax
          reminders go to Super Admins. Email and WhatsApp delivery require their provider
          credentials to be configured securely.
        </p>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-brand">Live official updates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reads the public RSS feeds published by KASNEB, TVETA, HELB, and ICPAK. Updates are
              fetched on demand; headlines and summaries link back to each agency.
            </p>
            {syncStatusQuery.data?.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last checked{" "}
                {new Date(
                  Math.max(
                    ...syncStatusQuery.data.map((source) =>
                      new Date(source.last_attempted_at).getTime(),
                    ),
                  ),
                ).toLocaleString("en-KE")}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={syncFeeds.isPending}
            onClick={() => syncFeeds.mutate()}
          >
            <RefreshCw className={syncFeeds.isPending ? "animate-spin" : ""} />
            {syncFeeds.isPending ? "Fetching…" : "Fetch latest"}
          </Button>
        </div>

        {updatesQuery.error || syncStatusQuery.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Could not load official feed data:{" "}
            {(updatesQuery.error ?? syncStatusQuery.error)?.message}. Confirm migration{" "}
            <code>0039_regulatory_public_feeds.sql</code> has been applied.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {feedSources.map((source) => {
            const sync = syncStatusQuery.data?.find((item) => item.source_key === source.key);
            return (
              <div key={source.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-brand">{source.name}</p>
                  <Badge variant={sync?.status === "error" ? "destructive" : "secondary"}>
                    {sync?.status === "error" ? "Feed error" : "Public feed"}
                  </Badge>
                </div>
                {sync?.last_successful_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {new Date(sync.last_successful_at).toLocaleString("en-KE")}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Not fetched yet</p>
                )}
                {sync?.status === "error" && sync.error_message && (
                  <p className="mt-1 text-xs text-destructive">{sync.error_message}</p>
                )}
                <a
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open official site <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          })}
        </div>

        {updatesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading saved agency updates…</p>
        ) : updatesQuery.data?.length ? (
          <div className="space-y-3">
            {updatesQuery.data.map((update) => (
              <article key={update.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{update.source_name}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {update.published_at
                      ? new Date(update.published_at).toLocaleDateString("en-KE")
                      : `Fetched ${new Date(update.fetched_at).toLocaleDateString("en-KE")}`}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold text-brand">{update.title}</h3>
                {update.summary && (
                  <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">
                    {update.summary}
                  </p>
                )}
                <a
                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  href={update.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read on {update.source_name} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No public feed items are saved yet. Select <strong>Fetch latest</strong> to import
            current agency headlines.
          </p>
        )}

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-brand">
            Official sources without a verified public feed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            These public portals are linked for manual verification; this system does not scrape
            authenticated accounts or claim to monitor updates there.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {portalOnlySources.map((source) => (
              <a
                key={source.name}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.name} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Feed headlines are informational—not verified exam deadlines, compliance advice, or
          student-specific statuses. Confirm dates and requirements on the linked official notice
          before acting.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Open actions" value={openActions.length} />
        <SummaryCard label="Due in 30 days" value={dueSoonCount} />
        <SummaryCard label="Overdue" value={overdueCount} alert={overdueCount > 0} />
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">
              {editingId ? "Edit action" : "Add an action or deadline"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add dates from official notices and keep submission references with the task.
            </p>
          </div>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(emptyDraft);
                setEditingId(null);
              }}
            >
              <X /> Cancel
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Agency">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.agency}
              onChange={(event) => setDraft({ ...draft, agency: event.target.value })}
            >
              {agencies.map((agency) => (
                <option key={agency}>{agency}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Action category">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Due date">
            <Input
              type="date"
              required
              value={draft.due_date}
              onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
            />
          </FormField>
          <FormField label="Action name">
            <Input
              required
              maxLength={180}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="e.g. KASNEB exam registration closes"
            />
          </FormField>
          <FormField label="Status">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
              value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value })}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Official notice or reference URL (optional)">
            <Input
              type="url"
              maxLength={1000}
              value={draft.reference_url}
              onChange={(event) => setDraft({ ...draft, reference_url: event.target.value })}
              placeholder="https://"
            />
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Details (optional)">
              <Textarea
                maxLength={2000}
                value={draft.details}
                onChange={(event) => setDraft({ ...draft, details: event.target.value })}
                rows={2}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Internal notes or submission reference (optional)">
              <Textarea
                maxLength={2000}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                rows={2}
              />
            </FormField>
          </div>
        </div>
        <Button type="submit" disabled={saveAction.isPending}>
          {editingId ? <Pencil /> : <Plus />}
          {saveAction.isPending ? "Saving…" : editingId ? "Save changes" : "Add action"}
        </Button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-brand">Tracked actions</h2>
            <p className="text-sm text-muted-foreground">
              Deadlines are ordered by date; completed items remain available for reference.
            </p>
          </div>
        </div>
        {actions.length ? (
          actions.map((action) => {
            const remainingDays = daysUntil(action.due_date);
            const isOverdue = action.status !== "completed" && remainingDays < 0;
            return (
              <article key={action.id} className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-brand">{action.title}</h3>
                      <Badge variant={isOverdue ? "destructive" : "secondary"}>
                        {isOverdue ? "overdue" : statusLabel(action.status)}
                      </Badge>
                      <Badge variant="outline">{action.agency}</Badge>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{action.category}</p>
                    {action.details && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {action.details}
                      </p>
                    )}
                    <p className="text-sm">
                      Due {localDate(action.due_date).toLocaleDateString("en-KE")}
                      {action.status !== "completed" &&
                        (remainingDays < 0
                          ? ` · ${Math.abs(remainingDays)} day${remainingDays === -1 ? "" : "s"} overdue`
                          : remainingDays === 0
                            ? " · Due today"
                            : ` · In ${remainingDays} day${remainingDays === 1 ? "" : "s"}`)}
                    </p>
                    {action.notes && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        Notes: {action.notes}
                      </p>
                    )}
                    {action.reference_url && (
                      <a
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        href={action.reference_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open reference <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Status for ${action.title}`}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
                      value={action.status}
                      disabled={updateStatus.isPending}
                      onChange={(event) =>
                        updateStatus.mutate({ id: action.id, status: event.target.value })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(action.id);
                        setDraft({
                          agency: action.agency,
                          category: action.category,
                          title: action.title,
                          details: action.details ?? "",
                          due_date: action.due_date,
                          status: action.status,
                          reference_url: action.reference_url ?? "",
                          notes: action.notes ?? "",
                        });
                      }}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deleteAction.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete “${action.title}”?`)) {
                          deleteAction.mutate(action.id);
                        }
                      }}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            No actions are being tracked yet. Add exam, renewal, funding, or tax-invoice deadlines
            above.
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-destructive" : "text-brand"}`}>
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
