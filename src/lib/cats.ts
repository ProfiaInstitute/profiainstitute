import type { Json } from "@/integrations/supabase/types";

export type CatOptionKey = "A" | "B" | "C" | "D";

export type StudentCat = {
  id: string;
  title: string;
  name: string;
  downloadFilePath: string | null;
  downloadFileName: string | null;
  instructions: string | null;
  durationMinutes: number;
  opensAt: string;
  closesAt: string;
  attemptId: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  available: boolean;
  inProgress: boolean;
};

export type StudentCatQuestion = {
  id: string;
  prompt: string;
  options: { key: CatOptionKey; text: string }[];
  points: number;
  selectedOption: CatOptionKey | null;
  sharedGroup: string | null;
  sharedPrompt: string | null;
  groupPosition: number | null;
};

export type StudentCatAttempt = {
  id: string;
  assessmentId: string;
  title: string;
  instructions: string | null;
  durationMinutes: number;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  questions: StudentCatQuestion[];
};

export type AdminCatQuestion = {
  id: string;
  prompt: string;
  options: Record<CatOptionKey, string>;
  correctOption: CatOptionKey;
  points: number;
  sharedGroup: string | null;
  sharedPrompt: string | null;
  groupPosition: number | null;
};

export type AdminCatAttempt = {
  id: string;
  studentNumber: string;
  studentName: string;
  kasnebNumber: string | null;
  levelName: string | null;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  answers: { questionId: string; selectedOption: CatOptionKey }[];
};

export type AdminCatTargetStudent = {
  id: string;
  studentNumber: string;
  studentName: string;
};

export type AdminCat = {
  id: string;
  courseId: string;
  courseTitle: string;
  unitId: string | null;
  title: string;
  name: string;
  levelIds: string[];
  targetStudents: AdminCatTargetStudent[];
  downloadFilePath: string | null;
  downloadFileName: string | null;
  instructions: string | null;
  durationMinutes: number;
  opensAt: string;
  closesAt: string;
  questions: AdminCatQuestion[];
  attempts: AdminCatAttempt[];
};

export type CatUnitReportRow = {
  unit: string;
  student: string;
  student_number: string;
  kasneb_number: string;
  cat_1_score: string;
  cat_2_score: string;
  combined_score: string;
  combined_percentage: number | null;
};

export type CatUnitReportExportRow = Pick<
  CatUnitReportRow,
  "unit" | "student" | "kasneb_number" | "cat_1_score" | "cat_2_score"
>;

export function buildCatUnitReportExportRows(
  rows: readonly CatUnitReportRow[],
): CatUnitReportExportRow[] {
  return rows.map(({ unit, student, kasneb_number, cat_1_score, cat_2_score }) => ({
    unit,
    student,
    kasneb_number,
    cat_1_score,
    cat_2_score,
  }));
}

export function buildCatUnitReportRows(
  units: { id: string; title: string; code: string | null }[],
  cats: AdminCat[],
): CatUnitReportRow[] {
  const rows: CatUnitReportRow[] = [];

  for (const unit of units) {
    const studentResults = new Map<
      string,
      {
        studentName: string;
        studentNumber: string;
        kasnebNumber: string | null;
        cat1Score: number;
        cat1Maximum: number;
        cat2Score: number;
        cat2Maximum: number;
      }
    >();
    const unitCats = cats.filter((cat) => cat.unitId === unit.id);

    for (const cat of unitCats) {
      const catNumber = /\bCAT\s*[-#:]?\s*1\b/i.test(`${cat.name} ${cat.title}`)
        ? 1
        : /\bCAT\s*[-#:]?\s*2\b/i.test(`${cat.name} ${cat.title}`)
          ? 2
          : null;
      if (catNumber === null) continue;

      for (const attempt of cat.attempts) {
        if (!attempt.submittedAt || attempt.score === null || attempt.maxScore === null) continue;
        const student = studentResults.get(attempt.studentNumber) ?? {
          studentName: attempt.studentName,
          studentNumber: attempt.studentNumber,
          kasnebNumber: attempt.kasnebNumber,
          cat1Score: 0,
          cat1Maximum: 0,
          cat2Score: 0,
          cat2Maximum: 0,
        };
        student.kasnebNumber ??= attempt.kasnebNumber;

        if (catNumber === 1) {
          student.cat1Score += attempt.score;
          student.cat1Maximum += attempt.maxScore;
        } else {
          student.cat2Score += attempt.score;
          student.cat2Maximum += attempt.maxScore;
        }
        studentResults.set(attempt.studentNumber, student);
      }
    }

    for (const student of studentResults.values()) {
      const combinedScore = student.cat1Score + student.cat2Score;
      const combinedMaximum = student.cat1Maximum + student.cat2Maximum;
      rows.push({
        unit: `${unit.code ? `${unit.code} · ` : ""}${unit.title}`,
        student: student.studentName,
        student_number: student.studentNumber,
        kasneb_number: student.kasnebNumber ?? "",
        cat_1_score: student.cat1Maximum ? `${student.cat1Score}/${student.cat1Maximum}` : "",
        cat_2_score: student.cat2Maximum ? `${student.cat2Score}/${student.cat2Maximum}` : "",
        combined_score: `${combinedScore}/${combinedMaximum}`,
        combined_percentage:
          combinedMaximum > 0 ? Number(((combinedScore / combinedMaximum) * 100).toFixed(1)) : null,
      });
    }
  }

  return rows.sort(
    (left, right) =>
      left.unit.localeCompare(right.unit) ||
      left.student.localeCompare(right.student) ||
      left.student_number.localeCompare(right.student_number),
  );
}

function objectValue(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The CAT service returned an invalid response.");
  }
  return value;
}

function arrayValue(value: Json | undefined): Json[] {
  if (!Array.isArray(value)) throw new Error("The CAT service returned an invalid list.");
  return value;
}

function stringValue(value: Json | undefined, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`The CAT service returned an invalid ${field}.`);
  }
  return value;
}

