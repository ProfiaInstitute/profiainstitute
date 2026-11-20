import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import {
  buildCatUnitReportExportRows,
  buildCatUnitReportRows,
  getDateTimeLocalMinimum,
  parseAdminCats,
  parseStudentCatAttempt,
  parseStudentCats,
  type AdminCat,
  type AdminCatAttempt,
} from "@/lib/cats";

describe("CAT local date and time validation", () => {
  it("sets the minimum to the next minute for an immediately opened CAT", () => {
    const now = new Date(2026, 9, 31, 10, 14, 30);
    const minimum = getDateTimeLocalMinimum(undefined, now);

    expect(new Date(minimum).getTime()).toBe(new Date(2026, 9, 31, 10, 15).getTime());
  });

  it("requires a CAT closing time to be after its scheduled opening time", () => {
    const now = new Date(2026, 9, 31, 10, 14, 30);
    const minimum = getDateTimeLocalMinimum("2026-11-05T11:11", now);

    expect(new Date(minimum).getTime()).toBe(new Date(2026, 10, 5, 11, 12).getTime());
  });
});

describe("CAT response parsing", () => {
  it("parses the student's available CATs and submitted marks", () => {
    const value: Json = [
      {
        id: "cat-1",
        title: "Unit CAT",
        name: "CAT 1 Financial Accounting",
        download_file_path: "course-1/cat-downloads/cat-file.pdf",
        download_file_name: "cat-file.pdf",
        instructions: null,
        duration_minutes: 30,
        opens_at: "2026-10-25T08:00:00.000Z",
        closes_at: "2026-10-25T10:00:00.000Z",
        attempt_id: "attempt-1",
        started_at: "2026-10-25T08:10:00.000Z",
        submitted_at: "2026-10-25T08:20:00.000Z",
        score: 4,
        max_score: 5,
        available: true,
        in_progress: false,
      },
    ];

    expect(parseStudentCats(value)).toEqual([
      expect.objectContaining({
        id: "cat-1",
        name: "CAT 1 Financial Accounting",
        downloadFilePath: "course-1/cat-downloads/cat-file.pdf",
        downloadFileName: "cat-file.pdf",
        attemptId: "attempt-1",
        score: 4,
        maxScore: 5,
        inProgress: false,
      }),
    ]);
  });

  it("parses student questions without accepting or exposing an answer key", () => {
    const value: Json = {
      id: "attempt-1",
      assessment_id: "cat-1",
      title: "Unit CAT",
      instructions: "Choose one answer.",
      duration_minutes: 30,
      started_at: "2026-10-25T08:10:00.000Z",
      deadline: "2026-10-25T08:40:00.000Z",
      submitted_at: null,
      score: null,
      max_score: null,
      questions: [
        {
          id: "question-1",
          prompt: "Which option is correct?",
          options: [
            { key: "B", text: "First" },
            { key: "D", text: "Second" },
            { key: "A", text: "Third" },
            { key: "C", text: "Fourth" },
          ],
          points: 2,
          selected_option: "B",
        },
      ],
    };

    const attempt = parseStudentCatAttempt(value);
    expect(attempt.questions[0]?.selectedOption).toBe("B");
    expect(attempt.questions[0]?.options[0]).toEqual({ key: "B", text: "First" });
    expect(attempt.questions[0]).not.toHaveProperty("correctOption");
  });

  it("includes question choices and student responses in the staff view", () => {
    const value: Json = [
      {
        id: "cat-1",
        course_id: "course-1",
        course_title: "Course",
        title: "Unit CAT",
        name: "CAT 1 Financial Accounting",
        level_ids: ["level-1", "level-2"],
        target_students: [
          {
            id: "student-1",
            student_number: "PRF/2026/0001",
            student_name: "Student Name",
          },
        ],
        download_file_path: "course-1/cat-downloads/cat-file.pdf",
        download_file_name: "cat-file.pdf",
        instructions: null,
        duration_minutes: 30,
        opens_at: "2026-10-25T08:00:00.000Z",
        closes_at: "2026-10-25T10:00:00.000Z",
        questions: [
          {
            id: "question-1",
            prompt: "Question",
            option_a: "A choice",
            option_b: "B choice",
            option_c: "C choice",
            option_d: "D choice",
            correct_option: "C",
            points: 1,
          },
        ],
        attempts: [
          {
            id: "attempt-1",
            student_number: "PRF/2026/0001",
            student_name: "Student Name",
            kasneb_number: "1234567890",
            level_name: "Level 1",
            started_at: "2026-10-25T08:10:00.000Z",
            submitted_at: "2026-10-25T08:15:00.000Z",
            score: 0,
            max_score: 1,
            answers: [{ question_id: "question-1", selected_option: "A" }],
          },
        ],
      },
    ];

    const [cat] = parseAdminCats(value);
    expect(cat?.name).toBe("CAT 1 Financial Accounting");
    expect(cat?.levelIds).toEqual(["level-1", "level-2"]);
    expect(cat?.targetStudents).toEqual([
      {
        id: "student-1",
        studentNumber: "PRF/2026/0001",
        studentName: "Student Name",
      },
    ]);
    expect(cat?.downloadFileName).toBe("cat-file.pdf");
    expect(cat?.questions[0]?.correctOption).toBe("C");
    expect(cat?.attempts[0]?.kasnebNumber).toBe("1234567890");
    expect(cat?.attempts[0]?.levelName).toBe("Level 1");
    expect(cat?.attempts[0]?.answers[0]?.selectedOption).toBe("A");
  });

  it("rejects malformed service responses instead of hiding invalid CAT data", () => {
    expect(() => parseStudentCats({})).toThrow("invalid list");
  });
});

