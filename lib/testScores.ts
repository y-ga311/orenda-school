import {
  buildExamSectionTitle,
  calculateAverageScore,
  type ExamScoreRow,
  type ExamType,
} from "@/lib/examResults";

export const TEST_SCORE_SUBJECTS = [
  { column: "medical_overview", label: "医療概論" },
  { column: "public_health", label: "衛生学・公衆衛生学" },
  { column: "related_laws", label: "関係法規" },
  { column: "anatomy", label: "解剖学" },
  { column: "physiology", label: "生理学" },
  { column: "pathology", label: "病理学" },
  { column: "clinical_medicine_overview", label: "臨床医学総論" },
  { column: "clinical_medicine_detail", label: "臨床医学各論" },
  { column: "clinical_medicine_detail_total", label: "臨床医学各論（総合）" },
  { column: "rehabilitation", label: "リハビリテーション医学" },
  { column: "oriental_medicine_overview", label: "東洋医学概論" },
  { column: "meridian_points", label: "経絡経穴概論" },
  { column: "oriental_medicine_clinical", label: "東洋医学臨床論" },
  { column: "oriental_medicine_clinical_general", label: "東洋医学臨床論（総合）" },
  { column: "acupuncture_theory", label: "はり理論" },
  { column: "moxibustion_theory", label: "きゅう理論" },
] as const;

export type TestScoreSubjectColumn = (typeof TEST_SCORE_SUBJECTS)[number]["column"];

export type TestScoreRow = {
  student_id: number | string;
  test_name: string;
} & Partial<Record<TestScoreSubjectColumn, number | string | null>>;

export const TEST_SCORES_SELECT = [
  "student_id",
  "test_name",
  ...TEST_SCORE_SUBJECTS.map((subject) => subject.column),
].join(", ");

const TEST_NAME_KEYWORD: Record<"mock" | "graduation", string> = {
  mock: "模擬試験",
  graduation: "卒業試験",
};

export function usesTestScoresTable(examType: ExamType) {
  return examType === "mock" || examType === "graduation";
}

export function buildTestScoreSessionKey(testName: string, index: number) {
  return `${index}:${testName}`;
}

export function parseTestScoreSessionKey(sessionKey: string) {
  const separatorIndex = sessionKey.indexOf(":");
  if (separatorIndex === -1) {
    return sessionKey;
  }
  return sessionKey.slice(separatorIndex + 1);
}

function parseScoreValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildScoresFromTestScoreRow(row: TestScoreRow): ExamScoreRow[] {
  return TEST_SCORE_SUBJECTS.flatMap(({ column, label }) => {
    const score = parseScoreValue(row[column]);
    if (score === null) {
      return [];
    }

    return [{ subjectName: label, score }];
  });
}

export function buildTestScoreExamResponse(
  examType: "mock" | "graduation",
  rows: TestScoreRow[],
  sessionKey: string | null,
) {
  const sessions = rows.map((row, index) => {
    const sessionLabel = row.test_name.trim();
    const key = buildTestScoreSessionKey(sessionLabel, index);

    return {
      sessionKey: key,
      sessionLabel,
      sectionTitle: buildExamSectionTitle(examType, sessionLabel),
    };
  });

  const selectedSession =
    sessions.find((session) => session.sessionKey === sessionKey) ?? sessions[0] ?? null;

  const selectedRowIndex = selectedSession
    ? sessions.findIndex((session) => session.sessionKey === selectedSession.sessionKey)
    : -1;

  const selectedScores =
    selectedRowIndex >= 0 ? buildScoresFromTestScoreRow(rows[selectedRowIndex]) : [];

  return {
    examType,
    sessions,
    selectedSessionKey: selectedSession?.sessionKey ?? null,
    sectionTitle: selectedSession?.sectionTitle ?? null,
    scores: selectedScores,
    averageScore: calculateAverageScore(selectedScores),
    tableMissing: false,
  };
}

export function getTestNameKeyword(examType: "mock" | "graduation") {
  return TEST_NAME_KEYWORD[examType];
}
