import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCognitiveColumnUpdates,
  buildCognitiveJsonUpdate,
  buildLearningAbilityColumnUpdates,
} from "@/lib/studentProfile";
import { buildPartialGroupUpdatePayload } from "@/lib/studentProfileBulk";
import type {
  BulkScoreImportRowError,
  CognitiveScoreImportRow,
  LearningAbilityScoreImportRow,
  MedicalFoundationTestImportRow,
  ScoreSummaryImportRow,
  StudentBulkScoreImportGroup,
} from "@/lib/studentBulkScoreImport";

export type ImportStudentBulkScoresResult =
  | { ok: true; updatedCount: number }
  | {
      ok: false;
      message: string;
      rowErrors?: BulkScoreImportRowError[];
    };

function isMissingColumnError(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("42703") ||
    message.includes("cognitive_camera") ||
    message.includes("learning_ability_reading")
  );
}

async function assertStudentsExist(
  supabase: SupabaseClient,
  gakuseiIds: string[],
  rowNumbers?: number[],
  rows?: Array<{ gakuseiId: string }>,
) {
  const { data, error } = await supabase
    .from("students")
    .select("gakusei_id")
    .in("gakusei_id", gakuseiIds);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const existingIds = new Set((data ?? []).map((row) => String(row.gakusei_id)));
  const rowErrors: BulkScoreImportRowError[] = [];

  rows?.forEach((row, index) => {
    if (!existingIds.has(row.gakuseiId)) {
      rowErrors.push({
        rowNumber: rowNumbers?.[index] ?? index + 2,
        message: `学籍番号「${row.gakuseiId}」の学生が見つかりません。`,
      });
    }
  });

  if (rowErrors.length > 0) {
    return {
      ok: false as const,
      message: "存在しない学籍番号が含まれています。",
      rowErrors,
    };
  }

  return { ok: true as const };
}

async function updateCognitiveScores(
  supabase: SupabaseClient,
  row: CognitiveScoreImportRow,
) {
  const columnPayload = buildCognitiveColumnUpdates(row.scores);
  const { error } = await supabase
    .from("students")
    .update(columnPayload)
    .eq("gakusei_id", row.gakuseiId);

  if (!error) {
    return { ok: true as const };
  }

  if (!isMissingColumnError(error.message)) {
    return { ok: false as const, message: error.message };
  }

  const { error: fallbackError } = await supabase
    .from("students")
    .update({ cognitive_scores: buildCognitiveJsonUpdate(row.scores) })
    .eq("gakusei_id", row.gakuseiId);

  if (fallbackError) {
    return { ok: false as const, message: fallbackError.message };
  }

  return { ok: true as const };
}

async function updateLearningAbilityScores(
  supabase: SupabaseClient,
  row: LearningAbilityScoreImportRow,
) {
  const columnPayload = buildLearningAbilityColumnUpdates(row.scores);
  const { error } = await supabase
    .from("students")
    .update(columnPayload)
    .eq("gakusei_id", row.gakuseiId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        ok: false as const,
        message: "学習能力チェックのカラムが未作成のため保存できません。",
      };
    }
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

async function updateMedicalFoundationTest(
  supabase: SupabaseClient,
  row: MedicalFoundationTestImportRow,
) {
  const payload = buildPartialGroupUpdatePayload({
    medicalFoundationTestScore:
      row.medicalFoundationTestScore === null
        ? ""
        : String(row.medicalFoundationTestScore),
  });
  if (!payload) {
    return { ok: false as const, message: "更新データがありません。" };
  }

  const { error } = await supabase
    .from("students")
    .update(payload)
    .eq("gakusei_id", row.gakuseiId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        ok: false as const,
        message: "医療系専門基礎テストのカラムが未作成のため保存できません。",
      };
    }
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

async function updateScoreSummary(
  supabase: SupabaseClient,
  row: ScoreSummaryImportRow,
) {
  const values: Record<string, string> = {};
  if (row.pretestScore !== null && row.pretestScore !== undefined) {
    values.pretestScore = String(row.pretestScore);
  }
  if (row.supportArea) {
    values.supportArea = row.supportArea;
  }
  if (row.careerEducation) {
    values.careerEducation = row.careerEducation;
  }

  const payload = buildPartialGroupUpdatePayload(values);
  if (!payload) {
    return { ok: false as const, message: "更新データがありません。" };
  }

  const { error } = await supabase
    .from("students")
    .update(payload)
    .eq("gakusei_id", row.gakuseiId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        ok: false as const,
        message: "スコア項目のカラムが未作成のため保存できません。",
      };
    }
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function importStudentBulkScores(
  supabase: SupabaseClient,
  group: StudentBulkScoreImportGroup,
  rows:
    | CognitiveScoreImportRow[]
    | ScoreSummaryImportRow[]
    | LearningAbilityScoreImportRow[]
    | MedicalFoundationTestImportRow[],
  rowNumbers?: number[],
): Promise<ImportStudentBulkScoresResult> {
  const gakuseiIds = [...new Set(rows.map((row) => row.gakuseiId))];
  const existence = await assertStudentsExist(supabase, gakuseiIds, rowNumbers, rows);
  if (!existence.ok) {
    return existence;
  }

  let updatedCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const result =
      group === "cognitive"
        ? await updateCognitiveScores(supabase, row as CognitiveScoreImportRow)
        : group === "learningAbility"
          ? await updateLearningAbilityScores(supabase, row as LearningAbilityScoreImportRow)
          : group === "medicalFoundationTest"
            ? await updateMedicalFoundationTest(supabase, row as MedicalFoundationTestImportRow)
            : await updateScoreSummary(supabase, row as ScoreSummaryImportRow);

    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        rowErrors: [
          {
            rowNumber: rowNumbers?.[index] ?? index + 2,
            message: "保存に失敗しました。",
          },
        ],
      };
    }

    updatedCount += 1;
  }

  return { ok: true, updatedCount };
}
