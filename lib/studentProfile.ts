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
}[] = [
  { key: "camera", label: "カメラ" },
  { key: "3d", label: "3D" },
  { key: "fantasy", label: "ファンタジー" },
  { key: "reading", label: "読書" },
  { key: "sound", label: "サウンド" },
  { key: "radio", label: "ラジオ" },
];

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
