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

export type ParsedCatQuestions = {
  questions: ImportedCatQuestion[];
  incompleteQuestionNumbers: number[];
};

const questionStart =
  /^\s*(?:q(?:uestion)?\s*)?(?:\(\s*)?(\d{1,3})(?:\s*\))?\s*(?:[).:-]|\s+)\s*(.*)$/i;
const questionNumberOnly = /^\s*(?:q(?:uestion)?\s*)?\(?(\d{1,3})\)?\s*$/i;
const answerLine = /^\s*(?:answer|correct\s+(?:answer|option)|ans)\s*[:.)-]?\s*\(?([A-D])\)?\b/i;
const markingSchemeEntry =
  /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*(?:[-.):]\s*|\s+)?\(?\s*([A-D])\s*\)?(?:\s*[:–—-]\s*(.*))?\s*$/i;
const answerSectionHeading =
  /^\s*(?:(?:the\s+)?answer\s*key|answers?|correct\s+answers?|suggested\s+answers?|mark(?:ing)?\s+scheme|solutions?)\s*(?:\([^)]*\))?\s*[:\-–—]?\s*$/i;
const answerSectionInline =
  /^\s*(?:(?:the\s+)?answer\s*key|answers?|correct\s+answers?|suggested\s+answers?|mark(?:ing)?\s+scheme|solutions?)\s*[:\-–—]\s*(.+)\s*$/i;
const optionMarker = /(?:^|[\s|;])(?:\(([A-D])\)|\[([A-D])\]|([A-D])\s*[).:-])\s*/gi;
const markingSchemeEntriesInline =
  /(?:^|[\s,;|])(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.)\-:]?\s*\(?([A-D])\)?(?=$|[\s,;|])/gi;

export function parseCatMarkingSchemeFromText(text: string): ImportedCatAnswer[] {
  const answers = new Map<number, CatOptionKey>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const [index, line] of lines.entries()) {
    let trimmed = line.trim();
    if (!trimmed || answerSectionHeading.test(trimmed)) {
      continue;
    }
    const inlinePayload = trimmed.match(answerSectionInline)?.[1];
    if (inlinePayload && parseMarkingSchemeEntries(inlinePayload)) trimmed = inlinePayload;

    const entries = parseMarkingSchemeEntries(trimmed);
    if (!entries) {
      if (/^(?:q(?:uestion)?\s*)?\d/i.test(trimmed)) {
        throw new Error(
          `Could not read marking-scheme line ${index + 1}: “${trimmed}”. Use formats such as “1.A”, “1 a”, or “1 A: explanation”.`,
        );
      }
      continue;
    }

    for (const { questionNumber, correctOption } of entries) {
      if (questionNumber < 1 || questionNumber > 100) {
        throw new Error(
          `Marking-scheme question numbers must be from 1 to 100 (line ${index + 1}).`,
        );
      }
      if (answers.has(questionNumber)) {
        throw new Error(`Question ${questionNumber} appears more than once in the marking scheme.`);
      }
      answers.set(questionNumber, correctOption);
    }
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
  const result = parseCatQuestionsWithDiagnostics(text);
  if (result.incompleteQuestionNumbers.length) {
    throw incompleteQuestionsError(result.incompleteQuestionNumbers);
  }
  return result.questions;
}

export function parseCatQuestionsWithDiagnostics(text: string): ParsedCatQuestions {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const answerKeyLines: string[] = [];
  const questionLines: string[] = [];
  let readingAnswerKey = false;

  for (const line of lines) {
    const inlinePayload = line.match(answerSectionInline)?.[1];
    if (inlinePayload && parseMarkingSchemeEntries(inlinePayload)) {
      readingAnswerKey = true;
      answerKeyLines.push(inlinePayload);
      continue;
    }
    if (answerSectionHeading.test(line)) {
      readingAnswerKey = true;
      continue;
    }
    if (readingAnswerKey) {
      answerKeyLines.push(line);
    } else {
      questionLines.push(line);
    }
  }
  if (!readingAnswerKey) {
    const tailLines: string[] = [];
    const tailAnswers: ImportedCatAnswer[] = [];
    let firstTailLine = questionLines.length;
    for (let index = questionLines.length - 1; index >= 0; index -= 1) {
      const line = questionLines[index]!;
      if (!line.trim()) {
        firstTailLine = index;
        continue;
      }
      const entries = parseMarkingSchemeEntries(line.trim());
      if (!entries) break;
      firstTailLine = index;
      tailLines.unshift(line);
      tailAnswers.unshift(...entries);
    }

    const earlierQuestionNumbers = new Set(
      questionLines.slice(0, firstTailLine).flatMap((line) => {
        const match = line.match(questionStart) ?? line.match(questionNumberOnly);
        return match?.[1] ? [Number(match[1])] : [];
      }),
    );
    if (
      tailAnswers.length > 1 ||
      tailAnswers.some((answer) => earlierQuestionNumbers.has(answer.questionNumber))
    ) {
      questionLines.splice(firstTailLine);
      answerKeyLines.push(...tailLines);
    }
  }
  const answerKey = parseEmbeddedAnswerKey(answerKeyLines);

  const parsed: ImportedCatQuestion[] = [];
  const incompleteQuestions: number[] = [];
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
    const complete =
      current.prompt.trim() &&
      options.A?.trim() &&
      options.B?.trim() &&
      options.C?.trim() &&
      options.D?.trim();
    parsed.push({
      prompt: current.prompt.trim(),
      options: {
        A: options.A?.trim() ?? "",
        B: options.B?.trim() ?? "",
        C: options.C?.trim() ?? "",
        D: options.D?.trim() ?? "",
      },
      correctOption: current.correctOption ?? answerKey.get(current.number) ?? null,
    });
    if (!complete) incompleteQuestions.push(current.number);
    current = undefined;
  }

  for (const rawLine of questionLines.flatMap(splitCollapsedQuestionLine)) {
    const line = rawLine.trim();
    if (!line) continue;

    const questionMatch = line.match(questionStart) ?? line.match(questionNumberOnly);
    if (questionMatch) {
      const questionNumber = Number(questionMatch[1]);
      if (questionNumber < 1 || questionNumber > 100) {
        throw new Error(`Question numbers must be from 1 to 100 (question ${questionNumber}).`);
      }
      finishQuestion();
      current = {
        number: questionNumber,
        prompt: "",
        options: {},
        currentOption: null,
        correctOption: null,
      };
      if (questionMatch[2]?.trim()) appendQuestionLine(current, questionMatch[2].trim());
      continue;
    }

    const answerMatch = line.match(answerLine);
    if (answerMatch && current) {
      current.correctOption = answerMatch[1]?.toUpperCase() as CatOptionKey;
      continue;
    }

    if (!current) continue;

    appendQuestionLine(current, line);
  }
  finishQuestion();

  if (!parsed.length) {
    throw new Error(
      "No complete multiple-choice questions were found. Use numbered questions followed by choices labeled A–D.",
    );
  }
  if (parsed.length > 100) {
    throw new Error("A CAT can contain no more than 100 questions.");
  }
  return { questions: parsed, incompleteQuestionNumbers: incompleteQuestions };
}

