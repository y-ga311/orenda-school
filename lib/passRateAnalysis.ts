import { calculateAverageScore, isTakenExamScore, type ExamScoreRow } from "@/lib/examResults";

export type PassRateAbcdGrade = "A" | "B" | "C" | "D";

export type PassRateAnalysisMethod = "simple" | "model" | "blended";

export type SubjectApproachLevel = "focus" | "maintain" | "watch";

export type ExamSnapshotFeatures = {
  totalAverage: number;
  weakSubjectCount: number;
  minSubjectScore: number;
  takenSubjectCount: number;
};

export type GraduateExamSample = {
  passed: boolean;
  features: ExamSnapshotFeatures;
  scores: ExamScoreRow[];
};

export type SubjectApproachItem = {
  subjectName: string;
  studentScore: number;
  passedAverage: number | null;
  gap: number | null;
  level: SubjectApproachLevel;
  priorityRank: number;
};

export type ExamPassRateAnalysis = {
  available: boolean;
  reason: string | null;
  abcdGrade: PassRateAbcdGrade | null;
  passProbability: number | null;
  passProbabilitySimple: number | null;
  passProbabilityModel: number | null;
  method: PassRateAnalysisMethod | null;
  studentTotalAverage: number | null;
  passedAverageTotal: number | null;
  failedAverageTotal: number | null;
  graduateSampleCount: {
    passed: number;
    failed: number;
  };
  subjectApproaches: SubjectApproachItem[];
};

export const PASS_RATE_ABCD_THRESHOLDS = {
  A: 0.8,
  B: 0.6,
  C: 0.4,
} as const;

export const SUBJECT_APPROACH_FOCUS_GAP = -15;
export const SUBJECT_APPROACH_MAINTAIN_SCORE = 60;
export const LOGISTIC_MIN_SAMPLES_PER_GROUP = 5;

export function classifyPassRateAbcd(probability: number): PassRateAbcdGrade {
  if (probability >= PASS_RATE_ABCD_THRESHOLDS.A) {
    return "A";
  }
  if (probability >= PASS_RATE_ABCD_THRESHOLDS.B) {
    return "B";
  }
  if (probability >= PASS_RATE_ABCD_THRESHOLDS.C) {
    return "C";
  }
  return "D";
}

export function formatPassRateProbability(probability: number | null) {
  if (probability === null) {
    return "—";
  }
  return `${Math.round(probability * 1000) / 10}%`;
}

export function getPassRateAbcdLabel(grade: PassRateAbcdGrade) {
  return grade;
}

export function getSubjectApproachLevelLabel(level: SubjectApproachLevel) {
  switch (level) {
    case "focus":
      return "要重点";
    case "maintain":
      return "要維持";
    case "watch":
      return "要様子見";
  }
}

export function buildExamSnapshotFeatures(scores: ExamScoreRow[]): ExamSnapshotFeatures | null {
  const takenScores = scores.filter(isTakenExamScore);
  if (takenScores.length === 0) {
    return null;
  }

  const scoreValues = takenScores.map((row) => row.score ?? 0);
  const totalAverage = calculateAverageScore(scores);
  if (totalAverage === null) {
    return null;
  }

  return {
    totalAverage,
    weakSubjectCount: scoreValues.filter((score) => score < SUBJECT_APPROACH_MAINTAIN_SCORE).length,
    minSubjectScore: Math.min(...scoreValues),
    takenSubjectCount: takenScores.length,
  };
}

