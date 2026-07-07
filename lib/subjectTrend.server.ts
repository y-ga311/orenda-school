import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCohortLabel, formatCohortStudentLabel, parseCohortKeyFromClass } from "@/lib/cohort";
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
import {
  buildSubjectTrendSummary,
  formatSubjectTrendDateLabel,
  getSubjectTrendCohortLookupKey,
  resolveMockLabelsForTrend,
  resolveRegularSubjectsForTrend,
  roundSubjectTrendAverage,
  sortSubjectTrendPoints,
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
        sortOrder: index + 1,
        examDateIso,
        examDateLabel: formatSubjectTrendDateLabel(examDateIso),
        sourceType: "mock",
        chartValue: target.score,
        cohortAverage: null,
        displayValue: `${target.correctCount}/${target.questionCount}（${target.score}%）`,
        notTaken: false,
      });
    });
  });

  return points;
}

type CohortStudentIndex = {
  cohortKey: string;
  gakuseiId: string;
  studentId: number | string;
};

async function loadCohortStudentIndex(supabase: SupabaseClient, cohortKey: string) {
  const { data, error } = await supabase.from("students").select("id, gakusei_id, class");

  if (error) {
    throw new Error(error.message);
  }

  const students: CohortStudentIndex[] = [];
  const gakuseiIdSet = new Set<string>();
  const studentIdSet = new Set<string>();

  (data ?? []).forEach((row) => {
    const rowCohortKey = parseCohortKeyFromClass(row.class as string | null | undefined);
    const gakuseiId = String(row.gakusei_id ?? "").trim();
    const studentId = row.id;

    if (rowCohortKey !== cohortKey || !gakuseiId || studentId === null || studentId === undefined) {
      return;
    }

    students.push({ cohortKey: rowCohortKey, gakuseiId, studentId });
    gakuseiIdSet.add(gakuseiId);
    studentIdSet.add(String(studentId));
  });

  return { students, gakuseiIdSet, studentIdSet };
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

  const { data, error } = await supabase
    .from("student_exam_results")
    .select("gakusei_id, session_key, subject_name, score")
    .eq("exam_type", "regular");

  if (error) {
    throw new Error(error.message);
  }

  (data ?? []).forEach((row) => {
    const gakuseiId = String(row.gakusei_id).trim();
    const sessionKey = String(row.session_key).trim();
    const subjectName = String(row.subject_name).trim();
    const score = Number(row.score);

    if (
      !gakuseiIdSet.has(gakuseiId) ||
      !regularSubjects.includes(subjectName) ||
      !Number.isFinite(score)
    ) {
      return;
    }

    const key = `regular:${sessionKey}:${subjectName}`;
    const scores = scoresByKey.get(key) ?? [];
    scores.push(score);
    scoresByKey.set(key, scores);
  });

  return scoresByKey;
}

async function loadMockCohortAverages(
  supabase: SupabaseClient,
  studentIdSet: Set<string>,
  mockLabels: string[],
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
    const studentId = String(row.student_id);
    if (!studentIdSet.has(studentId)) {
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
    const lookupKey = getSubjectTrendCohortLookupKey(point);
    const cohortAverage =
      point.sourceType === "regular"
        ? (regularAverages.get(lookupKey) ?? null)
        : (mockAverages.get(lookupKey) ?? null);

    return {
      ...point,
      cohortAverage,
    };
  });
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
    const { gakuseiIdSet, studentIdSet } = await loadCohortStudentIndex(supabase, cohortKey);
    const [regularScoreLists, mockScoreLists] = await Promise.all([
      loadRegularCohortAverages(supabase, gakuseiIdSet, regularSubjects),
      loadMockCohortAverages(supabase, studentIdSet, mockLabels),
    ]);
    const regularAverages = buildAverageMap(regularScoreLists);
    const mockAverages = buildAverageMap(mockScoreLists);
    points = attachCohortAveragesToPoints(points, regularAverages, mockAverages);
  }

  return {
    subjectName,
    points,
    cohortAverageLabel,
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
