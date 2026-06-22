export type NewStudentRegistrationFormState = {
  studentId: string;
  name: string;
  gakuseiId: string;
  gakuseiPassword: string;
  hogosyaId: string;
  hogosyaPassword: string;
  parentEmail: string;
  className: string;
};

export type NewStudentRegistrationFieldErrors = Partial<
  Record<keyof NewStudentRegistrationFormState, string>
>;

export const NEW_STUDENT_FIELD_LABELS: Record<keyof NewStudentRegistrationFormState, string> = {
  studentId: "ID",
  name: "名前",
  gakuseiId: "学生ID",
  gakuseiPassword: "学生パスワード",
  hogosyaId: "保護者ID",
  hogosyaPassword: "保護者パスワード",
  parentEmail: "保護者メールアドレス",
  className: "所属クラス",
};

export const STUDENT_REGISTRATION_CSV_HEADERS = [
  NEW_STUDENT_FIELD_LABELS.studentId,
  NEW_STUDENT_FIELD_LABELS.name,
  NEW_STUDENT_FIELD_LABELS.gakuseiId,
  NEW_STUDENT_FIELD_LABELS.gakuseiPassword,
  NEW_STUDENT_FIELD_LABELS.hogosyaId,
  NEW_STUDENT_FIELD_LABELS.hogosyaPassword,
  NEW_STUDENT_FIELD_LABELS.parentEmail,
  NEW_STUDENT_FIELD_LABELS.className,
] as const;

export const STUDENT_REGISTRATION_TEMPLATE_FILENAME = "student-registration-template.csv";

export const MAX_STUDENT_IMPORT_ROWS = 500;

export type StudentRegistrationRowError = {
  rowNumber: number;
  message: string;
};

const STUDENT_REGISTRATION_TEMPLATE_SAMPLE_ROW = [
  "1001",
  "山田太郎",
  "yamada001",
  "studentpass",
  "parent001",
  "parentpass",
  "parent@example.com",
  "A組",
] as const;

const CSV_HEADER_TO_FORM_KEY: Record<string, keyof NewStudentRegistrationFormState> = {
  [NEW_STUDENT_FIELD_LABELS.studentId]: "studentId",
  [NEW_STUDENT_FIELD_LABELS.name]: "name",
  [NEW_STUDENT_FIELD_LABELS.gakuseiId]: "gakuseiId",
  [NEW_STUDENT_FIELD_LABELS.gakuseiPassword]: "gakuseiPassword",
  [NEW_STUDENT_FIELD_LABELS.hogosyaId]: "hogosyaId",
  [NEW_STUDENT_FIELD_LABELS.hogosyaPassword]: "hogosyaPassword",
  [NEW_STUDENT_FIELD_LABELS.parentEmail]: "parentEmail",
  [NEW_STUDENT_FIELD_LABELS.className]: "className",
};

const CSV_UTF8_BOM = "\uFEFF";

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 一括登録用 CSV テンプレート（ヘッダー + 記入例1行） */
export function buildStudentRegistrationCsvTemplate() {
  const lines = [
    STUDENT_REGISTRATION_CSV_HEADERS.join(","),
    [...STUDENT_REGISTRATION_TEMPLATE_SAMPLE_ROW].map(escapeCsvCell).join(","),
  ];

  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function downloadStudentRegistrationTemplate() {
  const csv = buildStudentRegistrationCsvTemplate();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = STUDENT_REGISTRATION_TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const MAX_TEXT_FIELD_LENGTH = 200;
const MAX_STUDENT_ID = 2_147_483_647;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createEmptyNewStudentForm(): NewStudentRegistrationFormState {
  return {
    studentId: "",
    name: "",
    gakuseiId: "",
    gakuseiPassword: "",
    hogosyaId: "",
    hogosyaPassword: "",
    parentEmail: "",
    className: "",
  };
}

function parseStudentId(value: string):
  | { ok: true; value: number }
  | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "IDを入力してください。" };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "IDは半角数字で入力してください。" };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_STUDENT_ID) {
    return { ok: false, error: "IDは1以上の整数で入力してください。" };
  }

  return { ok: true, value: parsed };
}

