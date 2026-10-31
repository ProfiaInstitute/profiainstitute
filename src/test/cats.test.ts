import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { parseAdminCats, parseStudentCatAttempt, parseStudentCats } from "@/lib/cats";

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
