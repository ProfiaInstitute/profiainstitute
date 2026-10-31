import { useState, type ChangeEvent } from "react";
import { readCatQuestionsFile } from "@/lib/cat-question-file";
import type { ImportedCatQuestion } from "@/lib/cat-import-format";

export function CatQuestionImporter({
  onImport,
}: {
  onImport: (questions: ImportedCatQuestion[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const questions = await readCatQuestionsFile(file);
      onImport(questions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The question file could not be read.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <label className="grid gap-2 text-sm font-medium">
        Import questions from Word or PDF
        <input
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(event) => void importFile(event)}
          className="w-full min-w-0 text-xs"
        />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Use numbered questions with choices labeled A–D. Include answers as “Answer: B” or add an
        “Answer Key” section. Files up to 20 MB; scanned PDFs are not supported.
      </p>
      {busy && <p className="mt-2 text-sm text-muted-foreground">Reading questions…</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
