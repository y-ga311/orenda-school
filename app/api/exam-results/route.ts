import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildExamSectionTitle,
  calculateAverageScore,
  type ExamType,
} from "@/lib/examResults";
import {
  buildTestScoreExamResponse,
  getTestNameKeyword,
  TEST_SCORES_SELECT,
  type TestScoreRow,
  usesTestScoresTable,
} from "@/lib/testScores";
import {
  buildQuestionCountMap,
  QUESTION_COUNTS_SELECT,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import {
  getRegularExamSubjectsForSession,
  loadRegularExamTerms,
} from "@/lib/regularExam.server";
import { sortRegularExamTerms } from "@/lib/regularExam";
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

function buildRegularExamResponse(
  examType: "regular",
  rows: ExamResultRow[],
  sessionKey: string | null,
  terms: Awaited<ReturnType<typeof loadRegularExamTerms>>["terms"],
  masterTableMissing: boolean,
) {
  const scoreBySession = new Map<string, Map<string, number>>();

  rows.forEach((row) => {
    const sessionScores =
      scoreBySession.get(row.session_key) ?? new Map<string, number>();
    sessionScores.set(row.subject_name, Number(row.score));
    scoreBySession.set(row.session_key, sessionScores);
  });

  const sessions = sortRegularExamTerms(
    terms.map((term) => ({
      sessionKey: term.sessionKey,
      sessionLabel: term.sessionLabel,
      sectionTitle: buildExamSectionTitle(examType, term.sessionLabel),
      sortOrder: term.sortOrder,
    })),
  );

  const selectedSession =
    sessions.find((session) => session.sessionKey === sessionKey) ??
    sessions[0] ??
    null;

  const termDefinition = selectedSession
    ? terms.find((term) => term.sessionKey === selectedSession.sessionKey)
    : null;
  const sessionScores = selectedSession
    ? (scoreBySession.get(selectedSession.sessionKey) ?? new Map<string, number>())
    : new Map<string, number>();

  const subjectOrder =
    termDefinition?.subjects ??
    (selectedSession
      ? getRegularExamSubjectsForSession(terms, selectedSession.sessionKey)
      : []);

  const selectedScores =
    subjectOrder.length > 0
      ? subjectOrder.map((subjectName) => {
          const score = sessionScores.get(subjectName);
          if (score === undefined) {
            return {
              subjectName,
              score: null,
              notTaken: true,
            };
          }
          return {
            subjectName,
            score,
            notTaken: false,
          };
        })
      : [...sessionScores.entries()].map(([subjectName, score]) => ({
          subjectName,
          score,
          notTaken: false,
        }));

  return {
    examType,
    scoreFormat: "points" as const,
    sessions,
    selectedSessionKey: selectedSession?.sessionKey ?? null,
    sectionTitle: selectedSession?.sectionTitle ?? null,
    scores: selectedScores,
    averageScore: calculateAverageScore(selectedScores),
    tableMissing: masterTableMissing,
    masterTableMissing,
  };
}

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

  if (usesTestScoresTable(examType)) {
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("gakusei_id", gakuseiId)
      .maybeSingle();

    if (studentError) {
      console.error("[exam-results] students:", studentError.message);
      return NextResponse.json(
        { message: "学生情報の取得中にエラーが発生しました。" },
        { status: 500 },
      );
    }

    if (!student?.id) {
      return NextResponse.json({ message: "学生が見つかりません。" }, { status: 404 });
    }

    const keyword = getTestNameKeyword(examType);
    const [scoresResult, questionCountsResult] = await Promise.all([
      supabase
        .from("test_scores")
        .select(TEST_SCORES_SELECT)
        .eq("student_id", student.id)
        .ilike("test_name", `%${keyword}%`)
        .order("test_name", { ascending: true }),
      supabase.from("question_counts").select(QUESTION_COUNTS_SELECT).ilike("test_name", `%${keyword}%`).order("test_name", {
        ascending: true,
      }),
    ]);

    const { data, error } = scoresResult;

    if (error) {
      if (error.code === "42P01" || error.message.includes("test_scores")) {
        return NextResponse.json({
          examType,
          sessions: [],
          selectedSessionKey: null,
          sectionTitle: null,
          testDate: null,
          scores: [],
          averageScore: null,
          tableMissing: true,
          questionCountsMissing: false,
        });
      }

      console.error("[exam-results] test_scores:", error.message);
      return NextResponse.json(
        { message: "試験成績の取得中にエラーが発生しました。" },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as unknown as TestScoreRow[];
    let questionCountByTestName = new Map<string, QuestionCountRow>();
    let questionCountsMissing = false;

    if (questionCountsResult.error) {
      if (
        questionCountsResult.error.code === "42P01" ||
        questionCountsResult.error.message.includes("question_counts")
      ) {
        questionCountsMissing = true;
      } else {
        console.error("[exam-results] question_counts:", questionCountsResult.error.message);
        return NextResponse.json(
          { message: "問題数の取得中にエラーが発生しました。" },
          { status: 500 },
        );
      }
    } else {
      questionCountByTestName = buildQuestionCountMap(
        (questionCountsResult.data ?? []) as unknown as QuestionCountRow[],
      );
    }

    return NextResponse.json({
      ...buildTestScoreExamResponse(examType, rows, questionCountByTestName, sessionKey),
      questionCountsMissing,
    });
  }

  let termsLoad;
  try {
    termsLoad = await loadRegularExamTerms(supabase);
  } catch (termsError) {
    console.error("[exam-results] regular_exam_terms:", termsError);
    return NextResponse.json(
      { message: "定期試験マスタの取得中にエラーが発生しました。" },
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
      return NextResponse.json(
        buildRegularExamResponse(
          "regular",
          [],
          sessionKey,
          termsLoad.terms,
          true,
        ),
      );
    }

    console.error("[exam-results] student_exam_results:", error.message);
    return NextResponse.json(
      { message: "試験成績の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    buildRegularExamResponse(
      "regular",
      (data ?? []) as ExamResultRow[],
      sessionKey,
      termsLoad.terms,
      termsLoad.tableMissing,
    ),
  );
}
