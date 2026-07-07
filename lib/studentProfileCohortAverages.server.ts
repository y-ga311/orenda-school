import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCohortStudentLabel, parseCohortKeyFromClass } from "@/lib/cohort";
import {
  LEARNING_ABILITY_SCORE_COLUMNS,
  LEARNING_ABILITY_SCORE_ITEMS,
  MEDICAL_FOUNDATION_TEST_COLUMN,
  parseIntegerScore,
  type LearningAbilityScores,
  type StudentProfileScoreCohortAverages,
} from "@/lib/studentProfile";
import { roundSubjectTrendAverage } from "@/lib/subjectTrend";

type CohortScoreRow = {
  class: string | null;
  pretest_score?: number | string | null;
  medical_foundation_test_score?: number | string | null;
  learning_ability_reading?: number | string | null;
  learning_ability_calculation?: number | string | null;
  learning_ability_data_reading?: number | string | null;
};

const COHORT_SCORE_SELECT = [
  "class",
  "pretest_score",
  ...LEARNING_ABILITY_SCORE_COLUMNS,
  MEDICAL_FOUNDATION_TEST_COLUMN,
].join(", ");

const LEGACY_COHORT_SCORE_SELECT = "class, pretest_score" as const;

function isMissingColumnError(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("42703") ||
    message.includes("learning_ability_reading")
  );
}

function parseDecimalScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function averageNumericValues(values: number[]) {
  return roundSubjectTrendAverage(values);
}

function collectNumericValues(
  rows: CohortScoreRow[],
  readValue: (row: CohortScoreRow) => number | null,
) {
  const values: number[] = [];
  rows.forEach((row) => {
    const value = readValue(row);
    if (value !== null && Number.isFinite(value)) {
      values.push(value);
    }
  });
  return values;
}

function buildEmptyCohortAverages(
  cohortKey: string | null = null,
): StudentProfileScoreCohortAverages {
  return {
    cohortKey,
    cohortAverageLabel: cohortKey ? `${formatCohortStudentLabel(cohortKey)}平均` : null,
    pretestScore: null,
    medicalFoundationTestScore: null,
    learningAbilityScores: {},
  };
}

export async function buildStudentProfileCohortAverages(
  supabase: SupabaseClient,
  cohortKey: string | null,
  extendedFieldsAvailable: boolean,
): Promise<StudentProfileScoreCohortAverages> {
  if (!cohortKey || !extendedFieldsAvailable) {
    return buildEmptyCohortAverages(cohortKey);
  }

  let result = await supabase.from("students").select(COHORT_SCORE_SELECT);
  if (result.error && isMissingColumnError(result.error.message)) {
    result = await supabase.from("students").select(LEGACY_COHORT_SCORE_SELECT);
  }

  if (result.error) {
    console.warn("[student-profile] cohort averages:", result.error.message);
    return buildEmptyCohortAverages(cohortKey);
  }

  const cohortRows = ((result.data ?? []) as unknown as CohortScoreRow[]).filter(
    (row) => parseCohortKeyFromClass(row.class) === cohortKey,
  );

  if (cohortRows.length === 0) {
    return buildEmptyCohortAverages(cohortKey);
  }

  const learningAbilityScores: LearningAbilityScores = {};
  LEARNING_ABILITY_SCORE_ITEMS.forEach(({ key, column }) => {
    learningAbilityScores[key] = averageNumericValues(
      collectNumericValues(cohortRows, (row) => parseIntegerScore(row[column as keyof CohortScoreRow])),
    );
  });

  return {
    cohortKey,
    cohortAverageLabel: `${formatCohortStudentLabel(cohortKey)}平均`,
    pretestScore: averageNumericValues(
      collectNumericValues(cohortRows, (row) => parseDecimalScore(row.pretest_score)),
    ),
    medicalFoundationTestScore: averageNumericValues(
      collectNumericValues(cohortRows, (row) =>
        parseDecimalScore(row.medical_foundation_test_score),
      ),
    ),
    learningAbilityScores,
  };
}
