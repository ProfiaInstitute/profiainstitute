import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createExcelWorkbook } from "@/lib/excel-export";

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
    expect(sheet).toContain("student");
    expect(sheet).toContain("Amina &amp; Co");
    expect(sheet).toContain("<v>87.5</v>");
    expect(sheet).toContain("<v>1</v>");
    expect(sheet).toContain('<autoFilter ref="A1:D2"/>');
    expect(sheet).not.toContain("private");
  });

  it("rejects empty exports", () => {
    expect(() => createExcelWorkbook([])).toThrow("There are no records to export.");
  });
});
