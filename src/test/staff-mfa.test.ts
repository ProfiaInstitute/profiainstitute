import { describe, expect, it } from "vitest";
import { requiresStaffMfa, type AppRole } from "@/lib/auth";

describe("staff MFA policy", () => {
  it("requires MFA for every staff role, including facilitators", () => {
    const staffRoles: AppRole[] = [
      "super_admin",
      "admissions_admin",
      "academic_admin",
      "content_admin",
      "facilitator",
    ];

    for (const role of staffRoles) expect(requiresStaffMfa([role])).toBe(true);
  });

  it("does not require staff MFA for student-only or roleless accounts", () => {
    expect(requiresStaffMfa(["student"])).toBe(false);
    expect(requiresStaffMfa([])).toBe(false);
    expect(requiresStaffMfa(undefined)).toBe(false);
  });

  it("requires MFA when an account has both student and staff roles", () => {
    expect(requiresStaffMfa(["student", "facilitator"])).toBe(true);
  });
});