describe("CAT unit reports", () => {
  it("combines submitted CAT 1 and CAT 2 marks by selected unit and student", () => {
    const makeAttempt = (
      id: string,
      studentNumber: string,
      studentName: string,
      score: number | null,
      maxScore: number | null,
      submittedAt: string | null,
      kasnebNumber: string | null = null,
    ): AdminCatAttempt => ({
      id,
      studentNumber,
      studentName,
      kasnebNumber,
      levelName: "Level 1",
      startedAt: "2026-10-25T08:00:00.000Z",
      submittedAt,
      score,
      maxScore,
      answers: [],
    });
    const makeCat = (
      id: string,
      name: string,
      unitId: string,
      attempts: AdminCatAttempt[],
    ): AdminCat => ({
      id,
      courseId: "course-1",
      courseTitle: "Course",
      unitId,
      title: name,
      name,
      levelIds: [],
      targetStudents: [],
      downloadFilePath: null,
      downloadFileName: null,
      instructions: null,
      durationMinutes: 30,
      opensAt: "2026-10-25T08:00:00.000Z",
      closesAt: "2026-10-25T10:00:00.000Z",
      questions: [],
      attempts,
    });
    const cats = [
      makeCat("cat-1", "CAT 1 Finance", "unit-1", [
        makeAttempt(
          "attempt-1",
          "S001",
          "Ada Student",
          6,
          10,
          "2026-10-25T08:30:00.000Z",
          "KASNEB-001",
        ),
      ]),
      makeCat("cat-2", "CAT 2 Finance", "unit-1", [
        makeAttempt("attempt-2", "S001", "Ada Student", 10, 20, "2026-10-25T09:30:00.000Z"),
        makeAttempt("attempt-3", "S002", "Ben Student", 8, 10, "2026-10-25T09:40:00.000Z"),
        makeAttempt("attempt-4", "S003", "Cal Student", null, null, null),
      ]),
      makeCat("cat-3", "CAT 1 Another Unit", "unit-2", [
        makeAttempt("attempt-5", "S004", "Dee Student", 5, 5, "2026-10-25T09:00:00.000Z"),
      ]),
    ];

    expect(
      buildCatUnitReportRows([{ id: "unit-1", title: "Finance", code: "FIN1" }], cats),
    ).toEqual([
      {
        unit: "FIN1 · Finance",
        student: "Ada Student",
        student_number: "S001",
        kasneb_number: "KASNEB-001",
        cat_1_score: "6/10",
        cat_2_score: "10/20",
        combined_score: "16/30",
        combined_percentage: 53.3,
      },
      {
        unit: "FIN1 · Finance",
        student: "Ben Student",
        student_number: "S002",
        kasneb_number: "",
        cat_1_score: "",
        cat_2_score: "8/10",
        combined_score: "8/10",
        combined_percentage: 80,
      },
    ]);

    expect(
      buildCatUnitReportExportRows([
        {
          unit: "FIN1 · Finance",
          student: "Ada Student",
          student_number: "S001",
          kasneb_number: "KASNEB-001",
          cat_1_score: "6/10",
          cat_2_score: "10/20",
          combined_score: "16/30",
          combined_percentage: 53.3,
        },
      ]),
    ).toEqual([
      {
        unit: "FIN1 · Finance",
        student: "Ada Student",
        kasneb_number: "KASNEB-001",
        cat_1_score: "6/10",
        cat_2_score: "10/20",
      },
    ]);
  });
});
