import {
  parseCatMarkingSchemeFromText,
  parseCatQuestionsWithDiagnostics,
  type ImportedCatAnswer,
  type ParsedCatQuestions,
} from "@/lib/cat-import-format";

const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
const PDF_TEXT_THRESHOLD = 40;
type ImportProgress = (message: string) => void;

export async function readCatQuestionsFile(
  file: File,
  onProgress?: ImportProgress,
): Promise<ParsedCatQuestions> {
  return parseCatQuestionsWithDiagnostics(await readCatDocumentText(file, "question", onProgress));
}

export async function readCatMarkingSchemeFile(
  file: File,
  onProgress?: ImportProgress,
): Promise<ImportedCatAnswer[]> {
  return parseCatMarkingSchemeFromText(
    await readCatDocumentText(file, "marking-scheme", onProgress),
  );
}

async function readCatDocumentText(
  file: File,
  purpose: "question" | "marking-scheme",
  onProgress?: ImportProgress,
): Promise<string> {
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error("CAT import files must be 20 MB or smaller.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  let ocrWorker: import("tesseract.js").Worker | undefined;

  async function recognize(image: HTMLCanvasElement | File, status: string): Promise<string> {
    if (!ocrWorker) {
      onProgress?.("Starting OCR engine (first use may download English recognition data)…");
      try {
        const [{ createWorker }, workerUrl] = await Promise.all([
          import("tesseract.js"),
          import("tesseract.js/dist/worker.min.js?url").then((module) => module.default),
        ]);
        ocrWorker = await createWorker("eng", 1, {
          workerPath: workerUrl,
          logger: ({ status: workerStatus, progress }) => {
            const percent = Math.round(progress * 100);
            onProgress?.(
              workerStatus === "recognizing text"
                ? `${status} (${percent}%)`
                : `Preparing OCR: ${workerStatus} (${percent}%)`,
            );
          },
        });
      } catch (cause) {
        throw new Error(
          `Could not start OCR. Check your internet connection and try again. ${cause instanceof Error ? cause.message : ""}`.trim(),
        );
      }
    }

    try {
      return (await ocrWorker.recognize(image)).data.text;
    } catch (cause) {
      throw new Error(
        `OCR failed while reading ${status.toLowerCase()}. ${cause instanceof Error ? cause.message : "Try a clearer image or PDF."}`.trim(),
      );
    }
  }

  try {
    if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return requireDocumentText(result.value);
    }
    if (extension === "txt") return requireDocumentText(await file.text());
    if (extension === "pdf") {
      const [{ getDocument, GlobalWorkerOptions }, pdfWorkerUrl] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((module) => module.default),
      ]);
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loadingTask = getDocument({ data: await file.arrayBuffer() });
      const pdfDocument = await loadingTask.promise;
      const pageTexts: string[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          onProgress?.(`Reading PDF page ${pageNumber} of ${pdfDocument.numPages}…`);
          const page = await pdfDocument.getPage(pageNumber);
          const content = await page.getTextContent();
          const rows: { y: number; items: { x: number; text: string }[] }[] = [];
          for (const item of content.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            const x = item.transform[4] ?? 0;
            const y = item.transform[5] ?? 0;
            let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
            if (!row) {
              row = { y, items: [] };
              rows.push(row);
            }
            row.items.push({ x, text: item.str });
          }
          const pageText = rows
            .sort((left, right) => right.y - left.y)
            .map((row) =>
              row.items
                .sort((left, right) => left.x - right.x)
                .map((item) => item.text)
                .join(" "),
            )
            .join("\n");
          if (pageText.trim().length < PDF_TEXT_THRESHOLD) {
            onProgress?.(`Running OCR on PDF page ${pageNumber} of ${pdfDocument.numPages}…`);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            pageTexts.push(
              await recognize(
                canvas,
                `Recognizing PDF page ${pageNumber} of ${pdfDocument.numPages}`,
              ),
            );
            canvas.width = 0;
            canvas.height = 0;
          } else {
            pageTexts.push(pageText);
          }
        }
      } finally {
        await loadingTask.destroy();
      }
      return requireDocumentText(pageTexts.join("\n"));
    }

    if (["jpg", "jpeg", "png", "webp", "bmp"].includes(extension ?? "")) {
      onProgress?.("Recognizing image…");
      return requireDocumentText(await recognize(file, "Recognizing image"));
    }

    throw new Error(
      purpose === "question"
        ? "Upload a Word .docx, PDF, plain-text file, or JPG, PNG, WebP, or BMP image."
        : "Upload a Word .docx, PDF, plain-text file, or JPG, PNG, WebP, or BMP marking-scheme image.",
    );
  } finally {
    await ocrWorker?.terminate();
  }
}

function requireDocumentText(text: string): string {
  if (!text.trim()) {
    throw new Error(
      "No text could be read from this file. For a scan, use a clear image or PDF with legible printed text.",
    );
  }
  return text;
}
