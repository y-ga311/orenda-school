import {
  buildExamSectionTitle,
  calculateAverageScore,
  sortExamSessionsByDate,
  type ExamScoreRow,
  type ExamType,
} from "@/lib/examResults";
import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import {
  formatExamTestDate,
  getQuestionCountForSubject,
  type QuestionCountRow,
} from "@/lib/questionCounts";

export { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";

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

export function parseTestScoreSessionIndex(sessionKey: string) {
  const separatorIndex = sessionKey.indexOf(":");
  if (separatorIndex === -1) {
    return -1;
  }

  const index = Number(sessionKey.slice(0, separatorIndex));
  return Number.isFinite(index) ? index : -1;
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

export function buildScoresFromTestScoreRow(
  row: TestScoreRow,
  questionCountRow: QuestionCountRow | null = null,
): ExamScoreRow[] {
  return TEST_SCORE_SUBJECTS.map(({ column, label }) => {
    const correctCount = parseScoreValue(row[column]);
    const questionCount = getQuestionCountForSubject(questionCountRow, column);
    const notTaken =
      correctCount === null ||
      questionCount === null ||
      questionCount === undefined ||
      questionCount <= 0;

    if (notTaken) {
      return {
        subjectName: label,
        score: null,
        correctCount,
        questionCount,
        notTaken: true,
      };
    }

    return {
      subjectName: label,
      score: Math.round((correctCount / questionCount) * 100),
      correctCount,
      questionCount,
      notTaken: false,
    };
  });
}

export function buildTestScoreExamResponse(
  examType: "mock" | "graduation",
  rows: TestScoreRow[],
  questionCountByTestName: Map<string, QuestionCountRow>,
  sessionKey: string | null,
) {
  const sessions = sortExamSessionsByDate(
    rows.map((row, index) => {
      const sessionLabel = row.test_name.trim();
      const key = buildTestScoreSessionKey(sessionLabel, index);
      const questionCountRow = questionCountByTestName.get(sessionLabel) ?? null;
      const testDateIso = questionCountRow?.test_date?.trim() || null;
      const formattedDate = formatExamTestDate(testDateIso);

      return {
        sessionKey: key,
        sessionLabel,
        sectionTitle: formattedDate
          ? `${buildExamSectionTitle(examType, sessionLabel)}（${formattedDate}）`
          : buildExamSectionTitle(examType, sessionLabel),
        testDate: formattedDate,
        testDateIso,
      };
    }),
  );

  const selectedSession =
    sessions.find((session) => session.sessionKey === sessionKey) ?? sessions[0] ?? null;

  const selectedRowIndex = selectedSession
    ? parseTestScoreSessionIndex(selectedSession.sessionKey)
    : -1;

  const selectedRow = selectedRowIndex >= 0 ? rows[selectedRowIndex] : null;
  const selectedQuestionCountRow = selectedRow
    ? (questionCountByTestName.get(selectedRow.test_name.trim()) ?? null)
    : null;

  const selectedScores = selectedRow
    ? buildScoresFromTestScoreRow(selectedRow, selectedQuestionCountRow)
    : [];

  return {
    examType,
    sessions,
    selectedSessionKey: selectedSession?.sessionKey ?? null,
    sectionTitle: selectedSession?.sectionTitle ?? null,
    testDate: selectedSession?.testDate ?? null,
    scores: selectedScores,
    averageScore: calculateAverageScore(selectedScores),
    tableMissing: false,
    questionCountsMissing: false,
  };
}

export function getTestNameKeyword(examType: "mock" | "graduation") {
  return TEST_NAME_KEYWORD[examType];
}
