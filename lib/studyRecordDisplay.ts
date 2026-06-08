import type { StudyPeriod } from "@/lib/studyRecords";

export const recordPeriodOptions = [
  { id: "today", label: "今日", title: "今日の学習時間" },
  { id: "week", label: "週間", title: "週間の学習時間" },
  { id: "month", label: "月間", title: "月間の学習時間" },
  { id: "year", label: "年間", title: "年間の学習時間" },
  { id: "total", label: "総時間", title: "総学習時間" },
] as const satisfies ReadonlyArray<{
  id: StudyPeriod;
  label: string;
  title: string;
}>;

export type StudyRecordData = {
  summary: {
    todayMinutes: number;
    monthMinutes: number;
    totalMinutes: number;
  };
  selectedPeriod: StudyPeriod;
  periodSummary: {
    averageMinutes: number;
    studiedDays: number;
    totalMinutes: number;
  };
  subjectBreakdown: {
    color: string;
    minutes: number;
    percentage: number;
    subjectName: string;
  }[];
  subjectTotals: {
    subjectName: string;
    minutes: number;
  }[];
  sessionLog: {
    dateKey: string;
    dateLabel: string;
    sessions: {
      studiedAt: string;
      subjectName: string;
      durationMinutes: number;
      color: string;
      tagBackground: string;
      tagColor: string;
    }[];
  }[];
  calendar: {
    year: number;
    month: number;
    days: {
      date: string;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      minutes: number;
    }[];
  };
};

export function formatStudyMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes}分`;
  }

  if (restMinutes === 0) {
    return `${hours}時間`;
  }

  return `${hours}時間${restMinutes}分`;
}

export function buildStudyPieGradient(
  subjects: StudyRecordData["subjectBreakdown"],
): string {
  if (subjects.length === 0) {
    return "#e5e5ea";
  }

  const totalMinutes = subjects.reduce((sum, subject) => sum + subject.minutes, 0);
  if (totalMinutes <= 0) {
    return "#e5e5ea";
  }

  let cumulativePercent = 0;
  const stops = subjects.map((subject, index) => {
    const start = cumulativePercent;
    const slicePercent = (subject.minutes / totalMinutes) * 100;
    cumulativePercent += slicePercent;
    const end = index === subjects.length - 1 ? 100 : cumulativePercent;

    return `${subject.color} ${start}% ${end}%`;
  });

  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

export function buildStudyPieChartLabel(
  subjects: StudyRecordData["subjectBreakdown"],
): string {
  return subjects
    .map((subject) => `${subject.subjectName} ${subject.percentage}%`)
    .join("、");
}

export function addMonths(year: number, month: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

export function getJstYearMonth(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const [year, month] = formatter.format(date).split("-").map(Number);
  return { year, month };
}
