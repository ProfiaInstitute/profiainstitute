import type { CatOptionKey } from "@/lib/cats";

export type CatPreviewQuestion = {
  prompt: string;
  options: Record<CatOptionKey, string>;
};

export function CatQuestionPreview({ questions }: { questions: CatPreviewQuestion[] }) {
  return (
    <details className="rounded-lg border bg-background p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Preview student exam ({questions.length} questions)
      </summary>
      <div className="mt-3 space-y-3">
        {questions.map((question, index) => (
          <article key={`${index}-${question.prompt}`} className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {index + 1}. {question.prompt}
            </p>
            <ol className="mt-2 grid gap-1 sm:grid-cols-2">
              {(["A", "B", "C", "D"] as const).map((key) => (
                <li key={key}>
                  <strong>{key}.</strong> {question.options[key]}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </details>
  );
}
