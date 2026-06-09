import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildExamSectionTitle,
  calculateAverageScore,
  type ExamType,
} from "@/lib/examResults";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

const EXAM_TYPES: ExamType[] = ["regular", "mock", "graduation"];

type ExamResultRow = {
  session_key: string;
  session_label: string;
  subject_name: string;
  score: number | string;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();

  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const gakuseiId = url.searchParams.get("gakuseiId")?.trim();
  const requestedExamType = url.searchParams.get("examType")?.trim();
  const sessionKey = url.searchParams.get("sessionKey")?.trim() ?? null;

  if (!gakuseiId) {
    return NextResponse.json({ message: "学生が選択されていません。" }, { status: 400 });
  }

  const examType = EXAM_TYPES.includes(requestedExamType as ExamType)
    ? (requestedExamType as ExamType)
    : "regular";

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("student_exam_results")
    .select("session_key, session_label, subject_name, score")
    .eq("gakusei_id", gakuseiId)
    .eq("exam_type", examType)
    .order("session_key", { ascending: true })
    .order("subject_name", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message.includes("student_exam_results")) {
      return NextResponse.json({
        examType,
        sessions: [],
        selectedSessionKey: null,
        sectionTitle: null,
        scores: [],
        averageScore: null,
        tableMissing: true,
      });
    }

    console.error("[exam-results] student_exam_results:", error.message);
    return NextResponse.json(
      { message: "試験成績の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as ExamResultRow[];
  const sessionMap = new Map<string, ExamSessionAccumulator>();

  rows.forEach((row) => {
    const existing = sessionMap.get(row.session_key) ?? {
      sessionKey: row.session_key,
      sessionLabel: row.session_label,
      scores: [],
    };

    existing.scores.push({
      subjectName: row.subject_name,
      score: Number(row.score),
    });
    sessionMap.set(row.session_key, existing);
  });

  const sessions = [...sessionMap.values()]
    .sort((a, b) => a.sessionKey.localeCompare(b.sessionKey, "ja"))
    .map((session) => ({
      sessionKey: session.sessionKey,
      sessionLabel: session.sessionLabel,
      sectionTitle: buildExamSectionTitle(examType, session.sessionLabel),
    }));

  const selectedSession =
    sessions.find((session) => session.sessionKey === sessionKey) ??
    sessions[0] ??
    null;

  const selectedScores = selectedSession
    ? (sessionMap.get(selectedSession.sessionKey)?.scores ?? [])
    : [];

  return NextResponse.json({
    examType,
    sessions,
    selectedSessionKey: selectedSession?.sessionKey ?? null,
    sectionTitle: selectedSession?.sectionTitle ?? null,
    scores: selectedScores,
    averageScore: calculateAverageScore(selectedScores),
    tableMissing: false,
  });
}

type ExamSessionAccumulator = {
  sessionKey: string;
  sessionLabel: string;
  scores: { subjectName: string; score: number }[];
};
