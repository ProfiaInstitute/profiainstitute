import type { ImportedCatQuestion } from "@/lib/cat-import-format";
import { parseCatQuestionsFromText } from "@/lib/cat-import-format";

const MAX_IMPORT_SIZE = 20 * 1024 * 1024;

export async function readCatQuestionsFile(file: File): Promise<ImportedCatQuestion[]> {
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error("Question files must be 20 MB or smaller.");
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
  } else {
    throw new Error("Import a Word .docx file or a text-based PDF.");
  }

  if (!text.trim()) {
    throw new Error(
      "No selectable text was found. Scanned/image-only PDFs are not supported; use a text-based PDF or Word document.",
    );
  }
  return parseCatQuestionsFromText(text);
}
