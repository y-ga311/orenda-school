export type ExamType = "regular" | "mock" | "graduation";

export type ExamScoreRow = {
  subjectName: string;
  score: number | null;
  correctCount?: number | null;
  questionCount?: number | null;
  /** 未実施科目（NULL または問題数未設定） */
  notTaken?: boolean;
};

export type ExamSessionOption = {
  sessionKey: string;
  sessionLabel: string;
  sectionTitle: string;
  testDate?: string | null;
  /** 並び替え用 ISO 日付（レスポンスに含めても可） */
  testDateIso?: string | null;
};

function parseIsoDateTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
  const parsed = Date.parse(datePart);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJapaneseDateTimestamp(value: string) {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = Date.parse(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

export function getExamSessionSortTimestamp(session: ExamSessionOption) {
  const isoTimestamp = parseIsoDateTimestamp(session.testDateIso);
  if (isoTimestamp !== null) {
    return isoTimestamp;
  }

  const formattedTimestamp = parseJapaneseDateTimestamp(session.testDate ?? "");
  if (formattedTimestamp !== null) {
    return formattedTimestamp;
  }

  const keyTimestamp = parseIsoDateTimestamp(session.sessionKey);
  if (keyTimestamp !== null) {
    return keyTimestamp;
  }

  return parseJapaneseDateTimestamp(session.sessionLabel);
}

/** 試験日の古い順（過去→未来）。日付不明は末尾。 */
export function sortExamSessionsByDate<T extends ExamSessionOption>(sessions: T[]) {
  return [...sessions].sort((a, b) => {
    const aTimestamp = getExamSessionSortTimestamp(a);
    const bTimestamp = getExamSessionSortTimestamp(b);

    if (aTimestamp !== null && bTimestamp !== null) {
      if (aTimestamp !== bTimestamp) {
        return aTimestamp - bTimestamp;
      }
      return a.sessionLabel.localeCompare(b.sessionLabel, "ja");
    }

    if (aTimestamp !== null) {
      return -1;
    }
    if (bTimestamp !== null) {
      return 1;
    }

    return a.sessionLabel.localeCompare(b.sessionLabel, "ja");
  });
}

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
  const takenScores = scores.filter(
    (row) => !row.notTaken && row.score !== null && row.score !== undefined,
  );

  if (takenScores.length === 0) {
    return null;
  }

  const total = takenScores.reduce((sum, row) => sum + (row.score ?? 0), 0);
  return Math.round(total / takenScores.length);
}

export function isTakenExamScore(row: ExamScoreRow) {
  return !row.notTaken && row.score !== null && row.score !== undefined;
}

export const ACUPUNCTURE_THEORY_LABEL = "はり理論";
export const MOXIBUSTION_THEORY_LABEL = "きゅう理論";

export type ExamTrackTotal = {
  label: "はり師" | "きゅう師";
  correctTotal: number;
  questionTotal: number;
  percent: number | null;
};

function isCountableExamSubject(row: ExamScoreRow) {
  return (
    row.questionCount !== null &&
    row.questionCount !== undefined &&
    row.questionCount > 0
  );
}

/** はり師＝共通科目＋はり理論、きゅう師＝共通科目＋きゅう理論（未実施は0点として集計） */
export function calculateExamTrackTotals(scores: ExamScoreRow[]) {
  let commonCorrect = 0;
  let commonQuestions = 0;
  let acupunctureCorrect = 0;
  let acupunctureQuestions = 0;
  let moxibustionCorrect = 0;
  let moxibustionQuestions = 0;

  for (const row of scores) {
    if (!isCountableExamSubject(row)) {
      continue;
    }

    const correct = row.correctCount ?? 0;
    const questions = row.questionCount ?? 0;

    if (row.subjectName === ACUPUNCTURE_THEORY_LABEL) {
      acupunctureCorrect = correct;
      acupunctureQuestions = questions;
      continue;
    }

    if (row.subjectName === MOXIBUSTION_THEORY_LABEL) {
      moxibustionCorrect = correct;
      moxibustionQuestions = questions;
      continue;
    }

    commonCorrect += correct;
    commonQuestions += questions;
  }

  const acupuncturistQuestions = commonQuestions + acupunctureQuestions;
  const moxibustionistQuestions = commonQuestions + moxibustionQuestions;

  if (acupuncturistQuestions <= 0 && moxibustionistQuestions <= 0) {
    return null;
  }

  const acupuncturistCorrect = commonCorrect + acupunctureCorrect;
  const moxibustionistCorrect = commonCorrect + moxibustionCorrect;

  return {
    acupuncturist: {
      label: "はり師" as const,
      correctTotal: acupuncturistCorrect,
      questionTotal: acupuncturistQuestions,
      percent:
        acupuncturistQuestions > 0
          ? Math.round((acupuncturistCorrect / acupuncturistQuestions) * 100)
          : null,
    },
    moxibustionist: {
      label: "きゅう師" as const,
      correctTotal: moxibustionistCorrect,
      questionTotal: moxibustionistQuestions,
      percent:
        moxibustionistQuestions > 0
          ? Math.round((moxibustionistCorrect / moxibustionistQuestions) * 100)
          : null,
    },
  };
}

export function getTrackTotalTone(percent: number | null) {
  if (percent === null) {
    return getNotTakenScoreTone();
  }

  if (percent >= 60) {
    return {
      boxBackground: "#dcfce7",
      boxBorder: "#bbf7d0",
      textColor: "#166534",
    };
  }

  return {
    boxBackground: "#fee2e2",
    boxBorder: "#fecaca",
    textColor: "#b91c1c",
  };
}

export function formatTrackTotalDisplay(total: ExamTrackTotal) {
  if (total.percent === null || total.questionTotal <= 0) {
    return "-";
  }

  return `${total.correctTotal}/${total.questionTotal}（${total.percent}%）`;
}

export function filterRadarChartScores(
  scores: ExamScoreRow[],
  { requireQuestionCount = false }: { requireQuestionCount?: boolean } = {},
) {
  if (!requireQuestionCount) {
    return scores;
  }

  return scores.filter(
    (row) =>
      isTakenExamScore(row) &&
      row.questionCount !== null &&
      row.questionCount !== undefined &&
      row.questionCount > 0,
  );
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

/** 模擬・卒業試験の正解率（%）用 */
export function getPercentScoreTone(percent: number) {
  if (percent >= 60) {
    return {
      boxBackground: "#dcfce7",
      boxBorder: "#bbf7d0",
      textColor: "#166534",
    };
  }

  if (percent > 40) {
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

export function getNotTakenScoreTone() {
  return {
    boxBackground: "#f8fafc",
    boxBorder: "#e2e8f0",
    textColor: "#64748b",
  };
}

export function formatScore(score: number) {
  return Number.isInteger(score) ? `${score}点` : `${score.toFixed(1)}点`;
}

export function formatScoreDetail(row: ExamScoreRow) {
  if (row.score === null) {
    return "-";
  }

  return formatScore(row.score);
}

/** 模擬・卒業試験: 正解数/問題数（正解率%） */
export function formatTestScoreDetail(row: ExamScoreRow) {
  if (
    row.notTaken ||
    row.score === null ||
    row.correctCount === null ||
    row.correctCount === undefined ||
    row.questionCount === null ||
    row.questionCount === undefined ||
    row.questionCount <= 0
  ) {
    return "-";
  }

  return `${row.correctCount}/${row.questionCount}（${row.score}%）`;
}
