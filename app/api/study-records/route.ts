import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  addDaysToJapanDate,
  getJapanBoundaryIso,
  getJapanDateParts,
} from "@/lib/japanDate";
import {
  buildCalendarDays,
  buildPeriodSummary,
  buildSessionLog,
  buildSubjectBreakdown,
  buildSubjectTotals,
  STUDY_PERIODS,
  sumDurationMinutes,
  type StudyPeriod,
  type StudySession,
} from "@/lib/studyRecords";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type ResolveStudentIdResult =
  | { studentId: string; error: null }
  | { studentId: null; error: { status: number; message: string } };

async function resolveStudentId(request: Request): Promise<ResolveStudentIdResult> {
  const cookieStore = await cookies();
  const url = new URL(request.url);
  const queryStudentId = url.searchParams.get("studentId")?.trim();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();

  if (teacherId) {
    if (!queryStudentId) {
      return {
        studentId: null,
        error: { status: 400, message: "学生が選択されていません。" },
      };
    }
    return { studentId: queryStudentId, error: null };
  }

  const studentCookie =
    cookieStore.get("orenda_student_id")?.value?.trim() ??
    cookieStore.get("student_id")?.value?.trim();

  if (studentCookie) {
    return { studentId: studentCookie, error: null };
  }

  return {
    studentId: null,
    error: { status: 401, message: "ログインが必要です。" },
  };
}

export async function GET(request: Request) {
  const resolved = await resolveStudentId(request);

  if (resolved.error) {
    return NextResponse.json(
      { message: resolved.error.message },
      { status: resolved.error.status },
    );
  }

  const studentId = resolved.studentId;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const today = getJapanDateParts();
  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year"));
  const requestedMonth = Number(url.searchParams.get("month"));
  const requestedPeriod = url.searchParams.get("period");
  const period: StudyPeriod = STUDY_PERIODS.includes(requestedPeriod as StudyPeriod)
    ? (requestedPeriod as StudyPeriod)
    : "month";
  const targetMonth = {
    year: Number.isInteger(requestedYear) ? requestedYear : today.year,
    month:
      Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : today.month,
    day: 1,
  };
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
    targetMonth.month === 12
      ? { year: targetMonth.year + 1, month: 1, day: 1 }
      : { year: targetMonth.year, month: targetMonth.month + 1, day: 1 };
  const nextYear = { year: targetMonth.year + 1, month: 1, day: 1 };

  const todayStartIso = getJapanBoundaryIso(today.year, today.month, today.day);
  const tomorrowStartIso = getJapanBoundaryIso(nextDay.year, nextDay.month, nextDay.day);
  const weekStartIso = getJapanBoundaryIso(weekStart.year, weekStart.month, weekStart.day);
  const weekEndIso = getJapanBoundaryIso(weekEnd.year, weekEnd.month, weekEnd.day);
  const monthStartIso = getJapanBoundaryIso(targetMonth.year, targetMonth.month, 1);
  const nextMonthStartIso = getJapanBoundaryIso(nextMonth.year, nextMonth.month, nextMonth.day);
  const yearStartIso = getJapanBoundaryIso(targetMonth.year, 1, 1);
  const nextYearStartIso = getJapanBoundaryIso(nextYear.year, nextYear.month, nextYear.day);
  const periodRange = {
    today: { startIso: todayStartIso, endIso: tomorrowStartIso },
    week: { startIso: weekStartIso, endIso: weekEndIso },
    month: { startIso: monthStartIso, endIso: nextMonthStartIso },
    year: { startIso: yearStartIso, endIso: nextYearStartIso },
    total: { startIso: null, endIso: null },
  }[period];

  let periodQuery = supabase
    .from("study_sessions")
    .select("duration_minutes, studied_at, subject_name")
    .eq("gakusei_id", studentId);

  if (periodRange.startIso && periodRange.endIso) {
    periodQuery = periodQuery
      .gte("studied_at", periodRange.startIso)
      .lt("studied_at", periodRange.endIso);
  }

  const [todayResult, monthResult, totalResult, periodResult] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("duration_minutes")
      .eq("gakusei_id", studentId)
      .gte("studied_at", todayStartIso)
      .lt("studied_at", tomorrowStartIso),
    supabase
      .from("study_sessions")
      .select("duration_minutes, studied_at, subject_name")
      .eq("gakusei_id", studentId)
      .gte("studied_at", monthStartIso)
      .lt("studied_at", nextMonthStartIso),
    supabase.from("study_sessions").select("duration_minutes").eq("gakusei_id", studentId),
    periodQuery,
  ]);

  const error =
    todayResult.error ?? monthResult.error ?? totalResult.error ?? periodResult.error;

  if (error) {
    console.error("[study-records] study_sessions:", error.message);
    return NextResponse.json(
      { message: "学習記録の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  const monthSessions = (monthResult.data ?? []) as StudySession[];
  const periodSessions = (periodResult.data ?? []) as StudySession[];

  return NextResponse.json({
    summary: {
      todayMinutes: sumDurationMinutes(todayResult.data),
      monthMinutes: sumDurationMinutes(monthSessions),
      totalMinutes: sumDurationMinutes(totalResult.data),
    },
    selectedPeriod: period,
    periodSummary: buildPeriodSummary(periodSessions),
    subjectBreakdown: buildSubjectBreakdown(periodSessions),
    subjectTotals: buildSubjectTotals(periodSessions),
    sessionLog: buildSessionLog(periodSessions),
    calendar: {
      year: targetMonth.year,
      month: targetMonth.month,
      days: buildCalendarDays(monthSessions, targetMonth, today),
    },
  });
}
