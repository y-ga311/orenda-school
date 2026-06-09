import {
  buildPeriodSummary,
  buildSubjectBreakdown,
  buildSubjectStyleMap,
  type StudySession,
} from "@/lib/studyRecords";

export type RankingSession = StudySession & {
  gakusei_id: string;
};

export type StudentInfo = {
  gakusei_id: string;
  name: string;
  class: string | null;
};

export type RankingEntry = {
  rank: number;
  gakuseiId: string;
  name: string;
  class: string;
  totalMinutes: number;
  studiedDays: number;
  averageMinutes: number;
  subjectBreakdown: {
    subjectName: string;
    minutes: number;
    color: string;
    percentage: number;
  }[];
};

export type ClassSubjectTotal = {
  subjectName: string;
  minutes: number;
  color: string;
};

export type SubjectLeader = {
  subjectName: string;
  studentName: string;
  minutes: number;
};

export function buildStudyRanking(
  students: StudentInfo[],
  sessions: RankingSession[],
  subjectFilter: string | null,
) {
  const styleMap = buildSubjectStyleMap(sessions);
  const sessionsByStudent = new Map<string, RankingSession[]>();

  sessions.forEach((session) => {
    const list = sessionsByStudent.get(session.gakusei_id) ?? [];
    list.push(session);
    sessionsByStudent.set(session.gakusei_id, list);
  });

  const entries: Omit<RankingEntry, "rank">[] = students.map((student) => {
    const studentSessions = sessionsByStudent.get(student.gakusei_id) ?? [];
    const filteredSessions =
      subjectFilter === null
        ? studentSessions
        : studentSessions.filter(
            (session) => (session.subject_name ?? "未分類") === subjectFilter,
          );
    const summary = buildPeriodSummary(filteredSessions);
    const breakdown = buildSubjectBreakdown(filteredSessions).map((item) => ({
      ...item,
      color: styleMap.get(item.subjectName)?.color ?? item.color,
    }));

    return {
      gakuseiId: student.gakusei_id,
      name: student.name,
      class: student.class?.trim() || "クラス未設定",
      totalMinutes: summary.totalMinutes,
      studiedDays: summary.studiedDays,
      averageMinutes: summary.averageMinutes,
      subjectBreakdown: breakdown,
    };
  });

  entries.sort((a, b) => {
    if (b.totalMinutes !== a.totalMinutes) {
      return b.totalMinutes - a.totalMinutes;
    }
    return a.name.localeCompare(b.name, "ja");
  });

  const rankedEntries: RankingEntry[] = entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  const classSubjectTotals = buildClassSubjectTotals(sessions, styleMap);
  const subjectLeaders = buildSubjectLeaders(students, sessions, styleMap);

  const subjectOptions = [...new Set(sessions.map((s) => s.subject_name ?? "未分類"))].sort(
    (a, b) => a.localeCompare(b, "ja"),
  );

  return {
    entries: rankedEntries,
    classSubjectTotals,
    subjectLeaders,
    subjectOptions,
  };
}

function buildClassSubjectTotals(
  sessions: RankingSession[],
  styleMap: ReturnType<typeof buildSubjectStyleMap>,
): ClassSubjectTotal[] {
  const minutesBySubject = new Map<string, number>();

  sessions.forEach((session) => {
    const subjectName = session.subject_name ?? "未分類";
    minutesBySubject.set(
      subjectName,
      (minutesBySubject.get(subjectName) ?? 0) + (session.duration_minutes ?? 0),
    );
  });

  return [...minutesBySubject.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([subjectName, minutes]) => ({
      subjectName,
      minutes,
      color: styleMap.get(subjectName)?.color ?? "#94a3b8",
    }));
}

function buildSubjectLeaders(
  students: StudentInfo[],
  sessions: RankingSession[],
  styleMap: ReturnType<typeof buildSubjectStyleMap>,
): SubjectLeader[] {
  const studentNameById = new Map(students.map((s) => [s.gakusei_id, s.name]));
  const minutesBySubjectStudent = new Map<string, Map<string, number>>();

  sessions.forEach((session) => {
    const subjectName = session.subject_name ?? "未分類";
    const byStudent = minutesBySubjectStudent.get(subjectName) ?? new Map<string, number>();
    byStudent.set(
      session.gakusei_id,
      (byStudent.get(session.gakusei_id) ?? 0) + (session.duration_minutes ?? 0),
    );
    minutesBySubjectStudent.set(subjectName, byStudent);
  });

  return [...minutesBySubjectStudent.entries()]
    .map(([subjectName, byStudent]) => {
      const top = [...byStudent.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] <= 0) {
        return null;
      }

      return {
        subjectName,
        studentName: studentNameById.get(top[0]) ?? "—",
        minutes: top[1],
      };
    })
    .filter((item): item is SubjectLeader => item !== null)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
    .map(({ subjectName, studentName, minutes }) => ({
      subjectName,
      studentName,
      minutes,
    }));
}
