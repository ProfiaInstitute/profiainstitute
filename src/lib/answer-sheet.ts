import { unzipSync, zipSync } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CatOptionKey } from "@/lib/cats";

export type AnswerSheetQuestion = {
  id: string;
  selectedOption: CatOptionKey | null;
  correctOption: CatOptionKey | null;
  points?: number;
};

export type AnswerSheetPayload = {
  courseName: string;
  unitName: string;
  unitCode: string;
  examName: string;
  studentName: string;
  kasnebNumber: string;
  questions: AnswerSheetQuestion[];
};

export type AnswerKeySheetPayload = Pick<
  AnswerSheetPayload,
  "courseName" | "unitName" | "unitCode" | "examName"
> & {
  questions: { correctOption: CatOptionKey }[];
};

export type AnswerSheetUnit = {
  name: string;
  code: string;
};

export function parseAnswerSheetUnit(value: Json | null): AnswerSheetUnit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The CAT service returned invalid unit details.");
  }
  const unitName = value["unit_name"];
  const unitCode = value["unit_code"];
  if (typeof unitName !== "string" || !unitName.trim()) {
    throw new Error("The CAT service returned an invalid unit name.");
  }
  if (typeof unitCode !== "string" || !unitCode.trim()) {
    throw new Error("The CAT service returned an invalid unit code.");
  }
  return { name: unitName, code: unitCode };
}

export async function fetchAnswerSheetUnit(assessmentId: string): Promise<AnswerSheetUnit> {
  const { data, error } = await supabase.rpc("get_cat_answer_sheet_unit", {
    _assessment_id: assessmentId,
  });
  if (error) throw error;
  return parseAnswerSheetUnit(data);
}

export function buildAnswerSheetQuestionList<
  T extends {
    id: string;
    selectedOption?: CatOptionKey | null;
    correctOption?: CatOptionKey | null;
    points?: number;
  },
>(questions: T[]): AnswerSheetQuestion[] {
  return questions.map(({ id, selectedOption = null, correctOption = null, points }) => ({
    id,
    selectedOption: selectedOption ?? null,
    correctOption: correctOption ?? null,
    ...(points === undefined ? {} : { points }),
  }));
}

export type AnswerSheetMetrics = {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  totalMarks: number;
  maxMarks: number;
  percentage: number;
};

export function calculateAnswerSheetMetrics(questions: AnswerSheetQuestion[]): AnswerSheetMetrics {
  const totalQuestions = questions.length;
  const attempted = questions.filter((question) => question.selectedOption).length;
  const correct = questions.filter(
    (question) =>
      question.selectedOption &&
      question.correctOption &&
      question.selectedOption === question.correctOption,
  ).length;
  const incorrect = questions.filter(
    (question) =>
      question.selectedOption !== null &&
      question.correctOption !== null &&
      question.selectedOption !== question.correctOption,
  ).length;
  const unanswered = totalQuestions - attempted;
  const totalMarks = questions.reduce(
    (sum, question) =>
      question.correctOption && question.selectedOption === question.correctOption
        ? sum + (question.points ?? 1)
        : sum,
    0,
  );
  const maxMarks = questions.reduce((sum, question) => sum + (question.points ?? 1), 0);
  const percentage = maxMarks === 0 ? 0 : (totalMarks / maxMarks) * 100;

  return {
    totalQuestions,
    attempted,
    correct,
    incorrect,
    unanswered,
    totalMarks,
    maxMarks,
    percentage,
  };
}

const TEMPLATE_PATH = "/templates/ANSWER%20SHEET.docx";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTextRun(text: string, color?: "000000" | "FF0000", italic = false, bold = false) {
  const colorTag = color ? `<w:color w:val="${color}"/>` : "";
  const italicTag = italic ? "<w:i/>" : "";
  const boldTag = bold ? "<w:b/>" : "";
  return `
    <w:r>
      <w:rPr>
        ${colorTag}
        ${boldTag}
        ${italicTag}
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>`;
}

