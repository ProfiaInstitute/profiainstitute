import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CatDownloadButton } from "@/components/academics/CatDownloadButton";
import { supabase } from "@/integrations/supabase/client";
import {
  catDateTimeLabel,
  parseCatSubmission,
  parseStudentCatAttempt,
  parseStudentCats,
  type CatOptionKey,
  type StudentCat,
  type StudentCatAttempt,
} from "@/lib/cats";

export function StudentCatsSection({ courseId }: { courseId: string | null }) {
  const queryClient = useQueryClient();
  const [activeAttempt, setActiveAttempt] = useState<StudentCatAttempt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingAttemptId = useRef<string | null>(null);
  const catsQuery = useQuery({
    queryKey: ["student", "cats", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_cats", { _course_id: courseId });
      if (error) throw error;
      return parseStudentCats(data);
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const submitAttempt = useCallback(
    async (attemptId: string, automatic = false) => {
      if (submittingAttemptId.current === attemptId) return;
      submittingAttemptId.current = attemptId;
      setSubmitting(true);
      setSubmitError("");
      let result: ReturnType<typeof parseCatSubmission>;
      try {
        const { data, error } = await supabase.rpc("submit_cat_attempt", {
          _attempt_id: attemptId,
        });
        if (error) throw error;
        result = parseCatSubmission(data);
      } catch (error) {
        submittingAttemptId.current = null;
        setSubmitting(false);
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        setSubmitError(message);
        toast.error("Could not submit CAT", { description: message });
        return;
      }
      setActiveAttempt((current) =>
        current?.id === attemptId
          ? {
              ...current,
              submittedAt: result.submittedAt,
              score: result.score,
              maxScore: result.maxScore,
              questions: [],
            }
          : current,
      );
      setSubmitting(false);
      setSubmitError("");
      toast.success(automatic ? "CAT time expired. Your answers were submitted." : "CAT submitted");
      void queryClient.invalidateQueries({ queryKey: ["student", "cats", courseId] });
    },
    [courseId, queryClient],
  );

  useEffect(() => {
    if (!activeAttempt || activeAttempt.submittedAt || submitting || submitError) return;
    if (Date.parse(activeAttempt.deadline) <= now) {
      void submitAttempt(activeAttempt.id, true);
    }
  }, [activeAttempt, now, submitError, submitAttempt, submitting]);

  async function startAttempt(cat: StudentCat) {
    setStartingId(cat.id);
    try {
      const { data, error } = await supabase.rpc("start_cat_attempt", {
        _assessment_id: cat.id,
      });
      if (error) throw error;
      const attempt = parseStudentCatAttempt(data);
      setActiveAttempt(attempt);
      setSubmitError("");
      submittingAttemptId.current = attempt.submittedAt ? attempt.id : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast.error("Could not open CAT", {
        description: message,
      });
      void catsQuery.refetch();
    } finally {
      setStartingId(null);
    }
  }

  async function saveAnswer(questionId: string, selectedOption: CatOptionKey) {
    if (!activeAttempt || savingQuestionId) return;
    setSavingQuestionId(questionId);
    try {
      const { error } = await supabase.rpc("save_cat_answer", {
        _attempt_id: activeAttempt.id,
        _question_id: questionId,
        _selected_option: selectedOption,
      });
      if (error) throw error;
      setActiveAttempt((current) =>
        current?.id === activeAttempt.id
          ? {
              ...current,
              questions: current.questions.map((question) =>
                question.id === questionId ? { ...question, selectedOption } : question,
              ),
            }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast.error("Could not save answer", { description: message });
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (!courseId) {
    return (
      <EmptyCats
        title="No course assigned"
        detail="Your course must be assigned before course CATs can appear."
      />
    );
  }
  if (catsQuery.isLoading) {
    return (
      <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Loading CATs…</p>
    );
  }
  if (catsQuery.error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-card p-5 text-sm text-destructive"
      >
        Could not load CATs: {catsQuery.error.message}
        <Button
          className="ml-3"
          size="sm"
          variant="outline"
          onClick={() => void catsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (activeAttempt) {
    const secondsRemaining = Math.max(
      0,
      Math.ceil((Date.parse(activeAttempt.deadline) - now) / 1000),
    );
    if (activeAttempt.submittedAt) {
      return (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <img
                  src="/favicon.png"
                  alt="Profia Institute"
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <h2 className="font-semibold text-brand">{activeAttempt.title}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">CAT submitted</p>
            </div>
            <Badge>Result</Badge>
          </div>
          <p className="rounded-lg bg-accent p-4 text-lg font-semibold">
            Your mark: {activeAttempt.score} / {activeAttempt.maxScore}
          </p>
          <Button variant="outline" onClick={() => setActiveAttempt(null)}>
            Back to CATs
          </Button>
        </section>
      );
    }
    return (
      <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/favicon.png"
                alt="Profia Institute"
                className="h-10 w-10 shrink-0 object-contain"
              />
              <h2 className="font-semibold text-brand">{activeAttempt.title}</h2>
            </div>
            {activeAttempt.instructions && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {activeAttempt.instructions}
              </p>
            )}
          </div>
          <Badge variant={secondsRemaining > 0 ? "default" : "destructive"} className="gap-1">
            <Clock3 className="h-3.5 w-3.5" /> {formatCountdown(secondsRemaining)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Your answers are saved as you choose them. You can submit only once; leaving this page
          does not stop the timer.
        </p>
        {activeAttempt.questions.map((question, index) => (
          <fieldset key={question.id} className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-semibold">
              {index + 1}. {question.prompt}{" "}
              <span className="text-muted-foreground">({question.points} marks)</span>
            </legend>
            {question.options.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.key}
                  checked={question.selectedOption === option.key}
                  disabled={submitting || secondsRemaining <= 0 || Boolean(savingQuestionId)}
                  onChange={() => void saveAnswer(question.id, option.key)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <strong>{option.key}.</strong> {option.text}
                </span>
              </label>
            ))}
            {savingQuestionId === question.id && (
              <p className="text-xs text-muted-foreground">Saving answer…</p>
            )}
          </fieldset>
        ))}
        {submitError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            Submission failed: {submitError}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            disabled={submitting || Boolean(savingQuestionId)}
            onClick={() => void submitAttempt(activeAttempt.id)}
          >
            {submitting ? "Submitting…" : "Submit CAT"}
          </Button>
          {submitError && (
            <Button
              variant="outline"
              disabled={submitting || Boolean(savingQuestionId)}
              onClick={() => void submitAttempt(activeAttempt.id, secondsRemaining <= 0)}
            >
              Retry submission
            </Button>
          )}
        </div>
      </section>
    );
  }

  return catsQuery.data?.length ? (
    <div className="space-y-3">
      {catsQuery.data.map((cat) => (
        <CatStudentCard
          key={cat.id}
          cat={cat}
          busy={startingId === cat.id}
          onStart={() => void startAttempt(cat)}
        />
      ))}
    </div>
  ) : (
    <EmptyCats
      title="No CATs yet"
      detail="CATs published for your course level will appear here."
    />
  );
}

function CatStudentCard({
  cat,
  busy,
  onStart,
}: {
  cat: StudentCat;
  busy: boolean;
  onStart: () => void;
}) {
  const now = Date.now();
  const submitted = Boolean(cat.submittedAt);
  const isOpen = now >= Date.parse(cat.opensAt) && now < Date.parse(cat.closesAt);
  const badge = submitted
    ? "Submitted"
    : cat.inProgress
      ? "In progress"
      : isOpen
        ? "Open"
        : now < Date.parse(cat.opensAt)
          ? "Upcoming"
          : "Closed";

  return (
    <article className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand">{cat.title}</h2>
          <p className="mt-1 text-sm font-medium">CAT download name: {cat.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {cat.durationMinutes} minute time limit · Opens {catDateTimeLabel(cat.opensAt)} · Closes{" "}
            {catDateTimeLabel(cat.closesAt)}
          </p>
        </div>
        <Badge variant={submitted ? "default" : isOpen || cat.inProgress ? "secondary" : "outline"}>
          {badge}
        </Badge>
      </div>
      {cat.instructions && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{cat.instructions}</p>
      )}
      {cat.downloadFilePath && cat.downloadFileName && (
        <div className="mt-4">
          <CatDownloadButton
            path={cat.downloadFilePath}
            filename={cat.downloadFileName}
            name={cat.name}
          />
        </div>
      )}
      {submitted ? (
        <p className="mt-4 rounded-lg bg-accent p-3 text-sm font-semibold">
          Your mark: {cat.score} / {cat.maxScore}
        </p>
      ) : cat.inProgress ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Attempt started {cat.startedAt ? catDateTimeLabel(cat.startedAt) : ""}. Resume to continue
          before its timer expires.
        </p>
      ) : !isOpen ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {now < Date.parse(cat.opensAt)
            ? "This CAT is not available yet."
            : "The access window for this CAT has closed."}
        </p>
      ) : null}
      {!submitted && (isOpen || cat.inProgress) && (
        <Button className="mt-4" disabled={busy} onClick={onStart}>
          {busy ? "Opening CAT…" : cat.inProgress ? "Resume CAT" : "Start CAT"}
        </Button>
      )}
    </article>
  );
}

function EmptyCats({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 text-center">
      <h2 className="font-semibold text-brand">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
