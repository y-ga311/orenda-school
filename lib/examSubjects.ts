export const TEST_SCORE_SUBJECTS = [
  { column: "medical_overview", label: "医療概論" },
  { column: "public_health", label: "衛生学・公衆衛生学" },
  { column: "related_laws", label: "関係法規" },
  { column: "anatomy", label: "解剖学" },
  { column: "physiology", label: "生理学" },
  { column: "pathology", label: "病理学" },
  { column: "clinical_medicine_overview", label: "臨床医学総論" },
  { column: "clinical_medicine_detail", label: "臨床医学各論" },
  { column: "clinical_medicine_detail_total", label: "臨床医学各論（総合）" },
  { column: "rehabilitation", label: "リハビリテーション医学" },
  { column: "oriental_medicine_overview", label: "東洋医学概論" },
  { column: "meridian_points", label: "経絡経穴概論" },
  { column: "oriental_medicine_clinical", label: "東洋医学臨床論" },
  { column: "oriental_medicine_clinical_general", label: "東洋医学臨床論（総合）" },
  { column: "acupuncture_theory", label: "はり理論" },
  { column: "moxibustion_theory", label: "きゅう理論" },
] as const;

export type TestScoreSubjectColumn = (typeof TEST_SCORE_SUBJECTS)[number]["column"];
