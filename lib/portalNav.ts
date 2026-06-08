export type PortalNavItem = {
  label: string;
  href: string;
  section?: "confirm" | "edit";
};

export const portalNavItems: PortalNavItem[] = [
  { label: "学習時間（個人別）", href: "/learning-time", section: "confirm" },
  { label: "学習時間ランキング", href: "#", section: "confirm" },
  { label: "定期試験", href: "#", section: "confirm" },
  { label: "模擬試験", href: "#", section: "confirm" },
  { label: "卒業試験", href: "#", section: "confirm" },
  { label: "科目別推移", href: "#", section: "confirm" },
  { label: "学生基本情報", href: "#", section: "edit" },
  { label: "試験問題数設定", href: "#", section: "edit" },
  { label: "新規学生登録", href: "#", section: "edit" },
  { label: "試験結果登録", href: "#", section: "edit" },
  { label: "Orenda編集", href: "#", section: "edit" },
  { label: "つながるポータル保護者連絡", href: "#", section: "edit" },
];
