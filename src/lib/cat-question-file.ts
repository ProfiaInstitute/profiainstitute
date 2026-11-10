import type { ImportedCatQuestion } from "@/lib/cat-import-format";
import {
  parseCatMarkingSchemeFromText,
  parseCatQuestionsFromText,
  type ImportedCatAnswer,
} from "@/lib/cat-import-format";

const MAX_IMPORT_SIZE = 20 * 1024 * 1024;

export async function readCatQuestionsFile(file: File): Promise<ImportedCatQuestion[]> {
  return parseCatQuestionsFromText(await readCatDocumentText(file, "question"));
}

export async function readCatMarkingSchemeFile(file: File): Promise<ImportedCatAnswer[]> {
  return parseCatMarkingSchemeFromText(await readCatDocumentText(file, "marking-scheme"));
}

async function readCatDocumentText(
  file: File,
  purpose: "question" | "marking-scheme",
): Promise<string> {
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error("CAT import files must be 20 MB or smaller.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text: string;

  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (extension === "pdf") {
    const [{ getDocument, GlobalWorkerOptions }, pdfWorkerUrl] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((module) => module.default),
    ]);
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await getDocument({ data: await file.arrayBuffer() }).promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
          .join(""),
      );
    }
    text = pageTexts.join("\n");
  } else if (extension === "txt") {
    text = await file.text();
  } else {
    throw new Error(
      purpose === "question"
        ? "Import a Word .docx file, a text-based PDF, or a plain-text file."
        : "Import a Word .docx file, a text-based PDF, or a plain-text marking scheme.",
    );
  }

  if (!text.trim()) {
    throw new Error(
      "No selectable text was found. Scanned/image-only PDFs are not supported; use a text-based PDF or Word document.",
    );
  }
  return text;
}
