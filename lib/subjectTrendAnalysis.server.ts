import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAllNationalExamFailedStudentSets,
  buildAllNationalExamPassedStudentSets,
  isTestScoreRowInStudentIdSet,
  loadCohortStudentContext,
  type CohortStudentContext,
} from "@/lib/cohortStudents.server";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { normalizeStudentIdentifier } from "@/lib/studentIdentifier";
import {
  getTestScoreKeyword,
  testScoreRoundKeysMatch,
  testScoreRoundKeysMatchLoose,
} from "@/lib/examRoundKey";
import {
  buildQuestionCountMap,
  QUESTION_COUNTS_SELECT,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import {
  buildScoresFromTestScoreRow,
  TEST_SCORES_SELECT,
  type TestScoreRow,
} from "@/lib/testScores";
import type { GraduateExamSample } from "@/lib/passRateAnalysis";
import {
  createGraduateSampleFromSubjectScore,
  buildSubjectTrendAnalysis,
  emptySubjectTrendAnalysis,
  getLatestSubjectTrendPoint,
  parseMockTestNameFromTrendPoint,
  parseRegularSessionKeyFromTrendPoint,
  type SubjectTrendAnalysis,
} from "@/lib/subjectTrendAnalysis";
import type { SubjectTrendPoint } from "@/lib/subjectTrend";
import { roundSubjectTrendAverage } from "@/lib/subjectTrend";

function collectMockGraduateSubjectSamples(
  rows: TestScoreRow[],
  questionCountByTestName: Map<string, QuestionCountRow>,
  selectedTestName: string,
  subjectName: string,
  mockLabelSet: Set<string>,
  passedStudentIdSet: Set<string>,
  failedStudentIdSet: Set<string>,
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
  matchFn: (selected: string, candidate: string) => boolean,
) {
  const passedSamples: GraduateExamSample[] = [];
  const failedSamples: GraduateExamSample[] = [];
  const passedScores: number[] = [];
  const seenPassedStudents = new Set<string>();
  const seenFailedStudents = new Set<string>();

  rows.forEach((row) => {
    const testName = String(row.test_name ?? "").trim();
    if (!matchFn(selectedTestName, testName)) {
      return;
    }

    const studentId = String(row.student_id ?? "");
    const questionCountRow = questionCountByTestName.get(testName) ?? null;
    const scoreRows = buildScoresFromTestScoreRow(row, questionCountRow);
    const subjectRow = scoreRows.find(
      (target) =>
        mockLabelSet.has(target.subjectName) &&
        !target.notTaken &&
        target.score !== null,
    );
    if (!subjectRow || subjectRow.score === null) {
      return;
    }

    if (
      isTestScoreRowInStudentIdSet(row.student_id, passedStudentIdSet, studentLookupMaps) &&
      !seenPassedStudents.has(studentId)
    ) {
      passedSamples.push(
        createGraduateSampleFromSubjectScore(subjectName, subjectRow.score, true),
      );
      passedScores.push(subjectRow.score);
      seenPassedStudents.add(studentId);
    }

    if (
      isTestScoreRowInStudentIdSet(row.student_id, failedStudentIdSet, studentLookupMaps) &&
      !seenFailedStudents.has(studentId)
    ) {
      failedSamples.push(
        createGraduateSampleFromSubjectScore(subjectName, subjectRow.score, false),
      );
      seenFailedStudents.add(studentId);
    }
  });

  return {
    passedSamples,
    failedSamples,
    passedAverageAtLatest: roundSubjectTrendAverage(passedScores),
  };
}

async function collectRegularGraduateSubjectSamples(
  supabase: SupabaseClient,
  sessionKey: string,
  regularSubjects: string[],
  subjectName: string,
  passedGakuseiIdSet: Set<string>,
  failedGakuseiIdSet: Set<string>,
) {
  const passedSamples: GraduateExamSample[] = [];
  const failedSamples: GraduateExamSample[] = [];
  const passedScores: number[] = [];
  const seenPassed = new Set<string>();
  const seenFailed = new Set<string>();

  const rows = await fetchAllRows<{
    gakusei_id: string | number;
    session_key: string;
    subject_name: string;
    score: number | string;
    exam_type: string;
  }>(
    supabase,
    "student_exam_results",
    "gakusei_id, session_key, subject_name, score, exam_type",
  );

  rows.forEach((row) => {
    if (String(row.exam_type).trim() !== "regular") {
      return;
    }
    if (String(row.session_key).trim() !== sessionKey) {
      return;
    }

    const rowSubjectName = String(row.subject_name).trim();
    if (!regularSubjects.includes(rowSubjectName)) {
      return;
    }

    const score = Number(row.score);
    if (!Number.isFinite(score)) {
      return;
    }

    const gakuseiId = normalizeStudentIdentifier(String(row.gakusei_id));
    if (!gakuseiId) {
      return;
    }

    if (passedGakuseiIdSet.has(gakuseiId) && !seenPassed.has(gakuseiId)) {
      passedSamples.push(createGraduateSampleFromSubjectScore(subjectName, score, true));
      passedScores.push(score);
      seenPassed.add(gakuseiId);
    }

    if (failedGakuseiIdSet.has(gakuseiId) && !seenFailed.has(gakuseiId)) {
      failedSamples.push(createGraduateSampleFromSubjectScore(subjectName, score, false));
      seenFailed.add(gakuseiId);
    }
  });

  return {
    passedSamples,
    failedSamples,
    passedAverageAtLatest: roundSubjectTrendAverage(passedScores),
  };
}

async function loadMockGraduateSubjectSamples(
  supabase: SupabaseClient,
  selectedTestName: string,
  subjectName: string,
  mockLabels: string[],
  cohortContext: CohortStudentContext,
) {
  const { failedStudentIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );
  const { passedStudentIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );

  const keyword = getTestScoreKeyword("mock");
  const [scoresResult, questionCountsResult] = await Promise.all([
    supabase.from("test_scores").select(TEST_SCORES_SELECT).ilike("test_name", `%${keyword}%`),
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
  const mockLabelSet = new Set(mockLabels);

  let collected = collectMockGraduateSubjectSamples(
    rows,
    questionCountByTestName,
    selectedTestName,
    subjectName,
    mockLabelSet,
    passedStudentIdSet,
    failedStudentIdSet,
    cohortContext.studentLookupMaps,
    testScoreRoundKeysMatch,
  );

  if (collected.passedSamples.length === 0 && collected.failedSamples.length === 0) {
    collected = collectMockGraduateSubjectSamples(
      rows,
      questionCountByTestName,
      selectedTestName,
      subjectName,
      mockLabelSet,
      passedStudentIdSet,
      failedStudentIdSet,
      cohortContext.studentLookupMaps,
      testScoreRoundKeysMatchLoose,
    );
  }

  return collected;
}

export async function buildSubjectTrendPassRateAnalysis(
  supabase: SupabaseClient,
  subjectName: string,
  points: SubjectTrendPoint[],
  regularSubjects: string[],
  mockLabels: string[],
  context?: CohortStudentContext,
): Promise<SubjectTrendAnalysis> {
  const latest = getLatestSubjectTrendPoint(points);
  if (!latest || latest.chartValue === null) {
    return emptySubjectTrendAnalysis("実施済みの成績がありません。");
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { failedGakuseiIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );
  const { passedGakuseiIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );

  if (failedGakuseiIdSet.size === 0 && passedGakuseiIdSet.size === 0) {
    return emptySubjectTrendAnalysis("合格者・不合格者の卒業生データが不足しています。");
  }

  let collected: {
    passedSamples: GraduateExamSample[];
    failedSamples: GraduateExamSample[];
    passedAverageAtLatest: number | null;
  };

  if (latest.sourceType === "mock") {
    const testName = parseMockTestNameFromTrendPoint(latest);
    if (!testName) {
      return emptySubjectTrendAnalysis("最新の模擬試験名を判定できません。");
    }
    collected = await loadMockGraduateSubjectSamples(
      supabase,
      testName,
      subjectName,
      mockLabels,
      cohortContext,
    );
  } else {
    const sessionKey = parseRegularSessionKeyFromTrendPoint(latest);
    if (!sessionKey) {
      return emptySubjectTrendAnalysis("最新の定期試験学期を判定できません。");
    }
    collected = await collectRegularGraduateSubjectSamples(
      supabase,
      sessionKey,
      regularSubjects,
      subjectName,
      passedGakuseiIdSet,
      failedGakuseiIdSet,
    );
  }

  return buildSubjectTrendAnalysis({
    subjectName,
    points,
    passedSamples: collected.passedSamples,
    failedSamples: collected.failedSamples,
    passedAverageAtLatest:
      latest.passedCohortAverage ?? collected.passedAverageAtLatest,
  });
}
