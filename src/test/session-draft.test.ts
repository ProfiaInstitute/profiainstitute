import {
  clearSessionDraft,
  createSessionDraftKey,
  readSessionDraft,
  writeSessionDraft,
} from "@/lib/session-draft";

type TestDraft = { title: string };

function isTestDraft(value: unknown): value is TestDraft {
  return Boolean(
    value && typeof value === "object" && "title" in value && typeof value.title === "string",
  );
}

describe("session form drafts", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("saves and restores a draft scoped to a user and form", () => {
    const key = createSessionDraftKey("staff-1", "cat", "unit-1");
    const draft = { title: "Term CAT", questions: [{ prompt: "Question?" }] };

    expect(writeSessionDraft(key, draft)).toBe(true);
    expect(readSessionDraft(key, isTestDraft)).toEqual(draft);
    expect(readSessionDraft(createSessionDraftKey("staff-2", "cat", "unit-1"), isTestDraft)).toBe(
      null,
    );
  });

  it("ignores malformed drafts and removes drafts after successful publishing", () => {
    const key = createSessionDraftKey("staff-1", "assignment");
    sessionStorage.setItem(key, "{bad json");

    expect(readSessionDraft(key, isTestDraft)).toBeNull();
    writeSessionDraft(key, { title: "Assignment" });
    clearSessionDraft(key);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