function mean(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  if (average === null || values.length < 2) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeSimplePassProbability(
  studentTotalAverage: number,
  passedAverages: number[],
  failedAverages: number[],
) {
  const passedMean = mean(passedAverages);
  const failedMean = mean(failedAverages);
  if (passedMean === null || failedMean === null) {
    return null;
  }

  const threshold = (passedMean + failedMean) / 2;
  const pooled = [
    ...passedAverages.map((value) => value - passedMean),
    ...failedAverages.map((value) => value - failedMean),
  ];
  const sd = standardDeviation(pooled) ?? 8;
  const scale = Math.max(sd * 2, 4);
  const logisticInput = (studentTotalAverage - threshold) / scale;
  const probability = 1 / (1 + Math.exp(-logisticInput));
  return Math.max(0, Math.min(1, probability));
}

function sigmoid(value: number) {
  if (value > 20) {
    return 1;
  }
  if (value < -20) {
    return 0;
  }
  return 1 / (1 + Math.exp(-value));
}

function dot(weights: number[], features: number[]) {
  let sum = weights[0];
  for (let index = 0; index < features.length; index += 1) {
    sum += weights[index + 1] * features[index];
  }
  return sum;
}

export function fitLogisticRegression(
  samples: Array<{ features: number[]; label: 0 | 1 }>,
  learningRate = 0.08,
  iterations = 250,
) {
  if (samples.length === 0) {
    return null;
  }

  const featureCount = samples[0].features.length;
  const weights = new Array(featureCount + 1).fill(0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = new Array(featureCount + 1).fill(0);

    samples.forEach((sample) => {
      const prediction = sigmoid(dot(weights, sample.features));
      const error = prediction - sample.label;
      gradients[0] += error;
      sample.features.forEach((feature, featureIndex) => {
        gradients[featureIndex + 1] += error * feature;
      });
    });

    const scale = samples.length;
    weights.forEach((weight, index) => {
      weights[index] = weight - (learningRate * gradients[index]) / scale;
    });
  }

  return weights;
}

export function predictLogisticProbability(weights: number[], features: number[]) {
  return sigmoid(dot(weights, features));
}

function normalizeFeatures(samples: GraduateExamSample[]) {
  const totals = samples.map((sample) => sample.features.totalAverage);
  const weakCounts = samples.map((sample) => sample.features.weakSubjectCount);
  const minScores = samples.map((sample) => sample.features.minSubjectScore);

  const totalMean = mean(totals) ?? 0;
  const weakMean = mean(weakCounts) ?? 0;
  const minMean = mean(minScores) ?? 0;
  const totalSd = standardDeviation(totals) || 1;
  const weakSd = standardDeviation(weakCounts) || 1;
  const minSd = standardDeviation(minScores) || 1;

  const normalize = (features: ExamSnapshotFeatures) => [
    (features.totalAverage - totalMean) / totalSd,
    (features.weakSubjectCount - weakMean) / weakSd,
    (features.minSubjectScore - minMean) / minSd,
  ];

  return { normalize };
}

export function computeModelPassProbability(
  studentFeatures: ExamSnapshotFeatures,
  samples: GraduateExamSample[],
) {
  if (
    samples.length < LOGISTIC_MIN_SAMPLES_PER_GROUP * 2 ||
    samples.filter((sample) => sample.passed).length < LOGISTIC_MIN_SAMPLES_PER_GROUP ||
    samples.filter((sample) => !sample.passed).length < LOGISTIC_MIN_SAMPLES_PER_GROUP
  ) {
    return null;
  }

  const { normalize } = normalizeFeatures(samples);
  const trainingSamples = samples.map((sample) => ({
    features: normalize(sample.features),
    label: (sample.passed ? 1 : 0) as 0 | 1,
  }));
  const weights = fitLogisticRegression(trainingSamples);
  if (!weights) {
    return null;
  }

  return predictLogisticProbability(weights, normalize(studentFeatures));
}

export function blendPassProbabilities(
  simple: number | null,
  model: number | null,
  passedCount: number,
  failedCount: number,
) {
  if (simple === null && model === null) {
    return { probability: null, method: null as PassRateAnalysisMethod | null };
  }

  if (model === null || passedCount < LOGISTIC_MIN_SAMPLES_PER_GROUP || failedCount < LOGISTIC_MIN_SAMPLES_PER_GROUP) {
    return { probability: simple, method: "simple" as const };
  }

  if (passedCount >= 20 && failedCount >= 20) {
    return { probability: model, method: "model" as const };
  }

  if (simple === null) {
    return { probability: model, method: "model" as const };
  }

  return {
    probability: simple * 0.5 + model * 0.5,
    method: "blended" as const,
  };
}

export function buildSubjectApproachItems(
  studentScores: ExamScoreRow[],
  passedAverageBySubject: Map<string, number>,
): SubjectApproachItem[] {
  const items: SubjectApproachItem[] = [];

  studentScores.forEach((row) => {
    if (!isTakenExamScore(row) || row.score === null) {
      return;
    }

    const passedAverage = passedAverageBySubject.get(row.subjectName) ?? null;
    const gap = passedAverage === null ? null : row.score - passedAverage;
    let level: SubjectApproachLevel = "watch";
    if (gap !== null && gap >= 0 && row.score >= SUBJECT_APPROACH_MAINTAIN_SCORE) {
      level = "maintain";
    }

    items.push({
      subjectName: row.subjectName,
      studentScore: row.score,
      passedAverage,
      gap,
      level,
      priorityRank: 0,
    });
  });

  items.sort((a, b) => {
    const gapA = a.gap ?? Number.POSITIVE_INFINITY;
    const gapB = b.gap ?? Number.POSITIVE_INFINITY;
    if (gapA !== gapB) {
      return gapA - gapB;
    }
    return a.subjectName.localeCompare(b.subjectName, "ja");
  });

  items.forEach((item, index) => {
    item.priorityRank = index + 1;
    if (item.gap !== null && item.gap < SUBJECT_APPROACH_FOCUS_GAP && index < 5) {
      item.level = "focus";
    }
  });

  return items;
}

export function buildExamPassRateAnalysis(input: {
  studentScores: ExamScoreRow[];
  passedSamples: GraduateExamSample[];
  failedSamples: GraduateExamSample[];
  passedAverageBySubject: Map<string, number>;
}): ExamPassRateAnalysis {
  const passedCount = input.passedSamples.length;
  const failedCount = input.failedSamples.length;
  const studentFeatures = buildExamSnapshotFeatures(input.studentScores);

  if (!studentFeatures) {
    return {
      available: false,
      reason: "実施済み科目がありません。",
      abcdGrade: null,
      passProbability: null,
      passProbabilitySimple: null,
      passProbabilityModel: null,
      method: null,
      studentTotalAverage: null,
      passedAverageTotal: null,
      failedAverageTotal: null,
      graduateSampleCount: { passed: passedCount, failed: failedCount },
      subjectApproaches: [],
    };
  }

  if (passedCount === 0 || failedCount === 0) {
    return {
      available: false,
      reason: "合格者・不合格者の卒業生データが不足しています。",
      abcdGrade: null,
      passProbability: null,
      passProbabilitySimple: null,
      passProbabilityModel: null,
      method: null,
      studentTotalAverage: studentFeatures.totalAverage,
      passedAverageTotal: null,
      failedAverageTotal: null,
      graduateSampleCount: { passed: passedCount, failed: failedCount },
      subjectApproaches: buildSubjectApproachItems(
        input.studentScores,
        input.passedAverageBySubject,
      ),
    };
  }

  const passedAverages = input.passedSamples.map((sample) => sample.features.totalAverage);
  const failedAverages = input.failedSamples.map((sample) => sample.features.totalAverage);
  const passProbabilitySimple = computeSimplePassProbability(
    studentFeatures.totalAverage,
    passedAverages,
    failedAverages,
  );
  const passProbabilityModel = computeModelPassProbability(studentFeatures, [
    ...input.passedSamples,
    ...input.failedSamples,
  ]);
  const blended = blendPassProbabilities(
    passProbabilitySimple,
    passProbabilityModel,
    passedCount,
    failedCount,
  );

  return {
    available: blended.probability !== null,
    reason: blended.probability === null ? "合格確率を算出できませんでした。" : null,
    abcdGrade:
      blended.probability === null ? null : classifyPassRateAbcd(blended.probability),
    passProbability: blended.probability,
    passProbabilitySimple,
    passProbabilityModel,
    method: blended.method,
    studentTotalAverage: studentFeatures.totalAverage,
    passedAverageTotal: mean(passedAverages),
    failedAverageTotal: mean(failedAverages),
    graduateSampleCount: { passed: passedCount, failed: failedCount },
    subjectApproaches: buildSubjectApproachItems(
      input.studentScores,
      input.passedAverageBySubject,
    ),
  };
}
