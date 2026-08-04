import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  COGNITIVE_SCORE_COLUMNS,
  LEARNING_ABILITY_SCORE_COLUMNS,
  MEDICAL_FOUNDATION_TEST_COLUMN,
  parseCognitiveScoresFromRow,
  parseLearningAbilityScoresFromRow,
  type CognitiveScores,
} from "@/lib/studentProfile";
import {
  buildPartialGroupUpdatePayload,
  buildNationalExamStatusBulkValue,
  getStudentBulkGroup,
  type StudentBulkGroupKey,
  type StudentBulkRow,
  type StudentBulkRowValues,
  validateBulkGroupPartialValues,
} from "@/lib/studentProfileBulk";
import { isMissingNationalExamPassedColumn } from "@/lib/nationalExamStatus";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { decryptStudentRows } from "@/lib/studentNameCrypto.server";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type DbStudentRow = {
  gakusei_id: string;
  name: string | null;
  class: string | null;
  nickname: string | null;
  gakusei_password?: string | null;
  hogosya_id?: string | null;
  hogosya_pass?: string | null;
  mail?: string | null;
  pretest_score?: number | string | null;
  support_area?: string | null;
  career_education?: string | null;
  cognitive_scores?: CognitiveScores | null;
  cognitive_camera?: number | string | null;
  cognitive_3d?: number | string | null;
  cognitive_fantasy?: number | string | null;
  cognitive_reading?: number | string | null;
  cognitive_sound?: number | string | null;
  cognitive_radio?: number | string | null;
  learning_ability_reading?: number | string | null;
  learning_ability_calculation?: number | string | null;
  learning_ability_data_reading?: number | string | null;
  medical_foundation_test_score?: number | string | null;
  national_exam_failed?: boolean | null;
  national_exam_passed?: boolean | null;
};

type BulkUpdateBody = {
  group?: unknown;
  updates?: unknown;
};

const BULK_GROUP_KEYS = new Set<string>([
  "nickname",
  "className",
  "scoreSummary",
  "cognitive",
  "learningAbility",
  "medicalFoundationTest",
  "parentAccount",
  "studentAccount",
  "nationalExamStatus",
]);

const CORE_SELECT =
  "gakusei_id, name, class, nickname, gakusei_password, hogosya_id, hogosya_pass, mail, national_exam_failed, national_exam_passed" as const;

const LEGACY_CORE_SELECT =
  "gakusei_id, name, class, nickname, gakusei_password, hogosya_id, hogosya_pass, mail, national_exam_failed" as const;

const EXTENDED_BULK_SELECT = [
  "gakusei_id",
  "pretest_score",
  "support_area",
  "career_education",
  "cognitive_scores",
  ...COGNITIVE_SCORE_COLUMNS,
  ...LEARNING_ABILITY_SCORE_COLUMNS,
  MEDICAL_FOUNDATION_TEST_COLUMN,
].join(", ");

const LEGACY_EXTENDED_BULK_SELECT =
  "gakusei_id, pretest_score, support_area, career_education, cognitive_scores" as const;

function isMissingColumnError(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("42703") ||
    message.includes("cognitive_camera") ||
    message.includes("learning_ability_reading")
  );
}

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: NextResponse.json({ message: "ログインが必要です。" }, { status: 401 }) };
  }
  return { teacherId };
}

function formatBulkValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

