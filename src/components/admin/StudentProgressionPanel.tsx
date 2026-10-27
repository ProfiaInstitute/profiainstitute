import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

type RuleDraft = {
  name: string;
  source_course_id: string;
  next_course_id: string;
  exam_name_pattern: string;
  minimum_score: string;
  delay_days: string;
  subject: string;
  message: string;
};

const initialRule: RuleDraft = {
  name: "",
  source_course_id: "",
  next_course_id: "",
  exam_name_pattern: "%exam%",
  minimum_score: "50",
  delay_days: "7",
  subject: "Continue your studies at Profia Institute",
  message:
    "Congratulations {student_name} on completing your examinations. You passed and can now enrol in {next_course}. Continue your studies: {enrolment_link}",
};

export function StudentProgressionPanel() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [draft, setDraft] = useState(initialRule);
  const coursesQuery = useQuery({
    queryKey: ["admin", "progression-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,title").order("title");
      if (error) throw error;
      return data;
    },
  });
  const rulesQuery = useQuery({
    queryKey: ["admin", "progression-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("progression_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const followupsQuery = useQuery({
    queryKey: ["admin", "progression-followups"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_student_progression_followups");
      if (error) throw error;
      return data;
    },
  });
  const saveRule = useMutation({
    mutationFn: async (values: RuleDraft) => {
      const { error } = await supabase.from("progression_rules").insert({
        name: values.name.trim(),
        source_course_id: values.source_course_id,
        next_course_id: values.next_course_id,
        exam_name_pattern: values.exam_name_pattern.trim(),
        minimum_score: Number(values.minimum_score),
        delay_days: Number(values.delay_days),
        subject: values.subject.trim(),
        message: values.message.trim(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Progression rule saved");
      setDraft(initialRule);
      await queryClient.invalidateQueries({ queryKey: ["admin", "progression-rules"] });
    },
    onError: (error) =>
      toast.error("Could not save progression rule", { description: error.message }),
  });
  const updateRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("progression_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Progression rule updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "progression-rules"] });
    },
    onError: (error) => toast.error("Could not update rule", { description: error.message }),
  });
  const queueExisting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("queue_existing_progression_followups");
      if (error) throw error;
      return data;
    },
    onSuccess: async (count) => {
      toast.success(
        `${count} follow-up${count === 1 ? "" : "s"} queued for eligible published exam results`,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "progression-followups"] });
    },
    onError: (error) =>
      toast.error("Could not queue eligible students", { description: error.message }),
  });
  const retryFollowup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("retry_progression_followup", { _followup_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Follow-up queued for retry");
      await queryClient.invalidateQueries({ queryKey: ["admin", "progression-followups"] });
    },
    onError: (error) => toast.error("Could not retry follow-up", { description: error.message }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.subject.trim() || !draft.message.trim()) {
      toast.error("Enter a rule name, email subject, and message.");
      return;
    }
    if (!draft.source_course_id || !draft.next_course_id) {
      toast.error("Select both the current course and the next level.");
      return;
    }
    if (draft.source_course_id === draft.next_course_id) {
      toast.error("The next level must be a different course.");
      return;
    }
    const score = Number(draft.minimum_score);
    const delay = Number(draft.delay_days);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast.error("Pass score must be from 0 to 100.");
      return;
    }
    if (!Number.isInteger(delay) || delay < 0 || delay > 365) {
      toast.error("Follow-up delay must be between 0 and 365 days.");
      return;
    }
    saveRule.mutate(draft);
  }

  if (coursesQuery.error || rulesQuery.error || followupsQuery.error) {
    const error = coursesQuery.error ?? rulesQuery.error ?? followupsQuery.error;
    const migrationRequired = error ? isProgressionMigrationError(error) : false;
    return (
      <PanelError
        message={error?.message ?? "Could not load progression data."}
        migrationRequired={migrationRequired}
        retry={() => {
          void coursesQuery.refetch();
          void rulesQuery.refetch();
          void followupsQuery.refetch();
        }}
      />
    );
  }
  if (coursesQuery.isLoading || rulesQuery.isLoading || followupsQuery.isLoading)
    return (
      <div role="status" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
        Loading student progression…
      </div>
    );

  const courseName = new Map(coursesQuery.data?.map((course) => [course.id, course.title]) ?? []);
  const dueCount =
    followupsQuery.data?.filter((item) => item.status === "pending" || item.status === "failed")
      .length ?? 0;
  const hasActiveRule = rulesQuery.data?.some((rule) => rule.enabled) ?? false;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-primary/30 bg-cream p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold text-brand">Automatic exam follow-up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When a qualifying exam result is published, matching active students are scheduled for
              a follow-up email after the configured number of days. Students are invited to apply
              for the next course; staff still confirm the new enrolment.
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Create a progression rule</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            For example, link CPA Level I to Level II after a qualifying final exam.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule name">
            <Input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="CPA Level I exam follow-up"
            />
          </Field>
          <Field label="Exam unit name contains (SQL pattern)">
            <Input
              required
              value={draft.exam_name_pattern}
              onChange={(e) => setDraft({ ...draft, exam_name_pattern: e.target.value })}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Default `%exam%` only matches unit names containing “exam”.
            </span>
          </Field>
          <Field label="Current course">
            <select
              required
              className={selectClass}
              value={draft.source_course_id}
              onChange={(e) => setDraft({ ...draft, source_course_id: e.target.value })}
            >
              <option value="">Select current level</option>
              {coursesQuery.data?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Next level course">
            <select
              required
              className={selectClass}
              value={draft.next_course_id}
              onChange={(e) => setDraft({ ...draft, next_course_id: e.target.value })}
            >
              <option value="">Select next level</option>
              {coursesQuery.data?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minimum pass score (%)">
            <Input
              required
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.minimum_score}
              onChange={(e) => setDraft({ ...draft, minimum_score: e.target.value })}
            />
          </Field>
          <Field label="Days after exam result publication">
            <Input
              required
              type="number"
              min="0"
              max="365"
              step="1"
              value={draft.delay_days}
              onChange={(e) => setDraft({ ...draft, delay_days: e.target.value })}
            />
          </Field>
          <Field label="Email subject">
            <Input
              required
              maxLength={200}
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </Field>
          <Field label="Message template">
            <Textarea
              required
              rows={4}
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Use {"{student_name}"}, {"{student_number}"}, {"{next_course}"} and{" "}
              {"{enrolment_link}"}.
            </span>
          </Field>
        </div>
        <Button disabled={saveRule.isPending || !coursesQuery.data?.length}>
          {saveRule.isPending ? "Saving…" : "Save progression rule"}
        </Button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Progression rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rulesQuery.data?.length ?? 0} rules · {dueCount} pending or failed follow-ups
            </p>
          </div>
          <Button
            variant="outline"
            disabled={queueExisting.isPending}
            onClick={() => queueExisting.mutate()}
          >
            <RefreshCw />{" "}
            {queueExisting.isPending ? "Checking…" : "Queue eligible existing results"}
          </Button>
        </div>
        {rulesQuery.data?.length ? (
          rulesQuery.data.map((rule) => (
            <article
              key={rule.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-brand">{rule.name}</h3>
                  <Badge variant={rule.enabled ? "default" : "secondary"}>
                    {rule.enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {courseName.get(rule.source_course_id) ?? "Course removed"} →{" "}
                  {courseName.get(rule.next_course_id) ?? "Course removed"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Exam pattern: {rule.exam_name_pattern} · Pass ≥ {rule.minimum_score}% · Email
                  after {rule.delay_days} days
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={rule.enabled ? "secondary" : "outline"}
                  disabled={updateRule.isPending}
                  onClick={() => updateRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                >
                  {rule.enabled ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(`Delete rule “${rule.name}” and its unsent follow-ups?`))
                      void supabase
                        .from("progression_rules")
                        .delete()
                        .eq("id", rule.id)
                        .then(({ error }) => {
                          if (error)
                            toast.error("Could not delete rule", { description: error.message });
                          else {
                            toast.success("Rule deleted");
                            void queryClient.invalidateQueries({
                              queryKey: ["admin", "progression-rules"],
                            });
                            void queryClient.invalidateQueries({
                              queryKey: ["admin", "progression-followups"],
                            });
                          }
                        });
                  }}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="No progression rules"
            detail="Create a rule to automatically follow up with students after published exam results."
          />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-brand">Scheduled student follow-ups</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest 100 messages, including student, result, and course details. Failed messages can
            be retried.
          </p>
        </div>
        {followupsQuery.data?.length ? (
          followupsQuery.data.map((followup) => (
            <article
              key={followup.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div>
                <p className="font-medium">
                  {followup.student_name || followup.student_number}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {followup.student_number}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {followup.student_email || "No email on record"}
                </p>
                <p className="mt-1 text-sm">
                  {followup.source_course} → {followup.next_course}
                </p>
                <p className="text-xs text-muted-foreground">
                  {followup.unit_name}
                  {followup.score !== null ? ` · ${followup.score}%` : ""}
                  {followup.grade ? ` · ${followup.grade}` : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      followup.status === "sent"
                        ? "default"
                        : followup.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {followup.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Due {new Date(followup.due_at).toLocaleString("en-KE")}
                  </span>
                </div>
                {followup.sent_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent {new Date(followup.sent_at).toLocaleString("en-KE")}
                  </p>
                )}
                {followup.last_error && (
                  <p className="mt-2 max-w-xl text-xs text-destructive">{followup.last_error}</p>
                )}
              </div>
              {followup.status === "failed" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retryFollowup.isPending}
                  onClick={() => retryFollowup.mutate(followup.id)}
                >
                  <Send /> Retry email
                </Button>
              )}
            </article>
          ))
        ) : (
          <EmptyState
            title="No follow-ups scheduled"
            detail={
              hasActiveRule
                ? "No qualifying results have been queued. Publish an exam result that matches an active rule, or queue eligible existing results to check past results."
                : "Create and activate a progression rule first. Follow-ups are created only for active students with published exam results that match the rule."
            }
          />
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-6 text-center">
      <p className="font-semibold text-brand">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
function isProgressionMigrationError(error: Error) {
  if (!("code" in error) || typeof error.code !== "string") return false;
  return ["42P01", "42703", "42883", "PGRST202", "PGRST205"].includes(error.code);
}

function PanelError({
  message,
  migrationRequired,
  retry,
}: {
  message: string;
  migrationRequired: boolean;
  retry: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-5">
      {migrationRequired && (
        <p className="mb-2 font-semibold text-brand">
          Student progression is not fully installed in this Supabase project.
        </p>
      )}
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      {migrationRequired && (
        <p className="mt-2 text-sm text-muted-foreground">
          Apply <code>drizzle/migrations/0003_student_progression_followups.sql</code> and{" "}
          <code>drizzle/migrations/0007_student_progression_directory.sql</code> in the Supabase SQL
          Editor, then retry.
        </p>
      )}
      <Button variant="outline" className="mt-3" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
