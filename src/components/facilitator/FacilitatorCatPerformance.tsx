import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { catDateTimeLabel, parseAdminCats } from "@/lib/cats";

export function FacilitatorCatPerformance({ unitId }: { unitId: string }) {
  const query = useQuery({
    queryKey: ["facilitator", "cat-performance", unitId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_facilitator_cat_performance", {
        _unit_id: unitId,
      });
      if (error) throw error;
      return parseAdminCats(data);
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading CAT performance…</p>;
  }
  if (query.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}
      </p>
    );
  }
  if (!query.data?.length) {
    return (
      <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
        No CATs have been assigned to this unit yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {query.data.map((cat) => {
        const submittedAttempts = cat.attempts.filter((attempt) => attempt.submittedAt);
        const percentages = submittedAttempts.flatMap((attempt) =>
          attempt.score !== null && attempt.maxScore
            ? [(attempt.score / attempt.maxScore) * 100]
            : [],
        );
        const average =
          percentages.length > 0
            ? percentages.reduce((total, percentage) => total + percentage, 0) / percentages.length
            : null;

        return (
          <article key={cat.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-brand">{cat.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cat.courseTitle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{cat.attempts.length} attempts</Badge>
                <Badge>{submittedAttempts.length} submitted</Badge>
                {average !== null && <Badge variant="outline">Average {average.toFixed(1)}%</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{cat.questions.length} questions</span>
              <span>{cat.durationMinutes} minute time limit</span>
              <span>Opens {catDateTimeLabel(cat.opensAt)}</span>
              <span>Closes {catDateTimeLabel(cat.closesAt)}</span>
            </div>
            {cat.attempts.length ? (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-semibold">Student attempts</h4>
                {cat.attempts.map((attempt) => (
                  <details key={attempt.id} className="rounded-md border bg-muted/20 p-3">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {attempt.studentName} · {attempt.studentNumber}
                      </span>
                      {attempt.submittedAt ? (
                        <Badge>
                          Submitted · {attempt.score ?? "—"}/{attempt.maxScore ?? "—"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">In progress · no mark yet</Badge>
                      )}
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Started {catDateTimeLabel(attempt.startedAt)}
                      {attempt.submittedAt &&
                        ` · Submitted ${catDateTimeLabel(attempt.submittedAt)}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      KASNEB number: {attempt.kasnebNumber ?? "Not entered"} · Level:{" "}
                      {attempt.levelName ?? "Not recorded"}
                    </p>
                    <div className="mt-3 space-y-3">
                      {cat.questions.map((question, index) => {
                        const selected = attempt.answers.find(
                          (answer) => answer.questionId === question.id,
                        )?.selectedOption;
                        return (
                          <div key={question.id} className="rounded-md bg-background p-3 text-sm">
                            <p className="font-medium">
                              {index + 1}. {question.prompt}{" "}
                              <span className="text-muted-foreground">
                                ({question.points} marks)
                              </span>
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              Selected:{" "}
                              {selected
                                ? `${selected}. ${question.options[selected]}`
                                : "No answer"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Correct answer: {question.correctOption}.{" "}
                              {question.options[question.correctOption]}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className="border-t pt-3 text-sm text-muted-foreground">
                No student attempts yet.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
