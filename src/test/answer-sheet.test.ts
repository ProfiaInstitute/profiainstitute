import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  calculateAnswerSheetMetrics,
  generateMarkedAnswerSheetBlob,
  generateMarkedAnswerSheetsBlob,
  parseAnswerSheetUnit,
} from "@/lib/answer-sheet";

describe("CAT answer-sheet generation", () => {
  it("preserves the exact unit name and code returned by the CAT service", () => {
    expect(
      parseAnswerSheetUnit({
        unit_name: "Principles of Entrepreneurship and Management",
        unit_code: "CM 11",
      }),
    ).toEqual({
      name: "Principles of Entrepreneurship and Management",
      code: "CM 11",
    });
  });

  it("rejects unresolved or incomplete unit details instead of guessing a code", () => {
    expect(() => parseAnswerSheetUnit(null)).toThrow("invalid unit details");
    expect(() =>
      parseAnswerSheetUnit({
        unit_name: "Principles of Entrepreneurship and Management",
        unit_code: null,
      }),
    ).toThrow("invalid unit code");
  });

  it("calculates fully correct, incorrect, mixed, unanswered, and weighted scores", () => {
    const allCorrect = Array.from({ length: 50 }, (_, index) => ({
      id: `correct-${index}`,
      selectedOption: "A" as const,
      correctOption: "A" as const,
    }));
    expect(calculateAnswerSheetMetrics(allCorrect)).toEqual({
      totalQuestions: 50,
      attempted: 50,
      correct: 50,
      incorrect: 0,
      unanswered: 0,
      totalMarks: 50,
      maxMarks: 50,
      percentage: 100,
    });

    const allIncorrect = allCorrect.map((question) => ({
      ...question,
      selectedOption: "B" as const,
    }));
    expect(calculateAnswerSheetMetrics(allIncorrect)).toMatchObject({
      totalQuestions: 50,
      attempted: 50,
      correct: 0,
      incorrect: 50,
      unanswered: 0,
      totalMarks: 0,
      percentage: 0,
    });

    expect(
      calculateAnswerSheetMetrics([
        { id: "weighted-correct", selectedOption: "A", correctOption: "A", points: 2 },
        { id: "weighted-wrong", selectedOption: "B", correctOption: "A", points: 3 },
        { id: "weighted-unanswered", selectedOption: null, correctOption: "C", points: 5 },
      ]),
    ).toEqual({
      totalQuestions: 3,
      attempted: 2,
      correct: 1,
      incorrect: 1,
      unanswered: 1,
      totalMarks: 2,
      maxMarks: 10,
      percentage: 20,
    });
  });

  it("keeps the official DOCX XML well-formed and retains its table structure", async () => {
    const template = readFileSync(resolve(process.cwd(), "public/templates/ANSWER SHEET.docx"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(template)));

    try {
      const blob = await generateMarkedAnswerSheetBlob({
        courseName: "Accounting",
        unitName: "Financial Accounting",
        unitCode: "ACC101",
        examName: "CAT 1",
        studentName: "Jane Doe",
        kasnebNumber: "KAS-123",
        questions: [
          { id: "q1", selectedOption: "B", correctOption: "B", points: 1 },
          { id: "q2", selectedOption: "A", correctOption: "C", points: 1 },
          { id: "q3", selectedOption: null, correctOption: "D", points: 1 },
        ],
      });

      const outputBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result);
          else reject(new Error("Could not read the generated DOCX blob."));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
      const files = unzipSync(new Uint8Array(outputBytes));
      const documentXml = files["word/document.xml"];
      if (!documentXml) throw new Error("Generated DOCX is missing word/document.xml.");
      const parsed = new DOMParser().parseFromString(
        new TextDecoder().decode(documentXml),
        "application/xml",
      );
      expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(
        parsed.getElementsByTagNameNS(
          "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
          "tbl",
        ),
      ).toHaveLength(1);

      const text = parsed.documentElement.textContent;
      expect(text).toContain("COURSE NAME Accounting");
      expect(text).toContain("UNIT NAME Financial Accounting");
      expect(text).toContain("STUDENT NAME Jane Doe");
      expect(text).toContain("KAS-123");
      expect(text).toContain("B");
      expect(text).toContain("Correct: C");
      expect(text).toContain("Correct: D");

      const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const runs = Array.from(parsed.getElementsByTagNameNS(wordNamespace, "r"));
      const runByText = (expected: string) =>
        runs.find((run) => run.textContent?.trim() === expected);
      const selectedAnswer = runByText("B");
      const correctTick = runByText("✓");
      const incorrectCross = runByText("✗");
      const correctedOption = runByText("Correct: C");
      expect(
        selectedAnswer
          ?.getElementsByTagNameNS(wordNamespace, "color")[0]
          ?.getAttributeNS(wordNamespace, "val"),
      ).toBe("000000");
      expect(
        correctTick
          ?.getElementsByTagNameNS(wordNamespace, "color")[0]
          ?.getAttributeNS(wordNamespace, "val"),
      ).toBe("FF0000");
      expect(correctTick?.getElementsByTagNameNS(wordNamespace, "b")).toHaveLength(0);
      expect(
        incorrectCross
          ?.getElementsByTagNameNS(wordNamespace, "color")[0]
          ?.getAttributeNS(wordNamespace, "val"),
      ).toBe("FF0000");
      expect(
        correctedOption
          ?.getElementsByTagNameNS(wordNamespace, "color")[0]
          ?.getAttributeNS(wordNamespace, "val"),
      ).toBe("FF0000");
      expect(correctedOption?.getElementsByTagNameNS(wordNamespace, "i")).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("combines multiple student answer sheets in one paginated DOCX", async () => {
    const template = readFileSync(resolve(process.cwd(), "public/templates/ANSWER SHEET.docx"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(template)));

    try {
      const blob = await generateMarkedAnswerSheetsBlob(
        ["Jane Doe", "John Smith"].map((studentName) => ({
          courseName: "Accounting",
          unitName: "Financial Accounting",
          unitCode: "ACC101",
          examName: "CAT 1",
          studentName,
          kasnebNumber: "KAS-123",
          questions: [{ id: "q1", selectedOption: "B" as const, correctOption: "B" as const }],
        })),
      );
      const outputBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result);
          else reject(new Error("Could not read the generated DOCX blob."));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
      const files = unzipSync(new Uint8Array(outputBytes));
      const documentXml = files["word/document.xml"];
      if (!documentXml) throw new Error("Generated DOCX is missing word/document.xml.");
      const xml = new TextDecoder().decode(documentXml);
      const parsed = new DOMParser().parseFromString(xml, "application/xml");

      expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(parsed.documentElement.textContent).toContain("STUDENT NAME Jane Doe");
      expect(parsed.documentElement.textContent).toContain("STUDENT NAME John Smith");
      expect(
        parsed.getElementsByTagNameNS(
          "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
          "br",
        ),
      ).toHaveLength(1);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
