import { describe, expect, it } from "vitest";
import { parseCatMarkingSchemeFromText, parseCatQuestionsFromText } from "@/lib/cat-import-format";

describe("CAT document question parsing", () => {
  it("parses numbered questions, A-D choices, and an inline answer", () => {
    expect(
      parseCatQuestionsFromText(
        ["1. Which number is even?", "A) One", "B) Two", "C) Three", "D) Five", "Answer: B"].join(
          "\n",
        ),
      ),
    ).toEqual([
      {
        prompt: "Which number is even?",
        options: { A: "One", B: "Two", C: "Three", D: "Five" },
        correctOption: "B",
      },
    ]);
  });

  it("matches a separate answer key to its numbered question", () => {
    const questions = parseCatQuestionsFromText(
      [
        "Question 3: Which color is primary?",
        "A. Orange",
        "B. Green",
        "C. Blue",
        "D. Brown",
        "Answer Key",
        "3. C",
      ].join("\n"),
    );

    expect(questions[0]?.correctOption).toBe("C");
  });

  it("parses separate marking schemes with optional explanation text", () => {
    expect(
      parseCatMarkingSchemeFromText(["1.A", "2 a", "3 A: explanation for the answer"].join("\n")),
    ).toEqual([
      { questionNumber: 1, correctOption: "A" },
      { questionNumber: 2, correctOption: "A" },
      { questionNumber: 3, correctOption: "A" },
    ]);
  });

  it("rejects duplicate or malformed marking-scheme entries", () => {
    expect(() => parseCatMarkingSchemeFromText(["1.A", "1.B"].join("\n"))).toThrow(
      "appears more than once",
    );
    expect(() => parseCatMarkingSchemeFromText("2: maybe")).toThrow(
      "Could not read marking-scheme line",
    );
  });

  it("leaves unkeyed correct answers for staff to select", () => {
    const questions = parseCatQuestionsFromText(
      ["1) Pick a choice", "A. First", "B. Second", "C. Third", "D. Fourth"].join("\n"),
    );

    expect(questions[0]?.correctOption).toBeNull();
  });

  it("rejects incomplete multiple-choice questions", () => {
    expect(() => parseCatQuestionsFromText(["1. Question", "A. One", "B. Two"].join("\n"))).toThrow(
      "missing a prompt or one or more A–D choices",
    );
  });
});