function nullableString(value: Json | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("The CAT service returned invalid text.");
  return value;
}

function numberValue(value: Json | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`The CAT service returned an invalid ${field}.`);
  }
  return value;
}

function nullableNumber(value: Json | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("The CAT service returned an invalid mark.");
  }
  return value;
}

function booleanValue(value: Json | undefined): boolean {
  if (typeof value !== "boolean") throw new Error("The CAT service returned invalid status.");
  return value;
}

function optionValue(value: Json | undefined): CatOptionKey {
  if (value === "A" || value === "B" || value === "C" || value === "D") return value;
  throw new Error("The CAT service returned an invalid answer choice.");
}

export function parseStudentCats(value: Json | null): StudentCat[] {
  return arrayValue(value ?? undefined).map((item) => {
    const cat = objectValue(item);
    return {
      id: stringValue(cat["id"], "CAT id"),
      title: stringValue(cat["title"], "CAT title"),
      name:
        cat["name"] === null || cat["name"] === undefined
          ? stringValue(cat["title"], "CAT title")
          : stringValue(cat["name"], "CAT name"),
      downloadFilePath: nullableString(cat["download_file_path"]),
      downloadFileName: nullableString(cat["download_file_name"]),
      instructions: nullableString(cat["instructions"]),
      durationMinutes: numberValue(cat["duration_minutes"], "CAT duration"),
      opensAt: stringValue(cat["opens_at"], "CAT opening time"),
      closesAt: stringValue(cat["closes_at"], "CAT closing time"),
      attemptId: nullableString(cat["attempt_id"]),
      startedAt: nullableString(cat["started_at"]),
      submittedAt: nullableString(cat["submitted_at"]),
      score: nullableNumber(cat["score"]),
      maxScore: nullableNumber(cat["max_score"]),
      available: booleanValue(cat["available"]),
      inProgress: booleanValue(cat["in_progress"]),
    };
  });
}

export function parseStudentCatAttempt(value: Json | null): StudentCatAttempt {
  const attempt = objectValue(value ?? undefined);
  const questions = arrayValue(attempt["questions"]).map((entry) => {
    const question = objectValue(entry);
    const options = arrayValue(question["options"]).map((optionEntry) => {
      const option = objectValue(optionEntry);
      return {
        key: optionValue(option["key"]),
        text: stringValue(option["text"], "answer choice"),
      };
    });
    if (options.length !== 4) throw new Error("The CAT service returned an incomplete question.");
    return {
      id: stringValue(question["id"], "question id"),
      prompt: stringValue(question["prompt"], "question"),
      options,
      points: numberValue(question["points"], "question mark"),
      sharedGroup: nullableString(question["shared_group"]),
      sharedPrompt: nullableString(question["shared_prompt"]),
      groupPosition: nullableNumber(question["group_position"]),
      selectedOption:
        question["selected_option"] === null || question["selected_option"] === undefined
          ? null
          : optionValue(question["selected_option"]),
    };
  });

  return {
    id: stringValue(attempt["id"], "attempt id"),
    assessmentId: stringValue(attempt["assessment_id"], "CAT id"),
    title: stringValue(attempt["title"], "CAT title"),
    instructions: nullableString(attempt["instructions"]),
    durationMinutes: numberValue(attempt["duration_minutes"], "CAT duration"),
    startedAt: stringValue(attempt["started_at"], "attempt start time"),
    deadline: stringValue(attempt["deadline"], "attempt deadline"),
    submittedAt: nullableString(attempt["submitted_at"]),
    score: nullableNumber(attempt["score"]),
    maxScore: nullableNumber(attempt["max_score"]),
    questions,
  };
}

