import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import {
  buildScoresFromTestScoreRow,
  buildTestScoreSessionKey,
  getTestNameKeyword,
  TEST_SCORES_SELECT,
  type TestScoreRow,
} from "@/lib/testScores";
import {
  buildQuestionCountMap,
  QUESTION_COUNTS_SELECT,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import { loadRegularExamTerms } from "@/lib/regularExam.server";
import {
  buildSubjectTrendSummary,
  type SubjectTrendData,
  type SubjectTrendExamType,
  type SubjectTrendPoint,
} from "@/lib/subjectTrend";

async function loadStudentId(supabase: SupabaseClient, gakuseiId: string) {
  const { data, error } = await supabase
    .from("students")
    .select("id")
    .eq("gakusei_id", gakuseiId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function buildRegularSubjectTrend(
  supabase: SupabaseClient,
  gakuseiId: string,
  subjectName: string,
): Promise<SubjectTrendData> {
  const { terms } = await loadRegularExamTerms(supabase);
  const relevantTerms = terms.filter((term) => term.subjects.includes(subjectName));

  const { data, error } = await supabase
    .from("student_exam_results")
    .select("session_key, session_label, subject_name, score")
    .eq("gakusei_id", gakuseiId)
    .eq("exam_type", "regular")
    .eq("subject_name", subjectName);

  if (error) {
    throw new Error(error.message);
  }

  const scoreBySession = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const sessionKey = String(row.session_key).trim();
    const score = Number(row.score);
    if (sessionKey && Number.isFinite(score)) {
      scoreBySession.set(sessionKey, score);
    }
  });

  const points: SubjectTrendPoint[] = relevantTerms.map((term) => {
    const score = scoreBySession.get(term.sessionKey);
    if (score === undefined) {
      return {
        sessionKey: term.sessionKey,
        sessionLabel: term.sessionLabel,
        sortOrder: term.sortOrder,
        chartValue: null,
        displayValue: "—",
        notTaken: true,
      };
    }

    return {
      sessionKey: term.sessionKey,
      sessionLabel: term.sessionLabel,
      sortOrder: term.sortOrder,
      chartValue: score,
      displayValue: `${score}点`,
      notTaken: false,
    };
  });

  return {
    examType: "regular",
    scoreFormat: "points",
    subjectName,
    points,
    summary: buildSubjectTrendSummary(points, "points"),
  };
}

export async function buildMockSubjectTrend(
  supabase: SupabaseClient,
  gakuseiId: string,
  subjectName: string,
): Promise<SubjectTrendData> {
  const subject = TEST_SCORE_SUBJECTS.find((item) => item.label === subjectName);
  if (!subject) {
    return {
      examType: "mock",
      scoreFormat: "percent",
      subjectName,
      points: [],
      summary: buildSubjectTrendSummary([], "percent"),
    };
  }

  const studentId = await loadStudentId(supabase, gakuseiId);
  if (!studentId) {
    return {
      examType: "mock",
      scoreFormat: "percent",
      subjectName,
      points: [],
      summary: buildSubjectTrendSummary([], "percent"),
    };
  }

  const keyword = getTestNameKeyword("mock");
  const [scoresResult, questionCountsResult] = await Promise.all([
    supabase
      .from("test_scores")
      .select(TEST_SCORES_SELECT)
      .eq("student_id", studentId)
      .ilike("test_name", `%${keyword}%`)
      .order("test_name", { ascending: true }),
    supabase
      .from("question_counts")
      .select(QUESTION_COUNTS_SELECT)
      .ilike("test_name", `%${keyword}%`)
      .order("test_name", { ascending: true }),
  ]);

  if (scoresResult.error) {
    throw new Error(scoresResult.error.message);
  }
  if (questionCountsResult.error) {
    throw new Error(questionCountsResult.error.message);
  }

  const questionCountByTestName = buildQuestionCountMap(
    (questionCountsResult.data ?? []) as unknown as QuestionCountRow[],
  );

  const points: SubjectTrendPoint[] = ((scoresResult.data ?? []) as unknown as TestScoreRow[]).map(
    (row, index) => {
      const testName = String(row.test_name ?? "").trim();
      const scoreRows = buildScoresFromTestScoreRow(
        row,
        questionCountByTestName.get(testName) ?? null,
      );
      const target = scoreRows.find((item) => item.subjectName === subject.label);

      if (!target || target.notTaken || target.score === null) {
        return {
          sessionKey: buildTestScoreSessionKey(testName, index),
          sessionLabel: testName,
          sortOrder: index + 1,
          chartValue: null,
          displayValue: "—",
          notTaken: true,
        };
      }

      return {
        sessionKey: buildTestScoreSessionKey(testName, index),
        sessionLabel: testName,
        sortOrder: index + 1,
        chartValue: target.score,
        displayValue: `${target.correctCount}/${target.questionCount}（${target.score}%）`,
        notTaken: false,
      };
    },
  );

  return {
    examType: "mock",
    scoreFormat: "percent",
    subjectName,
    points,
    summary: buildSubjectTrendSummary(points, "percent"),
  };
}

export async function buildSubjectTrendData(
  supabase: SupabaseClient,
  input: {
    gakuseiId: string;
    examType: SubjectTrendExamType;
    subjectName: string;
  },
) {
  if (input.examType === "regular") {
    return buildRegularSubjectTrend(supabase, input.gakuseiId, input.subjectName);
  }
  return buildMockSubjectTrend(supabase, input.gakuseiId, input.subjectName);
}
