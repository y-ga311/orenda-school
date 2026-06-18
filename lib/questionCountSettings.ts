import {
  TEST_SCORE_SUBJECTS,
  type TestScoreSubjectColumn,
} from "@/lib/examSubjects";
import type { QuestionCountRow } from "@/lib/questionCounts";
import { formatExamTestDate } from "@/lib/questionCounts";

export type ExamQuestionType = "mock" | "graduation" | "other";

export type QuestionCountFilter = "all" | ExamQuestionType;

export const QUESTION_COUNT_GROUPS: {
  key: string;
  label: string;
  tone: "blue" | "green" | "purple" | "orange";
  columns: TestScoreSubjectColumn[];
}[] = [
  {
    key: "basic",
    label: "基礎医学系",
    tone: "blue",
    columns: [
      "medical_overview",
      "public_health",
      "related_laws",
      "anatomy",
      "physiology",
      "pathology",
    ],
  },
  {
    key: "clinical",
    label: "臨床医学系",
    tone: "green",
    columns: [
      "clinical_medicine_overview",
      "clinical_medicine_detail",
      "clinical_medicine_detail_total",
      "rehabilitation",
    ],
  },
  {
    key: "oriental",
    label: "東洋医学系",
    tone: "purple",
    columns: [
      "oriental_medicine_overview",
      "meridian_points",
      "oriental_medicine_clinical",
      "oriental_medicine_clinical_general",
    ],
  },
  {
    key: "specialized",
    label: "専門系",
    tone: "orange",
    columns: ["acupuncture_theory", "moxibustion_theory"],
  },
];

const SUBJECT_LABEL_MAP = new Map(
  TEST_SCORE_SUBJECTS.map((subject) => [subject.column, subject.label]),
);

export function getSubjectLabel(column: TestScoreSubjectColumn) {
  return SUBJECT_LABEL_MAP.get(column) ?? column;
}

export function getExamTypeFromTestName(testName: string): ExamQuestionType {
  const name = testName.trim();
  if (name.includes("模擬試験")) {
    return "mock";
  }
  if (name.includes("卒業試験")) {
    return "graduation";
  }
  return "other";
}

export function getExamTypeLabel(examType: ExamQuestionType) {
  if (examType === "mock") {
    return "模擬";
  }
  if (examType === "graduation") {
    return "卒業";
  }
  return "その他";
}

function parseCountValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateQuestionCountTotal(
  row: Partial<Record<TestScoreSubjectColumn, number | string | null>>,
) {
  return TEST_SCORE_SUBJECTS.reduce((sum, { column }) => {
    const value = parseCountValue(row[column]);
    return sum + (value ?? 0);
  }, 0);
}

export function formatQuestionCountTotal(total: number) {
  return `${total}問`;
}

export type QuestionCountListItem = {
  id: number | string | null;
  testName: string;
  testDate: string | null;
  testDateLabel: string | null;
  examType: ExamQuestionType;
  totalQuestions: number;
};

export function toQuestionCountListItem(row: QuestionCountRow & { id?: number | string | null }) {
  const testName = row.test_name.trim();
  return {
    id: row.id ?? null,
    testName,
    testDate: row.test_date?.trim() || null,
    testDateLabel: formatExamTestDate(row.test_date),
    examType: getExamTypeFromTestName(testName),
    totalQuestions: calculateQuestionCountTotal(row),
  };
}

export function buildQuestionCountPayload(
  testName: string,
  testDate: string,
  counts: Partial<Record<TestScoreSubjectColumn, number | null>>,
) {
  const payload: Record<string, string | number | null> = {
    test_name: testName.trim(),
    test_date: testDate.trim() || null,
  };

  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    payload[column] = counts[column] ?? null;
  });

  return payload;
}

export function rowToSubjectCounts(row: QuestionCountRow) {
  const counts: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    counts[column] = parseCountValue(row[column]);
  });
  return counts;
}

export function parseSubjectCountsFromForm(
  values: Partial<Record<TestScoreSubjectColumn, string>>,
) {
  const counts: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    const raw = values[column]?.trim() ?? "";
    if (!raw) {
      counts[column] = null;
      return;
    }
    const parsed = Number(raw);
    counts[column] = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });
  return counts;
}

export function toDateInputValue(testDate: string | null | undefined) {
  if (!testDate) {
    return "";
  }

  const trimmed = testDate.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
}
