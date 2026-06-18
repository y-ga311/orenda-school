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
};

export function buildProfileFormState(profile: StudentProfileData): StudentProfileFormState {
  return {
    nickname: profile.nickname,
    className: profile.className,
    studentPassword: "",
    parentId: profile.parentId,
    parentPassword: "",
    parentEmail: profile.parentEmail,
  };
}

export function getHighlightedCognitiveKey(scores: CognitiveScores): CognitiveScoreKey | null {
  let bestKey: CognitiveScoreKey | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const value = scores[key];
    if (typeof value === "number" && value > bestScore) {
      bestScore = value;
      bestKey = key;
    }
  });

  return bestKey;
}

export function formatScoreBadgeValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
