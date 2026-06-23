export type OrendaEditTabKey =
  | "multipleChoice"
  | "teacherQuest"
  | "studentSubmitted"
  | "medalSettings"
  | "nationalExamSchedule";

export type OrendaEditTab = {
  key: OrendaEditTabKey;
  label: string;
};

export const ORENDA_EDIT_TABS: OrendaEditTab[] = [
  { key: "multipleChoice", label: "4択問題" },
  { key: "teacherQuest", label: "教員クエスト" },
  { key: "studentSubmitted", label: "学生投稿問題" },
  { key: "medalSettings", label: "メダル設定" },
  { key: "nationalExamSchedule", label: "国家試験日程登録" },
];

export const DEFAULT_ORENDA_EDIT_TAB: OrendaEditTabKey = "multipleChoice";

export function getOrendaEditTab(key: OrendaEditTabKey) {
  return ORENDA_EDIT_TABS.find((tab) => tab.key === key);
}
