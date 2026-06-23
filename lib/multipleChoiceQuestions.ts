import { parseCsvText } from "@/lib/newStudentRegistration";
import {
  getQuestCatalogSubcategories,
  getQuestSubjectLabel,
  getQuestSubcategoryLabel,
  QUEST_CATALOG_SUBJECTS,
} from "@/lib/questCatalog";

export type MultipleChoiceAnswerIndex = 0 | 1 | 2 | 3;

export type MultipleChoiceQuestionListItem = {
  id: string;
  displayId: string;
  subjectId: string;
  subjectLabel: string;
  subcategoryId: string;
  subcategoryLabel: string;
  body: string;
  correctLabel: string;
  nationalExamRound: number | null;
  nationalExamQuestionNo: number | null;
  nationalExamLabel: string | null;
  updatedAt: string | null;
  updatedAtLabel: string | null;
};

export type MultipleChoiceQuestionDetail = MultipleChoiceQuestionListItem & {
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: MultipleChoiceAnswerIndex;
  explanation: string;
};

export type MultipleChoiceQuestionFormState = {
  subjectId: string;
  subcategoryId: string;
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: string;
  explanation: string;
  nationalExamRound: string;
  nationalExamQuestionNo: string;
};

export type MultipleChoiceImportRow = {
  subjectId: string;
  subcategoryId: string;
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: MultipleChoiceAnswerIndex;
  explanation: string;
  nationalExamRound: number | null;
  nationalExamQuestionNo: number | null;
};

export type MultipleChoiceRowError = {
  rowNumber: number;
  message: string;
};

export const MULTIPLE_CHOICE_CSV_HEADERS = [
  "科目ID",
  "中分類ID",
  "問題文",
  "選択肢1",
  "選択肢2",
  "選択肢3",
  "選択肢4",
  "正解",
  "解説",
  "国家試験回数",
  "問番号",
] as const;

export const MULTIPLE_CHOICE_TEMPLATE_FILENAME = "multiple-choice-questions-template.csv";
export const MAX_MULTIPLE_CHOICE_IMPORT_ROWS = 500;

const CSV_UTF8_BOM = "\uFEFF";

const TEMPLATE_SAMPLE_ROW = [
  "kaibou",
  "kaibou-skeleton",
  "骨格系について、正しいものを1つ選んでください。",
  "成人の骨は206個である",
  "すべての骨は長骨である",
  "肋骨12対すべてが胸骨と直接つながる",
  "蝶形骨は頭蓋骨に含まれない",
  "A",
  "成人の骨は一般に206個とされます。",
  "115",
  "42",
] as const;

const CSV_HEADER_TO_KEY = {
  科目ID: "subjectId",
  中分類ID: "subcategoryId",
  問題文: "body",
  選択肢1: "choice1",
  選択肢2: "choice2",
  選択肢3: "choice3",
  選択肢4: "choice4",
  正解: "correctAnswer",
  解説: "explanation",
  国家試験回数: "nationalExamRound",
  問番号: "nationalExamQuestionNo",
} as const;

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;

export function createEmptyMultipleChoiceForm(
  subjectId = "",
  subcategoryId = "",
): MultipleChoiceQuestionFormState {
  return {
    subjectId,
    subcategoryId,
    body: "",
    choice1: "",
    choice2: "",
    choice3: "",
    choice4: "",
    correctIndex: "0",
    explanation: "",
    nationalExamRound: "",
    nationalExamQuestionNo: "",
  };
}

export function detailToMultipleChoiceForm(
  detail: MultipleChoiceQuestionDetail,
): MultipleChoiceQuestionFormState {
  return {
    subjectId: detail.subjectId,
    subcategoryId: detail.subcategoryId,
    body: detail.body,
    choice1: detail.choice1,
    choice2: detail.choice2,
    choice3: detail.choice3,
    choice4: detail.choice4,
    correctIndex: String(detail.correctIndex),
    explanation: detail.explanation,
    nationalExamRound:
      detail.nationalExamRound === null ? "" : String(detail.nationalExamRound),
    nationalExamQuestionNo:
      detail.nationalExamQuestionNo === null ? "" : String(detail.nationalExamQuestionNo),
  };
}

export function formatQuestionDisplayId(id: string) {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `Q-${compact}`;
}

export function formatCorrectAnswerLabel(index: number) {
  return ANSWER_LABELS[index] ?? "?";
}

