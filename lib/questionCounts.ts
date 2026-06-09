import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";

export type QuestionCountRow = {
  test_name: string;
  test_date: string | null;
} & Partial<Record<TestScoreSubjectColumn, number | string | null>>;

export const QUESTION_COUNTS_SELECT = [
  "test_name",
  "test_date",
  ...TEST_SCORE_SUBJECTS.map((subject) => subject.column),
].join(", ");

function parseQuestionCountValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildQuestionCountMap(rows: QuestionCountRow[]) {
  const map = new Map<string, QuestionCountRow>();

  rows.forEach((row) => {
    const key = row.test_name.trim();
    if (key) {
      map.set(key, row);
    }
  });

  return map;
}

export function getQuestionCountForSubject(
  row: QuestionCountRow | null | undefined,
  column: TestScoreSubjectColumn,
) {
  if (!row) {
    return null;
  }

  return parseQuestionCountValue(row[column]);
}

export function formatExamTestDate(testDate: string | null | undefined) {
  if (!testDate) {
    return null;
  }

  const trimmed = testDate.trim();
  if (!trimmed) {
    return null;
  }

  const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) {
    return trimmed;
  }

  return `${year}年${month}月${day}日`;
}
