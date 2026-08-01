import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import { formatExamTestDate } from "@/lib/questionCounts";
import { getExamTypeFromTestName } from "@/lib/questionCountSettings";
import { parseCsvText } from "@/lib/newStudentRegistration";
import { normalizeStudentIdentifier } from "@/lib/studentIdentifier";
import {
  getRegularExamTerm,
  parseRegularExamPointScore,
  REGULAR_EXAM_TERMS,
  REGULAR_EXAM_MAX_SCORE,
} from "@/lib/regularExam";

export type ExamRegistrationSource = "test_scores" | "student_exam_results";

export type ExamRegistrationExamType = "mock" | "graduation" | "regular";

export type ExamRegistrationListItem = {
  key: string;
  source: ExamRegistrationSource;
  testName: string;
  testDate: string | null;
  testDateLabel: string | null;
  examType: ExamRegistrationExamType;
  examTypeLabel: string;
  registeredCount: number;
  sessionKey?: string;
};

export type ExamRegistrationScoreRow = {
  recordId?: number | string | null;
  studentId?: number | null;
  gakuseiId: string;
  studentName: string;
  scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
  subjectScores?: Record<string, number | null>;
  totalCorrect: number | null;
  correctRate: number | null;
};

export type ExamRegistrationDetail = {
  key: string;
  source: ExamRegistrationSource;
  testName: string;
  testDate: string | null;
  testDateLabel: string | null;
  examType: ExamRegistrationExamType;
  examTypeLabel: string;
  sessionKey?: string;
  questionCountsMissing: boolean;
  subjects: { column?: TestScoreSubjectColumn; label: string }[];
  rows: ExamRegistrationScoreRow[];
};

export type ExamRegistrationRowError = {
  rowNumber: number;
  message: string;
};

export const EXAM_RESULT_CSV_HEADERS = [
  "学籍番号",
  ...TEST_SCORE_SUBJECTS.map((subject) => subject.label),
] as const;

export const EXAM_RESULT_TEMPLATE_FILENAME = "exam-result-template.csv";

export const MAX_EXAM_RESULT_IMPORT_ROWS = 500;

const CSV_UTF8_BOM = "\uFEFF";

const TEMPLATE_SAMPLE_ROW = [
  "20250001",
  "8",
  "7",
  "6",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
] as const;

function normalizeCsvHeader(value: string) {
  return value.trim().replace(/\s+/g, "");
}

const STUDENT_IDENTIFIER_HEADERS = new Set([
  "学籍番号",
  "student_id",
  "gakusei_id",
  "学生ID",
  "学生id",
  "ID",
  "id",
]);

function findStudentIdentifierColumnIndex(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  return normalizedHeaders.findIndex((header) => STUDENT_IDENTIFIER_HEADERS.has(header));
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function getExamRegistrationTypeLabel(examType: ExamRegistrationExamType) {
  if (examType === "mock") {
    return "模擬";
  }
  if (examType === "graduation") {
    return "卒業";
  }
  return "定期";
}

export function inferExamRegistrationType(
  testName: string,
  examType?: string | null,
): ExamRegistrationExamType {
  if (examType === "regular" || examType === "mock" || examType === "graduation") {
    return examType;
  }

  const name = testName.trim();
  if (name.includes("定期試験") || name.includes("定期")) {
    return "regular";
  }

  const fromName = getExamTypeFromTestName(name);
  if (fromName === "mock") {
    return "mock";
  }
  if (fromName === "graduation") {
    return "graduation";
  }

  return "regular";
}

export function buildExamResultListKey(
  source: ExamRegistrationSource,
  testName: string,
  sessionKey?: string | null,
  examType?: ExamRegistrationExamType | null,
) {
  if (source === "student_exam_results") {
    return `ser:${examType ?? "regular"}:${sessionKey ?? testName}:${encodeURIComponent(testName)}`;
  }
  return `ts:${encodeURIComponent(testName)}`;
}

export function parseExamResultListKey(key: string):
  | { source: "test_scores"; testName: string }
  | { source: "student_exam_results"; examType: ExamRegistrationExamType; sessionKey: string; testName: string }
  | null {
  if (key.startsWith("ts:")) {
    const testName = decodeURIComponent(key.slice(3)).trim();
    return testName ? { source: "test_scores", testName } : null;
  }

  if (key.startsWith("ser:")) {
    const parts = key.slice(4).split(":");
    if (parts.length < 3) {
      return null;
    }
    const [examTypeRaw, sessionKey, ...nameParts] = parts;
    const testName = decodeURIComponent(nameParts.join(":")).trim();
    if (!sessionKey || !testName) {
      return null;
    }
    return {
      source: "student_exam_results",
      examType: inferExamRegistrationType("", examTypeRaw),
      sessionKey,
      testName,
    };
  }

  return null;
}

export function parseScoreValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseSubjectScoresFromForm(
  values: Partial<Record<TestScoreSubjectColumn, string>>,
) {
  const scores: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    scores[column] = parseScoreValue(values[column] ?? "");
  });
  return scores;
}

