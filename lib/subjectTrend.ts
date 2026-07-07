import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import {
  ACUPUNCTURE_THEORY_LABEL,
  MOXIBUSTION_THEORY_LABEL,
} from "@/lib/examResults";
import {
  getAllRegularExamSubjectNames,
  REGULAR_EXAM_TREND_FANOUT,
} from "@/lib/regularExam";
import { formatExamTestDate } from "@/lib/questionCounts";

export type SubjectTrendSourceType = "regular" | "mock";

export type SubjectTrendPoint = {
  sessionKey: string;
  sessionLabel: string;
  sortOrder: number;
  examDateIso: string | null;
  examDateLabel: string | null;
  sourceType: SubjectTrendSourceType;
  chartValue: number | null;
  cohortAverage: number | null;
  displayValue: string;
  notTaken: boolean;
};

export type SubjectTrendSummary = {
  latestValue: number | null;
  latestDisplay: string;
  delta: number | null;
  deltaDisplay: string;
  dataPointCount: number;
  hasUndatedRegularExams: boolean;
  cohortKey: string | null;
  cohortLabel: string | null;
  cohortMissing: boolean;
};

export type SubjectTrendData = {
  subjectName: string;
  points: SubjectTrendPoint[];
  summary: SubjectTrendSummary;
  cohortAverageLabel: string | null;
};

const MOCK_LABELS: string[] = TEST_SCORE_SUBJECTS.map((subject) => subject.label);
const REGULAR_SUBJECT_NAMES = getAllRegularExamSubjectNames();

/** 科目別推移の科目選択（表示順固定） */
export const SUBJECT_TREND_OPTION_ORDER = [
  "医療概論",
  "衛生学・公衆衛生学",
  "関係法規",
  "解剖学",
  "生理学",
  "病理学概論",
  "臨床医学総論",
  "臨床医学各論",
  "臨床医学各論（総合）",
  "リハビリテーション医学",
  "東洋医学概論",
  "経絡経穴概論",
  "東洋医学臨床論",
  "東洋医学臨床論（総合）",
  "はり理論",
  "きゅう理論",
] as const;

export type SubjectTrendOptionName = (typeof SUBJECT_TREND_OPTION_ORDER)[number];

/** 表示名と異なる模擬試験ラベル（病理学概論 ⇔ 病理学 など） */
const SUBJECT_TREND_MOCK_LABEL_ALIASES: Partial<Record<SubjectTrendOptionName, string>> = {
  病理学概論: "病理学",
};

export function stripRegularSubjectSuffix(subjectName: string) {
  return subjectName.replace(/[①②③]+$/, "").trim();
}

/** 科目別推移の科目選択肢（表示順固定） */
export function getGroupedSubjectTrendOptions(): SubjectTrendOptionName[] {
  return [...SUBJECT_TREND_OPTION_ORDER];
}

/** @deprecated use getGroupedSubjectTrendOptions */
export function getAllSubjectTrendSubjectOptions() {
  return getGroupedSubjectTrendOptions();
}

/** 選択科目（グループ名）に紐づく定期試験の subject_name 一覧 */
export function resolveRegularSubjectsForTrend(groupName: string) {
  if (groupName === ACUPUNCTURE_THEORY_LABEL || groupName === MOXIBUSTION_THEORY_LABEL) {
    const column =
      groupName === ACUPUNCTURE_THEORY_LABEL ? "acupuncture_theory" : "moxibustion_theory";
    return REGULAR_SUBJECT_NAMES.filter((name) =>
      REGULAR_EXAM_TREND_FANOUT[name]?.includes(column),
    );
  }

  return REGULAR_SUBJECT_NAMES.filter((name) => {
    const base = stripRegularSubjectSuffix(name);
    return base === groupName || name === groupName;
  });
}