function buildQuestionParagraph(
  slotNumber: number,
  question: AnswerSheetQuestion | undefined,
  includeMarking: boolean,
) {
  const runs: string[] = [buildTextRun(`${slotNumber}`, "000000")];
  if (question) {
    if (!includeMarking && question.correctOption) {
      runs.push(buildTextRun(` ${question.correctOption}`, "000000"));
      return runs.join("");
    }
    if (question.selectedOption) {
      runs.push(buildTextRun(` ${question.selectedOption}`, "000000"));
      if (question.correctOption && question.selectedOption === question.correctOption) {
        runs.push(buildTextRun(" ✓", "FF0000"));
      } else if (question.correctOption) {
        runs.push(buildTextRun(" ✗", "FF0000"));
        runs.push(buildTextRun(` Correct: ${question.correctOption}`, "FF0000", true, false));
      }
    } else if (question.correctOption) {
      runs.push(buildTextRun(" ✗", "FF0000"));
      runs.push(buildTextRun(` Correct: ${question.correctOption}`, "FF0000", true, false));
    }
  }
  return runs.join("");
}

function replaceParagraphByUniqueText(xml: string, fragment: string, replacement: string) {
  let replaced = false;
  const result = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (replaced || !paragraphText(paragraph).includes(fragment)) return paragraph;
    replaced = true;
    const openingTag = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const paragraphProperties = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const runProperties = paragraph.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    return `${openingTag}${paragraphProperties}<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(replacement)}</w:t></w:r></w:p>`;
  });
  if (!replaced) {
    throw new Error(`The official answer-sheet template is missing the "${fragment}" field.`);
  }
  return result;
}

function paragraphText(paragraph: string) {
  return [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1] ?? "")
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function replaceQuestionSlots(
  xml: string,
  questions: AnswerSheetQuestion[],
  includeMarking = true,
) {
  if (questions.length > 50) {
    throw new Error("The official answer sheet supports a maximum of 50 CAT questions.");
  }

  const questionSlots = new Set<number>();
  const result = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = paragraphText(paragraph).trim();
    if (!/^(?:[1-9]|[1-4]\d|50)$/.test(text)) return paragraph;
    const number = Number.parseInt(text, 10);
    if (questionSlots.has(number)) return paragraph;
    questionSlots.add(number);
    const question = questions[number - 1];
    const openingTag = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const paragraphProperties = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    return `${openingTag}${paragraphProperties}${buildQuestionParagraph(number, question, includeMarking)}</w:p>`;
  });

  if (questionSlots.size !== 50) {
    throw new Error(
      `The official answer-sheet template must contain 50 numbered answer slots; found ${questionSlots.size}.`,
    );
  }
  return result;
}

function fillAnswerSheetXml(
  documentXml: string,
  payload: AnswerSheetPayload,
  includeMarking = true,
) {
  if (payload.questions.length > 50) {
    throw new Error("The official answer sheet supports a maximum of 50 CAT questions.");
  }
  let updatedXml = documentXml;
  updatedXml = replaceParagraphByUniqueText(
    updatedXml,
    "COURSE NAME",
    `COURSE NAME ${payload.courseName}`,
  );
  updatedXml = replaceParagraphByUniqueText(
    updatedXml,
    "UNIT NAME",
    `UNIT NAME ${payload.unitName}  UNIT CODE ${payload.unitCode}`,
  );
  updatedXml = replaceParagraphByUniqueText(
    updatedXml,
    "EXAM",
    `EXAM ${payload.examName}  STUDENT NAME ${payload.studentName}`,
  );
  updatedXml = replaceParagraphByUniqueText(
    updatedXml,
    "STUDENT KASNEB NUMBER",
    `STUDENT KASNEB NUMBER ${payload.kasnebNumber}`,
  );
  return replaceQuestionSlots(updatedXml, payload.questions, includeMarking);
}

