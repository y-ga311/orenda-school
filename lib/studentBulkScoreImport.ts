import { parseCsvText } from "@/lib/newStudentRegistration";
import {
  COGNITIVE_SCORE_ITEMS,
  parseIntegerScore,
  parsePretestScoreFormValue,
  type CognitiveScoreKey,
  type CognitiveScores,
} from "@/lib/studentProfile";
import {
  validateBulkFieldValue,
  type StudentBulkGroupKey,
} from "@/lib/studentProfileBulk";

export type StudentBulkScoreImportGroup = Extract<
  StudentBulkGroupKey,
  "cognitive" | "scoreSummary"
>;

export const STUDENT_BULK_SCORE_IMPORT_GROUPS = new Set<StudentBulkScoreImportGroup>([
  "cognitive",
  "scoreSummary",
]);

export type BulkScoreImportRowError = {
  rowNumber: number;
  message: string;
};

export type CognitiveScoreImportRow = {
  gakuseiId: string;
  scores: CognitiveScores;
};

export type ScoreSummaryImportRow = {
  gakuseiId: string;
  pretestScore: number | null;
  supportArea: string | null;
  careerEducation: string | null;
};

export const MAX_BULK_SCORE_IMPORT_ROWS = 500;

const CSV_UTF8_BOM = "\uFEFF";

const COGNITIVE_CSV_HEADERS = [
  "学籍番号",
  ...COGNITIVE_SCORE_ITEMS.map((item) => item.label),
] as const;

const SCORE_SUMMARY_CSV_HEADERS = [
  "学籍番号",
  "入学前プレ",
  "サポート領域",
  "キャリア教育",
] as const;

const COGNITIVE_SAMPLE_ROW = ["11111", "12", "8", "15", "20", "10", "18"] as const;
const SCORE_SUMMARY_SAMPLE_ROW = ["11111", "85.5", "領域A", "教育B"] as const;

const COGNITIVE_HEADER_TO_KEY: Record<string, CognitiveScoreKey | "gakuseiId"> = {
  学籍番号: "gakuseiId",
  ...Object.fromEntries(COGNITIVE_SCORE_ITEMS.map((item) => [item.label, item.key])),
};

const SCORE_SUMMARY_HEADER_TO_KEY = {
  学籍番号: "gakuseiId",
  入学前プレ: "pretestScore",
  サポート領域: "supportArea",
  キャリア教育: "careerEducation",
} as const;

type ScoreSummaryFieldKey =
  (typeof SCORE_SUMMARY_HEADER_TO_KEY)[keyof typeof SCORE_SUMMARY_HEADER_TO_KEY];

