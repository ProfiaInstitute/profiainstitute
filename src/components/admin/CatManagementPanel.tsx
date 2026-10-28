import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LevelTargetPicker } from "@/components/academics/LevelTargetPicker";
import { CatDownloadButton } from "@/components/academics/CatDownloadButton";
import { supabase } from "@/integrations/supabase/client";
import { safeUploadFileName } from "@/lib/file-uploads";
import { catDateTimeLabel, parseAdminCats, type AdminCat, type CatOptionKey } from "@/lib/cats";

type QuestionDraft = {
  id: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CatOptionKey;
  points: string;
};

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
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [downloadFile, setDownloadFile] = useState<File | null>(null);
  const downloadFileInputRef = useRef<HTMLInputElement>(null);
  const [instructions, setInstructions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
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
  const createMutation = useMutation({
    mutationFn: async () => {
      const openingTime = new Date(opensAt);
      const closingTime = new Date(closesAt);
      const duration = Number(durationMinutes);
      if (
        !Number.isFinite(openingTime.getTime()) ||
        !Number.isFinite(closingTime.getTime()) ||
        openingTime.getTime() <= Date.now() ||
        closingTime.getTime() <= openingTime.getTime()
      ) {
        throw new Error("Choose a future opening time and a closing time after it.");
      }
      if (!Number.isInteger(duration) || duration < 1 || duration > 360) {
        throw new Error("CAT duration must be from 1 to 360 minutes.");
      }
      if (!name.trim() || !levelIds.length) {
        throw new Error("Enter a CAT download name and select at least one course level.");
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
        const { error } = await supabase.rpc("create_cat_assessment", {
          _course_id: courseId,
          _title: title.trim(),
          _name: name.trim(),
          _level_ids: levelIds,
          _instructions: instructions.trim() || null,
          _duration_minutes: duration,
          _opens_at: openingTime.toISOString(),
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
      setLevelIds([]);
      setDownloadFile(null);
      if (downloadFileInputRef.current) downloadFileInputRef.current.value = "";
      setInstructions("");
      setDurationMinutes("30");
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

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">CATs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a course CAT with multiple-choice questions, an access window, and a timed,
          one-time attempt. Times use your local time zone.
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
                setLevelIds([]);
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
              onChange={setLevelIds}
            />
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
            <label className="space-y-1 text-sm font-medium">
              Opens (local date and time)
              <Input
                required
                type="datetime-local"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Closes (local date and time)
              <Input
                required
                type="datetime-local"
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
                      className={selectClass}
                      value={question.correctOption}
                      onChange={(event) =>
                        updateQuestion(question.id, "correctOption", event.target.value)
                      }
                    >
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
        <div className="space-y-3">
          {query.data.cats.map((cat) => (
            <CatResultCard key={cat.id} cat={cat} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          No CATs have been created yet.
        </p>
      )}
    </section>
  );
}

function CatResultCard({ cat }: { cat: AdminCat }) {
  const now = Date.now();
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
        </div>
        <Badge variant={state === "Open" ? "default" : "secondary"}>{state}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{cat.durationMinutes} minute time limit</span>
        <span>{cat.questions.length} questions</span>
        <span>Opens {catDateTimeLabel(cat.opensAt)}</span>
        <span>Closes {catDateTimeLabel(cat.closesAt)}</span>
      </div>
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
