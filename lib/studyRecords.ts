import {
  addDaysToJapanDate,
  formatJapanDateLabel,
  getDateKey,
  getJapanDateKey,
  getJapanDateParts,
} from "@/lib/japanDate";

export type StudyPeriod = "today" | "week" | "month" | "year" | "total";

export const STUDY_PERIODS: StudyPeriod[] = [
  "today",
  "week",
  "month",
  "year",
  "total",
];

const SUBJECT_BREAKDOWN_COLORS = [
  "#34C759",
  "#007AFF",
  "#FFCC00",
  "#FF9500",
  "#AF52DE",
];

const SUBJECT_TAG_STYLES = [
  { tagBg: "#DBEAFE", tagText: "#1D4ED8" },
  { tagBg: "#DCFCE7", tagText: "#166534" },
  { tagBg: "#FFEDD5", tagText: "#C2410C" },
  { tagBg: "#FEE2E2", tagText: "#B91C1C" },
  { tagBg: "#EDE9FE", tagText: "#6D28D9" },
  { tagBg: "#FEF3C7", tagText: "#B45309" },
];

export type StudySession = {
  duration_minutes: number | null;
  studied_at: string | null;
  subject_name: string | null;
};

export type SubjectStyle = {
  color: string;
  tagBg: string;
  tagText: string;
};

export function buildSubjectStyleMap(sessions: StudySession[]) {
  const minutesBySubject = new Map<string, number>();

  sessions.forEach((session) => {
    const subjectName = session.subject_name ?? "未分類";
    minutesBySubject.set(
      subjectName,
      (minutesBySubject.get(subjectName) ?? 0) + (session.duration_minutes ?? 0),
    );
  });

  const styleMap = new Map<string, SubjectStyle>();
  [...minutesBySubject.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([subjectName], index) => {
      const tagStyle = SUBJECT_TAG_STYLES[index % SUBJECT_TAG_STYLES.length];
      styleMap.set(subjectName, {
        color: SUBJECT_BREAKDOWN_COLORS[index % SUBJECT_BREAKDOWN_COLORS.length],
        tagBg: tagStyle.tagBg,
        tagText: tagStyle.tagText,
      });
    });

  return styleMap;
}

export function sumDurationMinutes(
  sessions: { duration_minutes: number | null }[] | null,
) {
  return (
    sessions?.reduce((total, session) => total + (session.duration_minutes ?? 0), 0) ??
    0
  );
}

export function buildSubjectBreakdown(sessions: StudySession[]) {
  const minutesBySubject = new Map<string, number>();
  let totalMinutes = 0;

  sessions.forEach((session) => {
    const minutes = session.duration_minutes ?? 0;
    const subjectName = session.subject_name ?? "未分類";
    totalMinutes += minutes;
    minutesBySubject.set(subjectName, (minutesBySubject.get(subjectName) ?? 0) + minutes);
  });

  return [...minutesBySubject.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([subjectName, minutes], index) => ({
      subjectName,
      minutes,
      percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
      color: SUBJECT_BREAKDOWN_COLORS[index % SUBJECT_BREAKDOWN_COLORS.length],
    }));
}

function countStudiedDays(sessions: StudySession[]) {
  const studiedDateKeys = new Set<string>();

  sessions.forEach((session) => {
    if (!session.studied_at || !session.duration_minutes) {
      return;
    }
    studiedDateKeys.add(getJapanDateKey(session.studied_at));
  });

  return studiedDateKeys.size;
}

export function buildPeriodSummary(sessions: StudySession[]) {
  const totalMinutes = sumDurationMinutes(sessions);
  const studiedDays = countStudiedDays(sessions);

  return {
    totalMinutes,
    studiedDays,
    averageMinutes: studiedDays > 0 ? Math.round(totalMinutes / studiedDays) : 0,
  };
}

export function buildSubjectTotals(sessions: StudySession[]) {
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
    .map(([subjectName, minutes]) => ({
      subjectName,
      minutes,
    }));
}

export function buildSessionLog(sessions: StudySession[]) {
  const styleMap = buildSubjectStyleMap(sessions);
  const byDate = new Map<string, StudySession[]>();

  sessions
    .filter((session) => session.studied_at && (session.duration_minutes ?? 0) > 0)
    .forEach((session) => {
      const key = getJapanDateKey(session.studied_at!);
      const list = byDate.get(key) ?? [];
      list.push(session);
      byDate.set(key, list);
    });

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, daySessions]) => {
      const sortedSessions = [...daySessions].sort(
        (a, b) => new Date(b.studied_at!).getTime() - new Date(a.studied_at!).getTime(),
      );

      return {
        dateKey,
        dateLabel: formatJapanDateLabel(sortedSessions[0].studied_at!),
        sessions: sortedSessions.map((session) => {
          const subjectName = session.subject_name ?? "未分類";
          const style = styleMap.get(subjectName) ?? {
            color: SUBJECT_BREAKDOWN_COLORS[0],
            tagBg: SUBJECT_TAG_STYLES[0].tagBg,
            tagText: SUBJECT_TAG_STYLES[0].tagText,
          };

          return {
            studiedAt: session.studied_at!,
            subjectName,
            durationMinutes: session.duration_minutes ?? 0,
            color: style.color,
            tagBackground: style.tagBg,
            tagColor: style.tagText,
          };
        }),
      };
    });
}

export function buildCalendarDays(
  sessions: StudySession[],
  targetMonth: { year: number; month: number },
  today = getJapanDateParts(),
) {
  const minutesByDate = new Map<string, number>();
  const firstDay = new Date(Date.UTC(targetMonth.year, targetMonth.month - 1, 1));
  const mondayFirstOffset = (firstDay.getUTCDay() + 6) % 7;
  const todayKey = getDateKey(today.year, today.month, today.day);

  sessions.forEach((session) => {
    if (!session.studied_at) {
      return;
    }
    const key = getJapanDateKey(session.studied_at);
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + (session.duration_minutes ?? 0));
  });

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDaysToJapanDate(
      targetMonth.year,
      targetMonth.month,
      1,
      index - mondayFirstOffset,
    );
    const key = getDateKey(date.year, date.month, date.day);

    return {
      date: key,
      day: date.day,
      minutes: minutesByDate.get(key) ?? 0,
      isCurrentMonth: date.month === targetMonth.month,
      isToday: key === todayKey,
    };
  });
}
