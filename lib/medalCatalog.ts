export type MedalTier = "G" | "S" | "C";

export type MedalAchievement = {
  id: string;
  title: string;
  description: string;
  medalNo: string;
  tier: MedalTier;
  sortOrder: number;
  isActive: boolean;
};

/** 教員ポータルで付与する達成メダル一覧（表示順固定） */
export const MEDAL_ACHIEVEMENT_CATALOG: MedalAchievement[] = [
  {
    id: "career-nav",
    title: "キャリアnavi",
    description: "キャリアnaviプログラム参加",
    medalNo: "001",
    tier: "S",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "company-session",
    title: "企業説明会",
    description: "企業説明会への参加",
    medalNo: "002",
    tier: "G",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "ankoku-term1",
    title: "暗刻(1学期)",
    description: "暗記コンテスト「暗刻」1学期達成",
    medalNo: "003",
    tier: "C",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "ankoku-term2",
    title: "暗刻(2学期)",
    description: "暗記コンテスト「暗刻」2学期達成",
    medalNo: "003",
    tier: "S",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "ankoku-term3",
    title: "暗刻(3学期)",
    description: "暗記コンテスト「暗刻」3学期達成",
    medalNo: "003",
    tier: "G",
    sortOrder: 50,
    isActive: true,
  },
  {
    id: "attendance-y1s1",
    title: "出席率95%以上(1年1学期)",
    description: "1年1学期の出席率95%以上を達成",
    medalNo: "004",
    tier: "C",
    sortOrder: 60,
    isActive: true,
  },
  {
    id: "attendance-y1s2",
    title: "出席率95%以上(1年2学期)",
    description: "1年2学期の出席率95%以上を達成",
    medalNo: "004",
    tier: "S",
    sortOrder: 70,
    isActive: true,
  },
  {
    id: "attendance-y1s3",
    title: "出席率95%以上(1年3学期)",
    description: "1年3学期の出席率95%以上を達成",
    medalNo: "004",
    tier: "G",
    sortOrder: 80,
    isActive: true,
  },
  {
    id: "mogusa-factory",
    title: "もぐさ工場見学",
    description: "もぐさ工場見学への参加",
    medalNo: "005",
    tier: "G",
    sortOrder: 90,
    isActive: true,
  },
  {
    id: "career-nav2",
    title: "キャリアnavi2",
    description: "キャリアnavi2プログラム参加",
    medalNo: "001",
    tier: "G",
    sortOrder: 100,
    isActive: true,
  },
  {
    id: "anmame-term1",
    title: "暗豆(1学期)",
    description: "暗記コンテスト「暗豆」1学期達成",
    medalNo: "006",
    tier: "C",
    sortOrder: 110,
    isActive: true,
  },
  {
    id: "anmame-term2",
    title: "暗豆(2学期)",
    description: "暗記コンテスト「暗豆」2学期達成",
    medalNo: "006",
    tier: "S",
    sortOrder: 120,
    isActive: true,
  },
  {
    id: "anmame-term3",
    title: "暗豆(3学期)",
    description: "暗記コンテスト「暗豆」3学期達成",
    medalNo: "006",
    tier: "G",
    sortOrder: 130,
    isActive: true,
  },
  {
    id: "attendance-y2s1",
    title: "出席率95%以上(2年1学期)",
    description: "2年1学期の出席率95%以上を達成",
    medalNo: "007",
    tier: "C",
    sortOrder: 140,
    isActive: true,
  },
  {
    id: "attendance-y2s2",
    title: "出席率95%以上(2年2学期)",
    description: "2年2学期の出席率95%以上を達成",
    medalNo: "007",
    tier: "S",
    sortOrder: 150,
    isActive: true,
  },
  {
    id: "attendance-y2s3",
    title: "出席率95%以上(2年3学期)",
    description: "2年3学期の出席率95%以上を達成",
    medalNo: "007",
    tier: "G",
    sortOrder: 160,
    isActive: true,
  },
  {
    id: "job-session",
    title: "就職説明会",
    description: "就職説明会への参加",
    medalNo: "008",
    tier: "G",
    sortOrder: 170,
    isActive: true,
  },
  {
    id: "anki-term1",
    title: "暗爺(1学期)",
    description: "暗記コンテスト「暗爺」1学期達成",
    medalNo: "009",
    tier: "C",
    sortOrder: 180,
    isActive: true,
  },
  {
    id: "anki-term2",
    title: "暗爺(2学期)",
    description: "暗記コンテスト「暗爺」2学期達成",
    medalNo: "009",
    tier: "S",
    sortOrder: 190,
    isActive: true,
  },
  {
    id: "anki-term3",
    title: "暗爺(3学期)",
    description: "暗記コンテスト「暗爺」3学期達成",
    medalNo: "009",
    tier: "G",
    sortOrder: 200,
    isActive: true,
  },
  {
    id: "attendance-y3s1",
    title: "出席率95%以上(3年1学期)",
    description: "3年1学期の出席率95%以上を達成",
    medalNo: "010",
    tier: "C",
    sortOrder: 210,
    isActive: true,
  },
  {
    id: "attendance-y3s2",
    title: "出席率95%以上(3年2学期)",
    description: "3年2学期の出席率95%以上を達成",
    medalNo: "010",
    tier: "S",
    sortOrder: 220,
    isActive: true,
  },
  {
    id: "attendance-y3s3",
    title: "出席率95%以上(3年3学期)",
    description: "3年3学期の出席率95%以上を達成",
    medalNo: "010",
    tier: "G",
    sortOrder: 230,
    isActive: true,
  },
  {
    id: "sports-win",
    title: "球技大会優勝",
    description: "球技大会で優勝",
    medalNo: "011",
    tier: "G",
    sortOrder: 240,
    isActive: true,
  },
  {
    id: "mock-exam-1st",
    title: "模擬試験1位",
    description: "模擬試験で1位",
    medalNo: "012",
    tier: "G",
    sortOrder: 250,
    isActive: true,
  },
  {
    id: "regular-exam-1st",
    title: "定期試験1位",
    description: "定期試験で1位",
    medalNo: "013",
    tier: "G",
    sortOrder: 260,
    isActive: true,
  },
];

export type MedalGrantStatus = "granted" | "not_granted" | "partial";

export function getMedalGrantStatus(
  selectedGakuseiIds: string[],
  achievementId: string,
  grantsByGakuseiId: Record<string, string[]>,
): MedalGrantStatus {
  if (selectedGakuseiIds.length === 0) {
    return "not_granted";
  }

  let grantedCount = 0;
  for (const gakuseiId of selectedGakuseiIds) {
    const grants = grantsByGakuseiId[gakuseiId] ?? [];
    if (grants.includes(achievementId)) {
      grantedCount += 1;
    }
  }

  if (grantedCount === 0) {
    return "not_granted";
  }
  if (grantedCount === selectedGakuseiIds.length) {
    return "granted";
  }
  return "partial";
}

export function getMedalGrantStatusLabel(status: MedalGrantStatus) {
  if (status === "granted") {
    return "付与";
  }
  if (status === "partial") {
    return "一部付与";
  }
  return "未付与";
}

export function formatMedalImageKey(medalNo: string, tier: MedalTier) {
  return `${medalNo}${tier}`;
}
