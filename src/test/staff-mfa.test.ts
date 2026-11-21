import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requiresStaffMfa, type AppRole } from "@/lib/auth";
import {
  clearTrustedMfa,
  markMfaTrusted,
  readTrustedMfa,
  STAFF_MFA_TRUST_MS,
} from "@/lib/staff-mfa-trust";

describe("staff MFA policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a verified staff MFA verification trusted for 45 days", () => {
    markMfaTrusted("staff-1");
    expect(readTrustedMfa("staff-1")).toBe(true);

    vi.advanceTimersByTime(STAFF_MFA_TRUST_MS - 1);
    expect(readTrustedMfa("staff-1")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(readTrustedMfa("staff-1")).toBe(false);
  });

  it("clears trusted MFA verification on sign out", () => {
    markMfaTrusted("staff-2");
    clearTrustedMfa("staff-2");
    expect(readTrustedMfa("staff-2")).toBe(false);
  });
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
