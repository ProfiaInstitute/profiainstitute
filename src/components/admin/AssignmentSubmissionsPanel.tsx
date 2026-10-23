import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type AssignmentSubmission = Tables<"submissions"> & {
  assignment: Pick<Tables<"assignments">, "id" | "title" | "course_id"> | null;
  student: Pick<
    Tables<"students">,
    "id" | "student_number" | "first_name" | "middle_name" | "last_name"
  > | null;
  result: Pick<Tables<"results">, "score" | "grade"> | null;
};

type MarkSubmission = {
  submissionId: string;
  score: number;
  grade: string;
  feedback: string;
};

export function AssignmentSubmissionsPanel() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"needs-marking" | "marked">("needs-marking");
  const submissionsQuery = useQuery({
    queryKey: ["admin", "assignment-submissions"],
    queryFn: async (): Promise<AssignmentSubmission[]> => {
      const { data: submissions, error: submissionError } = await supabase
        .from("submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (submissionError) throw submissionError;
      if (!submissions.length) return [];

      const studentIds = [...new Set(submissions.map((submission) => submission.student_id))];
      const assignmentIds = [...new Set(submissions.map((submission) => submission.assignment_id))];
      const submissionIds = submissions.map((submission) => submission.id);
      const [students, assignments, results] = await Promise.all([
        supabase
          .from("students")
          .select("id,student_number,first_name,middle_name,last_name")
          .in("id", studentIds),
        supabase.from("assignments").select("id,title,course_id").in("id", assignmentIds),
        supabase
          .from("results")
          .select("source_submission_id,score,grade")
          .in("source_submission_id", submissionIds),
      ]);
      if (students.error) throw students.error;
      if (assignments.error) throw assignments.error;
      if (results.error) throw results.error;

      const studentsById = new Map(students.data.map((student) => [student.id, student]));
      const assignmentsById = new Map(
        assignments.data.map((assignment) => [assignment.id, assignment]),
      );
      const resultsBySubmissionId = new Map(
        results.data
          .filter((result) => result.source_submission_id)
          .map((result) => [result.source_submission_id!, result]),
      );
      return submissions.map((submission) => ({
        ...submission,
        student: studentsById.get(submission.student_id) ?? null,
        assignment: assignmentsById.get(submission.assignment_id) ?? null,
        result: resultsBySubmissionId.get(submission.id) ?? null,
      }));
    },
  });
  const markingMutation = useMutation({
    mutationFn: async (mark: MarkSubmission) => {
      const { error } = await supabase.rpc("mark_assignment_submission", {
        _submission_id: mark.submissionId,
        _score: mark.score,
        _grade: mark.grade,
        _feedback: mark.feedback.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Mark saved to assignment and Results");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "assignment-submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "directory", "results"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "results"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "assignment-submissions"] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error("Could not save assignment mark", { description: error.message }),
  });

  if (submissionsQuery.isLoading)
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold text-brand">Assignment submissions</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading learner submissions…</p>
      </section>
    );
  if (submissionsQuery.error)
    return (
      <section className="rounded-xl border border-destructive/40 bg-card p-5">
        <h2 className="font-semibold text-brand">Assignment submissions</h2>
        <p role="alert" className="mt-2 text-sm text-destructive">
          Could not load learner submissions: {submissionsQuery.error.message}
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => void submissionsQuery.refetch()}
        >
          Retry
        </Button>
      </section>
    );

  const submissions = submissionsQuery.data ?? [];
  const pending = submissions.filter((submission) => !submission.grade);
  const marked = submissions.filter((submission) => !!submission.grade);
  const visible = filter === "needs-marking" ? pending : marked;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand">Assignment submissions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review files and comments, then record marks in Results. The latest 500 submissions are
            shown.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "needs-marking" ? "default" : "outline"}
            onClick={() => setFilter("needs-marking")}
          >
            Needs marking · {pending.length}
          </Button>
          <Button
            size="sm"
            variant={filter === "marked" ? "default" : "outline"}
            onClick={() => setFilter("marked")}
          >
            Marked · {marked.length}
          </Button>
        </div>
      </div>
      {visible.length ? (
        <div className="grid gap-3">
          {visible.map((submission) => (
            <AssignmentMarkingCard
              key={submission.id}
              submission={submission}
              saving={markingMutation.isPending}
              onSave={(mark) => markingMutation.mutate(mark)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          {filter === "needs-marking"
            ? "No submissions need marking."
            : "No marked submissions yet."}
        </p>
      )}
    </section>
  );
}

function AssignmentMarkingCard({
  submission,
  saving,
  onSave,
}: {
  submission: AssignmentSubmission;
  saving: boolean;
  onSave: (mark: MarkSubmission) => void;
}) {
  const [score, setScore] = useState(
    submission.result?.score === null || submission.result?.score === undefined
      ? ""
      : String(submission.result.score),
  );
  const [grade, setGrade] = useState(submission.grade ?? submission.result?.grade ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");

  useEffect(() => {
    setScore(
      submission.result?.score === null || submission.result?.score === undefined
        ? ""
        : String(submission.result.score),
    );
    setGrade(submission.grade ?? submission.result?.grade ?? "");
    setFeedback(submission.feedback ?? "");
  }, [submission]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedScore = Number(score);
    if (
      score.trim() === "" ||
      !Number.isFinite(parsedScore) ||
      parsedScore < 0 ||
      parsedScore > 100
    ) {
      toast.error("Enter a score from 0 to 100.");
      return;
    }
    if (!grade.trim()) {
      toast.error("Enter a grade.");
      return;
    }
    onSave({ submissionId: submission.id, score: parsedScore, grade: grade.trim(), feedback });
  }

  const studentName = submission.student
    ? [submission.student.first_name, submission.student.middle_name, submission.student.last_name]
        .filter(Boolean)
        .join(" ")
    : "Student record unavailable";

  return (
    <article className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand">
            {submission.assignment?.title ?? "Assignment"}
          </h3>
          <p className="mt-1 text-sm">
            {studentName}
            {submission.student?.student_number ? ` · ${submission.student.student_number}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(submission.submitted_at).toLocaleString("en-KE")}
          </p>
        </div>
        <Badge variant={submission.grade ? "default" : "secondary"}>
          {submission.grade ? "Marked" : "Needs marking"}
        </Badge>
      </div>
      {submission.comment && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
          {submission.comment}
        </p>
      )}
      {submission.file_path && (
        <AdminSubmissionFile path={submission.file_path} label="Download submission" />
      )}
      <form
        className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[minmax(120px,180px)_minmax(120px,180px)_1fr_auto]"
        onSubmit={submit}
      >
        <label className="space-y-1 text-xs font-medium">
          Score (0–100)
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={score}
            onChange={(event) => setScore(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Grade
          <Input required value={grade} onChange={(event) => setGrade(event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Feedback for learner
          <Textarea
            rows={2}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
        </label>
        <Button className="self-end" type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : submission.grade ? "Update mark" : "Save mark"}
        </Button>
      </form>
      {submission.grade && (
        <p className="mt-2 text-xs text-muted-foreground">
          Result is recorded in the Results module and remains unpublished until staff publish it.
        </p>
      )}
    </article>
  );
}

function AdminSubmissionFile({ path, label }: { path: string; label: string }) {
  const fileQuery = useQuery({
    queryKey: ["admin", "submission-file-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("submissions").createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 4 * 60_000,
  });

  if (fileQuery.isLoading)
    return <p className="mt-3 text-sm text-muted-foreground">Preparing submission file…</p>;
  if (fileQuery.error)
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        Could not open submission: {fileQuery.error.message}
      </p>
    );
  return (
    <a
      className="mt-3 inline-flex text-sm font-medium text-primary underline"
      href={fileQuery.data}
      target="_blank"
      rel="noreferrer"
      download
    >
      {label} ↗
    </a>
  );
}