function incompleteQuestionsError(questionNumbers: number[]): Error {
  const examples = questionNumbers.slice(0, 5).join(", ");
  const more = questionNumbers.length > 5 ? ", …" : "";
  return new Error(
    `${questionNumbers.length} question${questionNumbers.length === 1 ? " is" : "s are"} missing a prompt or one or more A–D choices (question${questionNumbers.length === 1 ? "" : "s"} ${examples}${more}). Check that the document uses A–D choice labels and try again.`,
  );
}

function appendQuestionText(
  question: {
    prompt: string;
    options: Partial<Record<CatOptionKey, string>>;
    currentOption: CatOptionKey | null;
  },
  text: string,
) {
  if (question.currentOption) {
    const key = question.currentOption;
    question.options[key] = `${question.options[key] ?? ""} ${text}`.trim();
  } else {
    question.prompt = `${question.prompt} ${text}`.trim();
  }
}

function appendQuestionLine(
  question: {
    prompt: string;
    options: Partial<Record<CatOptionKey, string>>;
    currentOption: CatOptionKey | null;
  },
  line: string,
) {
  const markers = [...line.matchAll(optionMarker)];
  if (!markers.length) {
    appendQuestionText(question, line);
    return;
  }

  const firstMarker = markers[0]!;
  const precedingText = line.slice(0, firstMarker.index).trim();
  if (precedingText) appendQuestionText(question, precedingText);

  for (const [index, marker] of markers.entries()) {
    const key = (marker[1] ?? marker[2] ?? marker[3])?.toUpperCase() as CatOptionKey | undefined;
    const nextMarker = markers[index + 1];
    const valueStart = marker.index! + marker[0].length;
    const valueEnd = nextMarker?.index ?? line.length;
    if (key) {
      question.options[key] = line.slice(valueStart, valueEnd).trim();
      question.currentOption = key;
    }
  }
}

function parseMarkingSchemeEntries(
  line: string,
): { questionNumber: number; correctOption: CatOptionKey }[] | null {
  const singleEntry = line.match(markingSchemeEntry);
  if (singleEntry?.[1] && singleEntry[2]) {
    return [
      {
        questionNumber: Number(singleEntry[1]),
        correctOption: singleEntry[2].toUpperCase() as CatOptionKey,
      },
    ];
  }

  const matcher = new RegExp(markingSchemeEntriesInline.source, "gi");
  const matches = [...line.matchAll(matcher)];
  const remainingText = line
    .replace(new RegExp(markingSchemeEntriesInline.source, "gi"), "")
    .replace(/[\s,;|]/g, "");
  if (matches.length < 2 || remainingText) return null;
  return matches.map((match) => ({
    questionNumber: Number(match[1]),
    correctOption: match[2]!.toUpperCase() as CatOptionKey,
  }));
}

function parseEmbeddedAnswerKey(lines: string[]): Map<number, CatOptionKey> {
  const answers = new Map<number, CatOptionKey>();
  for (const line of lines) {
    const entries = parseMarkingSchemeEntries(line.trim());
    for (const entry of entries ?? []) {
      if (entry.questionNumber >= 1 && entry.questionNumber <= 100) {
        answers.set(entry.questionNumber, entry.correctOption);
      }
    }
  }
  return answers;
}

function splitCollapsedQuestionLine(line: string): string[] {
  const starts = [...line.matchAll(/(?:^|\s)(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:-]\s+/gi)];
  if (starts.length < 2) return [line];

  const splitIndexes: number[] = [];
  let segmentStart = 0;
  for (const start of starts.slice(1)) {
    const index = start.index ?? 0;
    const previousSegment = line.slice(segmentStart, index);
    const labels = [...previousSegment.matchAll(optionMarker)].map((marker) =>
      (marker[1] ?? marker[2] ?? marker[3])?.toUpperCase(),
    );
    if (["A", "B", "C", "D"].every((key) => labels.includes(key))) {
      splitIndexes.push(index);
      segmentStart = index;
    }
  }
  if (!splitIndexes.length) return [line];

  const segments: string[] = [];
  let previousIndex = 0;
  for (const index of splitIndexes) {
    segments.push(line.slice(previousIndex, index).trim());
    previousIndex = index;
  }
  segments.push(line.slice(previousIndex).trim());
  return segments;
}
