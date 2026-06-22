import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  COGNITIVE_SCORE_COLUMNS,
  COGNITIVE_SCORE_ITEMS,
  buildCognitiveColumnUpdates,
  buildCognitiveJsonUpdate,
  parseCognitiveScoresFromRow,
  parseIntegerScore,
  parsePretestScoreFormValue,
  type CognitiveScores,
  type StudentProfileData,
} from "@/lib/studentProfile";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { decryptStudentName } from "@/lib/studentNameCrypto.server";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type StudentRow = {
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
};

type UpdateBody = {
  gakuseiId?: unknown;
  nickname?: unknown;
  className?: unknown;
  studentPassword?: unknown;
  parentId?: unknown;
  parentPassword?: unknown;
  parentEmail?: unknown;
  pretestScore?: unknown;
  supportArea?: unknown;
  careerEducation?: unknown;
  cognitiveScores?: unknown;
};

const MAX_TEXT_FIELD_LENGTH = 200;
const MAX_PRETEST_SCORE = 9999.9;
const MAX_COGNITIVE_SCORE = 999;

const CORE_SELECT =
  "gakusei_id, name, class, nickname, gakusei_password, hogosya_id, hogosya_pass, mail" as const;

const EXTENDED_SELECT = [
  "pretest_score",
  "support_area",
  "career_education",
  "cognitive_scores",
  ...COGNITIVE_SCORE_COLUMNS,
].join(", ");

const LEGACY_EXTENDED_SELECT =
  "pretest_score, support_area, career_education, cognitive_scores" as const;

function isMissingColumnError(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("42703") ||
    message.includes("cognitive_camera")
  );
}

function parseCognitiveScores(row: StudentRow): CognitiveScores {
  return parseCognitiveScoresFromRow(row, row.cognitive_scores);
}

function mapStudentProfile(
  row: StudentRow,
  extendedFieldsAvailable: boolean,
): StudentProfileData {
  return {
    gakuseiId: row.gakusei_id,
    name: row.name?.trim() || "名前未設定",
    nickname: row.nickname?.trim() || "",
    className: row.class?.trim() || "",
    parentId: row.hogosya_id?.trim() || "",
    parentEmail: row.mail?.trim() || "",
    hasStudentPassword: Boolean(row.gakusei_password),
    hasParentPassword: Boolean(row.hogosya_pass),
    pretestScore:
      extendedFieldsAvailable && row.pretest_score !== null && row.pretest_score !== undefined
        ? Number(row.pretest_score)
        : null,
    supportArea:
      extendedFieldsAvailable && row.support_area?.trim()
        ? row.support_area.trim()
        : null,
    careerEducation:
      extendedFieldsAvailable && row.career_education?.trim()
        ? row.career_education.trim()
        : null,
    cognitiveScores: extendedFieldsAvailable
      ? parseCognitiveScores(row)
      : {},
    extendedFieldsAvailable,
  };
}

function parseCognitiveScoresInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "認知特性スコアの形式が正しくありません。" };
  }

  const scores: CognitiveScores = {};
  for (const { key } of COGNITIVE_SCORE_ITEMS) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === "") {
      scores[key] = null;
      continue;
    }

    const parsed = parseIntegerScore(raw);
    if (parsed === null) {
      return { error: `認知特性スコア（${key}）は0〜${MAX_COGNITIVE_SCORE}の整数で入力してください。` };
    }
    if (parsed < 0 || parsed > MAX_COGNITIVE_SCORE) {
      return {
        error: `認知特性スコア（${key}）は0〜${MAX_COGNITIVE_SCORE}の範囲で入力してください。`,
      };
    }
    scores[key] = parsed;
  }

  return { scores };
}

