import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Json } from "@/integrations/supabase/types";

export type AdmissionLetterData = {
  studentId: string;
  courseId: string;
  courseTitle: string;
  fullName: string;
  admissionNumber: string;
  address: string;
  town: string;
  county: string;
  phone: string;
  nationalId: string;
  applicationDate: string | null;
  acceptedAt: string;
  enrolledAt: string;
};

function recordValue(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The admission letter service returned an invalid response.");
  }
  return value;
}

function requiredString(record: Record<string, Json | undefined>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`The admission letter service returned an invalid ${key}.`);
  }
  return value;
}

function optionalString(record: Record<string, Json | undefined>, key: string): string {
  const value = record[key];
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    throw new Error(`The admission letter service returned invalid ${key}.`);
  }
  return value;
}

export function parseAdmissionLetterData(value: Json | null): AdmissionLetterData {
  const record = recordValue(value ?? undefined);
  return {
    studentId: requiredString(record, "student_id"),
    courseId: requiredString(record, "course_id"),
    courseTitle: requiredString(record, "course_title"),
    fullName: requiredString(record, "full_name"),
    admissionNumber: requiredString(record, "admission_number"),
    address: optionalString(record, "address"),
    town: optionalString(record, "town"),
    county: optionalString(record, "county"),
    phone: optionalString(record, "phone"),
    nationalId: optionalString(record, "national_id"),
    applicationDate: optionalString(record, "application_date") || null,
    acceptedAt: requiredString(record, "accepted_at"),
    enrolledAt: requiredString(record, "enrolled_at"),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatAdmissionDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The admission date is invalid.");
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formatCommencementDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The enrollment date is invalid.");
  }
  return `${new Intl.DateTimeFormat("en-KE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date)} EAT`;
}

export function buildAdmissionLetter(template: Uint8Array, data: AdmissionLetterData): Uint8Array {
  const entries = unzipSync(template);
  const documentXml = entries["word/document.xml"];
  if (!documentXml) throw new Error("The admission letter template is missing its document body.");

  const townAndCounty = [data.town, data.county].filter(Boolean).join(", ");
  const replacements: Record<string, string> = {
    ACCEPTANCE_DATE: formatAdmissionDate(data.acceptedAt),
    ADMISSION_NUMBER: data.admissionNumber,
    STUDENT_NAME: data.fullName.toLocaleUpperCase(),
    ADDRESS: data.address,
    TOWN_COUNTY: townAndCounty,
    PHONE: data.phone,
    NATIONAL_ID: data.nationalId,
    COURSE_TITLE_UPPER: data.courseTitle.toLocaleUpperCase(),
    COURSE_TITLE: data.courseTitle,
    PROGRAMME_COMMENCEMENT: formatCommencementDate(data.enrolledAt),
  };
  let xml = strFromU8(documentXml);
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    if (!xml.includes(placeholder)) {
      throw new Error(`The admission letter template is missing ${key}.`);
    }
    xml = xml.replaceAll(placeholder, escapeXml(value));
  }
  if (/\{\{[A-Z_]+\}\}/.test(xml)) {
    throw new Error("The admission letter template contains an unfilled field.");
  }

  return zipSync({ ...entries, "word/document.xml": strToU8(xml) });
}
