import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Json } from "@/integrations/supabase/types";
import { buildAdmissionLetter, parseAdmissionLetterData } from "@/lib/admission-letter";

describe("admission-letter generation", () => {
  const template = new Uint8Array(
    readFileSync(resolve(process.cwd(), "public/templates/office-of-registrar-template.docx")),
  );

  it("uses the supplied letter layout and fills it with enrolled student and course data", () => {
    const data: Json = {
      student_id: "student-1",
      course_id: "course-1",
      course_title: "Accounting & Finance",
      full_name: "Jane A. Doe",
      admission_number: "PRF-2026-00123",
      address: "12 O'Connell Road",
      town: "Homa Bay",
      county: "Homa Bay County",
      phone: "+254 700 000 000",
      national_id: "12345678",
      application_date: "2026-10-25T09:00:00.000Z",
      accepted_at: "2026-11-06T09:15:00.000Z",
      enrolled_at: "2026-11-07T08:30:00.000Z",
    };
    const letterData = parseAdmissionLetterData(data);
    const output = buildAdmissionLetter(template, letterData);
    const files = unzipSync(output);
    const documentXml = files["word/document.xml"];
    if (!documentXml) throw new Error("Generated admission letter is missing its document body.");
    const parsed = new DOMParser().parseFromString(strFromU8(documentXml), "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);

    const text = parsed.documentElement.textContent ?? "";
    expect(text).toContain("Date: 06/11/2026");
    expect(text).toContain("REF: PRF-2026-00123");
    expect(text).toContain("JANE A. DOE");
    expect(text).toContain("12 O'Connell Road");
    expect(text).toContain("Homa Bay, Homa Bay County");
    expect(text).toContain("+254 700 000 000");
    expect(text).toContain("12345678");
    expect(text).toContain("ACCOUNTING & FINANCE");
    expect(text).toContain("Accounting & Finance course.");
    expect(text).toContain("Your admission number is PRF-2026-00123");
    expect(text).toContain("7 November 2026");
    expect(text).toContain("11:30");
    expect(text).not.toContain("{{");
    expect(text).not.toContain("FRANCIS OMITO OHURU");
  });

  it("rejects malformed admission-letter responses and missing template fields", () => {
    expect(() => parseAdmissionLetterData(null)).toThrow("invalid response");
    const incompleteTemplate = zipSync({ "word/document.xml": strToU8("<root/>") });
    const data = parseAdmissionLetterData({
      student_id: "student-1",
      course_id: "course-1",
      course_title: "Accounting",
      full_name: "Jane Doe",
      admission_number: "PRF-2026-00123",
      address: null,
      town: null,
      county: null,
      phone: null,
      national_id: null,
      application_date: null,
      accepted_at: "2026-11-06T09:15:00.000Z",
      enrolled_at: "2026-11-07T08:30:00.000Z",
    });
    expect(() => buildAdmissionLetter(incompleteTemplate, data)).toThrow(
      "template is missing ACCEPTANCE_DATE",
    );
  });
});
