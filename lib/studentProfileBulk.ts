import {
  COGNITIVE_SCORE_ITEMS,
  parseIntegerScore,
  parsePretestScoreFormValue,
  type CognitiveScoreKey,
} from "@/lib/studentProfile";

export type StudentBulkFieldKey =
  | "nickname"
  | "className"
  | "parentId"
  | "parentEmail"
  | "studentPassword"
  | "parentPassword"
  | "pretestScore"
  | "supportArea"
  | "careerEducation"
  | CognitiveScoreKey;

export type StudentBulkGroupKey =
  | "nickname"
  | "className"
  | "scoreSummary"
  | "cognitive"
  | "parentAccount"
  | "studentAccount";

export type StudentBulkSectionKey = "basic" | "score" | "account";

export type StudentBulkColumnDef = {
  key: StudentBulkFieldKey;
  label: string;
  inputMode?: "text" | "decimal" | "numeric";
  placeholder?: string;
  isPassword?: boolean;
};

export type StudentBulkGroupDef = {
  key: StudentBulkGroupKey;
  label: string;
  section: StudentBulkSectionKey;
  columns: StudentBulkColumnDef[];
  requiresExtended?: boolean;
};

export const STUDENT_BULK_SECTION_LABELS: Record<StudentBulkSectionKey, string> = {
  basic: "基本情報",
  score: "スコアサマリー",
  account: "アカウント",
};

export const STUDENT_BULK_GROUPS: StudentBulkGroupDef[] = [
  {
    key: "nickname",
    label: "ニックネーム",
    section: "basic",
    columns: [{ key: "nickname", label: "ニックネーム", placeholder: "未設定" }],
  },
  {
    key: "className",
    label: "クラス",
    section: "basic",
    columns: [{ key: "className", label: "クラス", placeholder: "未設定" }],
  },
  {
    key: "scoreSummary",
    label: "入学前プレ・キャリアサポート",
    section: "score",
    requiresExtended: true,
    columns: [
      {
        key: "pretestScore",
        label: "入学前プレ",
        inputMode: "decimal",
        placeholder: "未設定",
      },
      {
        key: "supportArea",
        label: "サポート領域",
        placeholder: "未設定",
      },
      {
        key: "careerEducation",
        label: "キャリア教育",
        placeholder: "未設定",
      },
    ],
  },
  {
    key: "cognitive",
    label: "認知特性スコア",
    section: "score",
    requiresExtended: true,
    columns: COGNITIVE_SCORE_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      inputMode: "numeric" as const,
      placeholder: "未設定",
    })),
  },
  {
    key: "parentAccount",
    label: "保護者ID・パス・メール",
    section: "account",
    columns: [
      { key: "parentId", label: "保護者ID", placeholder: "未設定" },
      {
        key: "parentPassword",
        label: "保護者パスワード",
        isPassword: true,
        placeholder: "変更時のみ入力",
      },
      { key: "parentEmail", label: "保護者メール", placeholder: "未設定" },
    ],
  },
  {
    key: "studentAccount",
    label: "学生パスワード",
    section: "account",
    columns: [
      {
        key: "studentPassword",
        label: "学生パスワード",
        isPassword: true,
        placeholder: "変更時のみ入力",
      },
    ],
  },
];

const GROUP_MAP = new Map(STUDENT_BULK_GROUPS.map((group) => [group.key, group]));

const COGNITIVE_FIELD_KEYS = new Set<CognitiveScoreKey>(
  COGNITIVE_SCORE_ITEMS.map((item) => item.key),
);

const MAX_TEXT_FIELD_LENGTH = 200;
const MAX_PRETEST_SCORE = 9999.9;
const MAX_COGNITIVE_SCORE = 999;

export type StudentBulkRow = {
  gakuseiId: string;
  name: string;
  className: string;
  hasStudentPassword: boolean;
  hasParentPassword: boolean;
  values: Record<StudentBulkFieldKey, string>;
};

export type StudentBulkRowValues = Partial<Record<StudentBulkFieldKey, string>>;

export function getStudentBulkGroup(groupKey: StudentBulkGroupKey) {
  return GROUP_MAP.get(groupKey);
}

export function getStudentBulkGroupsBySection(section: StudentBulkSectionKey) {
  return STUDENT_BULK_GROUPS.filter((group) => group.section === section);
}

export function getGroupFieldKeys(group: StudentBulkGroupDef) {
  return group.columns.map((column) => column.key);
}

export function pickRowGroupValues(
  row: StudentBulkRow,
  group: StudentBulkGroupDef,
): StudentBulkRowValues {
  const values: StudentBulkRowValues = {};
  group.columns.forEach((column) => {
    values[column.key] = row.values[column.key] ?? "";
  });
  return values;
}

export function isRowGroupDirty(
  gakuseiId: string,
  group: StudentBulkGroupDef,
  editValues: Record<string, StudentBulkRowValues>,
  baselineValues: Record<string, StudentBulkRowValues>,
) {
  const current = editValues[gakuseiId] ?? {};
  const baseline = baselineValues[gakuseiId] ?? {};
  return group.columns.some(
    (column) => (current[column.key] ?? "") !== (baseline[column.key] ?? ""),
  );
}

export function countDirtyRows(
  rows: StudentBulkRow[],
  group: StudentBulkGroupDef,
  editValues: Record<string, StudentBulkRowValues>,
  baselineValues: Record<string, StudentBulkRowValues>,
) {
  return rows.filter((row) =>
    isRowGroupDirty(row.gakuseiId, group, editValues, baselineValues),
  ).length;
}