/** 選択科目（グループ名）に紐づく模擬試験の科目ラベル一覧 */
export function resolveMockLabelsForTrend(groupName: string): string[] {
  const alias = SUBJECT_TREND_MOCK_LABEL_ALIASES[groupName as SubjectTrendOptionName];
  if (alias) {
    return [alias];
  }

  if (MOCK_LABELS.includes(groupName)) {
    return [groupName];
  }

  const matched = TEST_SCORE_SUBJECTS.find((subject) => subject.label === groupName);
  if (matched) {
    return [matched.label];
  }

  return [];
}

/** 左（古い）→ 右（新しい）の並び用タイムスタンプ */
export function getSubjectTrendSortTimestamp(
  point: SubjectTrendPoint,
  allPoints: SubjectTrendPoint[] = [],
) {
  if (point.examDateIso) {
    const parsed = Date.parse(point.examDateIso);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const datedTimestamps = allPoints
    .map((item) => (item.examDateIso ? Date.parse(item.examDateIso) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (datedTimestamps.length > 0) {
    const earliestDated = Math.min(...datedTimestamps);
    const monthOffset = Math.max(point.sortOrder, 1);
    return earliestDated - (10 - monthOffset) * 30 * 86_400_000;
  }

  return point.sortOrder * 86_400_000;
}

export function sortSubjectTrendPoints(points: SubjectTrendPoint[]) {
  return [...points].sort((a, b) => {
    const timestampA = getSubjectTrendSortTimestamp(a, points);
    const timestampB = getSubjectTrendSortTimestamp(b, points);
    if (timestampA !== timestampB) {
      return timestampA - timestampB;
    }
    if (a.sourceType !== b.sourceType) {
      return a.sourceType === "regular" ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

export function formatSubjectTrendDateLabel(examDateIso: string | null | undefined) {
  if (!examDateIso?.trim()) {
    return null;
  }
  return formatExamTestDate(examDateIso.trim());
}

export function buildSubjectTrendSummary(
  points: SubjectTrendPoint[],
  cohortInfo?: {
    cohortKey: string | null;
    cohortLabel: string | null;
    cohortMissing: boolean;
  },
): SubjectTrendSummary {
  const takenPoints = points.filter((point) => !point.notTaken && point.chartValue !== null);
  const latest = takenPoints.at(-1) ?? null;
  const previous = takenPoints.length > 1 ? (takenPoints.at(-2) ?? null) : null;

  const latestValue = latest?.chartValue ?? null;
  const delta =
    latestValue !== null && previous?.chartValue !== null && previous?.chartValue !== undefined
      ? latestValue - previous.chartValue
      : null;

  const deltaDisplay =
    delta === null ? "—" : delta > 0 ? `+${delta}` : `${delta}`;

  const hasUndatedRegularExams = takenPoints.some(
    (point) => point.sourceType === "regular" && !point.examDateIso,
  );

  return {
    latestValue,
    latestDisplay: latest ? latest.displayValue : "—",
    delta,
    deltaDisplay,
    dataPointCount: takenPoints.length,
    hasUndatedRegularExams,
    cohortKey: cohortInfo?.cohortKey ?? null,
    cohortLabel: cohortInfo?.cohortLabel ?? null,
    cohortMissing: cohortInfo?.cohortMissing ?? false,
  };
}

export function roundSubjectTrendAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function getSubjectTrendCohortLookupKey(point: SubjectTrendPoint): string {
  if (point.sourceType === "regular") {
    return point.sessionKey;
  }

  if (!point.sessionKey.startsWith("mock:")) {
    return point.sessionKey;
  }

  const rest = point.sessionKey.slice("mock:".length);
  const subjectSeparator = rest.lastIndexOf(":");
  if (subjectSeparator === -1) {
    return point.sessionKey;
  }

  const subjectName = rest.slice(subjectSeparator + 1);
  const sessionPart = rest.slice(0, subjectSeparator);
  const indexSeparator = sessionPart.indexOf(":");
  const testName =
    indexSeparator === -1 ? sessionPart : sessionPart.slice(indexSeparator + 1);

  return `mock:${testName}:${subjectName}`;
}
