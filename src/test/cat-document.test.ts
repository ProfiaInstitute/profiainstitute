import { unzipSync } from "fflate";
import type { AdminCat } from "@/lib/cats";
import { createCatDocument } from "@/lib/cat-document";

const sampleCat = {
  title: "Term 2 CAT",
  name: "Financial Accounting CAT 2",
  courseTitle: "Accounting",
  durationMinutes: 45,
  instructions: "Answer all questions.",
  questions: [
    {
      id: "question-1",
      prompt: "What is 2 < 3?",
      options: {
        A: "No",
        B: "Yes & correct",
        C: "Maybe",
        D: "None",
      },
      correctOption: "B",
      points: 2,
      sharedGroup: null,
      sharedPrompt: null,
      groupPosition: null,
    },
  ],
} satisfies Pick<
  AdminCat,
  "title" | "name" | "courseTitle" | "durationMinutes" | "instructions" | "questions"
>;

function documentXml() {
  const files = unzipSync(createCatDocument(sampleCat));
  const document = files["word/document.xml"];
  if (!document) throw new Error("Generated Word document has no main document part.");
  return new TextDecoder().decode(document);
}

describe("CAT Word document generation", () => {
  it("creates a valid paper document without exposing the answer key", () => {
    const xml = documentXml();
    const parsed = new DOMParser().parseFromString(xml, "application/xml");

    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(xml).toContain("CAT PAPER");
    expect(xml).toContain("Answer all questions.");
    expect(xml).toContain("What is 2 &lt; 3?");
    expect(xml).toContain("B. Yes &amp; correct");
    expect(xml).not.toContain("Correct answer:");
  });

  it("includes the shared case once before its grouped questions", () => {
    const groupedCat = {
      ...sampleCat,
      questions: [
        {
          ...sampleCat.questions[0]!,
          id: "question-2",
          prompt: "Calculate the total.",
          sharedGroup: "Case 16-17",
          sharedPrompt: "Use the following figures.",
          groupPosition: 2,
        },
        {
          ...sampleCat.questions[0]!,
          id: "question-3",
          prompt: "Identify the relevant account.",
          sharedGroup: "Case 16-17",
          sharedPrompt: "Use the following figures.",
          groupPosition: 1,
        },
      ],
    };
    const files = unzipSync(createCatDocument(groupedCat));
    const document = new TextDecoder().decode(files["word/document.xml"]);

    expect(document.indexOf("Use the following figures.")).toBeLessThan(
      document.indexOf("Identify the relevant account."),
    );
    expect(document.indexOf("Identify the relevant account.")).toBeLessThan(
      document.indexOf("Calculate the total."),
    );
    expect(document.match(/Use the following figures\./g)).toHaveLength(1);
  });
});
