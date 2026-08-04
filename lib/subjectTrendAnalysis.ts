import {
  buildExamPassRateAnalysis,
  type ExamPassRateAnalysis,
  type GraduateExamSample,
  type PassRateAbcdGrade,
  type PassRateAnalysisMethod,
} from "@/lib/passRateAnalysis";
import type { ExamScoreRow } from "@/lib/examResults";
import type { SubjectTrendPoint } from "@/lib/subjectTrend";

export type SubjectTrendApproachLevel = "rising" | "strengthen" | "caution" | "watch";

export type SubjectTrendAnalysis = {
  available: boolean;
  reason: string | null;
  abcdGrade: PassRateAbcdGrade | null;
  passProbability: number | null;
  passProbabilitySimple: number | null;
  passProbabilityModel: number | null;
  method: PassRateAnalysisMethod | null;
  latestScore: number | null;
  latestDisplay: string | null;
  latestSourceType: SubjectTrendPoint["sourceType"] | null;
  latestSessionLabel: string | null;
  latestExamDateLabel: string | null;
  latestGap: number | null;
  passedAverageAtLatest: number | null;
  passedAverageTotal: number | null;
  failedAverageTotal: number | null;
  trendApproach: SubjectTrendApproachLevel | null;
  graduateSampleCount: {
    passed: number;
    failed: number;
  };
};

export const SUBJECT_TREND_APPROACH_MAINTAIN_SCORE = 60;
export const SUBJECT_TREND_APPROACH_FOCUS_GAP = -15;

export function getSubjectTrendApproachLabel(level: SubjectTrendApproachLevel) {
  switch (level) {
    case "rising":
      return "上昇維持";
    case "strengthen":
      return "要強化";
    case "caution":
      return "要注意";
    case "watch":
      return "要様子見";
  }
}

export function getTakenSubjectTrendPoints(points: SubjectTrendPoint[]) {
  return points.filter((point) => !point.notTaken && point.chartValue !== null);
}

export function getLatestSubjectTrendPoint(points: SubjectTrendPoint[]) {
  const takenPoints = getTakenSubjectTrendPoints(points);
  return takenPoints.at(-1) ?? null;
}

export function parseRegularSessionKeyFromTrendPoint(point: SubjectTrendPoint) {
  if (point.sourceType !== "regular") {
    return null;
  }
  const parts = point.sessionKey.split(":");
  return parts.length >= 2 ? parts[1] : null;
}

export function parseMockTestNameFromTrendPoint(point: SubjectTrendPoint) {
  if (point.sourceType !== "mock") {
    return null;
  }
  return point.sessionLabel.replace(/（模擬）$/, "").trim();
}

export function createGraduateSampleFromSubjectScore(
  subjectName: string,
  score: number,
  passed: boolean,
): GraduateExamSample {
  return {
    passed,
    features: {
      totalAverage: score,
      weakSubjectCount: score < SUBJECT_TREND_APPROACH_MAINTAIN_SCORE ? 1 : 0,
      minSubjectScore: score,
      takenSubjectCount: 1,
    },
    scores: [{ subjectName, score, notTaken: false }],
  };
}

export function classifySubjectTrendApproach(
  points: SubjectTrendPoint[],
  latestGap: number | null,
): SubjectTrendApproachLevel {
  const takenPoints = getTakenSubjectTrendPoints(points);
  const latest = takenPoints.at(-1);
  if (!latest || latest.chartValue === null) {
    return "watch";
  }

  const lastTwo = takenPoints.slice(-2);
  const rising =
    lastTwo.length === 2 &&
    (lastTwo[1].chartValue ?? 0) > (lastTwo[0].chartValue ?? 0);
  const declining =
    lastTwo.length === 2 &&
    (lastTwo[1].chartValue ?? 0) < (lastTwo[0].chartValue ?? 0);

  if (rising && latest.chartValue >= SUBJECT_TREND_APPROACH_MAINTAIN_SCORE) {
    return "rising";
  }
  if (declining) {
    return "caution";
  }
  if (
    latest.chartValue < SUBJECT_TREND_APPROACH_MAINTAIN_SCORE ||
    (latestGap !== null && latestGap < SUBJECT_TREND_APPROACH_FOCUS_GAP)
  ) {
    return "strengthen";
  }
  return "watch";
}

