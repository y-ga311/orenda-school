import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamScoreRow } from "@/lib/examResults";
import { TEST_SCORE_SUBJECTS } from "@/lib/examSubjects";
import {
  buildAllNationalExamFailedStudentSets,
  buildAllNationalExamPassedStudentSets,
  buildCohortStudentSets,
  isTestScoreRowInStudentIdSet,
  loadCohortStudentContext,
  loadCohortStudentIdSet,
  type CohortStudentContext,
} from "@/lib/cohortStudents.server";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { normalizeStudentIdentifier } from "@/lib/studentIdentifier";
import {
  getTestScoreKeyword,
  parseTestScoreRoundKey,
  testScoreRoundKeysMatch,
  testScoreRoundKeysMatchLoose,
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

type RegularExamResultRow = {
  gakusei_id: string | number;
  session_key: string;
  subject_name: string;
  score: number | string;
  exam_type: string;
};

async function loadRegularExamScoresBySubject(
  supabase: SupabaseClient,
  gakuseiIdSet: Set<string>,
  sessionKey: string,
  subjectNames: string[],
): Promise<Map<string, number[]>> {
  const scoresBySubject = new Map<string, number[]>();
  const normalizedSessionKey = sessionKey.trim();
  const subjectNameSet = new Set(subjectNames.map((name) => name.trim()).filter(Boolean));

  if (normalizedSessionKey === "" || subjectNameSet.size === 0 || gakuseiIdSet.size === 0) {
    return scoresBySubject;
  }

  const normalizedGakuseiIdSet = new Set(
    [...gakuseiIdSet].map((gakuseiId) => normalizeStudentIdentifier(gakuseiId)),
  );

  const rows = await fetchAllRows<RegularExamResultRow>(
    supabase,
    "student_exam_results",
    "gakusei_id, session_key, subject_name, score, exam_type",
  );

  rows.forEach((row) => {
    if (String(row.exam_type).trim() !== "regular") {
      return;
    }

    const gakuseiId = normalizeStudentIdentifier(String(row.gakusei_id));
    const rowSessionKey = String(row.session_key).trim();
    const subjectName = String(row.subject_name).trim();
    const score = Number(row.score);

    if (
      !gakuseiId ||
      !normalizedGakuseiIdSet.has(gakuseiId) ||
      rowSessionKey !== normalizedSessionKey ||
      !subjectNameSet.has(subjectName) ||
      !Number.isFinite(score)
    ) {
      return;
    }

    const scores = scoresBySubject.get(subjectName) ?? [];
    scores.push(score);
    scoresBySubject.set(subjectName, scores);
  });

  return scoresBySubject;
}

function buildRegularExamRadarScores(
  subjectNames: string[],
  scoresBySubject: Map<string, number[]>,
): ExamScoreRow[] {
  return subjectNames.map((subjectName) => {
    const average = roundSubjectTrendAverage(scoresBySubject.get(subjectName) ?? []);
    return {
      subjectName,
      score: average,
      notTaken: average === null,
    };
  });
}

/** 定期試験の同期（期）平均 */
export async function buildRegularCohortRadarScoresForSession(
  supabase: SupabaseClient,
  cohortKey: string,
  sessionKey: string,
  subjectNames: string[],
  context?: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedCohortKey = cohortKey.trim();
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedCohortKey || !normalizedSessionKey || subjectNames.length === 0) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { gakuseiIdSet } = buildCohortStudentSets(
    cohortContext.rows,
    normalizedCohortKey,
    cohortContext.nationalExamFailedAvailable,
    cohortContext.nationalExamPassedAvailable,
  );

  const scoresBySubject = await loadRegularExamScoresBySubject(
    supabase,
    gakuseiIdSet,
    normalizedSessionKey,
    subjectNames,
  );

  return buildRegularExamRadarScores(subjectNames, scoresBySubject);
}

/** 定期試験の国家試験不合格者平均（全期・学期照合） */
export async function buildFailedNationalExamRegularRadarScoresForSession(
  supabase: SupabaseClient,
  sessionKey: string,
  subjectNames: string[],
  context?: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey || subjectNames.length === 0) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { failedGakuseiIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );

  const scoresBySubject = await loadRegularExamScoresBySubject(
    supabase,
    failedGakuseiIdSet,
    normalizedSessionKey,
    subjectNames,
  );

  return buildRegularExamRadarScores(subjectNames, scoresBySubject);
}

/** 定期試験の国家試験合格者平均（全期・学期照合） */
export async function buildPassedNationalExamRegularRadarScoresForSession(
  supabase: SupabaseClient,
  sessionKey: string,
  subjectNames: string[],
  context?: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey || subjectNames.length === 0) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { passedGakuseiIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );

  const scoresBySubject = await loadRegularExamScoresBySubject(
    supabase,
    passedGakuseiIdSet,
    normalizedSessionKey,
    subjectNames,
  );

  return buildRegularExamRadarScores(subjectNames, scoresBySubject);
}

/** 国家試験合否別の平均（全期・回次照合） */
async function buildNationalExamOutcomeRadarScoresForTest(
  supabase: SupabaseClient,
  selectedTestName: string,
  studentIdSet: Set<string>,
  cohortContext: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedTestName = selectedTestName.trim();
  const selectedRound = parseTestScoreRoundKey(normalizedTestName);
  if (!selectedRound || studentIdSet.size === 0) {
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

  const collectScoresBySubject = (
    matchFn: (selected: string, candidate: string) => boolean,
  ) => {
    const scoresBySubject = new Map<string, number[]>();

    ((scoresResult.data ?? []) as unknown as TestScoreRow[]).forEach((row) => {
      const testName = String(row.test_name ?? "").trim();
      if (!matchFn(normalizedTestName, testName)) {
        return;
      }

      if (
        !isTestScoreRowInStudentIdSet(
          row.student_id,
          studentIdSet,
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

    return scoresBySubject;
  };

  let scoresBySubject = collectScoresBySubject(testScoreRoundKeysMatch);
  const hasStrictScores = [...scoresBySubject.values()].some((scores) => scores.length > 0);
  if (!hasStrictScores) {
    scoresBySubject = collectScoresBySubject(testScoreRoundKeysMatchLoose);
  }

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
  if (!parseTestScoreRoundKey(normalizedTestName)) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { failedStudentIdSet } = buildAllNationalExamFailedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamFailedAvailable,
  );

  return buildNationalExamOutcomeRadarScoresForTest(
    supabase,
    normalizedTestName,
    failedStudentIdSet,
    cohortContext,
  );
}

/** 国家試験合格者の平均（全期・回次照合） */
export async function buildPassedNationalExamRadarScoresForTest(
  supabase: SupabaseClient,
  selectedTestName: string,
  context?: CohortStudentContext,
): Promise<ExamScoreRow[]> {
  const normalizedTestName = selectedTestName.trim();
  if (!parseTestScoreRoundKey(normalizedTestName)) {
    return [];
  }

  const cohortContext = context ?? (await loadCohortStudentContext(supabase));
  const { passedStudentIdSet } = buildAllNationalExamPassedStudentSets(
    cohortContext.rows,
    cohortContext.nationalExamPassedAvailable,
  );

  return buildNationalExamOutcomeRadarScoresForTest(
    supabase,
    normalizedTestName,
    passedStudentIdSet,
    cohortContext,
  );
}
