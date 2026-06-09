export type ExamType = "regular" | "mock" | "graduation";

export type ExamScoreRow = {
  subjectName: string;
  score: number;
};

export type ExamSessionOption = {
  sessionKey: string;
  sessionLabel: string;
  sectionTitle: string;
};

export const EXAM_TYPE_CONFIG: Record<
  ExamType,
  { label: string; path: string; sectionSuffix: string | null }
> = {
  regular: {
    label: "定期試験",
    path: "/regular-exam",
    sectionSuffix: "定期試験成績",
  },
  mock: {
    label: "模擬試験",
    path: "/mock-exam",
    sectionSuffix: null,
  },
  graduation: {
    label: "卒業試験",
    path: "/graduation-exam",
    sectionSuffix: null,
  },
};

export function buildExamSectionTitle(examType: ExamType, sessionLabel: string) {
  const suffix = EXAM_TYPE_CONFIG[examType].sectionSuffix;
  if (suffix) {
    return `${sessionLabel}　${suffix}`;
  }
  return sessionLabel;
}

export function calculateAverageScore(scores: ExamScoreRow[]) {
  if (scores.length === 0) {
    return null;
  }

  const total = scores.reduce((sum, row) => sum + row.score, 0);
  return Math.round(total / scores.length);
}

export function getScoreTone(score: number) {
  if (score >= 80) {
    return {
      boxBackground: "#dcfce7",
      boxBorder: "#bbf7d0",
      textColor: "#166534",
    };
  }

  if (score >= 60) {
    return {
      boxBackground: "#fef3c7",
      boxBorder: "#fde68a",
      textColor: "#b45309",
    };
  }

  return {
    boxBackground: "#fee2e2",
    boxBorder: "#fecaca",
    textColor: "#b91c1c",
  };
}

export function formatScore(score: number) {
  return Number.isInteger(score) ? `${score}点` : `${score.toFixed(1)}点`;
}