async function loadAnswerSheetTemplate() {
  const response = await fetch(TEMPLATE_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`The official answer-sheet template could not be loaded (${response.status}).`);
  }
  const templateBytes = new Uint8Array(await response.arrayBuffer());
  const zipped = unzipSync(templateBytes);
  const documentXmlBytes = zipped["word/document.xml"];
  if (!documentXmlBytes) {
    throw new Error("The official answer-sheet template is missing its document content.");
  }
  return {
    zipped,
    documentXml: new TextDecoder("utf-8").decode(documentXmlBytes),
  };
}

function answerSheetBlob(zipped: Record<string, Uint8Array>, documentXml: string) {
  const nextZip = zipSync({
    ...Object.fromEntries(
      Object.entries(zipped).map(([fileName, fileBytes]) => {
        if (fileName === "word/document.xml") {
          return [fileName, new TextEncoder().encode(documentXml)];
        }
        return [fileName, fileBytes];
      }),
    ),
  });

  return new Blob([nextZip], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function mergeAnswerSheetDocuments(documents: string[]) {
  if (!documents.length) throw new Error("There are no submitted answer sheets to combine.");
  const firstBodyMatch = documents[0]?.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  if (!firstBodyMatch) throw new Error("The answer-sheet template has an invalid document body.");
  const firstBody = firstBodyMatch[1] ?? "";
  const sectionMatch = firstBody.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/);
  if (!sectionMatch) {
    throw new Error("The answer-sheet template is missing its page layout settings.");
  }
  const sectionProperties = sectionMatch[0];
  const pageBodies = documents.map((document) => {
    const body = document.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1];
    if (!body) throw new Error("An answer sheet has an invalid document body.");
    const content = body.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/, "");
    if (!content || content === body) {
      throw new Error("An answer sheet is missing its page layout settings.");
    }
    return content;
  });
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const bodyContent = pageBodies.join(pageBreak);
  return documents[0]!.replace(
    /(<w:body\b[^>]*>)[\s\S]*?(<\/w:body>)/,
    `$1${bodyContent}${sectionProperties}$2`,
  );
}

export async function generateMarkedAnswerSheetBlob(payload: AnswerSheetPayload): Promise<Blob> {
  const { zipped, documentXml } = await loadAnswerSheetTemplate();
  return answerSheetBlob(zipped, fillAnswerSheetXml(documentXml, payload));
}

export async function generateAnswerKeySheetBlob(payload: AnswerKeySheetPayload): Promise<Blob> {
  const { zipped, documentXml } = await loadAnswerSheetTemplate();
  return answerSheetBlob(
    zipped,
    fillAnswerSheetXml(
      documentXml,
      {
        ...payload,
        studentName: "",
        kasnebNumber: "",
        questions: payload.questions.map((question, index) => ({
          id: `answer-${index + 1}`,
          selectedOption: null,
          correctOption: question.correctOption,
        })),
      },
      false,
    ),
  );
}

export async function generateMarkedAnswerSheetsBlob(
  payloads: AnswerSheetPayload[],
): Promise<Blob> {
  if (!payloads.length) throw new Error("There are no submitted answer sheets to combine.");
  const { zipped, documentXml } = await loadAnswerSheetTemplate();
  const filledDocuments = payloads.map((payload) => fillAnswerSheetXml(documentXml, payload));
  return answerSheetBlob(zipped, mergeAnswerSheetDocuments(filledDocuments));
}

export async function downloadMarkedAnswerSheet(
  payload: AnswerSheetPayload,
  filename = "CAT-answer-sheet.docx",
): Promise<void> {
  const anchor = document.createElement("a");
  const blob = await generateMarkedAnswerSheetBlob(payload);
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadMarkedAnswerSheets(
  payloads: AnswerSheetPayload[],
  filename = "CAT-answer-sheets.docx",
): Promise<void> {
  const anchor = document.createElement("a");
  const blob = await generateMarkedAnswerSheetsBlob(payloads);
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
