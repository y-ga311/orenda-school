export const CLASS_APP_FEATURE_KEYS = [
  "timer",
  "quest",
  "student_quest",
  "tsubotomy",
  "grades",
  "portfolio",
  "links",
  "record",
  "collection",
  "ranking",
  "mypage",
] as const;

export type ClassAppFeatureKey = (typeof CLASS_APP_FEATURE_KEYS)[number];

export type ClassAppFeatures = Record<ClassAppFeatureKey, boolean>;

/** ホームメニューの上からの既定順 */
export const DEFAULT_MENU_ORDER: ClassAppFeatureKey[] = [...CLASS_APP_FEATURE_KEYS];

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
    label: "４択クエスト",
    description: "過去問・教員クエスト",
  },
  {
    key: "student_quest",
    label: "投稿問題",
    description: "メニュー表示のみ",
  },
  {
    key: "tsubotomy",
    label: "ツボトミー",
    description: "メニュー表示のみ",
  },
  {
    key: "grades",
    label: "成績",
    description: "メニュー表示のみ",
  },
  {
    key: "portfolio",
    label: "ポートフォリオ",
    description: "メニュー表示のみ",
  },
  {
    key: "links",
    label: "各種リンク",
    description: "メニュー表示のみ",
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
  menuOrder: ClassAppFeatureKey[];
  updatedAt: string | null;
  updatedBy: string | null;
  existsInDb: boolean;
};

export function createDefaultClassAppFeatures(): ClassAppFeatures {
  return {
    timer: true,
    quest: true,
    student_quest: true,
    tsubotomy: true,
    grades: true,
    portfolio: true,
    links: true,
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

function isClassAppFeatureKey(value: unknown): value is ClassAppFeatureKey {
  return (
    typeof value === "string" &&
    (CLASS_APP_FEATURE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * menu_order を正規化する。
 * 未知キーは無視し、重複は先頭だけ残す。
 * 欠落キーは既定順上の直前項目の直後へ挿入する（例: quest の直後に student_quest）。
 */
export function normalizeMenuOrder(raw: unknown): ClassAppFeatureKey[] {
  const seen = new Set<ClassAppFeatureKey>();
  const ordered: ClassAppFeatureKey[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!isClassAppFeatureKey(entry) || seen.has(entry)) {
        return;
      }
      seen.add(entry);
      ordered.push(entry);
    });
  }

  DEFAULT_MENU_ORDER.forEach((key, defaultIndex) => {
    if (seen.has(key)) {
      return;
    }

    let insertAt = 0;
    DEFAULT_MENU_ORDER.slice(0, defaultIndex).forEach((predecessor) => {
      const index = ordered.indexOf(predecessor);
      if (index >= 0) {
        insertAt = index + 1;
      }
    });
    ordered.splice(insertAt, 0, key);
    seen.add(key);
  });

  return ordered;
}

export function moveMenuOrderItem(
  order: ClassAppFeatureKey[],
  key: ClassAppFeatureKey,
  direction: -1 | 1,
) {
  const next = normalizeMenuOrder(order);
  const index = next.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) {
    return next;
  }
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function parseClassAppFeaturesPayload(input: {
  className?: unknown;
  features?: unknown;
  menuOrder?: unknown;
}):
  | { ok: true; className: string; features: ClassAppFeatures; menuOrder: ClassAppFeatureKey[] }
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
        message: `機能「${key}」の値が不正です。${CLASS_APP_FEATURE_KEYS.length}項目すべてを boolean で送ってください。`,
      };
    }
  }

  if (!Array.isArray(input.menuOrder)) {
    return {
      ok: false,
      message: `表示順は${CLASS_APP_FEATURE_KEYS.length}項目すべての feature key を含む配列で送ってください。`,
    };
  }

  const menuOrder = normalizeMenuOrder(input.menuOrder);
  const providedKeys = new Set(input.menuOrder.filter(isClassAppFeatureKey));
  if (providedKeys.size !== CLASS_APP_FEATURE_KEYS.length) {
    return {
      ok: false,
      message: `表示順は${CLASS_APP_FEATURE_KEYS.length}項目すべての feature key を含む配列で送ってください。`,
    };
  }

  const features = {} as ClassAppFeatures;
  CLASS_APP_FEATURE_KEYS.forEach((key) => {
    features[key] = source[key] as boolean;
  });

  return {
    ok: true,
    className,
    features,
    menuOrder,
  };
}

export function getClassAppFeatureDefinition(key: ClassAppFeatureKey) {
  return CLASS_APP_FEATURE_DEFINITIONS.find((item) => item.key === key);
}

export function countEnabledClassAppFeatures(features: ClassAppFeatures) {
  return CLASS_APP_FEATURE_KEYS.filter((key) => features[key]).length;
}