export function formatQuestionUpdatedLabel(updatedAt: string | null) {
  if (!updatedAt) {
    return null;
  }
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatNationalExamLabel(
  round: number | null,
  questionNo: number | null,
): string | null {
  if (round === null || questionNo === null) {
    return null;
  }
  return `第${round}回 問${questionNo}`;
}

export function parseOptionalPositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

export function validateNationalExamFields(
  roundRaw: string,
  questionNoRaw: string,
): string | null {
  const round = parseOptionalPositiveInteger(roundRaw);
  const questionNo = parseOptionalPositiveInteger(questionNoRaw);
  const hasRound = roundRaw.trim().length > 0;
  const hasQuestionNo = questionNoRaw.trim().length > 0;

  if (!hasRound && !hasQuestionNo) {
    return null;
  }
  if (hasRound !== hasQuestionNo) {
    return "国家試験回数と問番号はセットで入力してください。";
  }
  if (round === null) {
    return "国家試験回数は1以上の整数で入力してください。";
  }
  if (questionNo === null) {
    return "問番号は1以上の整数で入力してください。";
  }
  return null;
}

export function parseNationalExamFields(roundRaw: string, questionNoRaw: string):
  | { ok: true; nationalExamRound: number | null; nationalExamQuestionNo: number | null }
  | { ok: false; message: string } {
  const error = validateNationalExamFields(roundRaw, questionNoRaw);
  if (error) {
    return { ok: false, message: error };
  }

  return {
    ok: true,
    nationalExamRound: parseOptionalPositiveInteger(roundRaw),
    nationalExamQuestionNo: parseOptionalPositiveInteger(questionNoRaw),
  };
}

export function parseCorrectAnswerIndex(value: string): MultipleChoiceAnswerIndex | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  const letterIndex = ANSWER_LABELS.indexOf(upper as (typeof ANSWER_LABELS)[number]);
  if (letterIndex >= 0) {
    return letterIndex as MultipleChoiceAnswerIndex;
  }

  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) {
    return (numeric - 1) as MultipleChoiceAnswerIndex;
  }
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 3) {
    return numeric as MultipleChoiceAnswerIndex;
  }

  return null;
}

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

