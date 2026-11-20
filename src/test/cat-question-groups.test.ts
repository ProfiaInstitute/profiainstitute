import { orderCatPaperQuestions, validateSharedQuestionGroups } from "@/lib/cat-question-groups";

describe("shared CAT question groups", () => {
  it("requires complete, consistently ordered shared groups", () => {
    expect(
      validateSharedQuestionGroups([
        {
          sharedGroup: "Case 16-17",
          sharedPrompt: "Use the case facts.",
          groupPosition: "1",
        },
        {
          sharedGroup: "Case 16-17",
          sharedPrompt: "Different facts.",
          groupPosition: "2",
        },
      ]),
    ).toContain("same shared instructions");

    expect(
      validateSharedQuestionGroups([
        {
          sharedGroup: "Case 16-17",
          sharedPrompt: "Use the case facts.",
          groupPosition: "1",
        },
        {
          sharedGroup: "Case 16-17",
          sharedPrompt: "Use the case facts.",
          groupPosition: "1",
        },
      ]),
    ).toContain("different step numbers");
  });

  it("orders grouped steps before standalone questions without changing group order", () => {
    const questions = [
      { id: "standalone", sharedGroup: null, groupPosition: null },
      { id: "step-2", sharedGroup: "Case B", groupPosition: 2 },
      { id: "other-step-1", sharedGroup: "Case A", groupPosition: 1 },
      { id: "step-1", sharedGroup: "Case B", groupPosition: 1 },
      { id: "other-step-2", sharedGroup: "Case A", groupPosition: 2 },
      { id: "another-standalone", sharedGroup: null, groupPosition: null },
    ];

    expect(orderCatPaperQuestions(questions).map(({ id }) => id)).toEqual([
      "step-1",
      "step-2",
      "other-step-1",
      "other-step-2",
      "standalone",
      "another-standalone",
    ]);
  });
});
