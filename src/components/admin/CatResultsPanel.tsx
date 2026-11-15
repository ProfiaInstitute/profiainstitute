import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createExcelWorkbook } from "@/lib/excel-export";
import {
  buildCatUnitReportRows,
  parseAdminCats,
  type AdminCat,
  type AdminCatAttempt,
} from "@/lib/cats";
import {
  buildAnswerSheetQuestionList,
  downloadMarkedAnswerSheet,
  downloadMarkedAnswerSheets,
  type AnswerSheetPayload,
} from "@/lib/answer-sheet";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "");
}

function normalizeCatSearch(value: string) {
  return value.toLocaleLowerCase().replace(/[\s_-]+/g, "");
}

export function CatResultsPanel() {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [reportUnitIds, setReportUnitIds] = useState<string[]>([]);
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
    refetchInterval: 30_000,
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
  const selectedLevel = levelsQuery.data?.find((level) => level.id === levelId);
  const selectedUnit = unitsQuery.data?.find((unit) => unit.id === unitId);
  const selectedReportUnits = (unitsQuery.data ?? []).filter((unit) =>
    reportUnitIds.includes(unit.id),
  );
  const reportRows = buildCatUnitReportRows(
    selectedReportUnits,
    cats.filter((cat) => cat.courseId === courseId && cat.unitId !== null),
  );
  const unitCats = cats.filter((cat) => cat.courseId === courseId && cat.unitId === unitId);
  const unitResults = unitCats.map((cat) => ({
    cat,
    submittedAttempts: cat.attempts.filter((attempt) => attempt.submittedAt),
    inProgressAttempts: cat.attempts.filter((attempt) => !attempt.submittedAt),
  }));
  const normalizedCatSearch = normalizeCatSearch(catSearch.trim());
  const matchingCats = unitResults.filter(({ cat }) =>
    [cat.name, cat.title].some((value) => normalizeCatSearch(value).includes(normalizedCatSearch)),
  );
  const selectedResult = unitResults.find(({ cat }) => cat.id === assessmentId);
  const submittedAttempts = selectedResult?.submittedAttempts ?? [];
  const canDownloadSheets = Boolean(selectedUnit?.code?.trim());
  const markStudentsQuery = useQuery({
    queryKey: ["admin", "cat-mark-students", selectedResult?.cat.id],
    enabled: Boolean(selectedResult),
    queryFn: async () => {
      if (!selectedResult) return [];
      const { data, error } = await supabase.rpc("list_cat_mark_candidates", {
        _assessment_id: selectedResult.cat.id,
      });
      if (error) throw error;
      return data.map((student) => ({
        studentNumber: student.student_number,
        studentName: student.student_name,
      }));
    },
  });
  const markCandidates = markStudentsQuery.data ?? [];
  const submittedStudentNumbers = new Set(
    selectedResult?.cat.attempts.map((attempt) => attempt.studentNumber) ?? [],
  );
  const manualMarkCandidates = markCandidates.filter(
    (student) => !submittedStudentNumbers.has(student.studentNumber),
  );
  const maximumMark =
    selectedResult?.cat.questions.reduce((total, question) => total + question.points, 0) ?? 0;
  const [markDrafts, setMarkDrafts] = useState<Record<string, string>>({});
  const [manualStudentNumber, setManualStudentNumber] = useState("");
  const [manualMark, setManualMark] = useState("");
  const saveMarkMutation = useMutation({
    mutationFn: async (value: { studentNumber: string; score: string }) => {
      if (!selectedResult) throw new Error("Select a CAT first.");
      const score = Number(value.score);
      if (!Number.isInteger(score) || score < 0 || score > maximumMark) {
        throw new Error(`Enter a whole-number mark from 0 to ${maximumMark}.`);
      }
      const { error } = await supabase.rpc("save_cat_assessment_mark", {
        _assessment_id: selectedResult.cat.id,
        _student_number: value.studentNumber,
        _score: score,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success("CAT mark saved");
      setMarkDrafts((current) => {
        const next = { ...current };
        delete next[variables.studentNumber];
        return next;
      });
      setManualStudentNumber("");
      setManualMark("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "cat-results"] });
    },
    onError: (error) =>
      toast.error("Could not save CAT mark", {
        description: error instanceof Error ? error.message : "Please check the mark and retry.",
      }),
  });

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

  function downloadCatReport() {
    if (!reportRows.length || !selectedCourse || !selectedLevel) return;
    try {
      const workbook = createExcelWorkbook(reportRows);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(workbook)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilePart(selectedCourse.title)}-${safeFilePart(selectedLevel.name)}-cat-results.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Could not export CAT results", {
        description:
          error instanceof Error ? error.message : "The spreadsheet could not be created.",
      });
    }
  }

  function printCatReport() {
    if (!reportRows.length || !selectedCourse || !selectedLevel) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the CAT report.");
      return;
    }
    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    const rows = reportRows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.unit)}</td><td>${escapeHtml(row.student)}</td><td>${escapeHtml(row.student_number)}</td><td>${escapeHtml(row.kasneb_number || "—")}</td><td>${escapeHtml(row.cat_1_score || "—")}</td><td>${escapeHtml(row.cat_2_score || "—")}</td><td>${escapeHtml(row.combined_score)}</td><td>${row.combined_percentage === null ? "—" : `${row.combined_percentage}%`}</td></tr>`,
      )
      .join("");
    printWindow.document.write(`<!doctype html><html><head><title>CAT results</title><style>
      body{font:12px Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:#444}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}
      @page{size:landscape;margin:12mm}@media print{body{margin:0}}
    </style></head><body><h1>${escapeHtml(selectedCourse.title)} · ${escapeHtml(selectedLevel.name)} CAT results</h1><p>Generated ${escapeHtml(new Date().toLocaleDateString())}</p><table><thead><tr><th>Unit</th><th>Student</th><th>Student number</th><th>KASNEB number</th><th>CAT 1</th><th>CAT 2</th><th>Combined marks</th><th>Percentage</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">CAT results and answer sheets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a course, level, unit, and CAT to review submitted answers. Reused copies appear
          with the other CATs for their course and unit; results refresh automatically.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={catsQuery.isFetching}
        loading={catsQuery.isFetching}
        onClick={() => void catsQuery.refetch()}
      >
        <RefreshCw />
        Refresh results
      </Button>

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
                  setReportUnitIds([]);
                  setAssessmentId("");
                  setCatSearch("");
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
                  setReportUnitIds([]);
                  setAssessmentId("");
                  setCatSearch("");
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
                  setCatSearch("");
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
              Search CAT name
              <Input
                type="search"
                placeholder="Search CAT 1, CAT 2, or title"
                value={catSearch}
                disabled={!unitId}
                onChange={(event) => {
                  setCatSearch(event.target.value);
                  setAssessmentId("");
                }}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              CAT
              <select
                className={selectClass}
                value={assessmentId}
                disabled={!unitId || unitsQuery.isLoading}
                onChange={(event) => setAssessmentId(event.target.value)}
              >
                <option value="">Select CAT</option>
                {matchingCats.map(({ cat, submittedAttempts: attempts, inProgressAttempts }) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {cat.title.toLocaleLowerCase() !== cat.name.toLocaleLowerCase()
                      ? ` · ${cat.title}`
                      : ""}
                    {" · "}
                    {attempts.length} submitted
                    {inProgressAttempts.length ? ` · ${inProgressAttempts.length} in progress` : ""}
                    {cat.targetStudents.length ? ` · targeted to ${cat.targetStudents.length}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {unitId && catSearch.trim() && !matchingCats.length && (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                No CAT matches “{catSearch}”. Search checks both the CAT name and title.
              </p>
            )}
          </div>

          {courseId && levelId && !unitsQuery.isLoading && (
            <section className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">CAT unit report</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select units to include submitted CAT 1 and CAT 2 results for each student.
                    Combined marks and percentage use the total available marks.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!reportRows.length}
                    onClick={downloadCatReport}
                  >
                    <FileSpreadsheet />
                    Download Excel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!reportRows.length}
                    onClick={printCatReport}
                  >
                    <Printer />
                    Print / Save PDF
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(unitsQuery.data ?? []).map((unit) => (
                  <label key={unit.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={reportUnitIds.includes(unit.id)}
                      onChange={(event) =>
                        setReportUnitIds((current) =>
                          event.target.checked
                            ? [...current, unit.id]
                            : current.filter((id) => id !== unit.id),
                        )
                      }
                    />
                    {unit.code ? `${unit.code} · ` : ""}
                    {unit.title}
                  </label>
                ))}
              </div>
              {reportUnitIds.length > 0 && !reportRows.length && (
                <p className="text-sm text-muted-foreground">
                  No submitted CAT 1 or CAT 2 results were found for the selected units.
                </p>
              )}
              {reportRows.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[840px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="border-b px-3 py-2">Unit</th>
                        <th className="border-b px-3 py-2">Student</th>
                        <th className="border-b px-3 py-2">Student number</th>
                        <th className="border-b px-3 py-2">KASNEB number</th>
                        <th className="border-b px-3 py-2">CAT 1</th>
                        <th className="border-b px-3 py-2">CAT 2</th>
                        <th className="border-b px-3 py-2">Combined marks</th>
                        <th className="border-b px-3 py-2">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((row) => (
                        <tr
                          key={`${row.unit}-${row.student_number}`}
                          className="border-b last:border-0"
                        >
                          <td className="px-3 py-2">{row.unit}</td>
                          <td className="px-3 py-2 font-medium">{row.student}</td>
                          <td className="px-3 py-2">{row.student_number}</td>
                          <td className="px-3 py-2">{row.kasneb_number || "—"}</td>
                          <td className="px-3 py-2">{row.cat_1_score || "—"}</td>
                          <td className="px-3 py-2">{row.cat_2_score || "—"}</td>
                          <td className="px-3 py-2">{row.combined_score}</td>
                          <td className="px-3 py-2">
                            {row.combined_percentage === null ? "—" : `${row.combined_percentage}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {unitId && !unitsQuery.isLoading && !unitCats.length && (
            <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              No CATs are listed for this unit yet.
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
                    {selectedResult.inProgressAttempts.length
                      ? ` · ${selectedResult.inProgressAttempts.length} in progress`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !canDownloadSheets ||
                    !submittedAttempts.length ||
                    downloadingAll ||
                    Boolean(downloadingAttemptId)
                  }
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
              {!submittedAttempts.length ? (
                <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                  No submitted results for this CAT yet.
                  {selectedResult.inProgressAttempts.length
                    ? ` ${selectedResult.inProgressAttempts.length} attempt${selectedResult.inProgressAttempts.length === 1 ? " is" : "s are"} still in progress.`
                    : ""}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
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
                            <div className="flex min-w-40 items-center gap-2">
                              <Badge variant="secondary">
                                {attempt.score ?? 0}/{attempt.maxScore ?? 0}
                              </Badge>
                              <Input
                                aria-label={`Edit mark for ${attempt.studentName}`}
                                type="number"
                                min="0"
                                max={maximumMark}
                                step="1"
                                className="h-9 w-20"
                                value={
                                  markDrafts[attempt.studentNumber] ?? String(attempt.score ?? "")
                                }
                                onChange={(event) =>
                                  setMarkDrafts((current) => ({
                                    ...current,
                                    [attempt.studentNumber]: event.target.value,
                                  }))
                                }
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={saveMarkMutation.isPending}
                                loading={saveMarkMutation.isPending}
                                onClick={() =>
                                  saveMarkMutation.mutate({
                                    studentNumber: attempt.studentNumber,
                                    score:
                                      markDrafts[attempt.studentNumber] ??
                                      String(attempt.score ?? ""),
                                  })
                                }
                              >
                                Save
                              </Button>
                            </div>
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
                                !canDownloadSheets ||
                                downloadingAll ||
                                Boolean(downloadingAttemptId)
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
              )}
              <form
                className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[minmax(220px,1fr)_140px_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (manualStudentNumber) {
                    saveMarkMutation.mutate({
                      studentNumber: manualStudentNumber,
                      score: manualMark,
                    });
                  }
                }}
              >
                <label className="grid gap-1 text-sm font-medium">
                  Add result for student without a submitted CAT
                  <Select value={manualStudentNumber} onValueChange={setManualStudentNumber}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          markStudentsQuery.isLoading ? "Loading students…" : "Select student"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {manualMarkCandidates.map((student) => (
                        <SelectItem key={student.studentNumber} value={student.studentNumber}>
                          {student.studentName} · {student.studentNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Mark out of {maximumMark}
                  <Input
                    type="number"
                    min="0"
                    max={maximumMark}
                    step="1"
                    value={manualMark}
                    onChange={(event) => setManualMark(event.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={!manualStudentNumber || !manualMark || saveMarkMutation.isPending}
                  loading={saveMarkMutation.isPending}
                >
                  Add mark
                </Button>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Manual marks are recorded as submitted results without an online answer sheet.
                  Students with an in-progress attempt are excluded.
                </p>
                {markStudentsQuery.error && (
                  <p role="alert" className="text-sm text-destructive sm:col-span-3">
                    Could not load eligible students: {markStudentsQuery.error.message}
                  </p>
                )}
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
