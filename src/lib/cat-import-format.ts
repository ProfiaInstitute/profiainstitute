import type { CatOptionKey } from "@/lib/cats";

export type ImportedCatQuestion = {
  prompt: string;
  options: Record<CatOptionKey, string>;
  correctOption: CatOptionKey | null;
};

export type ImportedCatAnswer = {
  questionNumber: number;
  correctOption: CatOptionKey;
};

const questionStart = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:-]\s*(.+)$/i;
const optionStart = /^\s*\(?([A-D])(?:\)|[.:-])\s*(.*)$/i;
const answerLine = /^\s*(?:answer|correct\s+answer|ans)\s*[:.)-]\s*([A-D])\b/i;
const markingSchemeEntry =
  /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})(?:\s*[.):-]\s*|\s+)?([A-D])\b(?:\s*[:–—-]\s*(.*))?\s*$/i;

export function parseCatMarkingSchemeFromText(text: string): ImportedCatAnswer[] {
  const answers = new Map<number, CatOptionKey>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^(?:answer\s*key|marking\s*scheme|answers|correct\s+answers)\s*:?\s*$/i.test(trimmed)
    ) {
      continue;
    }

    const match = trimmed.match(markingSchemeEntry);
    if (!match?.[1] || !match[2]) {
      if (/^(?:q(?:uestion)?\s*)?\d/i.test(trimmed)) {
        throw new Error(
          `Could not read marking-scheme line ${index + 1}: “${trimmed}”. Use formats such as “1.A”, “1 a”, or “1 A: explanation”.`,
        );
      }
      continue;
    }

    const questionNumber = Number(match[1]);
    if (questionNumber < 1 || questionNumber > 100) {
      throw new Error(`Marking-scheme question numbers must be from 1 to 100 (line ${index + 1}).`);
    }
    if (answers.has(questionNumber)) {
      throw new Error(`Question ${questionNumber} appears more than once in the marking scheme.`);
    }
    answers.set(questionNumber, match[2].toUpperCase() as CatOptionKey);
  }

  if (!answers.size) {
    throw new Error(
      "No numbered answers were found. Use one answer per line, such as “1.A”, “1 a”, or “1 A: explanation”.",
    );
  }

  return [...answers].map(([questionNumber, correctOption]) => ({
    questionNumber,
    correctOption,
  }));
}

export function parseCatQuestionsFromText(text: string): ImportedCatQuestion[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const answerKeyLines: string[] = [];
  const questionLines: string[] = [];
  let readingAnswerKey = false;

  for (const line of lines) {
    if (/^\s*(?:answer\s*key|marking\s*scheme|answers)\s*:?\s*$/i.test(line)) {
      readingAnswerKey = true;
      continue;
    }
    if (readingAnswerKey) {
      answerKeyLines.push(line);
    } else {
      questionLines.push(line);
    }
  }
  const answerKey = new Map(
    (answerKeyLines.length ? parseCatMarkingSchemeFromText(answerKeyLines.join("\n")) : []).map(
      (answer) => [answer.questionNumber, answer.correctOption],
    ),
  );

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
