import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LevelTargetPicker } from "@/components/academics/LevelTargetPicker";
import { CatDownloadButton } from "@/components/academics/CatDownloadButton";
import { CatQuestionImporter } from "@/components/academics/CatQuestionImporter";
import { CatQuestionPreview } from "@/components/academics/CatQuestionPreview";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAnswerSheetQuestionList,
  downloadMarkedAnswerSheet,
  fetchAnswerSheetUnit,
} from "@/lib/answer-sheet";
import { createExcelWorkbook } from "@/lib/excel-export";
import { safeUploadFileName } from "@/lib/file-uploads";
import {
  catDateTimeLabel,
  getDateTimeLocalMinimum,
  parseAdminCats,
  type AdminCat,
  type CatOptionKey,
} from "@/lib/cats";
import type { ImportedCatAnswer, ImportedCatQuestion } from "@/lib/cat-import-format";

type QuestionDraft = {
  id: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CatOptionKey | "";
  points: string;
};

type EditableCatQuestion = Omit<QuestionDraft, "id"> & { id: string };

type CatEditValues = {
  title: string;
  name: string;
  instructions: string;
  durationMinutes: number;
  opensAt: string;
  closesAt: string;
  downloadFile: File | null;
  removeDownload: boolean;
  questions: EditableCatQuestion[] | null;
};

type CatAudience = "course_level" | "individual_students";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function newQuestion(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctOption: "A",
    points: "1",
  };
}

