import { describe, expect, it } from "vitest";
import { isAssignmentOpenForSubmission } from "@/lib/assignments";

describe("assignment submission deadlines", () => {
  const deadline = Date.parse("2026-10-23T08:00:00.000Z");

  it("allows a submission before the deadline", () => {
    expect(isAssignmentOpenForSubmission(new Date(deadline).toISOString(), deadline - 1)).toBe(
      true,
    );
  });

  it("closes submission at the exact deadline", () => {
    expect(isAssignmentOpenForSubmission(new Date(deadline).toISOString(), deadline)).toBe(false);
  });

  it("keeps missing or invalid deadlines closed", () => {
    expect(isAssignmentOpenForSubmission(null, deadline - 1)).toBe(false);
    expect(isAssignmentOpenForSubmission("not a date", deadline - 1)).toBe(false);
  });
});
