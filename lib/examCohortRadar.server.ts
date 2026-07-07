import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCohortKeyFromClass } from "@/lib/cohort";
import type { ExamScoreRow } from "@/lib/examResults";
import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import {
  buildQuestionCountMap,
  QUESTION_COUNTS_SELECT,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import { roundSubjectTrendAverage } from "@/lib/subjectTrend";
import {
  buildScoresFromTestScoreRow,
  TEST_SCORES_SELECT,
  type TestScoreRow,
} from "@/lib/testScores";

async function loadCohortStudentIdSet(supabase: SupabaseClient, cohortKey: string) {
  const { data, error } = await supabase.from("students").select("id, class");

  if (error) {
    throw new Error(error.message);
  }

  const studentIdSet = new Set<string>();
  (data ?? []).forEach((row) => {
    const rowCohortKey = parseCohortKeyFromClass(row.class as string | null | undefined);
    if (rowCohortKey !== cohortKey || row.id === null || row.id === undefined) {
      return;
    }
    studentIdSet.add(String(row.id));
  });

  return studentIdSet;
}

export async function buildCohortRadarScoresForTest(
  supabase: SupabaseClient,
  cohortKey: string,
  testName: string,
): Promise<ExamScoreRow[]> {
  const normalizedTestName = testName.trim();
  if (!cohortKey.trim() || !normalizedTestName) {
    return [];
  }

  const studentIdSet = await loadCohortStudentIdSet(supabase, cohortKey.trim());
  if (studentIdSet.size === 0) {
    return [];
  }

  const [scoresResult, questionCountsResult] = await Promise.all([
    supabase.from("test_scores").select(TEST_SCORES_SELECT).eq("test_name", normalizedTestName),
    supabase
      .from("question_counts")
      .select(QUESTION_COUNTS_SELECT)
      .eq("test_name", normalizedTestName),
  ]);

  if (scoresResult.error) {
    throw new Error(scoresResult.error.message);
  }
  if (questionCountsResult.error) {
    throw new Error(questionCountsResult.error.message);
  }

  const questionCountRow =
    ((questionCountsResult.data ?? []) as unknown as QuestionCountRow[])[0] ?? null;
  const scoresBySubject = new Map<string, number[]>();

  ((scoresResult.data ?? []) as unknown as TestScoreRow[]).forEach((row) => {
    if (!studentIdSet.has(String(row.student_id))) {
      return;
    }

    buildScoresFromTestScoreRow(row, questionCountRow).forEach((subjectRow) => {
      if (subjectRow.notTaken || subjectRow.score === null) {
        return;
      }

      const list = scoresBySubject.get(subjectRow.subjectName) ?? [];
      list.push(subjectRow.score);
      scoresBySubject.set(subjectRow.subjectName, list);
    });
  });

  return TEST_SCORE_SUBJECTS.map(({ label }) => {
    const average = roundSubjectTrendAverage(scoresBySubject.get(label) ?? []);
    return {
      subjectName: label,
      score: average,
      notTaken: average === null,
    };
  });
}
