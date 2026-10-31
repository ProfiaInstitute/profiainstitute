import type { CatOptionKey } from "@/lib/cats";

export type ImportedCatQuestion = {
  prompt: string;
  options: Record<CatOptionKey, string>;
  correctOption: CatOptionKey | null;
};

const questionStart = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:-]\s*(.+)$/i;
const optionStart = /^\s*\(?([A-D])(?:\)|[.:-])\s*(.*)$/i;
const answerLine = /^\s*(?:answer|correct\s+answer|ans)\s*[:.)-]\s*([A-D])\b/i;
const answerKeyEntry = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:-]\s*([A-D])\s*$/i;

export function parseCatQuestionsFromText(text: string): ImportedCatQuestion[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const answerKey = new Map<number, CatOptionKey>();
  const questionLines: string[] = [];
  let readingAnswerKey = false;

  for (const line of lines) {
    if (/^\s*(?:answer\s*key|answers)\s*:?\s*$/i.test(line)) {
      readingAnswerKey = true;
      continue;
    }
    if (readingAnswerKey) {
      const match = line.match(answerKeyEntry);
      if (match?.[1] && match[2]) {
        answerKey.set(Number(match[1]), match[2].toUpperCase() as CatOptionKey);
      }
    } else {
      questionLines.push(line);
    }
  }

  const parsed: ImportedCatQuestion[] = [];
  let incompleteCount = 0;
  let current:
    | {
        number: number;
        prompt: string;
        options: Partial<Record<CatOptionKey, string>>;
        currentOption: CatOptionKey | null;
        correctOption: CatOptionKey | null;
      }
    | undefined;

  function finishQuestion() {
    if (!current) return;
    const options = current.options;
    if (
      current.prompt.trim() &&
      options.A?.trim() &&
      options.B?.trim() &&
      options.C?.trim() &&
      options.D?.trim()
    ) {
      parsed.push({
        prompt: current.prompt.trim(),
        options: {
          A: options.A.trim(),
          B: options.B.trim(),
          C: options.C.trim(),
          D: options.D.trim(),
        },
        correctOption: current.correctOption ?? answerKey.get(current.number) ?? null,
      });
    } else {
      incompleteCount += 1;
    }
    current = undefined;
  }

  for (const rawLine of questionLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const questionMatch = line.match(questionStart);
    if (questionMatch) {
      finishQuestion();
      current = {
        number: Number(questionMatch[1]),
        prompt: questionMatch[2] ?? "",
        options: {},
        currentOption: null,
        correctOption: null,
      };
      continue;
    }

    const answerMatch = line.match(answerLine);
    if (answerMatch && current) {
      current.correctOption = answerMatch[1]?.toUpperCase() as CatOptionKey;
      continue;
    }

    const optionMatch = line.match(optionStart);
    if (optionMatch && current) {
      const key = optionMatch[1]?.toUpperCase() as CatOptionKey;
      current.options[key] = optionMatch[2] ?? "";
      current.currentOption = key;
      continue;
    }

    if (current?.currentOption) {
      const key = current.currentOption;
      current.options[key] = `${current.options[key] ?? ""} ${line}`.trim();
    } else if (current) {
      current.prompt = `${current.prompt} ${line}`.trim();
    }
  }
  finishQuestion();

  if (incompleteCount) {
    throw new Error(
      `${incompleteCount} question${incompleteCount === 1 ? " is" : "s are"} missing a prompt or one or more A–D choices. Complete them in the file and import again.`,
    );
  }
  if (!parsed.length) {
    throw new Error(
      "No complete multiple-choice questions were found. Use numbered questions followed by choices labeled A–D.",
    );
  }
  if (parsed.length > 100) {
    throw new Error("A CAT can contain no more than 100 questions.");
  }
  return parsed;
}
