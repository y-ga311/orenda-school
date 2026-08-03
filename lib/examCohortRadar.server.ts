import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamScoreRow } from "@/lib/examResults";
import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import {
  buildAllNationalExamFailedStudentSets,
  isTestScoreRowInStudentIdSet,
  loadCohortStudentContext,
  loadCohortStudentIdSet,
  type CohortStudentContext,
} from "@/lib/cohortStudents.server";
import {
  getTestScoreKeyword,
  parseTestScoreRoundKey,
  testScoreRoundKeysMatch,
} from "@/lib/examRoundKey";
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

type CohortStudentFilter = {
  nationalExamFailedOnly?: boolean;
  context?: CohortStudentContext;
};

export async function buildCohortRadarScoresForTest(
  supabase: SupabaseClient,
  cohortKey: string,
  testName: string,
  filter: CohortStudentFilter = {},
): Promise<ExamScoreRow[]> {
  const normalizedTestName = testName.trim();
  if (!cohortKey.trim() || !normalizedTestName) {
    return [];
  }

  const { studentIdSet, studentLookupMaps } = await loadCohortStudentIdSet(
    supabase,
    cohortKey.trim(),
    {
      nationalExamFailedOnly: filter.nationalExamFailedOnly,
      context: filter.context,
    },
  );
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
    if (!isTestScoreRowInStudentIdSet(row.student_id, studentIdSet, studentLookupMaps)) {
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

/** 国家試験不合格者の平均（全期・回次照合） */
export async function buildFailedNationalExamRadarScoresForTest(
  supabase: SupabaseClient,
  selectedTestName: string,
  context?: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedTestName = selectedTestName.trim();
  const selectedRound = parseTestScoreRoundKey(normalizedTestName);
  if (!selectedRound) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { failedStudentIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );
  if (failedStudentIdSet.size === 0) {
    return [];
  }

  const keyword = getTestScoreKeyword(selectedRound.examKind);
  const [scoresResult, questionCountsResult] = await Promise.all([
    supabase
      .from("test_scores")
      .select(TEST_SCORES_SELECT)
      .ilike("test_name", `%${keyword}%`),
    supabase
      .from("question_counts")
      .select(QUESTION_COUNTS_SELECT)
      .ilike("test_name", `%${keyword}%`),
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
  const scoresBySubject = new Map<string, number[]>();

  ((scoresResult.data ?? []) as unknown as TestScoreRow[]).forEach((row) => {
    const testName = String(row.test_name ?? "").trim();
    if (!testScoreRoundKeysMatch(normalizedTestName, testName)) {
      return;
    }

    if (
      !isTestScoreRowInStudentIdSet(
        row.student_id,
        failedStudentIdSet,
        cohortContext.studentLookupMaps,
      )
    ) {
      return;
    }

    const questionCountRow = questionCountByTestName.get(testName) ?? null;
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