function parseExtendedProfileInput(body: UpdateBody) {
  const extended: Record<string, unknown> = {};

  if (body.pretestScore !== undefined) {
    const raw =
      typeof body.pretestScore === "number"
        ? String(body.pretestScore)
        : typeof body.pretestScore === "string"
          ? body.pretestScore
          : "";
    const parsed = parsePretestScoreFormValue(raw);
    if (raw.trim() && parsed === null) {
      return { error: "入学前プレのスコアは数値で入力してください。" };
    }
    if (parsed !== null && (parsed < 0 || parsed > MAX_PRETEST_SCORE)) {
      return {
        error: `入学前プレのスコアは0〜${MAX_PRETEST_SCORE}の範囲で入力してください。`,
      };
    }
    extended.pretest_score = parsed;
  }

  if (body.supportArea !== undefined) {
    if (typeof body.supportArea !== "string") {
      return { error: "サポート領域の形式が正しくありません。" };
    }
    const trimmed = body.supportArea.trim();
    if (trimmed.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `サポート領域は${MAX_TEXT_FIELD_LENGTH}文字以内で入力してください。` };
    }
    extended.support_area = trimmed || null;
  }

  if (body.careerEducation !== undefined) {
    if (typeof body.careerEducation !== "string") {
      return { error: "キャリア教育の形式が正しくありません。" };
    }
    const trimmed = body.careerEducation.trim();
    if (trimmed.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `キャリア教育は${MAX_TEXT_FIELD_LENGTH}文字以内で入力してください。` };
    }
    extended.career_education = trimmed || null;
  }

  let cognitiveScores: CognitiveScores | undefined;
  if (body.cognitiveScores !== undefined) {
    const parsed = parseCognitiveScoresInput(body.cognitiveScores);
    if ("error" in parsed) {
      return { error: parsed.error };
    }
    cognitiveScores = parsed.scores;
  }

  return { extended, cognitiveScores };
}

async function updateStudentProfile(
  gakuseiId: string,
  updates: Record<string, unknown>,
  cognitiveScores?: CognitiveScores,
) {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { message: "Supabase接続情報が未設定です。" },
        { status: 500 },
      ),
    };
  }

  const payload = { ...updates };
  if (cognitiveScores) {
    Object.assign(payload, buildCognitiveColumnUpdates(cognitiveScores));
  }

  let { error } = await supabase.from("students").update(payload).eq("gakusei_id", gakuseiId);

  if (error && cognitiveScores && isMissingColumnError(error.message)) {
    const fallbackPayload: Record<string, unknown> = {
      ...updates,
      cognitive_scores: buildCognitiveJsonUpdate(cognitiveScores),
    };
    COGNITIVE_SCORE_COLUMNS.forEach((column) => {
      delete fallbackPayload[column];
    });

    ({ error } = await supabase
      .from("students")
      .update(fallbackPayload)
      .eq("gakusei_id", gakuseiId));
  }

  if (error && isMissingColumnError(error.message)) {
    const coreOnly = { ...updates };
    COGNITIVE_SCORE_COLUMNS.forEach((column) => {
      delete coreOnly[column];
    });
    delete coreOnly.pretest_score;
    delete coreOnly.support_area;
    delete coreOnly.career_education;
    delete coreOnly.cognitive_scores;

    ({ error } = await supabase
      .from("students")
      .update(coreOnly)
      .eq("gakusei_id", gakuseiId));

    if (!error) {
      const result = await fetchStudentRow(gakuseiId);
      if (result.error) {
        return result;
      }
      return {
        profile: result.profile,
        warning:
          "基本情報は保存しましたが、スコア項目のカラムが未作成のためスコアは保存されませんでした。",
      };
    }
  }

  if (error) {
    console.error("[student-profile] update:", error.message);
    return {
      error: NextResponse.json(
        { message: "学生情報の保存中にエラーが発生しました。" },
        { status: 500 },
      ),
    };
  }

  const result = await fetchStudentRow(gakuseiId);
  if (result.error) {
    return result;
  }

  return { profile: result.profile };
}

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: NextResponse.json({ message: "ログインが必要です。" }, { status: 401 }) };
  }
  return { teacherId };
}

