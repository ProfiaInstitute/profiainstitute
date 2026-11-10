import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createExcelWorkbook, sanitizeExportRows } from "@/lib/excel-export";

describe("createExcelWorkbook", () => {
  it("creates a valid workbook containing headers, values, and an autofilter", () => {
    const workbook = createExcelWorkbook([
      {
        student: "PRF/2026/0001",
        name: "Amina & Co",
        score: 87.5,
        passed: true,
        raw: { private: "excluded" },
      },
    ]);
    const files = unzipSync(workbook);
    const workbookXml = new TextDecoder().decode(files["xl/workbook.xml"]);
    const sheet = new TextDecoder().decode(files["xl/worksheets/sheet1.xml"]);

    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(workbookXml).toContain('name="Results"');
    expect(sheet).toContain("Student");
    expect(sheet).toContain("Amina &amp; Co");
    expect(sheet).toContain("<v>87.5</v>");
    expect(sheet).toContain("<v>1</v>");
    expect(sheet).toContain('<autoFilter ref="A1:D2"/>');
    expect(sheet).not.toContain("private");
  });

  it("rejects empty exports", () => {
    expect(() => createExcelWorkbook([])).toThrow("There are no records to export.");
  });

  it("removes database identifiers and internal fields recursively", () => {
    const rows = sanitizeExportRows([
      {
        id: "result-db-id",
        student_id: "student-db-id",
        userId: "user-db-id",
        student_number: "PRF/2026/0001",
        valid: true,
        raw: { token: "secret-token" },
        student: {
          id: "nested-db-id",
          first_name: "Amina",
          application_id: "application-db-id",
        },
        submissions: [{ assignment_id: "assignment-db-id", grade: "A" }],
      },
    ]);

    expect(rows).toEqual([
      {
        student_number: "PRF/2026/0001",
        valid: true,
        student: { first_name: "Amina" },
        submissions: [{ grade: "A" }],
      },
    ]);
  });

  it("omits database IDs, storage paths, and internal fields from workbooks", () => {
    const workbook = createExcelWorkbook([
      {
        student_id: "student-db-id",
        assignmentId: "assignment-db-id",
        unit_name: "Mathematics",
        score: 87,
        file_path: "private/document.pdf",
        created_by: "admin-db-id",
      },
    ]);
    const sheet = new TextDecoder().decode(unzipSync(workbook)["xl/worksheets/sheet1.xml"]);

    expect(sheet).toContain("Unit Name");
    expect(sheet).toContain("Mathematics");
    expect(sheet).toContain("<v>87</v>");
    expect(sheet).not.toContain("student-db-id");
    expect(sheet).not.toContain("assignment-db-id");
    expect(sheet).not.toContain("private/document.pdf");
    expect(sheet).not.toContain("created_by");
  });
});