function validateRequiredText(
  value: string,
  label: string,
  options?: { maxLength?: number },
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label}を入力してください。`;
  }

  const maxLength = options?.maxLength ?? MAX_TEXT_FIELD_LENGTH;
  if (trimmed.length > maxLength) {
    return `${label}は${maxLength}文字以内で入力してください。`;
  }

  return null;
}

export function validateNewStudentRegistrationForm(
  form: NewStudentRegistrationFormState,
): { ok: true; data: NewStudentRegistrationPayload } | { ok: false; errors: NewStudentRegistrationFieldErrors } {
  const errors: NewStudentRegistrationFieldErrors = {};
  const studentIdResult = parseStudentId(form.studentId);
  if (!studentIdResult.ok) {
    errors.studentId = studentIdResult.error;
  }

  const nameError = validateRequiredText(form.name, NEW_STUDENT_FIELD_LABELS.name);
  if (nameError) {
    errors.name = nameError;
  }

  const gakuseiIdError = validateRequiredText(form.gakuseiId, NEW_STUDENT_FIELD_LABELS.gakuseiId);
  if (gakuseiIdError) {
    errors.gakuseiId = gakuseiIdError;
  }

  const gakuseiPasswordError = validateRequiredText(
    form.gakuseiPassword,
    NEW_STUDENT_FIELD_LABELS.gakuseiPassword,
  );
  if (gakuseiPasswordError) {
    errors.gakuseiPassword = gakuseiPasswordError;
  }

  const hogosyaIdError = validateRequiredText(form.hogosyaId, NEW_STUDENT_FIELD_LABELS.hogosyaId);
  if (hogosyaIdError) {
    errors.hogosyaId = hogosyaIdError;
  }

  const hogosyaPasswordError = validateRequiredText(
    form.hogosyaPassword,
    NEW_STUDENT_FIELD_LABELS.hogosyaPassword,
  );
  if (hogosyaPasswordError) {
    errors.hogosyaPassword = hogosyaPasswordError;
  }

  const classNameError = validateRequiredText(form.className, NEW_STUDENT_FIELD_LABELS.className);
  if (classNameError) {
    errors.className = classNameError;
  }

  const parentEmail = form.parentEmail.trim();
  if (parentEmail) {
    if (parentEmail.length > MAX_TEXT_FIELD_LENGTH) {
      errors.parentEmail = `${NEW_STUDENT_FIELD_LABELS.parentEmail}は${MAX_TEXT_FIELD_LENGTH}文字以内で入力してください。`;
    } else if (!EMAIL_PATTERN.test(parentEmail)) {
      errors.parentEmail = "メールアドレスの形式が正しくありません。";
    }
  }

  if (Object.keys(errors).length > 0 || !studentIdResult.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      studentId: studentIdResult.value,
      name: form.name.trim(),
      gakuseiId: form.gakuseiId.trim(),
      gakuseiPassword: form.gakuseiPassword,
      hogosyaId: form.hogosyaId.trim(),
      hogosyaPassword: form.hogosyaPassword,
      parentEmail: parentEmail || null,
      className: form.className.trim(),
    },
  };
}

export type NewStudentRegistrationPayload = {
  studentId: number;
  name: string;
  gakuseiId: string;
  gakuseiPassword: string;
  hogosyaId: string;
  hogosyaPassword: string;
  parentEmail: string | null;
  className: string;
};

export function parseNewStudentRegistrationBody(body: unknown):
  | { ok: true; data: NewStudentRegistrationPayload }
  | { ok: false; message: string; errors?: NewStudentRegistrationFieldErrors } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "リクエスト形式が不正です。" };
  }

  const record = body as Record<string, unknown>;
  const form: NewStudentRegistrationFormState = {
    studentId: typeof record.studentId === "string" || typeof record.studentId === "number"
      ? String(record.studentId)
      : "",
    name: typeof record.name === "string" ? record.name : "",
    gakuseiId: typeof record.gakuseiId === "string" ? record.gakuseiId : "",
    gakuseiPassword: typeof record.gakuseiPassword === "string" ? record.gakuseiPassword : "",
    hogosyaId: typeof record.hogosyaId === "string" ? record.hogosyaId : "",
    hogosyaPassword: typeof record.hogosyaPassword === "string" ? record.hogosyaPassword : "",
    parentEmail: typeof record.parentEmail === "string" ? record.parentEmail : "",
    className: typeof record.className === "string" ? record.className : "",
  };

  const result = validateNewStudentRegistrationForm(form);
  if (!result.ok) {
    return {
      ok: false,
      message: "入力内容を確認してください。",
      errors: result.errors,
    };
  }

  return result;
}

/** RFC 4180 風の簡易 CSV パーサー（ダブルクォート・改行対応） */
export function parseCsvText(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeCsvHeader(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function isStudentRegistrationRowEmpty(cells: string[]) {
  return cells.every((cell) => !cell.trim());
}

function isStudentRegistrationSampleRow(cells: string[]) {
  if (cells.length < STUDENT_REGISTRATION_CSV_HEADERS.length) {
    return false;
  }

  return STUDENT_REGISTRATION_TEMPLATE_SAMPLE_ROW.every(
    (value, index) => cells[index]?.trim() === value,
  );
}

function mapCsvRowToFormState(
  cells: string[],
  columnIndexes: Record<keyof NewStudentRegistrationFormState, number>,
): NewStudentRegistrationFormState {
  const readCell = (key: keyof NewStudentRegistrationFormState) => {
    const index = columnIndexes[key];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  return {
    studentId: readCell("studentId"),
    name: readCell("name"),
    gakuseiId: readCell("gakuseiId"),
    gakuseiPassword: readCell("gakuseiPassword"),
    hogosyaId: readCell("hogosyaId"),
    hogosyaPassword: readCell("hogosyaPassword"),
    parentEmail: readCell("parentEmail"),
    className: readCell("className"),
  };
}

function buildColumnIndexes(headers: string[]):
  | { ok: true; indexes: Record<keyof NewStudentRegistrationFormState, number> }
  | { ok: false; message: string } {
  const indexes = {} as Record<keyof NewStudentRegistrationFormState, number>;
  const normalizedHeaders = headers.map(normalizeCsvHeader);

  for (const [headerLabel, formKey] of Object.entries(CSV_HEADER_TO_FORM_KEY)) {
    const headerIndex = normalizedHeaders.indexOf(normalizeCsvHeader(headerLabel));
    if (headerIndex === -1) {
      return {
        ok: false,
        message: `CSVのヘッダーに「${headerLabel}」列がありません。テンプレートをご利用ください。`,
      };
    }
    indexes[formKey as keyof NewStudentRegistrationFormState] = headerIndex;
  }

  return { ok: true, indexes };
}

function formatFieldErrors(errors: NewStudentRegistrationFieldErrors) {
  return Object.entries(errors)
    .map(([key, message]) => {
      const label = NEW_STUDENT_FIELD_LABELS[key as keyof NewStudentRegistrationFormState];
      return `${label}: ${message}`;
    })
    .join(" / ");
}

export type ParseStudentRegistrationCsvResult =
  | {
      ok: true;
      rows: NewStudentRegistrationPayload[];
      rowNumbers: number[];
      skippedSampleRows: number;
      skippedEmptyRows: number;
    }
  | {
      ok: false;
      message: string;
      rowErrors?: StudentRegistrationRowError[];
    };

export function parseStudentRegistrationCsv(text: string): ParseStudentRegistrationCsvResult {
  const parsedRows = parseCsvText(text).filter((row) => !isStudentRegistrationRowEmpty(row));

  if (parsedRows.length === 0) {
    return { ok: false, message: "CSVファイルが空です。" };
  }

  const headerRow = parsedRows[0].map((cell) => cell.trim());
  const columnResult = buildColumnIndexes(headerRow);
  if (!columnResult.ok) {
    return { ok: false, message: columnResult.message };
  }

  const rowErrors: StudentRegistrationRowError[] = [];
  const validRows: NewStudentRegistrationPayload[] = [];
  const rowNumbers: number[] = [];
  let skippedSampleRows = 0;
  let skippedEmptyRows = 0;

  parsedRows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;

    if (isStudentRegistrationRowEmpty(cells)) {
      skippedEmptyRows += 1;
      return;
    }

    if (isStudentRegistrationSampleRow(cells)) {
      skippedSampleRows += 1;
      return;
    }

    const form = mapCsvRowToFormState(cells, columnResult.indexes);
    const validation = validateNewStudentRegistrationForm(form);
    if (!validation.ok) {
      rowErrors.push({
        rowNumber,
        message: formatFieldErrors(validation.errors),
      });
      return;
    }

    validRows.push(validation.data);
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message: "CSVの入力内容に誤りがあります。",
      rowErrors,
    };
  }

  if (validRows.length === 0) {
    return {
      ok: false,
      message: "登録するデータ行がありません。記入例行を削除するか、学生データを入力してください。",
    };
  }

  if (validRows.length > MAX_STUDENT_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度に登録できるのは${MAX_STUDENT_IMPORT_ROWS}件までです。`,
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