const TEMPLATE_FILENAMES: Record<StudentBulkScoreImportGroup, string> = {
  cognitive: "cognitive-scores-template.csv",
  scoreSummary: "score-summary-template.csv",
};

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeCsvHeader(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function isRowEmpty(cells: string[]) {
  return cells.every((cell) => !cell.trim());
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildStudentBulkScoreCsvTemplate(group: StudentBulkScoreImportGroup) {
  if (group === "cognitive") {
    const lines = [
      COGNITIVE_CSV_HEADERS.join(","),
      [...COGNITIVE_SAMPLE_ROW].map(escapeCsvCell).join(","),
    ];
    return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
  }

  const lines = [
    SCORE_SUMMARY_CSV_HEADERS.join(","),
    [...SCORE_SUMMARY_SAMPLE_ROW].map(escapeCsvCell).join(","),
  ];
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function downloadStudentBulkScoreTemplate(group: StudentBulkScoreImportGroup) {
  downloadCsv(TEMPLATE_FILENAMES[group], buildStudentBulkScoreCsvTemplate(group));
}

function isSampleRow(group: StudentBulkScoreImportGroup, cells: string[]) {
  const sample =
    group === "cognitive" ? COGNITIVE_SAMPLE_ROW : SCORE_SUMMARY_SAMPLE_ROW;
  const headers =
    group === "cognitive" ? COGNITIVE_CSV_HEADERS : SCORE_SUMMARY_CSV_HEADERS;

  if (cells.length < headers.length) {
    return false;
  }

  return sample.every((value, index) => cells[index]?.trim() === value);
}

function buildColumnIndexes<T extends string>(
  headers: string[],
  headerMap: Record<string, T>,
) {
  const indexes = {} as Record<T, number>;
  const normalizedHeaders = headers.map(normalizeCsvHeader);

  for (const [headerLabel, key] of Object.entries(headerMap)) {
    const headerIndex = normalizedHeaders.indexOf(normalizeCsvHeader(headerLabel));
    if (headerIndex === -1) {
      return {
        ok: false as const,
        message: `CSVのヘッダーに「${headerLabel}」列がありません。テンプレートをご利用ください。`,
      };
    }
    indexes[key as T] = headerIndex;
  }

  return { ok: true as const, indexes };
}

function validateDuplicateGakuseiIds(gakuseiIds: string[]) {
  const duplicates = gakuseiIds.filter((id, index) => gakuseiIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    return `学籍番号が重複しています: ${[...new Set(duplicates)].join("、")}`;
  }
  return null;
}

function parseCognitiveScoreCsv(text: string):
  | { ok: true; rows: CognitiveScoreImportRow[]; rowNumbers: number[] }
  | { ok: false; message: string; rowErrors?: BulkScoreImportRowError[] } {
  const parsedRows = parseCsvText(text).filter((cells) => !isRowEmpty(cells));
  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const columnResult = buildColumnIndexes(headerRow, COGNITIVE_HEADER_TO_KEY);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rows: CognitiveScoreImportRow[] = [];
  const rowNumbers: number[] = [];
  const rowErrors: BulkScoreImportRowError[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (isSampleRow("cognitive", cells)) {
      return;
    }

    const readCell = (key: CognitiveScoreKey | "gakuseiId") => {
      const cellIndex = columnResult.indexes[key];
      return cellIndex === undefined ? "" : (cells[cellIndex] ?? "").trim();
    };

    const gakuseiId = readCell("gakuseiId");
    if (!gakuseiId) {
      rowErrors.push({ rowNumber, message: "学籍番号を入力してください。" });
      return;
    }

    const scores: CognitiveScores = {};
    for (const { key, label } of COGNITIVE_SCORE_ITEMS) {
      const raw = readCell(key);
      if (!raw) {
        scores[key] = null;
        continue;
      }

      const error = validateBulkFieldValue(key, raw);
      if (error) {
        rowErrors.push({ rowNumber, message: `${label}: ${error}` });
        return;
      }
      scores[key] = parseIntegerScore(raw);
    }

    const hasAnyScore = COGNITIVE_SCORE_ITEMS.some(({ key }) => scores[key] !== null);
    if (!hasAnyScore) {
      rowErrors.push({
        rowNumber,
        message: "少なくとも1つの認知特性スコアを入力してください。",
      });
      return;
    }

    rows.push({ gakuseiId, scores });
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return { ok: false, message: "CSVの入力内容に誤りがあります。", rowErrors };
  }
  if (rows.length === 0) {
    return { ok: false, message: "インポート対象の行がありません。" };
  }
  if (rows.length > MAX_BULK_SCORE_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度にインポートできるのは${MAX_BULK_SCORE_IMPORT_ROWS}件までです。`,
    };
  }

  const duplicateError = validateDuplicateGakuseiIds(rows.map((row) => row.gakuseiId));
  if (duplicateError) {
    return { ok: false, message: duplicateError };
  }

  return { ok: true, rows, rowNumbers };
}

function parseScoreSummaryCsv(text: string):
  | { ok: true; rows: ScoreSummaryImportRow[]; rowNumbers: number[] }
  | { ok: false; message: string; rowErrors?: BulkScoreImportRowError[] } {
  const parsedRows = parseCsvText(text).filter((cells) => !isRowEmpty(cells));
  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const columnResult = buildColumnIndexes(headerRow, SCORE_SUMMARY_HEADER_TO_KEY);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rows: ScoreSummaryImportRow[] = [];
  const rowNumbers: number[] = [];
  const rowErrors: BulkScoreImportRowError[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (isSampleRow("scoreSummary", cells)) {
      return;
    }

    const readCell = (key: ScoreSummaryFieldKey) => {
      const cellIndex = columnResult.indexes[key];
      return cellIndex === undefined ? "" : (cells[cellIndex] ?? "").trim();
    };

    const gakuseiId = readCell("gakuseiId");
    if (!gakuseiId) {
      rowErrors.push({ rowNumber, message: "学籍番号を入力してください。" });
      return;
    }

    const pretestRaw = readCell("pretestScore");
    const supportAreaRaw = readCell("supportArea");
    const careerEducationRaw = readCell("careerEducation");

    if (pretestRaw) {
      const error = validateBulkFieldValue("pretestScore", pretestRaw);
      if (error) {
        rowErrors.push({ rowNumber, message: error });
        return;
      }
    }
    if (supportAreaRaw) {
      const error = validateBulkFieldValue("supportArea", supportAreaRaw);
      if (error) {
        rowErrors.push({ rowNumber, message: error });
        return;
      }
    }
    if (careerEducationRaw) {
      const error = validateBulkFieldValue("careerEducation", careerEducationRaw);
      if (error) {
        rowErrors.push({ rowNumber, message: error });
        return;
      }
    }

    if (!pretestRaw && !supportAreaRaw && !careerEducationRaw) {
      rowErrors.push({
        rowNumber,
        message: "入学前プレ・サポート領域・キャリア教育のいずれかを入力してください。",
      });
      return;
    }

    rows.push({
      gakuseiId,
      pretestScore: pretestRaw ? parsePretestScoreFormValue(pretestRaw) : null,
      supportArea: supportAreaRaw || null,
      careerEducation: careerEducationRaw || null,
    });
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return { ok: false, message: "CSVの入力内容に誤りがあります。", rowErrors };
  }
  if (rows.length === 0) {
    return { ok: false, message: "インポート対象の行がありません。" };
  }
  if (rows.length > MAX_BULK_SCORE_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度にインポートできるのは${MAX_BULK_SCORE_IMPORT_ROWS}件までです。`,
    };
  }

  const duplicateError = validateDuplicateGakuseiIds(rows.map((row) => row.gakuseiId));
  if (duplicateError) {
    return { ok: false, message: duplicateError };
  }

  return { ok: true, rows, rowNumbers };
}

export function parseStudentBulkScoreCsv(
  group: StudentBulkScoreImportGroup,
  text: string,
) {
  if (group === "cognitive") {
    return parseCognitiveScoreCsv(text);
  }
  return parseScoreSummaryCsv(text);
}

export function parseStudentBulkScoreImportBody(body: unknown):
  | {
      ok: true;
      group: StudentBulkScoreImportGroup;
      cognitiveRows?: CognitiveScoreImportRow[];
      scoreSummaryRows?: ScoreSummaryImportRow[];
    }
  | { ok: false; message: string; rowErrors?: BulkScoreImportRowError[] } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "リクエストの形式が正しくありません。" };
  }

  const groupRaw = (body as { group?: unknown }).group;
  const csvText = (body as { csvText?: unknown }).csvText;

  if (typeof groupRaw !== "string" || !STUDENT_BULK_SCORE_IMPORT_GROUPS.has(groupRaw as StudentBulkScoreImportGroup)) {
    return { ok: false, message: "インポート対象の項目が指定されていません。" };
  }

  if (typeof csvText !== "string" || !csvText.trim()) {
    return { ok: false, message: "CSVファイルを選択してください。" };
  }

  const group = groupRaw as StudentBulkScoreImportGroup;

  if (group === "cognitive") {
    const parsed = parseCognitiveScoreCsv(csvText);
    if (!parsed.ok) {
      return parsed;
    }
    return { ok: true, group, cognitiveRows: parsed.rows };
  }

  const parsed = parseScoreSummaryCsv(csvText);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, group, scoreSummaryRows: parsed.rows };
}

export function formatBulkScoreImportRowErrors(rowErrors: BulkScoreImportRowError[]) {
  return rowErrors
    .slice(0, 8)
    .map((item) => `${item.rowNumber}行目: ${item.message}`)
    .join("\n");
}