export function calculateTotalCorrect(
  scores: Partial<Record<TestScoreSubjectColumn, number | null>>,
) {
  return TEST_SCORE_SUBJECTS.reduce((sum, { column }) => sum + (scores[column] ?? 0), 0);
}

export function calculateCorrectRate(
  scores: Partial<Record<TestScoreSubjectColumn, number | null>>,
  questionCounts: Partial<Record<TestScoreSubjectColumn, number | null>> | null,
) {
  if (!questionCounts) {
    return null;
  }

  let correct = 0;
  let totalQuestions = 0;

  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    const questionCount = questionCounts[column];
    if (questionCount === null || questionCount === undefined || questionCount <= 0) {
      return;
    }
    totalQuestions += questionCount;
    correct += scores[column] ?? 0;
  });

  if (totalQuestions <= 0) {
    return null;
  }

  return Math.round((correct / totalQuestions) * 100);
}

export function formatCorrectRate(rate: number | null | undefined) {
  if (rate === null || rate === undefined) {
    return "—";
  }
  return `${rate}%`;
}

export function buildExamResultCsvTemplate() {
  const lines = [
    EXAM_RESULT_CSV_HEADERS.join(","),
    [...TEMPLATE_SAMPLE_ROW].map(escapeCsvCell).join(","),
  ];
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function downloadExamResultTemplate() {
  const csv = buildExamResultCsvTemplate();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXAM_RESULT_TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isRowEmpty(cells: string[]) {
  return cells.every((cell) => !cell.trim());
}

function isTemplateSampleRow(cells: string[]) {
  return TEMPLATE_SAMPLE_ROW.every((value, index) => cells[index]?.trim() === value);
}

function buildColumnIndexes(headers: string[]):
  | { ok: true; studentIdIndex: number; subjectIndexes: Record<TestScoreSubjectColumn, number> }
  | { ok: false; message: string } {
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  const studentIdIndex = findStudentIdentifierColumnIndex(headers);

  if (studentIdIndex === -1) {
    return {
      ok: false,
      message: "CSVのヘッダーに「学籍番号」列がありません。",
    };
  }

  const subjectIndexes = {} as Record<TestScoreSubjectColumn, number>;
  const missingSubjects: string[] = [];

  TEST_SCORE_SUBJECTS.forEach(({ column, label }) => {
    const index = normalizedHeaders.indexOf(normalizeCsvHeader(label));
    if (index === -1) {
      missingSubjects.push(label);
      return;
    }
    subjectIndexes[column] = index;
  });

  if (missingSubjects.length > 0) {
    return {
      ok: false,
      message: `CSVのヘッダーに次の科目列がありません: ${missingSubjects.join("、")}`,
    };
  }

  return { ok: true, studentIdIndex, subjectIndexes };
}

export type ParseExamResultCsvResult =
  | {
      ok: true;
      rows: Array<{
        gakuseiId: string;
        scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
      }>;
      rowNumbers: number[];
      skippedSampleRows: number;
      skippedEmptyRows: number;
    }
  | {
      ok: false;
      message: string;
      rowErrors?: ExamRegistrationRowError[];
    };

export function parseExamResultCsv(text: string): ParseExamResultCsvResult {
  const parsedRows = parseCsvText(text).filter((row) => !isRowEmpty(row));

  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const headerRow = parsedRows[0].map((cell) => cell.trim());
  const columnResult = buildColumnIndexes(headerRow);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rowErrors: ExamRegistrationRowError[] = [];
  const validRows: Array<{
    gakuseiId: string;
    scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
  }> = [];
  const rowNumbers: number[] = [];
  let skippedSampleRows = 0;
  let skippedEmptyRows = 0;

  parsedRows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;

    if (isRowEmpty(cells)) {
      skippedEmptyRows += 1;
      return;
    }

    if (isTemplateSampleRow(cells)) {
      skippedSampleRows += 1;
      return;
    }

    const gakuseiId = normalizeStudentIdentifier(cells[columnResult.studentIdIndex] ?? "");
    if (!gakuseiId) {
      rowErrors.push({ rowNumber, message: "学籍番号を入力してください。" });
      return;
    }

    const scores: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
    let hasInvalidScore = false;

    TEST_SCORE_SUBJECTS.forEach(({ column }) => {
      const cellValue = cells[columnResult.subjectIndexes[column]] ?? "";
      const parsed = parseScoreValue(cellValue);
      if (cellValue.trim() && parsed === null) {
        hasInvalidScore = true;
      }
      scores[column] = parsed;
    });

    if (hasInvalidScore) {
      rowErrors.push({ rowNumber, message: "得点は0以上の数値で入力してください。" });
      return;
    }

    validRows.push({ gakuseiId, scores });
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return { ok: false, message: "CSVの入力内容に誤りがあります。", rowErrors };
  }

  if (validRows.length === 0) {
    return {
      ok: false,
      message: "登録するデータ行がありません。記入例行を削除するか、得点データを入力してください。",
    };
  }

  if (validRows.length > MAX_EXAM_RESULT_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度に登録できるのは${MAX_EXAM_RESULT_IMPORT_ROWS}件までです。`,
    };
  }

  const duplicateGakuseiIds = validRows
    .map((row) => row.gakuseiId)
    .filter((gakuseiId, index, all) => all.indexOf(gakuseiId) !== index);
  if (duplicateGakuseiIds.length > 0) {
    return {
      ok: false,
      message: `学籍番号が重複しています: ${[...new Set(duplicateGakuseiIds)].join("、")}`,
    };
  }

  return {
    ok: true,
    rows: validRows,
    rowNumbers,
    skippedSampleRows,
    skippedEmptyRows,
  };
}

export function validateImportMeta(testName: string, testDate: string) {
  if (!testName.trim()) {
    return "試験名を入力してください。";
  }
  if (!testDate.trim()) {
    return "実施日を入力してください。";
  }
  return null;
}

export function validateRegularImportMeta(sessionKey: string) {
  if (!sessionKey.trim()) {
    return "学期を選択してください。";
  }
  if (!getRegularExamTerm(sessionKey)) {
    return "選択した学期が不正です。";
  }
  return null;
}

export function buildRegularExamCsvTemplate(sessionKey: string) {
  const term = getRegularExamTerm(sessionKey);
  if (!term) {
    return null;
  }

  const headers = ["学籍番号", ...term.subjects];
  const sampleRow = [
    "20250001",
    ...term.subjects.map((_, index) => String(Math.max(60, 88 - index * 3))),
  ];
  const lines = [headers.join(","), sampleRow.map(escapeCsvCell).join(",")];
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function downloadRegularExamTemplate(sessionKey: string) {
  const csv = buildRegularExamCsvTemplate(sessionKey);
  if (!csv) {
    return;
  }

  const term = getRegularExamTerm(sessionKey);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `regular-exam-${sessionKey}-${term?.sessionLabel.replace(/\//g, "") ?? "template"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ParseRegularExamResultCsvResult =
  | {
      ok: true;
      rows: Array<{
        gakuseiId: string;
        scores: Record<string, number | null>;
      }>;
      rowNumbers: number[];
      skippedSampleRows: number;
      skippedEmptyRows: number;
    }
  | {
      ok: false;
      message: string;
      rowErrors?: ExamRegistrationRowError[];
    };

function buildRegularSubjectIndexes(headers: string[], expectedSubjects: string[]) {
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  const studentIdIndex = findStudentIdentifierColumnIndex(headers);

  if (studentIdIndex === -1) {
    return { ok: false as const, message: "CSVのヘッダーに「学籍番号」列がありません。" };
  }

  const subjectIndexes: Record<string, number> = {};
  const missingSubjects: string[] = [];

  expectedSubjects.forEach((label) => {
    const index = normalizedHeaders.indexOf(normalizeCsvHeader(label));
    if (index === -1) {
      missingSubjects.push(label);
      return;
    }
    subjectIndexes[label] = index;
  });

  if (missingSubjects.length > 0) {
    return {
      ok: false as const,
      message: `CSVのヘッダーに次の科目列がありません: ${missingSubjects.join("、")}`,
    };
  }

  return { ok: true as const, studentIdIndex, subjectIndexes };
}

export function parseRegularExamResultCsv(
  text: string,
  sessionKey: string,
): ParseRegularExamResultCsvResult {
  const term = getRegularExamTerm(sessionKey);
  if (!term) {
    return { ok: false, message: "学期が選択されていません。" };
  }

  const parsedRows = parseCsvText(text).filter((row) => !isRowEmpty(row));
  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const headerRow = parsedRows[0].map((cell) => cell.trim());
  const columnResult = buildRegularSubjectIndexes(headerRow, term.subjects);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rowErrors: ExamRegistrationRowError[] = [];
  const validRows: Array<{
    gakuseiId: string;
    scores: Record<string, number | null>;
  }> = [];
  const rowNumbers: number[] = [];
  let skippedSampleRows = 0;
  let skippedEmptyRows = 0;

  parsedRows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;

    if (isRowEmpty(cells)) {
      skippedEmptyRows += 1;
      return;
    }

    const gakuseiId = normalizeStudentIdentifier(cells[columnResult.studentIdIndex] ?? "");
    if (!gakuseiId) {
      rowErrors.push({ rowNumber, message: "学籍番号を入力してください。" });
      return;
    }

    const scores: Record<string, number | null> = {};
    let hasInvalidScore = false;

    term.subjects.forEach((subjectName) => {
      const cellValue = cells[columnResult.subjectIndexes[subjectName]] ?? "";
      const parsed = parseRegularExamPointScore(cellValue);
      if (cellValue.trim() && parsed === null) {
        hasInvalidScore = true;
      }
      scores[subjectName] = parsed;
    });

    if (hasInvalidScore) {
      rowErrors.push({
        rowNumber,
        message: `得点は0〜${REGULAR_EXAM_MAX_SCORE}の数値で入力してください。`,
      });
      return;
    }

    validRows.push({ gakuseiId, scores });
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return { ok: false, message: "CSVの入力内容に誤りがあります。", rowErrors };
  }

  if (validRows.length === 0) {
    return {
      ok: false,
      message: "登録するデータ行がありません。記入例行を削除するか、得点データを入力してください。",
    };
  }

  if (validRows.length > MAX_EXAM_RESULT_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度に登録できるのは${MAX_EXAM_RESULT_IMPORT_ROWS}件までです。`,
    };
  }

  const duplicateGakuseiIds = validRows
    .map((row) => row.gakuseiId)
    .filter((gakuseiId, index, all) => all.indexOf(gakuseiId) !== index);
  if (duplicateGakuseiIds.length > 0) {
    return {
      ok: false,
      message: `学籍番号が重複しています: ${[...new Set(duplicateGakuseiIds)].join("、")}`,
    };
  }

  return {
    ok: true,
    rows: validRows,
    rowNumbers,
    skippedSampleRows,
    skippedEmptyRows,
  };
}

export function getRegularExamTermOptions() {
  return REGULAR_EXAM_TERMS.map((term) => ({
    sessionKey: term.sessionKey,
    sessionLabel: term.sessionLabel,
  }));
}

export function formatListTestDateLabel(testDate: string | null | undefined) {
  if (!testDate) {
    return null;
  }
  const formatted = formatExamTestDate(testDate);
  if (!formatted) {
    return testDate;
  }
  return formatted.replace(/年/g, "/").replace(/月/g, "/").replace(/日/g, "").replace(/\/$/, "");
}
