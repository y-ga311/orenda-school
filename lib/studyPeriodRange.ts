import { addDaysToJapanDate, getJapanBoundaryIso, getJapanDateParts } from "@/lib/japanDate";
import type { StudyPeriod } from "@/lib/studyRecords";

export function getStudyPeriodRange(period: StudyPeriod, today = getJapanDateParts()) {
  const nextDay = addDaysToJapanDate(today.year, today.month, today.day, 1);
  const dayOfWeek = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const weekStart = addDaysToJapanDate(
    today.year,
    today.month,
    today.day,
    -((dayOfWeek + 6) % 7),
  );
  const weekEnd = addDaysToJapanDate(weekStart.year, weekStart.month, weekStart.day, 7);
  const nextMonth =
    today.month === 12
      ? { year: today.year + 1, month: 1, day: 1 }
      : { year: today.year, month: today.month + 1, day: 1 };
  const nextYear = { year: today.year + 1, month: 1, day: 1 };

  const todayStartIso = getJapanBoundaryIso(today.year, today.month, today.day);
  const tomorrowStartIso = getJapanBoundaryIso(nextDay.year, nextDay.month, nextDay.day);
  const weekStartIso = getJapanBoundaryIso(weekStart.year, weekStart.month, weekStart.day);
  const weekEndIso = getJapanBoundaryIso(weekEnd.year, weekEnd.month, weekEnd.day);
  const monthStartIso = getJapanBoundaryIso(today.year, today.month, 1);
  const nextMonthStartIso = getJapanBoundaryIso(nextMonth.year, nextMonth.month, nextMonth.day);
  const yearStartIso = getJapanBoundaryIso(today.year, 1, 1);
  const nextYearStartIso = getJapanBoundaryIso(nextYear.year, nextYear.month, nextYear.day);

  return {
    today: { startIso: todayStartIso, endIso: tomorrowStartIso },
    week: { startIso: weekStartIso, endIso: weekEndIso },
    month: { startIso: monthStartIso, endIso: nextMonthStartIso },
    year: { startIso: yearStartIso, endIso: nextYearStartIso },
    total: { startIso: null, endIso: null },
  }[period];
}
