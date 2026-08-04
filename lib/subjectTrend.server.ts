import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAllNationalExamFailedStudentSets,
  buildAllNationalExamPassedStudentSets,
  buildCohortStudentSets,
  isTestScoreRowInStudentIdSet,
  loadCohortStudentContext,
  type CohortStudentContext,
} from "@/lib/cohortStudents.server";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { formatCohortLabel, formatCohortStudentLabel } from "@/lib/cohort";
import {
  buildFailedTestScoreLooseLookupKey,
  buildFailedTestScoreRoundLookupKey,
  buildPassedTestScoreLooseLookupKey,
  buildPassedTestScoreRoundLookupKey,
  getTestScoreKeyword,
  parseTestScoreRoundKey,
  resolveFailedTestScoreAverage,
  resolvePassedTestScoreAverage,
} from "@/lib/examRoundKey";
import { normalizeStudentIdentifier } from "@/lib/studentIdentifier";
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
import {
  loadRegularExamTermsForCohort,
  loadStudentCohortKey,
} from "@/lib/regularExam.server";
import { buildSubjectTrendPassRateAnalysis } from "@/lib/subjectTrendAnalysis.server";
import {
  buildSubjectTrendSummary,
  formatSubjectTrendDateLabel,
  getFailedNationalExamTrendLookupKey,
  getRegularCohortTrendLookupKey,
  getSubjectTrendCohortLookupKey,
  parseMockTrendLookupKey,
  resolveMockLabelsForTrend,
  resolveRegularSubjectsForTrend,
  roundSubjectTrendAverage,
  sortSubjectTrendPoints,
  FAILED_NATIONAL_EXAM_COHORT_AVERAGE_LABEL,
  PASSED_NATIONAL_EXAM_COHORT_AVERAGE_LABEL,
  type SubjectTrendData,
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

function buildRegularTrendPoints(
  terms: Awaited<ReturnType<typeof loadRegularExamTermsForCohort>>["terms"],
  regularSubjects: string[],
  scoreRows: Array<{ session_key: string; subject_name: string; score: number | string }>,
) {
  const points: SubjectTrendPoint[] = [];
  const regularSubjectSet = new Set(regularSubjects);
  const termBySessionKey = new Map(terms.map((term) => [term.sessionKey, term]));

  scoreRows.forEach((row) => {
    const sessionKey = String(row.session_key).trim();
    const subjectName = String(row.subject_name).trim();
    const score = Number(row.score);

    if (!sessionKey || !subjectName || !Number.isFinite(score) || !regularSubjectSet.has(subjectName)) {
      return;
    }

    const term = termBySessionKey.get(sessionKey);
    if (!term) {
      return;
    }

    const examDateIso = term.examDate?.trim() || null;
    const subjectTag = regularSubjects.length > 1 ? ` ${subjectName}` : "";
    points.push({
      sessionKey: `regular:${sessionKey}:${subjectName}`,
      sessionLabel: `${term.sessionLabel}${subjectTag}（定期）`,
      sortOrder: term.sortOrder,
      examDateIso,
      examDateLabel: formatSubjectTrendDateLabel(examDateIso),
      sourceType: "regular",
      chartValue: score,
      cohortAverage: null,
      failedCohortAverage: null,
      passedCohortAverage: null,
      displayValue: `${score}点`,
      notTaken: false,
    });
  });

  return points;
}

async function buildMockTrendPoints(
  supabase: SupabaseClient,
  studentId: number | string,
  mockLabels: string[],
) {
  if (mockLabels.length === 0) {
    return [];
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

  const mockLabelSet = new Set(mockLabels);
  const points: SubjectTrendPoint[] = [];

  ((scoresResult.data ?? []) as unknown as TestScoreRow[]).forEach((row, index) => {
    const testName = String(row.test_name ?? "").trim();
    const questionCountRow = questionCountByTestName.get(testName) ?? null;
    const examDateIso = questionCountRow?.test_date?.trim() || null;
    const round = parseTestScoreRoundKey(testName);
    const mockSortOrder = round ? Number(round.roundKey) || index + 1 : index + 1;
    const scoreRows = buildScoresFromTestScoreRow(row, questionCountRow);

    scoreRows.forEach((target) => {
      if (!mockLabelSet.has(target.subjectName)) {
        return;
      }
      if (target.notTaken || target.score === null) {
        return;
      }

      points.push({
        sessionKey: `mock:${buildTestScoreSessionKey(testName, index)}:${target.subjectName}`,
        sessionLabel: `${testName}（模擬）`,
        sortOrder: mockSortOrder,
        examDateIso,
        examDateLabel: formatSubjectTrendDateLabel(examDateIso),
        sourceType: "mock",
        chartValue: target.score,
        cohortAverage: null,
        failedCohortAverage: null,
        passedCohortAverage: null,
        displayValue: `${target.correctCount}/${target.questionCount}（${target.score}%）`,
        notTaken: false,
      });
    });
  });

  return points;
}

function buildAverageMap(scoreLists: Map<string, number[]>) {
  const averages = new Map<string, number>();
  scoreLists.forEach((scores, key) => {
    const average = roundSubjectTrendAverage(scores);
    if (average !== null) {
      averages.set(key, average);
    }
  });
  return averages;
}

async function loadRegularCohortAverages(
  supabase: SupabaseClient,
  gakuseiIdSet: Set<string>,
  regularSubjects: string[],
) {
  const scoresByKey = new Map<string, number[]>();
  if (regularSubjects.length === 0 || gakuseiIdSet.size === 0) {
    return scoresByKey;
  }

  const normalizedGakuseiIdSet = new Set(
    [...gakuseiIdSet].map((gakuseiId) => normalizeStudentIdentifier(gakuseiId)),
  );

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

  const perStudentSessionScores = new Map<string, number[]>();

  rows.forEach((row) => {
    if (String(row.exam_type).trim() !== "regular") {
      return;
    }

    const gakuseiId = normalizeStudentIdentifier(String(row.gakusei_id));
    const sessionKey = String(row.session_key).trim();
    const subjectName = String(row.subject_name).trim();
    const score = Number(row.score);

    if (
      !gakuseiId ||
      !normalizedGakuseiIdSet.has(gakuseiId) ||
      !regularSubjects.includes(subjectName) ||
      !Number.isFinite(score)
    ) {
      return;
    }

    const studentSessionKey = `${gakuseiId}::${sessionKey}`;
    const scores = perStudentSessionScores.get(studentSessionKey) ?? [];
    scores.push(score);
    perStudentSessionScores.set(studentSessionKey, scores);
  });

  perStudentSessionScores.forEach((scores, studentSessionKey) => {
    const sessionKey = studentSessionKey.split("::")[1];
    const studentAverage = roundSubjectTrendAverage(scores);
    if (studentAverage === null || !sessionKey) {
      return;
    }

    const key = `regular:${sessionKey}`;
    const sessionScores = scoresByKey.get(key) ?? [];
    sessionScores.push(studentAverage);
    scoresByKey.set(key, sessionScores);
  });

  return scoresByKey;
}

async function loadNationalExamOutcomeTestScoreAverages(
  supabase: SupabaseClient,
  studentIdSet: Set<string>,
  mockLabels: string[],
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
  outcome: "failed" | "passed",
) {
  const scoresByKey = new Map<string, number[]>();
  if (mockLabels.length === 0 || studentIdSet.size === 0) {
    return scoresByKey;
  }

  const buildStrictKey =
    outcome === "failed"
      ? buildFailedTestScoreRoundLookupKey
      : buildPassedTestScoreRoundLookupKey;
  const buildLooseKey =
    outcome === "failed"
      ? buildFailedTestScoreLooseLookupKey
      : buildPassedTestScoreLooseLookupKey;

  const mockLabelSet = new Set(mockLabels);
  const keywords = [getTestScoreKeyword("mock"), getTestScoreKeyword("graduation")];
  const [scoresResults, questionCountsResults] = await Promise.all([
    Promise.all(
      keywords.map((keyword) =>
        supabase
          .from("test_scores")
          .select(TEST_SCORES_SELECT)
          .ilike("test_name", `%${keyword}%`),
      ),
    ),
    Promise.all(
      keywords.map((keyword) =>
        supabase
          .from("question_counts")
          .select(QUESTION_COUNTS_SELECT)
          .ilike("test_name", `%${keyword}%`),
      ),
    ),
  ]);

  const scoresRows: TestScoreRow[] = [];
  for (const result of scoresResults) {
    if (result.error) {
      throw new Error(result.error.message);
    }
    scoresRows.push(...((result.data ?? []) as unknown as TestScoreRow[]));
  }

  const questionCountRows: QuestionCountRow[] = [];
  for (const result of questionCountsResults) {
    if (result.error) {
      throw new Error(result.error.message);
    }
    questionCountRows.push(...((result.data ?? []) as unknown as QuestionCountRow[]));
  }

  const questionCountByTestName = buildQuestionCountMap(questionCountRows);

  scoresRows.forEach((row) => {
    if (!isTestScoreRowInStudentIdSet(row.student_id, studentIdSet, studentLookupMaps)) {
      return;
    }

    const testName = String(row.test_name ?? "").trim();
    const questionCountRow = questionCountByTestName.get(testName) ?? null;
    const scoreRows = buildScoresFromTestScoreRow(row, questionCountRow);

    scoreRows.forEach((target) => {
      if (!mockLabelSet.has(target.subjectName) || target.notTaken || target.score === null) {
        return;
      }

      const strictKey = buildStrictKey(testName, target.subjectName);
      const looseKey = buildLooseKey(testName, target.subjectName);

      for (const key of [strictKey, looseKey]) {
        if (!key) {
          continue;
        }

        const scores = scoresByKey.get(key) ?? [];
        scores.push(target.score);
        scoresByKey.set(key, scores);
      }
    });
  });

  return scoresByKey;
}

async function loadFailedTestScoreAverages(
  supabase: SupabaseClient,
  studentIdSet: Set<string>,
  mockLabels: string[],
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
) {
  return loadNationalExamOutcomeTestScoreAverages(
    supabase,
    studentIdSet,
    mockLabels,
    studentLookupMaps,
    "failed",
  );
}

async function loadPassedTestScoreAverages(
  supabase: SupabaseClient,
  studentIdSet: Set<string>,
  mockLabels: string[],
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
) {
  return loadNationalExamOutcomeTestScoreAverages(
    supabase,
    studentIdSet,
    mockLabels,
    studentLookupMaps,
    "passed",
  );
}

async function loadMockCohortAverages(
  supabase: SupabaseClient,
  studentIdSet: Set<string>,
  mockLabels: string[],
  studentLookupMaps: CohortStudentContext["studentLookupMaps"],
) {
  const scoresByKey = new Map<string, number[]>();
  if (mockLabels.length === 0 || studentIdSet.size === 0) {
    return scoresByKey;
  }

  const mockLabelSet = new Set(mockLabels);
  const keyword = getTestNameKeyword("mock");
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

  ((scoresResult.data ?? []) as unknown as TestScoreRow[]).forEach((row) => {
    if (!isTestScoreRowInStudentIdSet(row.student_id, studentIdSet, studentLookupMaps)) {
      return;
    }

    const testName = String(row.test_name ?? "").trim();
    const questionCountRow = questionCountByTestName.get(testName) ?? null;
    const scoreRows = buildScoresFromTestScoreRow(row, questionCountRow);

    scoreRows.forEach((target) => {
      if (!mockLabelSet.has(target.subjectName) || target.notTaken || target.score === null) {
        return;
      }

      const key = `mock:${testName}:${target.subjectName}`;
      const scores = scoresByKey.get(key) ?? [];
      scores.push(target.score);
      scoresByKey.set(key, scores);
    });
  });

  return scoresByKey;
}

function attachCohortAveragesToPoints(
  points: SubjectTrendPoint[],
  regularAverages: Map<string, number>,
  mockAverages: Map<string, number>,
) {
  return points.map((point) => {
    const lookupKey =
      point.sourceType === "regular"
        ? getRegularCohortTrendLookupKey(point)
        : getSubjectTrendCohortLookupKey(point);
    const cohortAverage =
      lookupKey === null
        ? null
        : point.sourceType === "regular"
          ? (regularAverages.get(lookupKey) ?? null)
          : (mockAverages.get(lookupKey) ?? null);

    return {
      ...point,
      cohortAverage,
    };
  });
}

function attachNationalExamOutcomeAveragesToPoints(
  points: SubjectTrendPoint[],
  regularAverages: Map<string, number>,
  mockAverages: Map<string, number>,
  outcome: "failed" | "passed",
) {
  const resolveMockAverage =
    outcome === "failed" ? resolveFailedTestScoreAverage : resolvePassedTestScoreAverage;
  const fieldName =
    outcome === "failed" ? "failedCohortAverage" : "passedCohortAverage";

  return points.map((point) => {
    if (point.sourceType === "regular") {
      const lookupKey = getFailedNationalExamTrendLookupKey(point);
      return {
        ...point,
        [fieldName]:
          lookupKey === null ? null : (regularAverages.get(lookupKey) ?? null),
      };
    }

    const parsed = parseMockTrendLookupKey(getSubjectTrendCohortLookupKey(point));
    const outcomeAverage = parsed
      ? resolveMockAverage(mockAverages, parsed.testName, parsed.subjectName)
      : null;

    return {
      ...point,
      [fieldName]: outcomeAverage,
    };
  });
}

function attachFailedNationalExamAveragesToPoints(
  points: SubjectTrendPoint[],
  failedRegularAverages: Map<string, number>,
  failedMockAverages: Map<string, number>,
) {
  return attachNationalExamOutcomeAveragesToPoints(
    points,
    failedRegularAverages,
    failedMockAverages,
    "failed",
  );
}

function attachPassedNationalExamAveragesToPoints(
  points: SubjectTrendPoint[],
  passedRegularAverages: Map<string, number>,
  passedMockAverages: Map<string, number>,
) {
  return attachNationalExamOutcomeAveragesToPoints(
    points,
    passedRegularAverages,
    passedMockAverages,
    "passed",
  );
}

export async function buildUnifiedSubjectTrend(
  supabase: SupabaseClient,
  gakuseiId: string,
  subjectName: string,
): Promise<SubjectTrendData> {
  const regularSubjects = resolveRegularSubjectsForTrend(subjectName);
  const mockLabels = resolveMockLabelsForTrend(subjectName);
  const cohortKey = await loadStudentCohortKey(supabase, gakuseiId);
  const cohortLabel = cohortKey ? formatCohortLabel(cohortKey) : null;
  const cohortAverageLabel = cohortKey ? `${formatCohortStudentLabel(cohortKey)}平均` : null;
  const cohortContext = await loadCohortStudentContext(supabase);
  const { failedGakuseiIdSet, failedStudentIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );
  const { passedGakuseiIdSet, passedStudentIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );
  const failedCohortAverageLabel =
    failedGakuseiIdSet.size > 0 ? FAILED_NATIONAL_EXAM_COHORT_AVERAGE_LABEL : null;
  const passedCohortAverageLabel =
    passedGakuseiIdSet.size > 0 ? PASSED_NATIONAL_EXAM_COHORT_AVERAGE_LABEL : null;
  const { terms } = await loadRegularExamTermsForCohort(supabase, cohortKey);

  let regularPoints: SubjectTrendPoint[] = [];
  if (regularSubjects.length > 0) {
    const { data, error } = await supabase
      .from("student_exam_results")
      .select("session_key, subject_name, score")
      .eq("gakusei_id", gakuseiId)
      .eq("exam_type", "regular");

    if (error) {
      throw new Error(error.message);
    }

    const filteredRows = (data ?? []).filter((row) =>
      regularSubjects.includes(String(row.subject_name).trim()),
    );

    regularPoints = buildRegularTrendPoints(terms, regularSubjects, filteredRows);
  }

  let mockPoints: SubjectTrendPoint[] = [];
  if (mockLabels.length > 0) {
    const studentId = await loadStudentId(supabase, gakuseiId);
    if (studentId) {
      mockPoints = await buildMockTrendPoints(supabase, studentId, mockLabels);
    }
  }

  let points = sortSubjectTrendPoints([...regularPoints, ...mockPoints]);

  if (cohortKey) {
    const { gakuseiIdSet, studentIdSet } = buildCohortStudentSets(
      cohortContext.rows,
      cohortKey,
      cohortContext.nationalExamFailedAvailable,
      cohortContext.nationalExamPassedAvailable,
    );
    const [regularScoreLists, mockScoreLists] = await Promise.all([
      loadRegularCohortAverages(supabase, gakuseiIdSet, regularSubjects),
      loadMockCohortAverages(
        supabase,
        studentIdSet,
        mockLabels,
        cohortContext.studentLookupMaps,
      ),
    ]);
    const regularAverages = buildAverageMap(regularScoreLists);
    const mockAverages = buildAverageMap(mockScoreLists);
    points = attachCohortAveragesToPoints(points, regularAverages, mockAverages);
  }

  if (failedGakuseiIdSet.size > 0) {
    const [failedRegularScoreLists, failedMockScoreLists] = await Promise.all([
      loadRegularCohortAverages(supabase, failedGakuseiIdSet, regularSubjects),
      loadFailedTestScoreAverages(
        supabase,
        failedStudentIdSet,
        mockLabels,
        cohortContext.studentLookupMaps,
      ),
    ]);
    const failedRegularAverages = buildAverageMap(failedRegularScoreLists);
    const failedMockAverages = buildAverageMap(failedMockScoreLists);
    points = attachFailedNationalExamAveragesToPoints(
      points,
      failedRegularAverages,
      failedMockAverages,
    );
  }

  if (passedGakuseiIdSet.size > 0) {
    const [passedRegularScoreLists, passedMockScoreLists] = await Promise.all([
      loadRegularCohortAverages(supabase, passedGakuseiIdSet, regularSubjects),
      loadPassedTestScoreAverages(
        supabase,
        passedStudentIdSet,
        mockLabels,
        cohortContext.studentLookupMaps,
      ),
    ]);
    const passedRegularAverages = buildAverageMap(passedRegularScoreLists);
    const passedMockAverages = buildAverageMap(passedMockScoreLists);
    points = attachPassedNationalExamAveragesToPoints(
      points,
      passedRegularAverages,
      passedMockAverages,
    );
  }

  const subjectAnalysis = await buildSubjectTrendPassRateAnalysis(
    supabase,
    subjectName,
    points,
    regularSubjects,
    mockLabels,
    cohortContext,
  );

  return {
    subjectName,
    points,
    cohortAverageLabel,
    failedCohortAverageLabel,
    passedCohortAverageLabel,
    subjectAnalysis,
    summary: buildSubjectTrendSummary(points, {
      cohortKey,
      cohortLabel,
      cohortMissing: !cohortKey,
    }),
  };
}

/** @deprecated use buildUnifiedSubjectTrend */
export async function buildSubjectTrendData(
  supabase: SupabaseClient,
  input: {
    gakuseiId: string;
    examType?: "regular" | "mock";
    subjectName: string;
  },
) {
  return buildUnifiedSubjectTrend(supabase, input.gakuseiId, input.subjectName);
}

export { TEST_SCORE_SUBJECTS };
