import type { AdminCat } from "@/lib/cats";

export type CatPerformanceUnit = {
  id: string;
  name: string;
  assessmentCount: number;
  attemptCount: number;
  averagePercent: number;
  latestAveragePercent: number | null;
  previousAveragePercent: number | null;
};

export type CatPerformanceLearner = {
  id: string;
  name: string;
  studentNumber: string;
  performance: {
    unitId: string;
    averagePercent: number;
    latestAveragePercent: number;
    previousAveragePercent: number | null;
    attemptCount: number;
  }[];
};

export function createCatPerformanceAnalysisInput(
  courseName: string,
  levelName: string,
  units: CatPerformanceUnit[],
) {
  return {
    courseName,
    levelName,
    units: units.map(({ id: _localId, ...unit }, index) => ({
      ...unit,
      id: `unit-${index + 1}`,
    })),
  };
}

export function buildCatPerformanceSnapshot(
  cats: AdminCat[],
  units: { id: string; title: string; code: string | null }[],
): { units: CatPerformanceUnit[]; learners: CatPerformanceLearner[] } {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const scoresByUnit = new Map<
    string,
    Map<string, { name: string; scoresByAssessment: Map<string, number[]> }>
  >();
  const learnerNames = new Map<string, string>();

  for (const cat of cats) {
    if (!cat.unitId || !unitById.has(cat.unitId)) continue;
    for (const attempt of cat.attempts) {
      if (
        !attempt.submittedAt ||
        attempt.score === null ||
        attempt.maxScore === null ||
        attempt.maxScore <= 0 ||
        attempt.score < 0 ||
        attempt.score > attempt.maxScore
      ) {
        continue;
      }

      const learners = scoresByUnit.get(cat.unitId) ?? new Map();
      const learner = learners.get(attempt.studentNumber) ?? {
        name: attempt.studentName,
        scoresByAssessment: new Map<string, number[]>(),
      };
      learnerNames.set(attempt.studentNumber, learner.name);
      const assessmentScores = learner.scoresByAssessment.get(cat.id) ?? [];
      assessmentScores.push((attempt.score / attempt.maxScore) * 100);
      learner.scoresByAssessment.set(cat.id, assessmentScores);
      learners.set(attempt.studentNumber, learner);
      scoresByUnit.set(cat.unitId, learners);
    }
  }

  const orderedCats = [...cats].sort(
    (left, right) => left.opensAt.localeCompare(right.opensAt) || left.id.localeCompare(right.id),
  );
  const unitSnapshots = units.flatMap((unit) => {
    const learners = scoresByUnit.get(unit.id);
    if (!learners?.size) return [];
    const assessmentAverages = orderedCats
      .filter((cat) => cat.unitId === unit.id)
      .flatMap((cat) => {
        const scores = [...learners.values()].flatMap(
          (learner) => learner.scoresByAssessment.get(cat.id) ?? [],
        );
        return scores.length
          ? [{ averagePercent: average(scores), attemptCount: scores.length }]
          : [];
      });
    const latest = assessmentAverages.at(-1);
    const previous = assessmentAverages.at(-2);
    const allScores = [...learners.values()].flatMap((learner) =>
      [...learner.scoresByAssessment.values()].flat(),
    );

    return [
      {
        id: unit.id,
        name: `${unit.code ? `${unit.code} · ` : ""}${unit.title}`,
        assessmentCount: assessmentAverages.length,
        attemptCount: allScores.length,
        averagePercent: round(average(allScores)),
        latestAveragePercent: latest ? round(latest.averagePercent) : null,
        previousAveragePercent: latest && previous ? round(previous.averagePercent) : null,
      },
    ];
  });

  const learnerKeys = [
    ...new Set([...scoresByUnit.values()].flatMap((learners) => [...learners.keys()])),
  ].sort();
  const learnerIds = new Map(learnerKeys.map((key, index) => [key, `learner-${index + 1}`]));
  const learnerSnapshots = learnerKeys.flatMap((key) => {
    const learnerId = learnerIds.get(key);
    if (!learnerId) return [];
    const performance = unitSnapshots.flatMap((unit) => {
      const scoresByAssessment = scoresByUnit.get(unit.id)?.get(key)?.scoresByAssessment;
      if (!scoresByAssessment) return [];
      const assessmentScores = orderedCats
        .filter((cat) => cat.unitId === unit.id)
        .flatMap((cat) => {
          const scores = scoresByAssessment.get(cat.id);
          return scores ? [{ scores, averagePercent: average(scores) }] : [];
        });
      const latest = assessmentScores.at(-1);
      const previous = assessmentScores.at(-2);
      if (!latest) return [];
      return [
        {
          unitId: unit.id,
          averagePercent: round(average(assessmentScores.flatMap((item) => item.scores))),
          latestAveragePercent: round(latest.averagePercent),
          previousAveragePercent: latest && previous ? round(previous.averagePercent) : null,
          attemptCount: assessmentScores.reduce((total, item) => total + item.scores.length, 0),
        },
      ];
    });

    return performance.length
      ? [
          {
            id: learnerId,
            name: learnerNames.get(key) ?? "Student",
            studentNumber: key,
            performance,
          },
        ]
      : [];
  });

  return { units: unitSnapshots, learners: learnerSnapshots };
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number) {
  return Number(value.toFixed(1));
}
