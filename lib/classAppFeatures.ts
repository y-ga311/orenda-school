export const CLASS_APP_FEATURE_KEYS = [
  "timer",
  "quest",
  "record",
  "collection",
  "ranking",
  "mypage",
] as const;

export type ClassAppFeatureKey = (typeof CLASS_APP_FEATURE_KEYS)[number];

export type ClassAppFeatures = Record<ClassAppFeatureKey, boolean>;

export type ClassAppFeatureDefinition = {
  key: ClassAppFeatureKey;
  label: string;
  description: string;
};

export const CLASS_APP_FEATURE_DEFINITIONS: ClassAppFeatureDefinition[] = [
  {
    key: "timer",
    label: "学習タイマー",
    description: "タイマー画面・ストップウォッチ",
  },
  {
    key: "quest",
    label: "クエスト",
    description: "問題クエスト一式",
  },
  {
    key: "record",
    label: "勉強時間",
    description: "学習時間の振り返り",
  },
  {
    key: "collection",
    label: "コレクション",
    description: "カード / ガチャ / メダル",
  },
  {
    key: "ranking",
    label: "交流",
    description: "勉強時間ランキング",
  },
  {
    key: "mypage",
    label: "マイページ",
    description: "プロフィール編集など",
  },
];

export type ClassAppFeaturesRow = {
  className: string;
  features: ClassAppFeatures;
  updatedAt: string | null;
  updatedBy: string | null;
  existsInDb: boolean;
};

export function createDefaultClassAppFeatures(): ClassAppFeatures {
  return {
    timer: true,
    quest: true,
    record: true,
    collection: true,
    ranking: true,
    mypage: true,
  };
}

export function normalizeClassAppFeatures(raw: unknown): ClassAppFeatures {
  const defaults = createDefaultClassAppFeatures();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const source = raw as Record<string, unknown>;
  const normalized = { ...defaults };

  CLASS_APP_FEATURE_KEYS.forEach((key) => {
    if (typeof source[key] === "boolean") {
      normalized[key] = source[key];
    }
  });

  return normalized;
}

export function parseClassAppFeaturesPayload(input: {
  className?: unknown;
  features?: unknown;
}):
  | { ok: true; className: string; features: ClassAppFeatures }
  | { ok: false; message: string } {
  const className = typeof input.className === "string" ? input.className.trim() : "";
  if (!className) {
    return { ok: false, message: "クラスを選択してください。" };
  }

  if (!input.features || typeof input.features !== "object" || Array.isArray(input.features)) {
    return { ok: false, message: "機能設定の形式が正しくありません。" };
  }

  const source = input.features as Record<string, unknown>;
  for (const key of CLASS_APP_FEATURE_KEYS) {
    if (typeof source[key] !== "boolean") {
      return {
        ok: false,
        message: `機能「${key}」の値が不正です。6項目すべてを boolean で送ってください。`,
      };
    }
  }

  return {
    ok: true,
    className,
    features: {
      timer: source.timer as boolean,
      quest: source.quest as boolean,
      record: source.record as boolean,
      collection: source.collection as boolean,
      ranking: source.ranking as boolean,
      mypage: source.mypage as boolean,
    },
  };
}

export function countEnabledClassAppFeatures(features: ClassAppFeatures) {
  return CLASS_APP_FEATURE_KEYS.filter((key) => features[key]).length;
}
