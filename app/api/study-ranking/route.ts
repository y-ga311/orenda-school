import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStudyPeriodRange } from "@/lib/studyPeriodRange";
import { buildStudyRanking, type RankingSession } from "@/lib/studyRanking";
import { STUDY_PERIODS, type StudyPeriod } from "@/lib/studyRecords";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();

  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get("period");
  const period: StudyPeriod = STUDY_PERIODS.includes(requestedPeriod as StudyPeriod)
    ? (requestedPeriod as StudyPeriod)
    : "month";
  const classFilter = url.searchParams.get("class")?.trim() ?? "all";
  const subjectParam = url.searchParams.get("subject")?.trim() ?? "all";
  const subjectFilter = subjectParam === "all" ? null : subjectParam;

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("gakusei_id, name, class")
    .order("name", { ascending: true });

  if (studentsError) {
    console.error("[study-ranking] students:", studentsError.message);
    return NextResponse.json(
      { message: "学生一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }

  const allStudents = studentsData ?? [];
  const classOptions = [
    ...new Set(
      allStudents
        .map((student) => student.class?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b, "ja"));

  const students =
    classFilter === "all"
      ? allStudents
      : allStudents.filter((student) => student.class?.trim() === classFilter);

  const gakuseiIds = students.map((student) => student.gakusei_id);

  if (gakuseiIds.length === 0) {
    return NextResponse.json({
      selectedPeriod: period,
      selectedClass: classFilter,
      selectedSubject: subjectParam,
      classOptions,
      subjectOptions: [],
      entries: [],
      classSubjectTotals: [],
      subjectLeaders: [],
    });
  }

  const periodRange = getStudyPeriodRange(period);

  let sessionsQuery = supabase
    .from("study_sessions")
    .select("gakusei_id, duration_minutes, studied_at, subject_name")
    .in("gakusei_id", gakuseiIds);

  if (periodRange.startIso && periodRange.endIso) {
    sessionsQuery = sessionsQuery
      .gte("studied_at", periodRange.startIso)
      .lt("studied_at", periodRange.endIso);
  }

  const { data: sessionsData, error: sessionsError } = await sessionsQuery;

  if (sessionsError) {
    console.error("[study-ranking] study_sessions:", sessionsError.message);
    return NextResponse.json(
      { message: "学習記録の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  const sessions = (sessionsData ?? []) as RankingSession[];
  const ranking = buildStudyRanking(students, sessions, subjectFilter);

  return NextResponse.json({
    selectedPeriod: period,
    selectedClass: classFilter,
    selectedSubject: subjectParam,
    classOptions,
    subjectOptions: ranking.subjectOptions,
    entries: ranking.entries,
    classSubjectTotals: ranking.classSubjectTotals,
    subjectLeaders: ranking.subjectLeaders,
  });
}