export function parseAdminCats(value: Json | null): AdminCat[] {
  return arrayValue(value ?? undefined).map((entry) => {
    const cat = objectValue(entry);
    const questions = arrayValue(cat["questions"]).map((questionEntry) => {
      const question = objectValue(questionEntry);
      return {
        id: stringValue(question["id"], "question id"),
        prompt: stringValue(question["prompt"], "question"),
        options: {
          A: stringValue(question["option_a"], "answer choice"),
          B: stringValue(question["option_b"], "answer choice"),
          C: stringValue(question["option_c"], "answer choice"),
          D: stringValue(question["option_d"], "answer choice"),
        },
        correctOption: optionValue(question["correct_option"]),
        points: numberValue(question["points"], "question mark"),
        sharedGroup: nullableString(question["shared_group"]),
        sharedPrompt: nullableString(question["shared_prompt"]),
        groupPosition: nullableNumber(question["group_position"]),
      };
    });
    const attempts = arrayValue(cat["attempts"]).map((attemptEntry) => {
      const attempt = objectValue(attemptEntry);
      return {
        id: stringValue(attempt["id"], "attempt id"),
        studentNumber: stringValue(attempt["student_number"], "student number"),
        studentName: stringValue(attempt["student_name"], "student name"),
        kasnebNumber: nullableString(attempt["kasneb_number"]),
        levelName: nullableString(attempt["level_name"]),
        startedAt: stringValue(attempt["started_at"], "attempt start time"),
        submittedAt: nullableString(attempt["submitted_at"]),
        score: nullableNumber(attempt["score"]),
        maxScore: nullableNumber(attempt["max_score"]),
        answers: arrayValue(attempt["answers"]).map((answerEntry) => {
          const answer = objectValue(answerEntry);
          return {
            questionId: stringValue(answer["question_id"], "question id"),
            selectedOption: optionValue(answer["selected_option"]),
          };
        }),
      };
    });
    const targetStudents = (
      cat["target_students"] === undefined ? [] : arrayValue(cat["target_students"])
    ).map((studentEntry) => {
      const student = objectValue(studentEntry);
      return {
        id: stringValue(student["id"], "target student id"),
        studentNumber: stringValue(student["student_number"], "target student number"),
        studentName: stringValue(student["student_name"], "target student name"),
      };
    });
    return {
      id: stringValue(cat["id"], "CAT id"),
      courseId: stringValue(cat["course_id"], "course id"),
      courseTitle: stringValue(cat["course_title"], "course name"),
      unitId: nullableString(cat["unit_id"]),
      title: stringValue(cat["title"], "CAT title"),
      name:
        cat["name"] === null || cat["name"] === undefined
          ? stringValue(cat["title"], "CAT title")
          : stringValue(cat["name"], "CAT name"),
      levelIds:
        cat["level_ids"] === null || cat["level_ids"] === undefined
          ? []
          : arrayValue(cat["level_ids"]).map((levelId) => stringValue(levelId, "course level id")),
      targetStudents,
      downloadFilePath: nullableString(cat["download_file_path"]),
      downloadFileName: nullableString(cat["download_file_name"]),
      instructions: nullableString(cat["instructions"]),
      durationMinutes: numberValue(cat["duration_minutes"], "CAT duration"),
      opensAt: stringValue(cat["opens_at"], "CAT opening time"),
      closesAt: stringValue(cat["closes_at"], "CAT closing time"),
      questions,
      attempts,
    };
  });
}

export function parseCatSubmission(value: Json | null): {
  submittedAt: string;
  score: number;
  maxScore: number;
} {
  const result = objectValue(value ?? undefined);
  return {
    submittedAt: stringValue(result["submitted_at"], "submission time"),
    score: numberValue(result["score"], "CAT mark"),
    maxScore: numberValue(result["max_score"], "total CAT mark"),
  };
}

export function catDateTimeLabel(value: string): string {
  return new Date(value).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getDateTimeLocalMinimum(afterValue?: string, now = new Date()): string {
  const minimum = new Date(now);
  minimum.setSeconds(0, 0);
  minimum.setMinutes(minimum.getMinutes() + 1);

  if (afterValue) {
    const after = new Date(afterValue);
    if (Number.isFinite(after.getTime())) {
      after.setSeconds(0, 0);
      after.setMinutes(after.getMinutes() + 1);
      if (after > minimum) minimum.setTime(after.getTime());
    }
  }

  return new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
