import { useState, type ChangeEvent } from "react";
import { readCatMarkingSchemeFile, readCatQuestionsFile } from "@/lib/cat-question-file";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseCatQuestionsWithDiagnostics,
  type ImportedCatAnswer,
  type ImportedCatQuestion,
} from "@/lib/cat-import-format";

export function CatQuestionImporter({
  onImport,
  onApplyMarkingScheme,
}: {
  onImport: (questions: ImportedCatQuestion[]) => number;
  onApplyMarkingScheme: (answers: ImportedCatAnswer[], questionOffset: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [typedQuestions, setTypedQuestions] = useState("");
  const [incompleteMessage, setIncompleteMessage] = useState("");
  const [importedQuestionCount, setImportedQuestionCount] = useState(0);
  const [questionOffset, setQuestionOffset] = useState(0);
  const [markingSchemeMessage, setMarkingSchemeMessage] = useState("");

  function addParsedQuestions(
    questions: ImportedCatQuestion[],
    incompleteQuestionNumbers: number[] = [],
  ) {
    if (!questions.length) {
      throw new Error("No complete questions were found. Add a numbered question and A–D choices.");
    }
    const offset = onImport(questions);
    setQuestionOffset(offset);
    setImportedQuestionCount(questions.length);
    if (incompleteQuestionNumbers.length) {
      const sample = incompleteQuestionNumbers.slice(0, 5).join(", ");
      const more = incompleteQuestionNumbers.length > 5 ? ", …" : "";
      setIncompleteMessage(
        `${questions.length} question${questions.length === 1 ? "" : "s"} imported. ${incompleteQuestionNumbers.length} need${incompleteQuestionNumbers.length === 1 ? "s" : ""} review (question${incompleteQuestionNumbers.length === 1 ? "" : "s"} ${sample}${more}); incomplete questions were added with blank fields so you can correct them.`,
      );
    } else {
      setIncompleteMessage("");
    }
    return offset;
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setProgress("Reading CAT file…");
    setError("");
    setIncompleteMessage("");
    setMarkingSchemeMessage("");
    try {
      const result = await readCatQuestionsFile(file, setProgress);
      addParsedQuestions(result.questions, result.incompleteQuestionNumbers);
      const answerCount = result.questions.filter((question) => question.correctOption).length;
      if (answerCount) {
        setMarkingSchemeMessage(
          `${answerCount} answer${answerCount === 1 ? "" : "s"} detected and applied from the uploaded document.`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The question file could not be read.");
    } finally {
      setBusy(false);
      setProgress("");
      event.target.value = "";
    }
  }

  function importTypedQuestions() {
    setError("");
    setIncompleteMessage("");
    setMarkingSchemeMessage("");
    try {
      const result = parseCatQuestionsWithDiagnostics(typedQuestions);
      addParsedQuestions(result.questions, result.incompleteQuestionNumbers);
      const answerCount = result.questions.filter((question) => question.correctOption).length;
      if (answerCount) {
        setMarkingSchemeMessage(
          `${answerCount} correct answer${answerCount === 1 ? "" : "s"} detected.`,
        );
      }
      setTypedQuestions("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The typed questions could not be read.");
    }
  }

  async function importMarkingScheme(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setProgress("Reading marking scheme…");
    setError("");
    setIncompleteMessage("");
    setMarkingSchemeMessage("");
    try {
      if (!importedQuestionCount) {
        throw new Error("Import the CAT questions before importing the marking scheme.");
      }
      const answers = await readCatMarkingSchemeFile(file, setProgress);
      const outOfRange = answers.find((answer) => answer.questionNumber > importedQuestionCount);
      if (outOfRange) {
        throw new Error(
          `The marking scheme includes question ${outOfRange.questionNumber}, but only ${importedQuestionCount} questions were imported.`,
        );
      }
      onApplyMarkingScheme(answers, questionOffset);
      setMarkingSchemeMessage(
        `${answers.length} answer${answers.length === 1 ? "" : "s"} applied. Explanation text is ignored.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The marking scheme could not be read.");
    } finally {
      setBusy(false);
      setProgress("");
      event.target.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-sm font-semibold text-brand">
        Type questions below, or upload/scan a complete CAT paper
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        OCR reads scanned PDFs and image files in your browser. You can review and edit the imported
        questions before publishing.
      </p>
      <label className="mt-3 grid gap-2 text-sm font-medium">
        Type or paste questions and choices
        <Textarea
          rows={7}
          value={typedQuestions}
          onChange={(event) => setTypedQuestions(event.target.value)}
          placeholder={
            "1. Question prompt\nA) First choice\nB) Second choice\nC) Third choice\nD) Fourth choice\n\n2. Next question…"
          }
        />
        <span className="font-normal text-muted-foreground">
          Use numbered questions and A–D choices. Correct answers can be selected in each question
          below after adding.
        </span>
        <span>
          <Button
            type="button"
            size="sm"
            disabled={!typedQuestions.trim() || busy}
            onClick={importTypedQuestions}
          >
            Add typed questions
          </Button>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-sm font-medium">
          Upload or scan CAT paper
          <input
            type="file"
            accept=".docx,.pdf,.txt,.jpg,.jpeg,.png,.webp,.bmp,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/bmp"
            disabled={busy}
            onChange={(event) => void importFile(event)}
            className="w-full min-w-0 text-xs"
          />
          <span className="font-normal text-muted-foreground">
            Upload the complete paper as-is, including scanned PDFs or clear JPG, PNG, WebP, or BMP
            images. OCR detects printed questions and choices; an answer scheme at the end is
            applied automatically.
          </span>
        </label>
        <label className="grid content-start gap-2 text-sm font-medium">
          Import marking scheme (optional)
          <input
            type="file"
            accept=".docx,.pdf,.txt,.jpg,.jpeg,.png,.webp,.bmp,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/bmp"
            disabled={busy || !importedQuestionCount}
            onChange={(event) => void importMarkingScheme(event)}
            className="w-full min-w-0 text-xs"
          />
          <span className="font-normal text-muted-foreground">
            Optional fallback if the paper has no answer key. Use one numbered answer per line, such
            as “1.A”, “1 a”, or “1 A: explanation”.
          </span>
        </label>
      </div>
      {busy && <p className="mt-2 text-sm text-muted-foreground">{progress}</p>}
      {markingSchemeMessage && (
        <p className="mt-2 text-sm text-emerald-700">{markingSchemeMessage}</p>
      )}
      {incompleteMessage && (
        <p role="status" className="mt-2 text-sm text-amber-700">
          {incompleteMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