function toSubjectTrendAnalysis(
  subjectName: string,
  points: SubjectTrendPoint[],
  base: ExamPassRateAnalysis,
): SubjectTrendAnalysis {
  const latest = getLatestSubjectTrendPoint(points);
  const latestScore = latest?.chartValue ?? null;
  const passedAverageAtLatest = latest?.passedCohortAverage ?? null;
  const latestGap =
    latestScore !== null && passedAverageAtLatest !== null
      ? latestScore - passedAverageAtLatest
      : null;

  return {
    available: base.available,
    reason: base.reason,
    abcdGrade: base.abcdGrade,
    passProbability: base.passProbability,
    passProbabilitySimple: base.passProbabilitySimple,
    passProbabilityModel: base.passProbabilityModel,
    method: base.method,
    latestScore,
    latestDisplay: latest?.displayValue ?? null,
    latestSourceType: latest?.sourceType ?? null,
    latestSessionLabel: latest?.sessionLabel ?? null,
    latestExamDateLabel: latest?.examDateLabel ?? null,
    latestGap,
    passedAverageAtLatest,
    passedAverageTotal: base.passedAverageTotal,
    failedAverageTotal: base.failedAverageTotal,
    trendApproach:
      latestScore === null
        ? null
        : classifySubjectTrendApproach(points, latestGap),
    graduateSampleCount: base.graduateSampleCount,
  };
}

export function buildSubjectTrendAnalysis(input: {
  subjectName: string;
  points: SubjectTrendPoint[];
  passedSamples: GraduateExamSample[];
  failedSamples: GraduateExamSample[];
  passedAverageAtLatest: number | null;
}): SubjectTrendAnalysis {
  const latest = getLatestSubjectTrendPoint(input.points);
  if (!latest || latest.chartValue === null) {
    return {
      available: false,
      reason: "実施済みの成績がありません。",
      abcdGrade: null,
      passProbability: null,
      passProbabilitySimple: null,
      passProbabilityModel: null,
      method: null,
      latestScore: null,
      latestDisplay: null,
      latestSourceType: null,
      latestSessionLabel: null,
      latestExamDateLabel: null,
      latestGap: null,
      passedAverageAtLatest: null,
      passedAverageTotal: null,
      failedAverageTotal: null,
      trendApproach: null,
      graduateSampleCount: {
        passed: input.passedSamples.length,
        failed: input.failedSamples.length,
      },
    };
  }

  const studentScores: ExamScoreRow[] = [
    {
      subjectName: input.subjectName,
      score: latest.chartValue,
      notTaken: false,
    },
  ];

  const passedAverageBySubject = new Map<string, number>();
  if (input.passedAverageAtLatest !== null) {
    passedAverageBySubject.set(input.subjectName, input.passedAverageAtLatest);
  }

  const base = buildExamPassRateAnalysis({
    studentScores,
    passedSamples: input.passedSamples,
    failedSamples: input.failedSamples,
    passedAverageBySubject,
  });

  return toSubjectTrendAnalysis(input.subjectName, input.points, base);
}

export function emptySubjectTrendAnalysis(reason: string): SubjectTrendAnalysis {
  return {
    available: false,
    reason,
    abcdGrade: null,
    passProbability: null,
    passProbabilitySimple: null,
    passProbabilityModel: null,
    method: null,
    latestScore: null,
    latestDisplay: null,
    latestSourceType: null,
    latestSessionLabel: null,
    latestExamDateLabel: null,
    latestGap: null,
    passedAverageAtLatest: null,
    passedAverageTotal: null,
    failedAverageTotal: null,
    trendApproach: null,
    graduateSampleCount: { passed: 0, failed: 0 },
  };
}
