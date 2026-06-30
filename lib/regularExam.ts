export type RegularExamTerm = {
  sessionKey: string;
  gradeYear: number;
  term: number;
  sessionLabel: string;
  sortOrder: number;
  subjects: string[];
};

/** DB seed と同期する定期試験マスタ（オフライン・フォールバック用） */
export const REGULAR_EXAM_TERMS: RegularExamTerm[] = [
  {
    sessionKey: "1-1",
    gradeYear: 1,
    term: 1,
    sessionLabel: "1年/1学期",
    sortOrder: 1,
    subjects: [
      "解剖学①",
      "解剖学②",
      "生理学①",
      "生理学②",
      "経絡経穴概論①",
      "はりきゅう理論①",
    ],
  },
  {
    sessionKey: "1-2",
    gradeYear: 1,
    term: 2,
    sessionLabel: "1年/2学期",
    sortOrder: 2,
    subjects: [
      "解剖学①",
      "解剖学②",
      "生理学①",
      "生理学②",
      "東洋医学概論①",
      "経絡経穴概論①",
    ],
  },
  {
    sessionKey: "1-3",
    gradeYear: 1,
    term: 3,
    sessionLabel: "1年/3学期",
    sortOrder: 3,
    subjects: [
      "医療概論",
      "衛生学・公衆衛生学①",
      "解剖学①",
      "解剖学②",
      "生理学①",
      "生理学②",
      "東洋医学概論①",
      "経絡経穴概論①",
    ],
  },
  {
    sessionKey: "2-1",
    gradeYear: 2,
    term: 1,
    sessionLabel: "2年/1学期",
    sortOrder: 4,
    subjects: [
      "病理学概論",
      "臨床医学総論①",
      "臨床医学各論①",
      "東洋医学概論②",
      "経絡経穴概論②",
      "東洋医学臨床論①",
    ],
  },
  {
    sessionKey: "2-2",
    gradeYear: 2,
    term: 2,
    sessionLabel: "2年/2学期",
    sortOrder: 5,
    subjects: [
      "衛生学・公衆衛生学②",
      "病理学概論",
      "臨床医学総論①",
      "臨床医学各論①",
      "東洋医学概論②",
      "東洋医学臨床論①",
      "東洋医学臨床論②",
      "はりきゅう理論②",
    ],
  },
  {
    sessionKey: "2-3",
    gradeYear: 2,
    term: 3,
    sessionLabel: "2年/3学期",
    sortOrder: 6,
    subjects: [
      "臨床医学総論①",
      "臨床医学各論①",
      "臨床医学各論②",
      "リハビリテーション医学①",
      "東洋医学臨床論①",
      "東洋医学臨床論②",
      "はりきゅう理論②",
    ],
  },
  {
    sessionKey: "3-1",
    gradeYear: 3,
    term: 1,
    sessionLabel: "3年/1学期",
    sortOrder: 7,
    subjects: [
      "関係法規",
      "臨床医学総論②",
      "臨床医学各論③",
      "リハビリテーション医学②",
      "東洋医学臨床論③",
    ],
  },
  {
    sessionKey: "3-2",
    gradeYear: 3,
    term: 2,
    sessionLabel: "3年/2学期",
    sortOrder: 8,
    subjects: [
      "関係法規",
      "臨床医学総論②",
      "臨床医学各論③",
      "リハビリテーション医学②",
    ],
  },
  {
    sessionKey: "3-3",
    gradeYear: 3,
    term: 3,
    sessionLabel: "3年/3学期",
    sortOrder: 9,
    subjects: ["臨床医学総論②", "リハビリテーション医学②"],
  },
];

export const REGULAR_EXAM_MAX_SCORE = 100;

export const REGULAR_EXAM_TREND_FANOUT: Record<string, string[]> = {
  "はりきゅう理論①": ["acupuncture_theory", "moxibustion_theory"],
  "はりきゅう理論②": ["acupuncture_theory", "moxibustion_theory"],
};

const termBySessionKey = new Map(
  REGULAR_EXAM_TERMS.map((term) => [term.sessionKey, term]),
);

export function getRegularExamTerm(sessionKey: string | null | undefined) {
  if (!sessionKey) {
    return null;
  }
  return termBySessionKey.get(sessionKey.trim()) ?? null;
}

export function sortRegularExamTerms<T extends { sessionKey: string; sortOrder?: number }>(
  terms: T[],
) {
  return [...terms].sort((a, b) => {
    const orderA = a.sortOrder ?? getRegularExamTerm(a.sessionKey)?.sortOrder ?? 999;
    const orderB = b.sortOrder ?? getRegularExamTerm(b.sessionKey)?.sortOrder ?? 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.sessionKey.localeCompare(b.sessionKey, "ja");
  });
}

export function getAllRegularExamSubjectNames() {
  const names = new Set<string>();
  REGULAR_EXAM_TERMS.forEach((term) => {
    term.subjects.forEach((subject) => names.add(subject));
  });
  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

export function parseRegularExamPointScore(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > REGULAR_EXAM_MAX_SCORE) {
    return null;
  }
  return parsed;
}
