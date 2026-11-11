import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAnswerSheetQuestionList,
  downloadMarkedAnswerSheet,
  downloadMarkedAnswerSheets,
  type AnswerSheetPayload,
} from "@/lib/answer-sheet";
import { parseAdminCats, type AdminCat, type AdminCatAttempt } from "@/lib/cats";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "");
}

export function CatResultsPanel() {
  const [courseId, setCourseId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [downloadingAttemptId, setDownloadingAttemptId] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);

  const catsQuery = useQuery({
    queryKey: ["admin", "cat-results"],
    queryFn: async () => {
      const [catsResult, coursesResult] = await Promise.all([
        supabase.rpc("list_cat_assessments"),
        supabase.from("courses").select("id,title").order("title"),
      ]);
      if (catsResult.error) throw catsResult.error;
      if (coursesResult.error) throw coursesResult.error;
      return { cats: parseAdminCats(catsResult.data), courses: coursesResult.data };
    },
  });
  const levelsQuery = useQuery({
    queryKey: ["admin", "cat-results-levels", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,sort_order")
        .eq("course_id", courseId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const unitsQuery = useQuery({
    queryKey: ["admin", "cat-results-units", courseId, levelId],
    enabled: Boolean(courseId && levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,course_id,level_id")
        .eq("course_id", courseId)
        .eq("level_id", levelId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const cats = catsQuery.data?.cats ?? [];
  const selectedCourse = catsQuery.data?.courses.find((course) => course.id === courseId);
  const selectedUnit = unitsQuery.data?.find((unit) => unit.id === unitId);
  const unitCats = cats.filter((cat) => cat.courseId === courseId && cat.unitId === unitId);
  const catsWithSubmittedAttempts = unitCats
    .map((cat) => ({
      cat,
      submittedAttempts: cat.attempts.filter((attempt) => attempt.submittedAt),
    }))
    .filter(({ submittedAttempts }) => submittedAttempts.length);
  const selectedResult = catsWithSubmittedAttempts.find(({ cat }) => cat.id === assessmentId);
  const submittedAttempts = selectedResult?.submittedAttempts ?? [];
  const canDownloadSheets = Boolean(selectedUnit?.code?.trim());

  function answerSheetPayload(cat: AdminCat, attempt: AdminCatAttempt): AnswerSheetPayload {
    if (!selectedUnit?.code?.trim() || !selectedCourse) {
      throw new Error("The selected unit is missing its course or unit code.");
    }
    return {
      courseName: selectedCourse.title,
      unitName: selectedUnit.title,
      unitCode: selectedUnit.code,
      examName: cat.name,
      studentName: attempt.studentName,
      kasnebNumber: attempt.kasnebNumber ?? "Not entered",
      questions: buildAnswerSheetQuestionList(
        cat.questions.map((question) => ({
          id: question.id,
          selectedOption:
            attempt.answers.find((answer) => answer.questionId === question.id)?.selectedOption ??
            null,
          correctOption: question.correctOption,
          points: question.points,
        })),
      ),
    };
  }

  async function downloadOne(attempt: AdminCatAttempt) {
    if (!selectedResult) return;
    setDownloadingAttemptId(attempt.id);
    try {
      await downloadMarkedAnswerSheet(
        answerSheetPayload(selectedResult.cat, attempt),
        `${safeFilePart(attempt.studentName)}-${safeFilePart(selectedResult.cat.name)}-answer-sheet.docx`,
      );
    } catch (error) {
      toast.error("Could not download the student answer sheet", {
        description: error instanceof Error ? error.message : "The document could not be created.",
      });
    } finally {
      setDownloadingAttemptId("");
    }
  }

  async function downloadAll() {
    if (!selectedResult || !submittedAttempts.length) return;
    setDownloadingAll(true);
    try {
      const payloads = submittedAttempts.map((attempt) =>
        answerSheetPayload(selectedResult.cat, attempt),
      );
      await downloadMarkedAnswerSheets(
        payloads,
        `${safeFilePart(selectedResult.cat.name)}-all-answer-sheets.docx`,
      );
    } catch (error) {
      toast.error("Could not download the combined answer sheets", {
        description: error instanceof Error ? error.message : "The document could not be created.",
      });
    } finally {
      setDownloadingAll(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">CAT results and answer sheets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a course, level, unit, and completed CAT to review submitted answers and download
          student answer sheets.
        </p>
      </div>

      {catsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading CAT results…</p>
      ) : catsQuery.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          Could not load CAT results: {catsQuery.error.message}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            onClick={() => void catsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Course
              <select
                className={selectClass}
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setLevelId("");
                  setUnitId("");
                  setAssessmentId("");
                }}
              >
                <option value="">Select course</option>
                {(catsQuery.data?.courses ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Level
              <select
                className={selectClass}
                value={levelId}
                disabled={!courseId || levelsQuery.isLoading}
                onChange={(event) => {
                  setLevelId(event.target.value);
                  setUnitId("");
                  setAssessmentId("");
                }}
              >
                <option value="">
                  {levelsQuery.isLoading ? "Loading levels…" : "Select level"}
                </option>
                {(levelsQuery.data ?? []).map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
            {levelsQuery.error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                Could not load course levels: {levelsQuery.error.message}
              </p>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Unit
              <select
                className={selectClass}
                value={unitId}
                disabled={!levelId || unitsQuery.isLoading}
                onChange={(event) => {
                  setUnitId(event.target.value);
                  setAssessmentId("");
                }}
              >
                <option value="">{unitsQuery.isLoading ? "Loading units…" : "Select unit"}</option>
                {(unitsQuery.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? `${unit.code} · ` : ""}
                    {unit.title}
                  </option>
                ))}
              </select>
            </label>
            {unitsQuery.error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                Could not load units: {unitsQuery.error.message}
              </p>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Completed CAT
              <select
                className={selectClass}
                value={assessmentId}
                disabled={!unitId || unitsQuery.isLoading}
                onChange={(event) => setAssessmentId(event.target.value)}
              >
                <option value="">Select CAT</option>
                {catsWithSubmittedAttempts.map(({ cat, submittedAttempts: attempts }) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.title} · {attempts.length} submitted
                  </option>
                ))}
              </select>
            </label>
          </div>

          {unitId && !unitsQuery.isLoading && !catsWithSubmittedAttempts.length && (
            <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              No submitted CAT results are available for this unit.
            </p>
          )}

          {selectedResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <h3 className="font-semibold">{selectedResult.cat.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedCourse?.title} · {selectedUnit?.title} · {submittedAttempts.length}{" "}
                    submitted answer sheet{submittedAttempts.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canDownloadSheets || downloadingAll || Boolean(downloadingAttemptId)}
                  loading={downloadingAll}
                  onClick={() => void downloadAll()}
                >
                  <ArrowDownToLine />
                  {downloadingAll ? "Preparing document…" : "Download all answer sheets"}
                </Button>
              </div>
              {!canDownloadSheets && (
                <p role="alert" className="text-sm text-destructive">
                  This unit has no unit code, so answer sheets cannot be generated until the code is
                  added in course setup.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="border-b px-3 py-2">Student</th>
                      <th className="border-b px-3 py-2">Student number</th>
                      <th className="border-b px-3 py-2">KASNEB number</th>
                      <th className="border-b px-3 py-2">Result</th>
                      <th className="border-b px-3 py-2">Submitted</th>
                      <th className="border-b px-3 py-2">Answer sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submittedAttempts.map((attempt) => (
                      <tr key={attempt.id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-medium">{attempt.studentName}</td>
                        <td className="px-3 py-3">{attempt.studentNumber}</td>
                        <td className="px-3 py-3">{attempt.kasnebNumber ?? "—"}</td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary">
                            {attempt.score ?? 0}/{attempt.maxScore ?? 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          {attempt.submittedAt
                            ? new Date(attempt.submittedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              !canDownloadSheets || downloadingAll || Boolean(downloadingAttemptId)
                            }
                            loading={downloadingAttemptId === attempt.id}
                            onClick={() => void downloadOne(attempt)}
                          >
                            <ArrowDownToLine />
                            Download
                          </Button>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-brand">
                              View answers
                            </summary>
                            <div className="mt-2 space-y-1">
                              {selectedResult.cat.questions.map((question, index) => {
                                const selected = attempt.answers.find(
                                  (answer) => answer.questionId === question.id,
                                )?.selectedOption;
                                return (
                                  <p key={question.id} className="text-xs">
                                    {index + 1}. Selected:{" "}
                                    {selected
                                      ? `${selected}. ${question.options[selected]}`
                                      : "No answer"}
                                    {" · "}Correct: {question.correctOption}.{" "}
                                    {question.options[question.correctOption]}
                                  </p>
                                );
                              })}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