export function parseStudentRegistrationImportBody(body: unknown):
  | { ok: true; rows: NewStudentRegistrationPayload[]; rowNumbers: number[] }
  | { ok: false; message: string; rowErrors?: StudentRegistrationRowError[] } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "リクエスト形式が不正です。" };
  }

  const record = body as Record<string, unknown>;
  const students = record.students;
  const rowNumbersInput = record.rowNumbers;

  if (!Array.isArray(students) || students.length === 0) {
    return { ok: false, message: "登録する学生データがありません。" };
  }

  if (students.length > MAX_STUDENT_IMPORT_ROWS) {
    return {
      ok: false,
      message: `一度に登録できるのは${MAX_STUDENT_IMPORT_ROWS}件までです。`,
    };
  }

  const rowErrors: StudentRegistrationRowError[] = [];
  const validRows: NewStudentRegistrationPayload[] = [];
  const rowNumbers: number[] = [];

  students.forEach((student, index) => {
    const parsed = parseNewStudentRegistrationBody(student);
    const rowNumber =
      Array.isArray(rowNumbersInput) && typeof rowNumbersInput[index] === "number"
        ? rowNumbersInput[index]
        : index + 2;

    if (!parsed.ok) {
      rowErrors.push({
        rowNumber,
        message: parsed.errors ? formatFieldErrors(parsed.errors) : parsed.message,
      });
      return;
    }

    validRows.push(parsed.data);
    rowNumbers.push(rowNumber);
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message: "入力内容を確認してください。",
      rowErrors,
    };
  }

  return { ok: true, rows: validRows, rowNumbers };
}
