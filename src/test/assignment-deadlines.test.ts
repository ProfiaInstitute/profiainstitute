import { describe, expect, it } from "vitest";
import { isAssignmentOpenForSubmission, submissionFilePaths } from "@/lib/assignments";

describe("assignment submission deadlines", () => {
  const deadline = Date.parse("2026-10-23T08:00:00.000Z");

  it("allows a submission before the deadline", () => {
    expect(isAssignmentOpenForSubmission(new Date(deadline).toISOString(), deadline - 1)).toBe(
      true,
    );
  });

  describe("submission file paths", () => {
    it("supports rows from before the multi-file column was installed", () => {
      expect(submissionFilePaths({ file_path: "student/assignment/old.pdf" })).toEqual([
        "student/assignment/old.pdf",
      ]);
    });

    it("uses every file path when the multi-file column is available", () => {
      expect(
        submissionFilePaths({
          file_path: "student/assignment/first.pdf",
          file_paths: ["student/assignment/first.pdf", "student/assignment/second.pdf"],
        }),
      ).toEqual(["student/assignment/first.pdf", "student/assignment/second.pdf"]);
    });

    it("returns no paths when a legacy submission has no file", () => {
      expect(submissionFilePaths({ file_path: null })).toEqual([]);
    });
  });

  it("closes submission at the exact deadline", () => {
    expect(isAssignmentOpenForSubmission(new Date(deadline).toISOString(), deadline)).toBe(false);
  });

  it("keeps missing or invalid deadlines closed", () => {
    expect(isAssignmentOpenForSubmission(null, deadline - 1)).toBe(false);
    expect(isAssignmentOpenForSubmission("not a date", deadline - 1)).toBe(false);
  });
});
