import { describe, expect, it } from "vitest";
import type { AdminCat, AdminCatAttempt } from "@/lib/cats";
import {
  buildCatPerformanceSnapshot,
  createCatPerformanceAnalysisInput,
} from "@/lib/performance-insights";
import { createOllamaAccessHeaders } from "@/lib/ollama-access";

function attempt(
  studentNumber: string,
  score: number | null,
  maxScore: number | null,
  submittedAt: string | null,
): AdminCatAttempt {
  return {
    id: `${studentNumber}-${submittedAt ?? "in-progress"}`,
    studentNumber,
    studentName: `Student ${studentNumber}`,
    kasnebNumber: null,
    levelName: "Level 1",
    startedAt: "2026-01-01T08:00:00.000Z",
    submittedAt,
    score,
    maxScore,
    answers: [],
  };
}

function cat(id: string, unitId: string, opensAt: string, attempts: AdminCatAttempt[]): AdminCat {
  return {
    id,
    courseId: "course-1",
    courseTitle: "Course",
    unitId,
    title: id,
    name: id,
    levelIds: [],
    targetStudents: [],
    downloadFilePath: null,
    downloadFileName: null,
    instructions: null,
    durationMinutes: 30,
    opensAt,
    closesAt: opensAt,
    questions: [],
    attempts,
  };
}

describe("CAT performance trends", () => {
  it("uses percentage marks, compares CAT averages, and keeps learner details local", () => {
    const snapshot = buildCatPerformanceSnapshot(
      [
        cat("cat-1", "unit-1", "2026-01-01T08:00:00.000Z", [
          attempt("S001", 4, 10, "2026-01-01T08:30:00.000Z"),
          attempt("S002", 8, 10, "2026-01-01T08:35:00.000Z"),
          attempt("S003", 10, 10, null),
        ]),
        cat("cat-2", "unit-1", "2026-02-01T08:00:00.000Z", [
          attempt("S001", 8, 10, "2026-02-01T08:30:00.000Z"),
          attempt("S002", 9, 10, "2026-02-01T08:35:00.000Z"),
        ]),
        cat("cat-other-unit", "unit-other", "2026-03-01T08:00:00.000Z", [
          attempt("S001", 0, 0, "2026-03-01T08:30:00.000Z"),
        ]),
      ],
      [{ id: "unit-1", title: "Accounting", code: "ACC1" }],
    );

    expect(snapshot.units).toEqual([
      {
        id: "unit-1",
        name: "ACC1 · Accounting",
        assessmentCount: 2,
        attemptCount: 4,
        averagePercent: 72.5,
        latestAveragePercent: 85,
        previousAveragePercent: 60,
      },
    ]);
    expect(snapshot.learners).toEqual([
      {
        id: "learner-1",
        name: "Student S001",
        studentNumber: "S001",
        performance: [
          {
            unitId: "unit-1",
            averagePercent: 60,
            latestAveragePercent: 80,
            previousAveragePercent: 40,
            attemptCount: 2,
          },
        ],
      },
      {
        id: "learner-2",
        name: "Student S002",
        studentNumber: "S002",
        performance: [
          {
            unitId: "unit-1",
            averagePercent: 85,
            latestAveragePercent: 90,
            previousAveragePercent: 80,
            attemptCount: 2,
          },
        ],
      },
    ]);
  });

  it("does not claim a trend until two CATs have submitted marks", () => {
    const snapshot = buildCatPerformanceSnapshot(
      [
        cat("cat-1", "unit-1", "2026-01-01T08:00:00.000Z", [
          attempt("S001", 7, 10, "2026-01-01T08:30:00.000Z"),
        ]),
      ],
      [{ id: "unit-1", title: "Accounting", code: null }],
    );

    expect(snapshot.units[0]).toMatchObject({
      assessmentCount: 1,
      latestAveragePercent: 70,
      previousAveragePercent: null,
    });
    expect(snapshot.learners[0]?.performance[0]?.previousAveragePercent).toBeNull();
  });

  it("sends aggregate unit data without student names or numbers to AI analysis", () => {
    const snapshot = buildCatPerformanceSnapshot(
      [
        cat("cat-1", "unit-1", "2026-01-01T08:00:00.000Z", [
          attempt("SENSITIVE-001", 7, 10, "2026-01-01T08:30:00.000Z"),
        ]),
      ],
      [{ id: "unit-1", title: "Accounting", code: null }],
    );

    const input = createCatPerformanceAnalysisInput("Course", "Level 1", snapshot.units);
    const serialized = JSON.stringify(input);

    expect(input.units[0]).toMatchObject({
      id: "unit-1",
      averagePercent: 70,
      attemptCount: 1,
    });
    expect(serialized).not.toContain("SENSITIVE-001");
    expect(serialized).not.toContain("Student SENSITIVE-001");
    expect(input).not.toHaveProperty("learners");
  });
});

describe("Ollama Cloudflare Access configuration", () => {
  it("allows local Ollama without Access credentials", () => {
    expect(createOllamaAccessHeaders(undefined, undefined, "http:")).toEqual({});
  });

  it("requires both service-token values", () => {
    expect(() => createOllamaAccessHeaders("client-id", undefined, "https:")).toThrow(
      "Configure both Ollama Cloudflare Access service-token values.",
    );
    expect(() => createOllamaAccessHeaders(undefined, "client-secret", "https:")).toThrow(
      "Configure both Ollama Cloudflare Access service-token values.",
    );
  });

  it("sends service-token headers only over HTTPS", () => {
    expect(createOllamaAccessHeaders(" client-id ", " client-secret ", "https:")).toEqual({
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
    });
    expect(() => createOllamaAccessHeaders("client-id", "client-secret", "http:")).toThrow(
      "Cloudflare Access service tokens require an HTTPS Ollama URL.",
    );
  });
});
