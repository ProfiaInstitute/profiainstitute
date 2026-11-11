import { describe, expect, it } from "vitest";
import {
  parseCatMarkingSchemeFromText,
  parseCatQuestionsFromText,
  parseCatQuestionsWithDiagnostics,
} from "@/lib/cat-import-format";

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
        "Answer Key: 3. C",
      ].join("\n"),
    );

    expect(questions[0]?.correctOption).toBe("C");
  });

  it("imports wrapped prompts, parenthesized choices, and an answer scheme at the bottom", () => {
    const questions = parseCatQuestionsFromText(
      [
        "Question 1",
        "Which number is even?",
        "(a) One",
        "(b) Two",
        "(c) Three",
        "(d) Four",
        "MARKING SCHEME",
        "1. (B)",
      ].join("\n"),
    );

    expect(questions).toEqual([
      {
        prompt: "Which number is even?",
        options: { A: "One", B: "Two", C: "Three", D: "Four" },
        correctOption: "B",
      },
    ]);
  });

  it("finds a trailing answer scheme even without a heading", () => {
    const questions = parseCatQuestionsFromText(
      ["1. Which number is even?", "A) One", "B) Two", "C) Three", "D) Four", "", "1. B"].join(
        "\n",
      ),
    );

    expect(questions[0]?.correctOption).toBe("B");
  });

  it("splits flattened PDF text when complete question choices run together", () => {
    const questions = parseCatQuestionsFromText(
      "1. First? A) one B) two C) three D) four 2. Second? A) red B) blue C) green D) yellow",
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]?.prompt).toBe("First?");
    expect(questions[1]?.prompt).toBe("Second?");
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

  it("parses several answers on one marking-scheme line", () => {
    expect(parseCatMarkingSchemeFromText("Answers: 1. B, 2. A, 3. D")).toEqual([
      { questionNumber: 1, correctOption: "B" },
      { questionNumber: 2, correctOption: "A" },
      { questionNumber: 3, correctOption: "D" },
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

  it("keeps complete and incomplete questions available for review", () => {
    const result = parseCatQuestionsWithDiagnostics(
      [
        "1. Complete question?",
        "A. First",
        "B. Second",
        "C. Third",
        "D. Fourth",
        "2. Incomplete question?",
        "A. Only one choice",
      ].join("\n"),
    );

    expect(result.questions).toHaveLength(2);
    expect(result.questions[1]).toEqual({
      prompt: "Incomplete question?",
      options: { A: "Only one choice", B: "", C: "", D: "" },
      correctOption: null,
    });
    expect(result.incompleteQuestionNumbers).toEqual([2]);
  });

  it("keeps answers from the paper's answer scheme on incomplete questions", () => {
    const result = parseCatQuestionsWithDiagnostics(
      [
        "1. Complete question?",
        "A. First",
        "B. Second",
        "C. Third",
        "D. Fourth",
        "2. Incomplete question?",
        "A. Only one choice",
        "Answer Key",
        "1. B",
        "2. C",
      ].join("\n"),
    );

    expect(result.questions).toHaveLength(2);
    expect(result.questions.map((question) => question.correctOption)).toEqual(["B", "C"]);
  });

  it("keeps imported questions when an embedded answer scheme has an unreadable line", () => {
    const result = parseCatQuestionsWithDiagnostics(
      [
        "1. Question?",
        "A. First",
        "B. Second",
        "C. Third",
        "D. Fourth",
        "Answer Key",
        "1. B",
        "2: unclear",
      ].join("\n"),
    );

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.correctOption).toBe("B");
  });

  it("rejects incomplete multiple-choice questions", () => {
    expect(() => parseCatQuestionsFromText(["1. Question", "A. One", "B. Two"].join("\n"))).toThrow(
      "missing a prompt or one or more A–D choices",
    );
  });
});