function mapBulkRow(
  row: DbStudentRow,
  extendedFieldsAvailable: boolean,
  nationalExamStatusAvailable: boolean,
): StudentBulkRow {
  const cognitiveScores = extendedFieldsAvailable
    ? parseCognitiveScoresFromRow(row, row.cognitive_scores)
    : {};
  const learningAbilityScores = extendedFieldsAvailable
    ? parseLearningAbilityScoresFromRow(row)
    : {};

  const values = {
    nickname: row.nickname?.trim() ?? "",
    className: row.class?.trim() ?? "",
    parentId: row.hogosya_id?.trim() ?? "",
    parentEmail: row.mail?.trim() ?? "",
    studentPassword: "",
    parentPassword: "",
    pretestScore:
      extendedFieldsAvailable && row.pretest_score !== null && row.pretest_score !== undefined
        ? formatBulkValue(row.pretest_score)
        : "",
    supportArea: extendedFieldsAvailable ? (row.support_area?.trim() ?? "") : "",
    careerEducation: extendedFieldsAvailable ? (row.career_education?.trim() ?? "") : "",
    camera: formatBulkValue(cognitiveScores.camera),
    "3d": formatBulkValue(cognitiveScores["3d"]),
    fantasy: formatBulkValue(cognitiveScores.fantasy),
    reading: formatBulkValue(cognitiveScores.reading),
    sound: formatBulkValue(cognitiveScores.sound),
    radio: formatBulkValue(cognitiveScores.radio),
    readingComprehension: formatBulkValue(learningAbilityScores.readingComprehension),
    calculation: formatBulkValue(learningAbilityScores.calculation),
    dataComprehension: formatBulkValue(learningAbilityScores.dataComprehension),
    medicalFoundationTestScore:
      extendedFieldsAvailable &&
      row.medical_foundation_test_score !== null &&
      row.medical_foundation_test_score !== undefined
        ? formatBulkValue(row.medical_foundation_test_score)
        : "",
    nationalExamStatus: nationalExamStatusAvailable
      ? buildNationalExamStatusBulkValue(row)
      : row.national_exam_failed === true
        ? "failed"
        : "",
  } as StudentBulkRow["values"];

  return {
    gakuseiId: row.gakusei_id,
    name: row.name?.trim() || "名前未設定",
    className: row.class?.trim() || "",
    hasStudentPassword: Boolean(row.gakusei_password),
    hasParentPassword: Boolean(row.hogosya_pass),
    values,
  };
}

