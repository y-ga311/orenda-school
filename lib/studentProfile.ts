export type CognitiveScoreKey =
  | "camera"
  | "3d"
  | "fantasy"
  | "reading"
  | "sound"
  | "radio";

export type CognitiveScores = Partial<Record<CognitiveScoreKey, number | null>>;

export const COGNITIVE_SCORE_ITEMS: {
  key: CognitiveScoreKey;
  label: string;
  column: string;
}[] = [
  { key: "camera", label: "カメラ", column: "cognitive_camera" },
  { key: "3d", label: "3D", column: "cognitive_3d" },
  { key: "fantasy", label: "ファンタジー", column: "cognitive_fantasy" },
  { key: "reading", label: "読書", column: "cognitive_reading" },
  { key: "sound", label: "サウンド", column: "cognitive_sound" },
  { key: "radio", label: "ラジオ", column: "cognitive_radio" },
];

export const COGNITIVE_SCORE_COLUMNS = COGNITIVE_SCORE_ITEMS.map((item) => item.column);

export function parseIntegerScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCognitiveScoresFromRow(
  row: Record<string, unknown>,
  jsonValue: unknown,
): CognitiveScores {
  const usesIntColumns = COGNITIVE_SCORE_ITEMS.some(({ column }) => column in row);

  if (usesIntColumns) {
    const scores: CognitiveScores = {};
    COGNITIVE_SCORE_ITEMS.forEach(({ key, column }) => {
      scores[key] = parseIntegerScore(row[column]);
    });
    return scores;
  }

  return parseCognitiveScoresFromJson(jsonValue);
}

export function parseCognitiveScoresFromJson(value: unknown): CognitiveScores {
  if (!value || typeof value !== "object") {
    return {};
  }

  const scores: CognitiveScores = {};
  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const raw = (value as Record<string, unknown>)[key];
    scores[key] = parseIntegerScore(raw);
  });

  return scores;
}

export type StudentProfileData = {
  gakuseiId: string;
  name: string;
  nickname: string;
  className: string;
  parentId: string;
  parentEmail: string;
  hasStudentPassword: boolean;
  hasParentPassword: boolean;
  pretestScore: number | null;
  supportArea: string | null;
  careerEducation: string | null;
  cognitiveScores: CognitiveScores;
  extendedFieldsAvailable: boolean;
};

export type StudentProfileFormState = {
  nickname: string;
  className: string;
  studentPassword: string;
  parentId: string;
  parentPassword: string;
  parentEmail: string;
  pretestScore: string;
  supportArea: string;
  careerEducation: string;
  cognitiveScores: Record<CognitiveScoreKey, string>;
};

function buildEmptyCognitiveFormState(): Record<CognitiveScoreKey, string> {
  return Object.fromEntries(
    COGNITIVE_SCORE_ITEMS.map(({ key }) => [key, ""]),
  ) as Record<CognitiveScoreKey, string>;
}

export function buildProfileFormState(profile: StudentProfileData): StudentProfileFormState {
  const cognitiveScores = buildEmptyCognitiveFormState();
  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const value = profile.cognitiveScores[key];
    cognitiveScores[key] =
      value === null || value === undefined ? "" : String(value);
  });

  return {
    nickname: profile.nickname,
    className: profile.className,
    studentPassword: "",
    parentId: profile.parentId,
    parentPassword: "",
    parentEmail: profile.parentEmail,
    pretestScore:
      profile.pretestScore === null || profile.pretestScore === undefined
        ? ""
        : String(profile.pretestScore),
    supportArea: profile.supportArea ?? "",
    careerEducation: profile.careerEducation ?? "",
    cognitiveScores,
  };
}

export function parsePretestScoreFormValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCognitiveScoresFormState(
  values: Record<CognitiveScoreKey, string>,
): CognitiveScores {
  const scores: CognitiveScores = {};
  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const trimmed = values[key]?.trim() ?? "";
    scores[key] = trimmed ? parseIntegerScore(trimmed) : null;
  });
  return scores;
}

export function buildCognitiveColumnUpdates(scores: CognitiveScores) {
  const updates: Record<string, number | null> = {};
  COGNITIVE_SCORE_ITEMS.forEach(({ key, column }) => {
    updates[column] = scores[key] ?? null;
  });
  return updates;
}

export function buildCognitiveJsonUpdate(scores: CognitiveScores) {
  const payload: Record<string, number | null> = {};
  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    payload[key] = scores[key] ?? null;
  });
  return payload;
}

export function getHighlightedCognitiveKeys(scores: CognitiveScores): CognitiveScoreKey[] {
  let bestScore = Number.NEGATIVE_INFINITY;
  const numericEntries: { key: CognitiveScoreKey; value: number }[] = [];

  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const value = scores[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      numericEntries.push({ key, value });
      if (value > bestScore) {
        bestScore = value;
      }
    }
  });

  if (numericEntries.length === 0 || !Number.isFinite(bestScore)) {
    return [];
  }

  return numericEntries
    .filter(({ value }) => value === bestScore)
    .map(({ key }) => key);
}

export function formatScoreBadgeValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
