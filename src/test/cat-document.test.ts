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
    },
  ],
} satisfies Pick<
  AdminCat,
  "title" | "name" | "courseTitle" | "durationMinutes" | "instructions" | "questions"
>;

function documentXml(kind: "paper" | "marking-scheme") {
  const files = unzipSync(createCatDocument(sampleCat, kind));
  const document = files["word/document.xml"];
  if (!document) throw new Error("Generated Word document has no main document part.");
  return new TextDecoder().decode(document);
}

describe("CAT Word document generation", () => {
  it("creates a valid paper document without exposing the answer key", () => {
    const xml = documentXml("paper");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");

    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(xml).toContain("CAT PAPER");
    expect(xml).toContain("Answer all questions.");
    expect(xml).toContain("What is 2 &lt; 3?");
    expect(xml).toContain("B. Yes &amp; correct");
    expect(xml).not.toContain("Correct answer:");
  });

  it("creates a marking scheme document with correct answers and marks", () => {
    const xml = documentXml("marking-scheme");

    expect(xml).toContain("CAT MARKING SCHEME");
    expect(xml).toContain("Correct answer: B. Yes &amp; correct (2 marks)");
  });
});