export function CatManagementPanel() {
  const queryClient = useQueryClient();
  const [catSearch, setCatSearch] = useState("");
  const [catStatusFilter, setCatStatusFilter] = useState<"all" | "scheduled" | "open" | "closed">(
    "all",
  );
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [catAudience, setCatAudience] = useState<CatAudience>("course_level");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [downloadFile, setDownloadFile] = useState<File | null>(null);
  const downloadFileInputRef = useRef<HTMLInputElement>(null);
  const [instructions, setInstructions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [openImmediately, setOpenImmediately] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const query = useQuery({
    queryKey: ["admin", "cat-assessments"],
    queryFn: async () => {
      const [catsResult, coursesResult] = await Promise.all([
        supabase.rpc("list_cat_assessments"),
        supabase.from("courses").select("id,title").order("title"),
      ]);
      if (catsResult.error) throw catsResult.error;
      if (coursesResult.error) throw coursesResult.error;
      return {
        cats: parseAdminCats(catsResult.data),
        courses: coursesResult.data,
      };
    },
  });
  const courseUnitsQuery = useQuery({
    queryKey: ["admin", "cat-unit-options", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,level_id,level:course_levels(name)")
        .eq("course_id", courseId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const targetStudentsQuery = useQuery({
    queryKey: ["admin", "cat-target-students", courseId, levelIds],
    enabled: Boolean(courseId && levelIds.length),
    queryFn: async () => {
      const [legacyStudents, enrollments, onlineEnrollments] = await Promise.all([
        supabase
          .from("students")
          .select("id,level_id")
          .eq("course_id", courseId)
          .eq("status", "active"),
        supabase
          .from("enrollments")
          .select("student_id,level_id")
          .eq("course_id", courseId)
          .eq("status", "active"),
        supabase
          .from("online_course_enrollments")
          .select("student_id,level_id")
          .eq("course_id", courseId)
          .eq("status", "active"),
      ]);
      if (legacyStudents.error) throw legacyStudents.error;
      if (enrollments.error) throw enrollments.error;
      if (onlineEnrollments.error) throw onlineEnrollments.error;

      const assignedLevelStudentIds = new Set(
        [...enrollments.data, ...onlineEnrollments.data]
          .filter((enrollment) => enrollment.level_id)
          .map((enrollment) => enrollment.student_id),
      );
      const studentIds = [
        ...new Set([
          ...enrollments.data
            .filter((enrollment) => enrollment.level_id && levelIds.includes(enrollment.level_id))
            .map((enrollment) => enrollment.student_id),
          ...onlineEnrollments.data
            .filter((enrollment) => enrollment.level_id && levelIds.includes(enrollment.level_id))
            .map((enrollment) => enrollment.student_id),
          ...legacyStudents.data
            .filter(
              (student) =>
                student.level_id &&
                levelIds.includes(student.level_id) &&
                !assignedLevelStudentIds.has(student.id),
            )
            .map((student) => student.id),
        ]),
      ];
      if (!studentIds.length) return [];

      const { data, error } = await supabase
        .from("students")
        .select("id,student_number,first_name,middle_name,last_name")
        .in("id", studentIds)
        .eq("status", "active")
        .order("last_name")
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });
  const targetStudents = targetStudentsQuery.data ?? [];
  const linkedUnitsQuery = useQuery({
    queryKey: ["admin", "cat-linked-unit-options", query.data?.cats.map((cat) => cat.courseId)],
    enabled: Boolean(query.data?.cats.length),
    queryFn: async () => {
      const courseIds = [...new Set((query.data?.cats ?? []).map((cat) => cat.courseId))];
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,course_id,level_id,level:course_levels(name)")
        .in("course_id", courseIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const filteredCats = (query.data?.cats ?? [])
    .filter((cat) => {
      const now = Date.now();
      const state =
        now < Date.parse(cat.opensAt)
          ? "scheduled"
          : now < Date.parse(cat.closesAt)
            ? "open"
            : "closed";
      if (catStatusFilter !== "all" && state !== catStatusFilter) return false;
      const unit = (linkedUnitsQuery.data ?? []).find((item) => item.id === cat.unitId);
      const searchText = [
        cat.title,
        cat.name,
        cat.courseTitle,
        unit?.title,
        unit?.code,
        ...cat.targetStudents.flatMap((student) => [student.studentName, student.studentNumber]),
        ...cat.attempts.flatMap((attempt) => [attempt.studentName, attempt.studentNumber]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchText.includes(catSearch.trim().toLocaleLowerCase());
    })
    .sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt));

  async function updateCat(cat: AdminCat, values: CatEditValues) {
    if (values.downloadFile && values.downloadFile.size > 50 * 1024 * 1024) {
      throw new Error("CAT download files must be 50 MB or smaller.");
    }

    let uploadedPath: string | null = null;
    if (values.downloadFile) {
      uploadedPath = `${cat.courseId}/cat-downloads/${crypto.randomUUID()}-${safeUploadFileName(values.downloadFile.name)}`;
      const { error } = await supabase.storage
        .from("learning")
        .upload(uploadedPath, values.downloadFile, {
          contentType: values.downloadFile.type || "application/octet-stream",
          upsert: false,
        });
      if (error) throw error;
    }

    const downloadFilePath = values.removeDownload ? null : (uploadedPath ?? cat.downloadFilePath);
    const downloadFileName = values.removeDownload
      ? null
      : (values.downloadFile?.name ?? cat.downloadFileName);

    try {
      const { error } = await supabase.rpc("update_cat_assessment", {
        _assessment_id: cat.id,
        _title: values.title.trim(),
        _name: values.name.trim(),
        _instructions: values.instructions.trim() || null,
        _duration_minutes: values.durationMinutes,
        _opens_at: values.opensAt,
        _closes_at: values.closesAt,
        _download_file_path: downloadFilePath,
        _download_file_name: downloadFileName,
        _questions:
          values.questions === null
            ? null
            : values.questions.map((question) => ({
                prompt: question.prompt.trim(),
                option_a: question.optionA.trim(),
                option_b: question.optionB.trim(),
                option_c: question.optionC.trim(),
                option_d: question.optionD.trim(),
                correct_option: question.correctOption,
                points: Number(question.points),
              })),
      });
      if (error) throw error;
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("learning")
          .remove([uploadedPath]);
        if (cleanupError) {
          const message = error instanceof Error ? error.message : "The CAT could not be updated.";
          throw new Error(
            `${message} The new CAT download could not be cleaned up: ${cleanupError.message}`,
          );
        }
      }
      throw error;
    }

    if (cat.downloadFilePath && cat.downloadFilePath !== downloadFilePath) {
      const { error } = await supabase.storage.from("learning").remove([cat.downloadFilePath]);
      if (error) {
        toast.error("CAT updated, but the previous download could not be removed.", {
          description: error.message,
        });
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["admin", "cat-assessments"] });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const openingTime = openImmediately ? now : new Date(opensAt);
      const closingTime = new Date(closesAt);
      const duration = Number(durationMinutes);
      if (
        !Number.isFinite(openingTime.getTime()) ||
        !Number.isFinite(closingTime.getTime()) ||
        (!openImmediately && openingTime.getTime() <= now.getTime()) ||
        closingTime.getTime() <= openingTime.getTime()
      ) {
        throw new Error(
          openImmediately
            ? `The closing time must be later than now (${now.toLocaleString()}). Check your device clock and time zone, or choose a later time.`
            : "Choose an opening time in the future and a closing time at least one minute after it. Times use your device's local time zone.",
        );
      }
      if (!Number.isInteger(duration) || duration < 1 || duration > 360) {
        throw new Error("CAT duration must be from 1 to 360 minutes.");
      }
      if (!name.trim() || !levelIds.length) {
        throw new Error("Enter a CAT download name and select at least one course level.");
      }
      if (catAudience === "individual_students" && !selectedStudentIds.length) {
        throw new Error("Select at least one student for this CAT.");
      }
      if (!unitId) throw new Error("Select the course unit this CAT assesses.");
      const selectedUnit = courseUnitsQuery.data?.find((unit) => unit.id === unitId);
      if (!selectedUnit?.code?.trim()) {
        throw new Error("Select a unit with a configured unit code.");
      }
      if (downloadFile && downloadFile.size > 50 * 1024 * 1024) {
        throw new Error("CAT download files must be 50 MB or smaller.");
      }

      let downloadFilePath: string | null = null;
      if (downloadFile) {
        downloadFilePath = `${courseId}/cat-downloads/${crypto.randomUUID()}-${safeUploadFileName(downloadFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("learning")
          .upload(downloadFilePath, downloadFile, {
            contentType: downloadFile.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }

      try {
        const { error } = await supabase.rpc("create_targeted_cat_assessment", {
          _course_id: courseId,
          _title: title.trim(),
          _name: name.trim(),
          _level_ids: levelIds,
          _instructions: instructions.trim() || null,
          _duration_minutes: duration,
          _opens_at: openImmediately ? null : openingTime.toISOString(),
          _closes_at: closingTime.toISOString(),
          _questions: questions.map((question) => ({
            prompt: question.prompt.trim(),
            option_a: question.optionA.trim(),
            option_b: question.optionB.trim(),
            option_c: question.optionC.trim(),
            option_d: question.optionD.trim(),
            correct_option: question.correctOption,
            points: Number(question.points),
          })),
          _download_file_path: downloadFilePath,
          _download_file_name: downloadFile?.name ?? null,
          _unit_id: unitId,
          _student_ids: catAudience === "individual_students" ? selectedStudentIds : [],
        });
        if (error) throw error;
      } catch (error) {
        if (downloadFilePath) {
          const { error: cleanupError } = await supabase.storage
            .from("learning")
            .remove([downloadFilePath]);
          if (cleanupError) {
            const message = error instanceof Error ? error.message : "The CAT could not be saved.";
            throw new Error(
              `${message} The uploaded CAT file could not be cleaned up: ${cleanupError.message}`,
            );
          }
        }
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success("CAT created and published");
      setTitle("");
      setName("");
      setCourseId("");
      setUnitId("");
      setLevelIds([]);
      setCatAudience("course_level");
      setSelectedStudentIds([]);
      setStudentSearch("");
      setDownloadFile(null);
      if (downloadFileInputRef.current) downloadFileInputRef.current.value = "";
      setInstructions("");
      setDurationMinutes("30");
      setOpenImmediately(true);
      setOpensAt("");
      setClosesAt("");
      setQuestions([newQuestion()]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "cat-assessments"] });
    },
    onError: (error: Error) => toast.error("Could not create CAT", { description: error.message }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  function updateQuestion(id: string, field: keyof QuestionDraft, value: string) {
    setQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, [field]: value } : question)),
    );
  }

  function importQuestions(imported: ImportedCatQuestion[]) {
    const starterIsBlank =
      questions.length === 1 &&
      !questions[0]?.prompt.trim() &&
      !questions[0]?.optionA.trim() &&
      !questions[0]?.optionB.trim() &&
      !questions[0]?.optionC.trim() &&
      !questions[0]?.optionD.trim();
    const nextCount = imported.length + (starterIsBlank ? 0 : questions.length);
    if (nextCount > 100) throw new Error("A CAT can contain no more than 100 questions.");
    const importedDrafts: QuestionDraft[] = imported.map((question) => ({
      id: crypto.randomUUID(),
      prompt: question.prompt,
      optionA: question.options.A,
      optionB: question.options.B,
      optionC: question.options.C,
      optionD: question.options.D,
      correctOption: question.correctOption ?? "",
      points: "1",
    }));
    const questionOffset = starterIsBlank ? 0 : questions.length;
    setQuestions((current) => (starterIsBlank ? importedDrafts : [...current, ...importedDrafts]));
    toast.success(`${imported.length} question${imported.length === 1 ? "" : "s"} imported`);
    return questionOffset;
  }

  function applyMarkingScheme(answers: ImportedCatAnswer[], questionOffset: number) {
    const answersByIndex = new Map(
      answers.map((answer) => [questionOffset + answer.questionNumber - 1, answer.correctOption]),
    );
    setQuestions((current) =>
      current.map((question, index) => {
        const correctOption = answersByIndex.get(index);
        return correctOption ? { ...question, correctOption } : question;
      }),
    );
    toast.success(
      `${answers.length} marking-scheme answer${answers.length === 1 ? "" : "s"} applied`,
    );
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">CATs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a course CAT with multiple-choice questions, immediate or scheduled access, and a
          timed, one-time attempt. Times use your device's local time zone; select a closing time at
          least one minute after now or the scheduled opening.
        </p>
      </div>
      <details className="rounded-lg border bg-muted/30 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand">Create a CAT</summary>
        <form className="mt-4 space-y-5" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              required
              maxLength={160}
              placeholder="CAT title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              required
              maxLength={160}
              placeholder="CAT download name (e.g. CAT 1 Financial Accounting)"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <select
              required
              className={selectClass}
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setUnitId("");
                setLevelIds([]);
                setSelectedStudentIds([]);
                setCatAudience("course_level");
              }}
            >
              <option value="">Select course</option>
              {query.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <LevelTargetPicker
              courseId={courseId}
              selectedLevelIds={levelIds}
              onChange={(nextLevelIds) => {
                setLevelIds(nextLevelIds);
                setSelectedStudentIds([]);
              }}
            />
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Course unit
              <select
                required
                className={selectClass}
                value={unitId}
                disabled={!courseId || courseUnitsQuery.isLoading}
                onChange={(event) => {
                  const nextUnitId = event.target.value;
                  setUnitId(nextUnitId);
                  const selectedUnit = courseUnitsQuery.data?.find(
                    (unit) => unit.id === nextUnitId,
                  );
                  if (selectedUnit?.level_id) setLevelIds([selectedUnit.level_id]);
                  setSelectedStudentIds([]);
                }}
              >
                <option value="">
                  {courseUnitsQuery.isLoading ? "Loading units…" : "Select course unit"}
                </option>
                {(courseUnitsQuery.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id} disabled={!unit.code?.trim()}>
                    {unit.code?.trim() || "Missing unit code"} · {unit.title}
                    {unit.level?.name ? ` · ${unit.level.name}` : ""}
                  </option>
                ))}
              </select>
              {courseUnitsQuery.error && (
                <span role="alert" className="text-xs text-destructive">
                  Could not load course units: {courseUnitsQuery.error.message}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                The answer sheet uses this unit’s exact system name and unit code.
              </span>
            </label>
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="text-sm font-medium">Who can take this CAT?</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cat-audience"
                    value="course_level"
                    checked={catAudience === "course_level"}
                    onChange={() => setCatAudience("course_level")}
                  />
                  Everyone in selected course levels
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cat-audience"
                    value="individual_students"
                    checked={catAudience === "individual_students"}
                    onChange={() => setCatAudience("individual_students")}
                  />
                  Selected students only
                </label>
              </div>
              {catAudience === "individual_students" && (
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <Input
                    aria-label="Search eligible students"
                    placeholder="Search students by name or student number"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    disabled={!courseId || !levelIds.length}
                  />
                  {!courseId || !levelIds.length ? (
                    <p className="text-sm text-muted-foreground">
                      Select a course and at least one course level to view eligible students.
                    </p>
                  ) : targetStudentsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading eligible students…</p>
                  ) : targetStudentsQuery.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      Could not load eligible students: {targetStudentsQuery.error.message}
                    </p>
                  ) : targetStudents.length ? (
                    <>
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {targetStudents
                          .filter((student) =>
                            [
                              student.student_number,
                              student.first_name,
                              student.middle_name,
                              student.last_name,
                            ]
                              .filter(Boolean)
                              .join(" ")
                              .toLocaleLowerCase()
                              .includes(studentSearch.trim().toLocaleLowerCase()),
                          )
                          .map((student) => {
                            const studentName = [
                              student.first_name,
                              student.middle_name,
                              student.last_name,
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <label
                                key={student.id}
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.includes(student.id)}
                                  onChange={(event) =>
                                    setSelectedStudentIds((current) =>
                                      event.target.checked
                                        ? [...new Set([...current, student.id])]
                                        : current.filter((id) => id !== student.id),
                                    )
                                  }
                                />
                                <span>
                                  {studentName} · {student.student_number}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {selectedStudentIds.length} selected of {targetStudents.length} eligible
                        students. Only selected students will see this CAT.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No active students are enrolled in the selected course levels.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Optional downloadable CAT file
              <input
                ref={downloadFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.odt,.rtf"
                className="w-full min-w-0 max-w-full text-xs"
                onChange={(event) => setDownloadFile(event.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-muted-foreground">
                Maximum file size: 50 MB. The timed online CAT remains available separately.
              </span>
            </label>
            <Input
              required
              type="number"
              min={1}
              max={360}
              step={1}
              aria-label="Time limit in minutes"
              placeholder="Time limit (minutes)"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
              <input
                type="checkbox"
                checked={openImmediately}
                onChange={(event) => setOpenImmediately(event.target.checked)}
                className="accent-primary"
              />
              Open immediately when published
            </label>
            {!openImmediately && (
              <label className="space-y-1 text-sm font-medium">
                Opens (local date and time)
                <Input
                  required
                  type="datetime-local"
                  min={getDateTimeLocalMinimum()}
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                />
              </label>
            )}
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Closes (local date and time)
              <Input
                required
                type="datetime-local"
                min={getDateTimeLocalMinimum(openImmediately ? undefined : opensAt)}
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
              />
            </label>
            <Textarea
              className="sm:col-span-2"
              rows={2}
              placeholder="Instructions for students (optional)"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-brand">Questions</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={questions.length >= 100}
                onClick={() => setQuestions((current) => [...current, newQuestion()])}
              >
                <Plus /> Add question
              </Button>
            </div>
            <CatQuestionImporter
              onImport={importQuestions}
              onApplyMarkingScheme={applyMarkingScheme}
            />
            <CatQuestionPreview
              questions={questions.map((question) => ({
                prompt: question.prompt,
                options: {
                  A: question.optionA,
                  B: question.optionB,
                  C: question.optionC,
                  D: question.optionD,
                },
              }))}
            />
            {questions.map((question, index) => (
              <article key={question.id} className="space-y-3 rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">Question {index + 1}</h4>
                  {questions.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) => current.filter((item) => item.id !== question.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <Textarea
                  required
                  maxLength={4000}
                  rows={2}
                  placeholder="Question"
                  value={question.prompt}
                  onChange={(event) => updateQuestion(question.id, "prompt", event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["A", "B", "C", "D"] as const).map((key) => {
                    const field: Record<CatOptionKey, keyof QuestionDraft> = {
                      A: "optionA",
                      B: "optionB",
                      C: "optionC",
                      D: "optionD",
                    };
                    return (
                      <Input
                        key={key}
                        required
                        maxLength={1000}
                        aria-label={`Question ${index + 1}, choice ${key}`}
                        placeholder={`Choice ${key}`}
                        value={question[field[key]]}
                        onChange={(event) =>
                          updateQuestion(question.id, field[key], event.target.value)
                        }
                      />
                    );
                  })}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium">
                    Correct answer
                    <select
                      required
                      className={selectClass}
                      value={question.correctOption}
                      onChange={(event) =>
                        updateQuestion(question.id, "correctOption", event.target.value)
                      }
                    >
                      <option value="" disabled>
                        Select correct answer
                      </option>
                      {(["A", "B", "C", "D"] as const).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Marks
                    <Input
                      required
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={question.points}
                      onChange={(event) =>
                        updateQuestion(question.id, "points", event.target.value)
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
          {query.error && (
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
          )}
          <Button
            disabled={createMutation.isPending || query.isLoading || !query.data?.courses.length}
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Publishing CAT…" : "Create and publish CAT"}
          </Button>
          {createMutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {createMutation.error.message}
            </p>
          )}
        </form>
      </details>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading CATs…</p>
      ) : query.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          Could not load CATs: {query.error.message}
          <Button className="ml-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.data?.cats.length ? (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search CATs"
                placeholder="Search title, course, unit, or student"
                className="pl-9"
                value={catSearch}
                onChange={(event) => setCatSearch(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              CAT status
              <select
                aria-label="Filter CATs by status"
                className={selectClass}
                value={catStatusFilter}
                onChange={(event) =>
                  setCatStatusFilter(event.target.value as "all" | "scheduled" | "open" | "closed")
                }
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="scheduled">Scheduled</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2" aria-live="polite">
              Showing {filteredCats.length} of {query.data.cats.length} CAT
              {query.data.cats.length === 1 ? "" : "s"} · sorted by opening date, newest first
            </p>
          </div>
          {filteredCats.length ? (
            <div className="space-y-3">
              {filteredCats.map((cat) => (
                <CatResultCard
                  key={cat.id}
                  cat={cat}
                  units={(linkedUnitsQuery.data ?? []).filter(
                    (unit) => unit.course_id === cat.courseId,
                  )}
                  onSaveChanges={(values) => updateCat(cat, values)}
                  onUnitChanged={async (assessmentId, nextUnitId) => {
                    const { error } = await supabase.rpc("set_cat_assessment_unit", {
                      _assessment_id: assessmentId,
                      _unit_id: nextUnitId,
                    });
                    if (error) {
                      toast.error("Could not link CAT to course unit", {
                        description: error.message,
                      });
                      return;
                    }
                    toast.success("CAT linked to course unit");
                    await queryClient.invalidateQueries({ queryKey: ["admin", "cat-assessments"] });
                  }}
                  onReused={async () => {
                    await queryClient.invalidateQueries({ queryKey: ["admin", "cat-assessments"] });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              No CATs match this search and status filter.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          No CATs have been created yet.
        </p>
      )}
    </section>
  );
}

function dateTimeLocalValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CatEditForm({
  cat,
  onSaveChanges,
}: {
  cat: AdminCat;
  onSaveChanges: (values: CatEditValues) => Promise<void>;
}) {
  const hasAttempts = cat.attempts.length > 0;
  const [title, setTitle] = useState(cat.title);
  const [name, setName] = useState(cat.name);
  const [instructions, setInstructions] = useState(cat.instructions ?? "");
  const [durationMinutes, setDurationMinutes] = useState(String(cat.durationMinutes));
  const [opensAt, setOpensAt] = useState(() => dateTimeLocalValue(cat.opensAt));
  const [closesAt, setClosesAt] = useState(() => dateTimeLocalValue(cat.closesAt));
  const [downloadFile, setDownloadFile] = useState<File | null>(null);
  const [removeDownload, setRemoveDownload] = useState(false);
  const [questions, setQuestions] = useState<EditableCatQuestion[]>(() =>
    cat.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      optionA: question.options.A,
      optionB: question.options.B,
      optionC: question.options.C,
      optionD: question.options.D,
      correctOption: question.correctOption,
      points: String(question.points),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 360) {
      setError("CAT duration must be from 1 to 360 minutes.");
      return;
    }
    if (questions.length < 1 || questions.length > 100) {
      setError("A CAT must contain between 1 and 100 questions.");
      return;
    }
    if (
      !hasAttempts &&
      (!Number.isFinite(new Date(opensAt).getTime()) ||
        !Number.isFinite(new Date(closesAt).getTime()) ||
        new Date(closesAt) <= new Date(opensAt))
    ) {
      setError("Choose a closing time later than the opening time.");
      return;
    }
    if (
      !hasAttempts &&
      questions.some(
        (question) =>
          !question.prompt.trim() ||
          !question.optionA.trim() ||
          !question.optionB.trim() ||
          !question.optionC.trim() ||
          !question.optionD.trim() ||
          !question.correctOption ||
          !Number.isInteger(Number(question.points)) ||
          Number(question.points) < 1 ||
          Number(question.points) > 100,
      )
    ) {
      setError("Complete each question, all four choices, a correct answer, and valid marks.");
      return;
    }

    setSaving(true);
    try {
      await onSaveChanges({
        title,
        name,
        instructions,
        durationMinutes: duration,
        opensAt: hasAttempts ? cat.opensAt : new Date(opensAt).toISOString(),
        closesAt: hasAttempts ? cat.closesAt : new Date(closesAt).toISOString(),
        downloadFile,
        removeDownload: removeDownload && !downloadFile,
        questions: hasAttempts ? null : questions,
      });
      toast.success("CAT updated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CAT could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-lg border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        Edit published CAT
      </summary>
      <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
        {hasAttempts && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Students have started this CAT. Questions, answer keys, schedule, and time limit are
            locked to protect existing attempts and scores. You can still update its title, download
            name, instructions, or downloadable file.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            CAT title
            <Input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Student download name
            <Input
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Time limit (minutes)
            <Input
              required
              type="number"
              min={1}
              max={360}
              step={1}
              disabled={hasAttempts}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Instructions
            <Textarea
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Opens at
            <Input
              required
              type="datetime-local"
              disabled={hasAttempts}
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Closes at
            <Input
              required
              type="datetime-local"
              disabled={hasAttempts}
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </label>
          {!hasAttempts && (
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Questions and answer key</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={questions.length >= 100}
                  onClick={() =>
                    setQuestions((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        prompt: "",
                        optionA: "",
                        optionB: "",
                        optionC: "",
                        optionD: "",
                        correctOption: "",
                        points: "1",
                      },
                    ])
                  }
                >
                  <Plus /> Add question
                </Button>
              </div>
              {questions.map((question, index) => (
                <fieldset
                  key={question.id}
                  className="grid gap-2 rounded-md border bg-background p-3"
                >
                  <legend className="px-1 text-sm font-semibold">Question {index + 1}</legend>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={questions.length <= 1}
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) => current.filter((item) => item.id !== question.id))
                      }
                    >
                      <Trash2 /> Remove
                    </Button>
                  </div>
                  <Textarea
                    required
                    maxLength={4000}
                    rows={2}
                    aria-label={`Question ${index + 1} prompt`}
                    value={question.prompt}
                    onChange={(event) =>
                      setQuestions((current) =>
                        current.map((item) =>
                          item.id === question.id ? { ...item, prompt: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((option) => {
                      const field: Record<CatOptionKey, keyof EditableCatQuestion> = {
                        A: "optionA",
                        B: "optionB",
                        C: "optionC",
                        D: "optionD",
                      };
                      return (
                        <Input
                          key={option}
                          required
                          maxLength={1000}
                          aria-label={`Question ${index + 1}, choice ${option}`}
                          placeholder={`Choice ${option}`}
                          value={question[field[option]]}
                          onChange={(event) =>
                            setQuestions((current) =>
                              current.map((item) =>
                                item.id === question.id
                                  ? { ...item, [field[option]]: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      );
                    })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Correct answer
                      <select
                        required
                        className={selectClass}
                        value={question.correctOption}
                        onChange={(event) =>
                          setQuestions((current) =>
                            current.map((item) =>
                              item.id === question.id
                                ? { ...item, correctOption: event.target.value as CatOptionKey }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="" disabled>
                          Select correct answer
                        </option>
                        {(["A", "B", "C", "D"] as const).map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Marks
                      <Input
                        required
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={question.points}
                        onChange={(event) =>
                          setQuestions((current) =>
                            current.map((item) =>
                              item.id === question.id
                                ? { ...item, points: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <label className="grid gap-1 text-sm font-medium">
              Replace downloadable CAT file
              <input
                type="file"
                accept=".pdf,.doc,.docx,.odt,.rtf"
                className="w-full min-w-0 text-xs"
                onChange={(event) => {
                  setDownloadFile(event.target.files?.[0] ?? null);
                  if (event.target.files?.[0]) setRemoveDownload(false);
                }}
              />
            </label>
            {cat.downloadFileName && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={removeDownload}
                  disabled={Boolean(downloadFile)}
                  onChange={(event) => setRemoveDownload(event.target.checked)}
                />
                Remove current file: {cat.downloadFileName}
              </label>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving} loading={saving}>
          {saving ? "Saving CAT…" : "Save CAT changes"}
        </Button>
      </form>
    </details>
  );
}

function CatResultCard({
  cat,
  units,
  onSaveChanges,
  onUnitChanged,
  onReused,
}: {
  cat: AdminCat;
  units: {
    id: string;
    title: string;
    code: string | null;
    course_id: string;
    level_id: string | null;
    level: { name: string } | null;
  }[];
  onSaveChanges: (values: CatEditValues) => Promise<void>;
  onUnitChanged: (assessmentId: string, unitId: string) => Promise<void>;
  onReused: () => Promise<void>;
}) {
  const now = Date.now();
  const submittedAttempts = cat.attempts.filter((attempt) => attempt.submittedAt);
  const [unitId, setUnitId] = useState(cat.unitId ?? "");
  const [savingUnit, setSavingUnit] = useState(false);
  const state =
    now < Date.parse(cat.opensAt)
      ? "Scheduled"
      : now < Date.parse(cat.closesAt)
        ? "Open"
        : "Closed";

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand">{cat.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{cat.courseTitle}</p>
          <p className="mt-1 text-sm">Student download name: {cat.name}</p>
          {cat.targetStudents.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Assigned to {cat.targetStudents.length} selected student
              {cat.targetStudents.length === 1 ? "" : "s"}:{" "}
              {cat.targetStudents
                .map((student) => `${student.studentName} (${student.studentNumber})`)
                .join(", ")}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-medium">
              Answer-sheet unit
              <select
                className={`${selectClass} min-w-64`}
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
                <option value="">Select unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id} disabled={!unit.code?.trim()}>
                    {unit.code?.trim() || "Missing code"} · {unit.title}
                    {unit.level?.name ? ` · ${unit.level.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!unitId || unitId === cat.unitId || savingUnit}
              onClick={async () => {
                setSavingUnit(true);
                try {
                  await onUnitChanged(cat.id, unitId);
                } finally {
                  setSavingUnit(false);
                }
              }}
            >
              {savingUnit ? "Saving unit…" : cat.unitId ? "Update unit" : "Link unit"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={state === "Open" ? "default" : "secondary"}>{state}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!submittedAttempts.length}
            onClick={() => exportCatResults(cat)}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Export results{submittedAttempts.length ? ` (${submittedAttempts.length})` : ""}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{cat.durationMinutes} minute time limit</span>
        <span>{cat.questions.length} questions</span>
        <span>Opens {catDateTimeLabel(cat.opensAt)}</span>
        <span>Closes {catDateTimeLabel(cat.closesAt)}</span>
      </div>
      <CatEditForm
        key={`${cat.id}-${cat.title}-${cat.name}-${cat.opensAt}-${cat.closesAt}`}
        cat={cat}
        onSaveChanges={onSaveChanges}
      />
      {cat.unitId && (
        <ReuseCatAssignment
          cat={cat}
          unit={units.find((unit) => unit.id === cat.unitId) ?? null}
          onReused={onReused}
        />
      )}
      {cat.instructions && <p className="whitespace-pre-wrap text-sm">{cat.instructions}</p>}
      {cat.downloadFilePath && cat.downloadFileName && (
        <CatDownloadButton
          path={cat.downloadFilePath}
          filename={cat.downloadFileName}
          name={cat.name}
        />
      )}
      {cat.attempts.length ? (
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-semibold">Student attempts · {cat.attempts.length}</h4>
          {cat.attempts.map((attempt) => (
            <details key={attempt.id} className="rounded-md border bg-muted/20 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {attempt.studentName} · {attempt.studentNumber}
                </span>
                <span className="flex items-center gap-2">
                  {attempt.submittedAt ? (
                    <Badge>
                      Submitted · {attempt.score}/{attempt.maxScore}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">In progress · no mark yet</Badge>
                  )}
                </span>
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Started {catDateTimeLabel(attempt.startedAt)}
                {attempt.submittedAt && ` · Submitted ${catDateTimeLabel(attempt.submittedAt)}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                KASNEB number: {attempt.kasnebNumber ?? "Not entered"} · Level:{" "}
                {attempt.levelName ?? "Not recorded"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAttemptAnswerSheet(cat, attempt)}
                >
                  Download answer sheet
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {cat.questions.map((question, index) => {
                  const selected = attempt.answers.find(
                    (answer) => answer.questionId === question.id,
                  )?.selectedOption;
                  return (
                    <div key={question.id} className="rounded-md bg-background p-3 text-sm">
                      <p className="font-medium">
                        {index + 1}. {question.prompt}{" "}
                        <span className="text-muted-foreground">({question.points} marks)</span>
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Selected:{" "}
                        {selected ? `${selected}. ${question.options[selected]}` : "No answer"}
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
        <p className="border-t pt-3 text-sm text-muted-foreground">No student attempts yet.</p>
      )}
    </article>
  );
}

function ReuseCatAssignment({
  cat,
  unit,
  onReused,
}: {
  cat: AdminCat;
  unit: {
    id: string;
    title: string;
    code: string | null;
    course_id: string;
    level_id: string | null;
    level: { name: string } | null;
  } | null;
  onReused: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [openImmediately, setOpenImmediately] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState(() =>
    dateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
  );
  const effectiveLevelIds = unit?.level_id ? [unit.level_id] : cat.levelIds;
  const studentsQuery = useQuery({
    queryKey: ["admin", "cat-reuse-students", cat.courseId, effectiveLevelIds],
    enabled: Boolean(unit),
    queryFn: async () => {
      const [studentsResult, enrollmentsResult, onlineEnrollmentsResult] = await Promise.all([
        supabase
          .from("students")
          .select("id,student_number,first_name,middle_name,last_name,level_id")
          .eq("course_id", cat.courseId)
          .eq("status", "active"),
        supabase
          .from("enrollments")
          .select("student_id,level_id")
          .eq("course_id", cat.courseId)
          .eq("status", "active"),
        supabase
          .from("online_course_enrollments")
          .select("student_id,level_id")
          .eq("course_id", cat.courseId)
          .eq("status", "active"),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (onlineEnrollmentsResult.error) throw onlineEnrollmentsResult.error;

      const enrollments = [...enrollmentsResult.data, ...onlineEnrollmentsResult.data];
      const assignedStudentIds = new Set(
        enrollments.filter((entry) => entry.level_id).map((entry) => entry.student_id),
      );
      const studentIds = new Set(
        enrollments
          .filter(
            (entry) =>
              !effectiveLevelIds.length ||
              (entry.level_id !== null && effectiveLevelIds.includes(entry.level_id)),
          )
          .map((entry) => entry.student_id),
      );
      for (const student of studentsResult.data) {
        if (
          !assignedStudentIds.has(student.id) &&
          (!effectiveLevelIds.length ||
            (student.level_id !== null && effectiveLevelIds.includes(student.level_id)))
        ) {
          studentIds.add(student.id);
        }
      }

      return studentsResult.data
        .filter((student) => studentIds.has(student.id))
        .sort((left, right) => {
          const leftName = [left.last_name, left.first_name].filter(Boolean).join(" ");
          const rightName = [right.last_name, right.first_name].filter(Boolean).join(" ");
          return leftName.localeCompare(rightName);
        });
    },
  });
  const students = studentsQuery.data ?? [];
  const visibleStudents = students.filter((student) =>
    [student.student_number, student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(studentSearch.trim().toLocaleLowerCase()),
  );
  const reuseMutation = useMutation({
    mutationFn: async () => {
      if (!unit?.code?.trim()) {
        throw new Error("Add a unit code before reusing this CAT.");
      }
      if (!selectedStudentIds.length) throw new Error("Select at least one student.");
      if (selectedStudentIds.length > 500) {
        throw new Error("A CAT can be assigned to at most 500 students at once.");
      }
      const now = new Date();
      const openingTime = openImmediately ? now : new Date(opensAt);
      const closingTime = new Date(closesAt);
      if (
        !Number.isFinite(openingTime.getTime()) ||
        !Number.isFinite(closingTime.getTime()) ||
        (!openImmediately && openingTime.getTime() <= now.getTime()) ||
        closingTime.getTime() <= openingTime.getTime()
      ) {
        throw new Error(
          "Choose a future opening time and a closing time later than the opening time.",
        );
      }
      const { error } = await supabase.rpc("create_targeted_cat_assessment", {
        _course_id: cat.courseId,
        _title: cat.title,
        _name: cat.name,
        _level_ids: effectiveLevelIds,
        _instructions: cat.instructions,
        _duration_minutes: cat.durationMinutes,
        _opens_at: openImmediately ? null : openingTime.toISOString(),
        _closes_at: closingTime.toISOString(),
        _questions: cat.questions.map((question) => ({
          prompt: question.prompt,
          option_a: question.options.A,
          option_b: question.options.B,
          option_c: question.options.C,
          option_d: question.options.D,
          correct_option: question.correctOption,
          points: question.points,
        })),
        _download_file_path: cat.downloadFilePath,
        _download_file_name: cat.downloadFileName,
        _unit_id: unit.id,
        _student_ids: selectedStudentIds,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("CAT copy published for selected students");
      setSelectedStudentIds([]);
      setStudentSearch("");
      await Promise.all([
        onReused(),
        queryClient.invalidateQueries({ queryKey: ["admin", "cat-results"] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error("Could not publish CAT for selected students", { description: error.message }),
  });

  return (
    <details className="rounded-lg border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        Reuse CAT and answer scheme for other students
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Creates a separate copy with the same questions, answer key, unit, and downloadable paper.
          The original CAT and its results stay unchanged.
        </p>
        {!unit ? (
          <p role="alert" className="text-sm text-destructive">
            Link this CAT to a course unit before reusing it.
          </p>
        ) : !unit.code?.trim() ? (
          <p role="alert" className="text-sm text-destructive">
            Add a unit code before reusing this CAT.
          </p>
        ) : (
          <>
            <Input
              aria-label="Search students for reused CAT"
              placeholder="Search students by name or student number"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
            {studentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading eligible students…</p>
            ) : studentsQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load eligible students: {studentsQuery.error.message}
              </p>
            ) : visibleStudents.length ? (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
                {visibleStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(student.id)}
                      onChange={(event) =>
                        setSelectedStudentIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, student.id])]
                            : current.filter((id) => id !== student.id),
                        )
                      }
                    />
                    {[student.first_name, student.middle_name, student.last_name]
                      .filter(Boolean)
                      .join(" ")}{" "}
                    · {student.student_number}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {students.length
                  ? "No students match your search."
                  : "No active students are enrolled in this CAT’s course and level."}
              </p>
            )}
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {selectedStudentIds.length} selected · the original CAT will not be changed.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={openImmediately}
                onChange={(event) => setOpenImmediately(event.target.checked)}
              />
              Open immediately for selected students
            </label>
            {!openImmediately && (
              <label className="grid gap-1 text-sm font-medium">
                Opens (local date and time)
                <Input
                  type="datetime-local"
                  min={getDateTimeLocalMinimum()}
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                />
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Closes (local date and time)
              <Input
                required
                type="datetime-local"
                min={getDateTimeLocalMinimum(openImmediately ? undefined : opensAt)}
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
              />
            </label>
            <Button
              type="button"
              disabled={!selectedStudentIds.length || reuseMutation.isPending}
              loading={reuseMutation.isPending}
              onClick={() => reuseMutation.mutate()}
            >
              {reuseMutation.isPending
                ? "Publishing CAT copy…"
                : "Publish CAT copy to selected students"}
            </Button>
          </>
        )}
      </div>
    </details>
  );
}

async function downloadAttemptAnswerSheet(cat: AdminCat, attempt: AdminCat["attempts"][number]) {
  try {
    const unit = await fetchAnswerSheetUnit(cat.id);

    await downloadMarkedAnswerSheet(
      {
        courseName: cat.courseTitle,
        unitName: unit.name,
        unitCode: unit.code,
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
      },
      `${attempt.studentName.replace(/\s+/g, "-")}-${cat.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-answer-sheet.docx`,
    );
  } catch (error) {
    toast.error("Could not generate the CAT answer sheet", {
      description: error instanceof Error ? error.message : "The unit details could not be loaded.",
    });
  }
}

function exportCatResults(cat: AdminCat) {
  const attempts = cat.attempts.filter((attempt) => attempt.submittedAt);
  if (!attempts.length) {
    toast.error("There are no submitted CAT results to export.");
    return;
  }

  try {
    const workbook = createExcelWorkbook(
      attempts.map((attempt) => ({
        "KASNEB Number": attempt.kasnebNumber ?? "",
        "Student Name": attempt.studentName,
        Course: cat.courseTitle,
        Level: attempt.levelName ?? "",
        "CAT Marks": attempt.score,
      })),
    );
    const blob = new Blob([new Uint8Array(workbook)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${cat.name.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "")}-results.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error("Could not export CAT results", {
      description: error instanceof Error ? error.message : "The workbook could not be created.",
    });
  }
}