function isSampleRow(cells: string[]) {
  return TEMPLATE_SAMPLE_ROW.every((value, index) => cells[index]?.trim() === value);
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

export function buildMultipleChoiceCsvTemplate() {
  const lines = [
    MULTIPLE_CHOICE_CSV_HEADERS.join(","),
    [...TEMPLATE_SAMPLE_ROW].map(escapeCsvCell).join(","),
  ];
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function downloadMultipleChoiceTemplate() {
  downloadCsv(MULTIPLE_CHOICE_TEMPLATE_FILENAME, buildMultipleChoiceCsvTemplate());
}

export function validateMultipleChoiceForm(
  form: MultipleChoiceQuestionFormState,
): string | null {
  if (!form.subjectId.trim()) {
    return "科目を選択してください。";
  }
  if (!form.subcategoryId.trim()) {
    return "中分類を選択してください。";
  }
  if (!form.body.trim()) {
    return "問題文を入力してください。";
  }
  if (!form.choice1.trim() || !form.choice2.trim() || !form.choice3.trim() || !form.choice4.trim()) {
    return "選択肢1〜4をすべて入力してください。";
  }

  const correctIndex = parseCorrectAnswerIndex(form.correctIndex);
  if (correctIndex === null) {
    return "正解は A〜D または 1〜4 で指定してください。";
  }

  const subcategories = getQuestCatalogSubcategories(form.subjectId.trim());
  if (!subcategories.some((item) => item.id === form.subcategoryId.trim())) {
    return "選択した科目に存在しない中分類です。";
  }

  return validateNationalExamFields(form.nationalExamRound, form.nationalExamQuestionNo);
}

export function formToMultipleChoicePayload(form: MultipleChoiceQuestionFormState) {
  const error = validateMultipleChoiceForm(form);
  if (error) {
    return { ok: false as const, message: error };
  }

  const correctIndex = parseCorrectAnswerIndex(form.correctIndex);
  if (correctIndex === null) {
    return { ok: false as const, message: "正解の形式が正しくありません。" };
  }

  const nationalExam = parseNationalExamFields(
    form.nationalExamRound,
    form.nationalExamQuestionNo,
  );
  if (!nationalExam.ok) {
    return { ok: false as const, message: nationalExam.message };
  }

  return {
    ok: true as const,
    payload: {
      subjectId: form.subjectId.trim(),
      subcategoryId: form.subcategoryId.trim(),
      body: form.body.trim(),
      choice1: form.choice1.trim(),
      choice2: form.choice2.trim(),
      choice3: form.choice3.trim(),
      choice4: form.choice4.trim(),
      correctIndex,
      explanation: form.explanation.trim(),
      nationalExamRound: nationalExam.nationalExamRound,
      nationalExamQuestionNo: nationalExam.nationalExamQuestionNo,
    },
  };
}

export function formatMultipleChoiceRowErrors(rowErrors: MultipleChoiceRowError[]) {
  return rowErrors
    .slice(0, 8)
    .map((item) => `${item.rowNumber}行目: ${item.message}`)
    .join("\n");
}

function buildColumnIndexes(headers: string[]) {
  const indexes = {} as Record<keyof typeof CSV_HEADER_TO_KEY extends infer K
    ? K extends keyof typeof CSV_HEADER_TO_KEY
      ? (typeof CSV_HEADER_TO_KEY)[K]
      : never
    : never, number>;
  const normalizedHeaders = headers.map(normalizeCsvHeader);

  for (const [headerLabel, key] of Object.entries(CSV_HEADER_TO_KEY)) {
    const headerIndex = normalizedHeaders.indexOf(normalizeCsvHeader(headerLabel));
    if (headerIndex === -1) {
      return {
        ok: false as const,
        message: `CSVのヘッダーに「${headerLabel}」列がありません。テンプレートをご利用ください。`,
      };
    }
    indexes[key as keyof typeof indexes] = headerIndex;
  }

  return { ok: true as const, indexes };
}

type CsvFieldKey = (typeof CSV_HEADER_TO_KEY)[keyof typeof CSV_HEADER_TO_KEY];

export function parseMultipleChoiceCsv(text: string):
  | { ok: true; rows: MultipleChoiceImportRow[] }
  | { ok: false; message: string; rowErrors?: MultipleChoiceRowError[] } {
  const parsedRows = parseCsvText(text).filter((cells) => !isRowEmpty(cells));
  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const columnResult = buildColumnIndexes(headerRow);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rows: MultipleChoiceImportRow[] = [];
  const rowErrors: MultipleChoiceRowError[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (isSampleRow(cells)) {
      return;
    }

    const readCell = (key: CsvFieldKey) => {
      const cellIndex = columnResult.indexes[key];
      return cellIndex === undefined ? "" : (cells[cellIndex] ?? "").trim();
    };

    const subjectId = readCell("subjectId");
    const subcategoryId = readCell("subcategoryId");
    const body = readCell("body");
    const choice1 = readCell("choice1");
    const choice2 = readCell("choice2");
    const choice3 = readCell("choice3");
    const choice4 = readCell("choice4");
    const correctRaw = readCell("correctAnswer");
    const explanation = readCell("explanation");
    const nationalExamRoundRaw = readCell("nationalExamRound");
    const nationalExamQuestionNoRaw = readCell("nationalExamQuestionNo");

    if (!subjectId) {
      rowErrors.push({ rowNumber, message: "科目IDを入力してください。" });
      return;
    }
    if (!QUEST_CATALOG_SUBJECTS.some((item) => item.id === subjectId)) {
      rowErrors.push({ rowNumber, message: `科目ID「${subjectId}」が見つかりません。` });
      return;
    }
    if (!subcategoryId) {
      rowErrors.push({ rowNumber, message: "中分類IDを入力してください。" });
      return;
    }
    if (!getQuestCatalogSubcategories(subjectId).some((item) => item.id === subcategoryId)) {
      rowErrors.push({
        rowNumber,
        message: `中分類ID「${subcategoryId}」が科目「${getQuestSubjectLabel(subjectId)}」に存在しません。`,
      });
      return;
    }
    if (!body) {
      rowErrors.push({ rowNumber, message: "問題文を入力してください。" });
      return;
    }
    if (!choice1 || !choice2 || !choice3 || !choice4) {
      rowErrors.push({ rowNumber, message: "選択肢1〜4をすべて入力してください。" });
      return;
    }

    const correctIndex = parseCorrectAnswerIndex(correctRaw);
    if (correctIndex === null) {
      rowErrors.push({ rowNumber, message: "正解は A〜D または 1〜4 で指定してください。" });
      return;
    }

    const nationalExamError = validateNationalExamFields(
      nationalExamRoundRaw,
      nationalExamQuestionNoRaw,
    );
    if (nationalExamError) {
      rowErrors.push({ rowNumber, message: nationalExamError });
      return;
    }
    const nationalExam = parseNationalExamFields(
      nationalExamRoundRaw,
      nationalExamQuestionNoRaw,
    );
    if (!nationalExam.ok) {
      rowErrors.push({ rowNumber, message: nationalExam.message });
      return;
    }

    rows.push({
      subjectId,
      subcategoryId,
      body,
      choice1,
      choice2,
      choice3,
      choice4,
      correctIndex,
      explanation,
      nationalExamRound: nationalExam.nationalExamRound,
      nationalExamQuestionNo: nationalExam.nationalExamQuestionNo,
    });
  });

  if (rowErrors.length > 0) {
    return { ok: false, message: "CSVの入力内容に誤りがあります。", rowErrors };
  }
  if (rows.length === 0) {
    return { ok: false, message: "インポート対象の行がありません。" };
  }
  if (rows.length > MAX_MULTIPLE_CHOICE_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度にインポートできるのは${MAX_MULTIPLE_CHOICE_IMPORT_ROWS}件までです。`,
    };
  }

  return { ok: true, rows };
}

export function groupMultipleChoiceListItems(items: MultipleChoiceQuestionListItem[]) {
  const groups = new Map<string, MultipleChoiceQuestionListItem[]>();

  items.forEach((item) => {
    const key = `${item.subjectId}::${item.subcategoryId}`;
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });

  return [...groups.entries()].map(([key, groupItems]) => {
    const [subjectId, subcategoryId] = key.split("::");
    return {
      subjectId,
      subcategoryId,
      subjectLabel: groupItems[0]?.subjectLabel ?? getQuestSubjectLabel(subjectId),
      subcategoryLabel:
        groupItems[0]?.subcategoryLabel ?? getQuestSubcategoryLabel(subjectId, subcategoryId),
      items: groupItems,
    };
  });
}
