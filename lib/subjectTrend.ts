import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import { getAllRegularExamSubjectNames } from "@/lib/regularExam";

export type SubjectTrendExamType = "regular" | "mock";

export type SubjectTrendPoint = {
  sessionKey: string;
  sessionLabel: string;
  sortOrder: number;
  chartValue: number | null;
  displayValue: string;
  notTaken: boolean;
};

export type SubjectTrendSummary = {
  latestValue: number | null;
  latestDisplay: string;
  delta: number | null;
  deltaDisplay: string;
  dataPointCount: number;
};

export type SubjectTrendData = {
  examType: SubjectTrendExamType;
  scoreFormat: "points" | "percent";
  subjectName: string;
  points: SubjectTrendPoint[];
  summary: SubjectTrendSummary;
};

export function getSubjectTrendSubjectOptions(examType: SubjectTrendExamType) {
  if (examType === "regular") {
    return getAllRegularExamSubjectNames();
  }
  return TEST_SCORE_SUBJECTS.map((subject) => subject.label);
}

export function buildSubjectTrendSummary(
  points: SubjectTrendPoint[],
  scoreFormat: "points" | "percent",
): SubjectTrendSummary {
  const takenPoints = points.filter((point) => !point.notTaken && point.chartValue !== null);
  const latest = takenPoints.at(-1) ?? null;
  const previous = takenPoints.length > 1 ? takenPoints.at(-2) ?? null : null;

  const latestValue = latest?.chartValue ?? null;
  const delta =
    latestValue !== null && previous?.chartValue !== null && previous?.chartValue !== undefined
      ? latestValue - previous.chartValue
      : null;

  const unit = scoreFormat === "points" ? "点" : "%";
  const deltaDisplay =
    delta === null
      ? "—"
      : delta > 0
        ? `+${delta}${unit}`
        : `${delta}${unit}`;

  return {
    latestValue,
    latestDisplay: latest ? latest.displayValue : "—",
    delta,
    deltaDisplay,
    dataPointCount: takenPoints.length,
  };
}