export async function GET() {
  const auth = await requireTeacher();
  if (auth.error) {
    return auth.error;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  let nationalExamStatusAvailable = true;
  const coreResult = await supabase
    .from("students")
    .select(CORE_SELECT)
    .order("name", { ascending: true });

  let coreRows: DbStudentRow[] | null = (coreResult.data ?? null) as DbStudentRow[] | null;

  if (coreResult.error && isMissingNationalExamPassedColumn(coreResult.error.message)) {
    nationalExamStatusAvailable = false;
    const legacyCoreResult = await supabase
      .from("students")
      .select(LEGACY_CORE_SELECT)
      .order("name", { ascending: true });

    if (legacyCoreResult.error) {
      console.error("[student-profiles-bulk] core:", legacyCoreResult.error.message);
      return NextResponse.json(
        { message: "学生情報の取得中にエラーが発生しました。" },
        { status: 500 },
      );
    }

    coreRows = (legacyCoreResult.data ?? null) as DbStudentRow[] | null;
  } else if (coreResult.error) {
    console.error("[student-profiles-bulk] core:", coreResult.error.message);
    return NextResponse.json(
      { message: "学生情報の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  if (!coreRows) {
    return NextResponse.json({ rows: [], extendedFieldsAvailable: true, nationalExamStatusAvailable });
  }

  let extendedResult = await supabase.from("students").select(EXTENDED_BULK_SELECT);
  if (extendedResult.error && isMissingColumnError(extendedResult.error.message)) {
    extendedResult = await supabase.from("students").select(LEGACY_EXTENDED_BULK_SELECT);
  }

  const extendedFieldsAvailable = !extendedResult.error;
  if (extendedResult.error) {
    console.warn("[student-profiles-bulk] extended:", extendedResult.error.message);
  }

  const extendedRows = (extendedResult.data ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const extendedById = new Map(
    extendedRows.map((row) => [String(row.gakusei_id), row]),
  );

  const decryptedCore = await decryptStudentRows(coreRows as DbStudentRow[]);
  const rows = decryptedCore
    .map((row) =>
      mapBulkRow(
        {
          ...row,
          ...((extendedById.get(row.gakusei_id) ?? {}) as Record<string, unknown>),
        } as DbStudentRow,
        extendedFieldsAvailable,
        nationalExamStatusAvailable,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return NextResponse.json({ rows, extendedFieldsAvailable, nationalExamStatusAvailable });
}

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as BulkUpdateBody | null;
  const groupKey = typeof body?.group === "string" ? body.group.trim() : "";

  if (!BULK_GROUP_KEYS.has(groupKey)) {
    return NextResponse.json({ message: "更新項目が指定されていません。" }, { status: 400 });
  }

  const group = getStudentBulkGroup(groupKey as StudentBulkGroupKey);
  if (!group) {
    return NextResponse.json({ message: "更新項目が指定されていません。" }, { status: 400 });
  }

  if (!Array.isArray(body?.updates)) {
    return NextResponse.json({ message: "更新データの形式が正しくありません。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const failures: { gakuseiId: string; message: string }[] = [];
  let updatedCount = 0;

  let nationalExamStatusAvailable = true;
  if (group.key === "nationalExamStatus") {
    const passedColumnProbe = await supabase.from("students").select("national_exam_passed").limit(1);
    nationalExamStatusAvailable =
      !passedColumnProbe.error ||
      !isMissingNationalExamPassedColumn(passedColumnProbe.error.message);
  }

  for (const item of body.updates) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const gakuseiId =
      typeof (item as { gakuseiId?: unknown }).gakuseiId === "string"
        ? (item as { gakuseiId: string }).gakuseiId.trim()
        : "";
    const values =
      (item as { values?: unknown }).values &&
      typeof (item as { values: unknown }).values === "object"
        ? ((item as { values: Record<string, string> }).values as StudentBulkRowValues)
        : null;

    if (!gakuseiId || !values) {
      continue;
    }

    const validationError = validateBulkGroupPartialValues(values);
    if (validationError) {
      failures.push({ gakuseiId, message: validationError });
      continue;
    }

    const payload = buildPartialGroupUpdatePayload(values);
    if (!payload) {
      continue;
    }

    if (group.key === "nationalExamStatus") {
      const status = values.nationalExamStatus?.trim() ?? "";
      if (!nationalExamStatusAvailable && status === "passed") {
        failures.push({
          gakuseiId,
          message:
            "国家試験合格の保存には SQL マイグレーション（add-student-national-exam-passed.sql）の実行が必要です。",
        });
        continue;
      }

      if (!nationalExamStatusAvailable) {
        delete payload.national_exam_passed;
      }
    }

    const { error } = await supabase.from("students").update(payload).eq("gakusei_id", gakuseiId);

    if (error) {
      if (group.requiresExtended && isMissingColumnError(error.message)) {
        failures.push({
          gakuseiId,
          message: "スコア項目のカラムが未作成のため保存できません。",
        });
        continue;
      }

      if (
        group.key === "nationalExamStatus" &&
        isMissingNationalExamPassedColumn(error.message)
      ) {
        failures.push({
          gakuseiId,
          message: "国家試験合格カラムが未作成のため保存できません。",
        });
        continue;
      }

      console.error("[student-profiles-bulk] update:", gakuseiId, error.message);
      failures.push({ gakuseiId, message: "保存中にエラーが発生しました。" });
      continue;
    }

    updatedCount += 1;
  }

  if (failures.length > 0 && updatedCount === 0) {
    return NextResponse.json(
      {
        message: "保存に失敗しました。",
        failures,
      },
      { status: 400 },
    );
  }

  const refreshed = await GET();
  const refreshedPayload = await refreshed.json();

  return NextResponse.json({
    ...refreshedPayload,
    updatedCount,
    failures,
    message:
      failures.length > 0
        ? `${updatedCount}件を保存しました。${failures.length}件はエラーがありました。`
        : `${updatedCount}件を保存しました。`,
  });
}