function getFieldLabel(field: StudentBulkFieldKey) {
  for (const group of STUDENT_BULK_GROUPS) {
    const column = group.columns.find((entry) => entry.key === field);
    if (column) {
      return column.label;
    }
  }
  return field;
}

export function isCognitiveBulkField(key: StudentBulkFieldKey): key is CognitiveScoreKey {
  return COGNITIVE_FIELD_KEYS.has(key as CognitiveScoreKey);
}

export function getBulkFieldDbColumn(field: StudentBulkFieldKey) {
  if (field === "className") {
    return "class";
  }
  if (field === "parentId") {
    return "hogosya_id";
  }
  if (field === "parentEmail") {
    return "mail";
  }
  if (field === "studentPassword") {
    return "gakusei_password";
  }
  if (field === "parentPassword") {
    return "hogosya_pass";
  }
  if (field === "pretestScore") {
    return "pretest_score";
  }
  if (field === "supportArea") {
    return "support_area";
  }
  if (field === "careerEducation") {
    return "career_education";
  }
  if (isCognitiveBulkField(field)) {
    return COGNITIVE_SCORE_ITEMS.find((item) => item.key === field)?.column ?? null;
  }
  return field;
}

export function validateBulkFieldValue(field: StudentBulkFieldKey, rawValue: string) {
  const trimmed = rawValue.trim();
  const label = getFieldLabel(field);

  if ((field === "studentPassword" || field === "parentPassword") && !trimmed) {
    return null;
  }

  if (field === "nickname") {
    if (trimmed.length > 12) {
      return "ニックネームは12文字以内で入力してください。";
    }
    return null;
  }

  if (field === "className" && !trimmed) {
    return "クラスを入力してください。";
  }

  if (field === "parentEmail" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "保護者メールアドレスの形式が正しくありません。";
  }

  if (field === "pretestScore") {
    if (!trimmed) {
      return null;
    }
    const parsed = parsePretestScoreFormValue(trimmed);
    if (parsed === null) {
      return "入学前プレのスコアは数値で入力してください。";
    }
    if (parsed < 0 || parsed > MAX_PRETEST_SCORE) {
      return `入学前プレのスコアは0〜${MAX_PRETEST_SCORE}の範囲で入力してください。`;
    }
    return null;
  }

  if (field === "supportArea" || field === "careerEducation") {
    if (trimmed.length > MAX_TEXT_FIELD_LENGTH) {
      return `${label}は${MAX_TEXT_FIELD_LENGTH}文字以内で入力してください。`;
    }
    return null;
  }

  if (isCognitiveBulkField(field)) {
    if (!trimmed) {
      return null;
    }
    const parsed = parseIntegerScore(trimmed);
    if (parsed === null) {
      return `${label}は0〜${MAX_COGNITIVE_SCORE}の整数で入力してください。`;
    }
    if (parsed < 0 || parsed > MAX_COGNITIVE_SCORE) {
      return `${label}は0〜${MAX_COGNITIVE_SCORE}の範囲で入力してください。`;
    }
  }

  return null;
}

export function validateBulkGroupPartialValues(values: StudentBulkRowValues) {
  for (const [field, value] of Object.entries(values)) {
    const error = validateBulkFieldValue(field as StudentBulkFieldKey, value ?? "");
    if (error) {
      return error;
    }
  }
  return null;
}

export function buildBulkFieldUpdatePayload(field: StudentBulkFieldKey, rawValue: string) {
  const trimmed = rawValue.trim();
  const column = getBulkFieldDbColumn(field);
  if (!column) {
    return null;
  }

  if (field === "nickname" || field === "parentId" || field === "parentEmail") {
    return { [column]: trimmed || null };
  }

  if (field === "className") {
    return { [column]: trimmed };
  }

  if (field === "studentPassword" || field === "parentPassword") {
    if (!trimmed) {
      return null;
    }
    return { [column]: trimmed };
  }

  if (field === "pretestScore") {
    return { [column]: trimmed ? parsePretestScoreFormValue(trimmed) : null };
  }

  if (field === "supportArea" || field === "careerEducation") {
    return { [column]: trimmed || null };
  }

  if (isCognitiveBulkField(field)) {
    return { [column]: trimmed ? parseIntegerScore(trimmed) : null };
  }

  return { [column]: trimmed || null };
}

export function getChangedGroupValues(
  group: StudentBulkGroupDef,
  current: StudentBulkRowValues,
  baseline: StudentBulkRowValues,
) {
  const changed: StudentBulkRowValues = {};
  group.columns.forEach((column) => {
    const nextValue = current[column.key] ?? "";
    const baseValue = baseline[column.key] ?? "";
    if (nextValue !== baseValue) {
      changed[column.key] = nextValue;
    }
  });
  return changed;
}

export function buildPartialGroupUpdatePayload(changedValues: StudentBulkRowValues) {
  const payload: Record<string, string | number | null> = {};

  (Object.entries(changedValues) as [StudentBulkFieldKey, string | undefined][]).forEach(
    ([field, value]) => {
      const fieldPayload = buildBulkFieldUpdatePayload(field, value ?? "");
      if (fieldPayload) {
        Object.assign(payload, fieldPayload);
      }
    },
  );

  return Object.keys(payload).length > 0 ? payload : null;
}
