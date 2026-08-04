import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamScoreRow } from "@/lib/examResults";
import {
  buildAllNationalExamFailedStudentSets,
  buildAllNationalExamPassedStudentSets,
  isTestScoreRowInStudentIdSet,
  loadCohortStudentContext,
  type CohortStudentContext,
} from "@/lib/cohortStudents.server";
import {
  getTestScoreKeyword,
  parseTestScoreRoundKey,
  testScoreRoundKeysMatch,
  testScoreRoundKeysMatchLoose,
} from "@/lib/examRoundKey";
import {
  buildExamPassRateAnalysis,
  buildExamSnapshotFeatures,
  type ExamPassRateAnalysis,
  type GraduateExamSample,
} from "@/lib/passRateAnalysis";
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

function buildSampleFromScores(
  passed: boolean,
  scores: ExamScoreRow[],
): GraduateExamSample | null {
  const features = buildExamSnapshotFeatures(scores);
  if (!features) {
    return null;
  }

  return {
    passed,
    features,
    scores,
  };
}

function collectGraduateExamSamples(
  rows: TestScoreRow[],
  questionCountByTestName: Map<string, QuestionCountRow>,
  selectedTestName: string,
  passedStudentIdSet: Set<string>,
  failedStudentIdSet: Set<string>,
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
  matchFn: (selected: string, candidate: string) => boolean,
) {
  const passedSamples: GraduateExamSample[] = [];
  const failedSamples: GraduateExamSample[] = [];
  const passedScoresBySubject = new Map<string, number[]>();
  const seenPassedStudents = new Set<string>();
  const seenFailedStudents = new Set<string>();

  rows.forEach((row) => {
    const testName = String(row.test_name ?? "").trim();
    if (!matchFn(selectedTestName, testName)) {
      return;
    }

    const studentId = String(row.student_id ?? "");
    const questionCountRow = questionCountByTestName.get(testName) ?? null;
    const scores = buildScoresFromTestScoreRow(row, questionCountRow);

    if (
      isTestScoreRowInStudentIdSet(row.student_id, passedStudentIdSet, studentLookupMaps) &&
      !seenPassedStudents.has(studentId)
    ) {
      const sample = buildSampleFromScores(true, scores);
      if (sample) {
        passedSamples.push(sample);
        seenPassedStudents.add(studentId);
        scores.forEach((subjectRow) => {
          if (subjectRow.notTaken || subjectRow.score === null) {
            return;
          }
          const list = passedScoresBySubject.get(subjectRow.subjectName) ?? [];
          list.push(subjectRow.score);
          passedScoresBySubject.set(subjectRow.subjectName, list);
        });
      }
    }

    if (
      isTestScoreRowInStudentIdSet(row.student_id, failedStudentIdSet, studentLookupMaps) &&
      !seenFailedStudents.has(studentId)
    ) {
      const sample = buildSampleFromScores(false, scores);
      if (sample) {
        failedSamples.push(sample);
        seenFailedStudents.add(studentId);
      }
    }
  });

  const passedAverageBySubject = new Map<string, number>();
  passedScoresBySubject.forEach((scores, subjectName) => {
    const average = roundSubjectTrendAverage(scores);
    if (average !== null) {
      passedAverageBySubject.set(subjectName, average);
    }
  });

  return {
    passedSamples,
    failedSamples,
    passedAverageBySubject,
  };
}

export async function buildTestScoreExamPassRateAnalysis(
  supabase: SupabaseClient,
  selectedTestName: string,
  studentScores: ExamScoreRow[],
  context?: CohortStudentContext,
): Promise<ExamPassRateAnalysis> {
  const normalizedTestName = selectedTestName.trim();
  const selectedRound = parseTestScoreRoundKey(normalizedTestName);
  if (!selectedRound) {
    return {
      available: false,
      reason: "試験名から回次を判定できません。",
      abcdGrade: null,
      passProbability: null,
      passProbabilitySimple: null,
      passProbabilityModel: null,
      method: null,
      studentTotalAverage: null,
      passedAverageTotal: null,
      failedAverageTotal: null,
      graduateSampleCount: { passed: 0, failed: 0 },
      subjectApproaches: [],
    };
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { failedStudentIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );
  const { passedStudentIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );

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
  const rows = (scoresResult.data ?? []) as unknown as TestScoreRow[];

  let collected = collectGraduateExamSamples(
    rows,
    questionCountByTestName,
    normalizedTestName,
    passedStudentIdSet,
    failedStudentIdSet,
    cohortContext.studentLookupMaps,
    testScoreRoundKeysMatch,
  );

  const hasStrictSamples =
    collected.passedSamples.length > 0 || collected.failedSamples.length > 0;
  if (!hasStrictSamples) {
    collected = collectGraduateExamSamples(
      rows,
      questionCountByTestName,
      normalizedTestName,
      passedStudentIdSet,
      failedStudentIdSet,
      cohortContext.studentLookupMaps,
      testScoreRoundKeysMatchLoose,
    );
  }

  return buildExamPassRateAnalysis({
    studentScores,
    passedSamples: collected.passedSamples,
    failedSamples: collected.failedSamples,
    passedAverageBySubject: collected.passedAverageBySubject,
  });
}
