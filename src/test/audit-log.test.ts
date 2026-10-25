import { describe, expect, it } from "vitest";
import { formatAuditTime, summarizeAuditChange } from "@/lib/audit-log";

describe("audit log summaries", () => {
  it("shows changed field names without exposing before and after values", () => {
    expect(
      summarizeAuditChange("update", "students", {
        before: {
          id: "private-id",
          phone: "0712345678",
          national_id: "12345678",
          status: "active",
        },
        after: {
          id: "private-id",
          phone: "0798765432",
          national_id: "98765432",
          status: "active",
        },
      }),
    ).toBe("Updated Student: Phone, National Id");
  });

  it("summarizes explicit status changes without showing record identifiers", () => {
    expect(
      summarizeAuditChange("application_status_change", "applications", {
        number: "APP-PRIVATE",
        from: "under_review",
        to: "accepted",
      }),
    ).toBe("Application status changed: Under Review → Accepted");
  });

  it("describes create and role actions without displaying raw audit details", () => {
    expect(summarizeAuditChange("insert", "students", { after: { id: "private-id" } })).toBe(
      "Created Student",
    );
    expect(
      summarizeAuditChange("invite_staff", "user_roles", {
        email: "private@example.com",
        role: "academic_admin",
      }),
    ).toBe("Invited staff member with Academic Admin role");
  });

  it("formats audit timestamps in East Africa time", () => {
    expect(formatAuditTime("2026-10-25T08:00:00.000Z")).toContain("11:00");
  });
});