async function fetchStudentRow(gakuseiId: string) {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { message: "Supabase接続情報が未設定です。" },
        { status: 500 },
      ),
    };
  }

  const coreResult = await supabase
    .from("students")
    .select(CORE_SELECT)
    .eq("gakusei_id", gakuseiId)
    .maybeSingle();

  if (coreResult.error) {
    console.error("[student-profile] students core:", coreResult.error.message);
    return {
      error: NextResponse.json(
        { message: "学生情報の取得中にエラーが発生しました。" },
        { status: 500 },
      ),
    };
  }

  if (!coreResult.data) {
    return {
      error: NextResponse.json({ message: "学生が見つかりません。" }, { status: 404 }),
    };
  }

  let extendedResult = await supabase
    .from("students")
    .select(EXTENDED_SELECT)
    .eq("gakusei_id", gakuseiId)
    .maybeSingle();

  if (extendedResult.error && isMissingColumnError(extendedResult.error.message)) {
    extendedResult = await supabase
      .from("students")
      .select(LEGACY_EXTENDED_SELECT)
      .eq("gakusei_id", gakuseiId)
      .maybeSingle();
  }

  const extendedFieldsAvailable = !extendedResult.error;

  if (extendedResult.error) {
    console.warn("[student-profile] extended columns unavailable:", extendedResult.error.message);
  }

  const row = {
    ...coreResult.data,
    ...((extendedResult.data ?? {}) as Record<string, unknown>),
  } as StudentRow;
  row.name = await decryptStudentName(row.name);

  return {
    profile: mapStudentProfile(row, extendedFieldsAvailable),
  };
}

export async function GET(request: Request) {
  const auth = await requireTeacher();
  if (auth.error) {
    return auth.error;
  }

  const gakuseiId = new URL(request.url).searchParams.get("gakuseiId")?.trim();
  if (!gakuseiId) {
    return NextResponse.json({ message: "学生が選択されていません。" }, { status: 400 });
  }

  const result = await fetchStudentRow(gakuseiId);
  if (result.error) {
    return result.error;
  }

  return NextResponse.json(result.profile);
}

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  const gakuseiId = typeof body?.gakuseiId === "string" ? body.gakuseiId.trim() : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const className = typeof body?.className === "string" ? body.className.trim() : "";
  const studentPassword =
    typeof body?.studentPassword === "string" ? body.studentPassword : "";
  const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
  const parentPassword =
    typeof body?.parentPassword === "string" ? body.parentPassword : "";
  const parentEmail = typeof body?.parentEmail === "string" ? body.parentEmail.trim() : "";

  if (!gakuseiId) {
    return NextResponse.json({ message: "学生が選択されていません。" }, { status: 400 });
  }

  if (nickname.length > 12) {
    return NextResponse.json(
      { message: "ニックネームは12文字以内で入力してください。" },
      { status: 400 },
    );
  }

  if (!className) {
    return NextResponse.json({ message: "クラスを入力してください。" }, { status: 400 });
  }

  if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return NextResponse.json(
      { message: "保護者メールアドレスの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const updates: Record<string, string | null> = {
    nickname: nickname || null,
    class: className,
    hogosya_id: parentId || null,
    mail: parentEmail || null,
  };
  if (studentPassword) {
    updates.gakusei_password = studentPassword;
  }

  if (parentPassword) {
    updates.hogosya_pass = parentPassword;
  }

  const extendedInput = parseExtendedProfileInput(body ?? {});
  if ("error" in extendedInput) {
    return NextResponse.json({ message: extendedInput.error }, { status: 400 });
  }

  const result = await updateStudentProfile(
    gakuseiId,
    { ...updates, ...extendedInput.extended },
    extendedInput.cognitiveScores,
  );

  if ("error" in result && result.error) {
    return result.error;
  }

  if ("warning" in result && result.warning) {
    return NextResponse.json({ ...result.profile, warning: result.warning });
  }

  return NextResponse.json(result.profile);
}
