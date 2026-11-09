import { useState, type ChangeEvent } from "react";
import { readCatMarkingSchemeFile, readCatQuestionsFile } from "@/lib/cat-question-file";
import type { ImportedCatAnswer, ImportedCatQuestion } from "@/lib/cat-import-format";

export function CatQuestionImporter({
  onImport,
  onApplyMarkingScheme,
}: {
  onImport: (questions: ImportedCatQuestion[]) => number;
  onApplyMarkingScheme: (answers: ImportedCatAnswer[], questionOffset: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importedQuestionCount, setImportedQuestionCount] = useState(0);
  const [questionOffset, setQuestionOffset] = useState(0);
  const [markingSchemeMessage, setMarkingSchemeMessage] = useState("");

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMarkingSchemeMessage("");
    try {
      const questions = await readCatQuestionsFile(file);
      const offset = onImport(questions);
      setQuestionOffset(offset);
      setImportedQuestionCount(questions.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The question file could not be read.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function importMarkingScheme(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMarkingSchemeMessage("");
    try {
      if (!importedQuestionCount) {
        throw new Error("Import the CAT questions before importing the marking scheme.");
      }
      const answers = await readCatMarkingSchemeFile(file);
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
      event.target.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-sm font-medium">
          Import questions from Word, PDF, or text
          <input
            type="file"
            accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={(event) => void importFile(event)}
            className="w-full min-w-0 text-xs"
          />
          <span className="font-normal text-muted-foreground">
            Number questions and use choices labeled A–D. Answers can be included here or in the
            separate marking-scheme file.
          </span>
        </label>
        <label className="grid content-start gap-2 text-sm font-medium">
          Import marking scheme (optional)
          <input
            type="file"
            accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy || !importedQuestionCount}
            onChange={(event) => void importMarkingScheme(event)}
            className="w-full min-w-0 text-xs"
          />
          <span className="font-normal text-muted-foreground">
            Use one numbered answer per line, such as “1.A”, “1 a”, or “1 A: explanation”. Only the
            answer letter is imported; explanation text is ignored.
          </span>
        </label>
      </div>
      {busy && <p className="mt-2 text-sm text-muted-foreground">Reading CAT file…</p>}
      {markingSchemeMessage && (
        <p className="mt-2 text-sm text-emerald-700">{markingSchemeMessage}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
