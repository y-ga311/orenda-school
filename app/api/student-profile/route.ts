import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  COGNITIVE_SCORE_ITEMS,
  type CognitiveScores,
  type StudentProfileData,
} from "@/lib/studentProfile";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type StudentRow = {
  gakusei_id: string;
  name: string | null;
  class: string | null;
  nickname: string | null;
  gakusei_password?: string | null;
  parent_id?: string | null;
  parent_password?: string | null;
  parent_email?: string | null;
  pretest_score?: number | string | null;
  support_area?: string | null;
  career_education?: string | null;
  cognitive_scores?: CognitiveScores | null;
};

type UpdateBody = {
  gakuseiId?: unknown;
  nickname?: unknown;
  className?: unknown;
  studentPassword?: unknown;
  parentId?: unknown;
  parentPassword?: unknown;
  parentEmail?: unknown;
};

const CORE_SELECT =
  "gakusei_id, name, class, nickname, gakusei_password" as const;

const EXTENDED_SELECT =
  "parent_id, parent_password, parent_email, pretest_score, support_area, career_education, cognitive_scores" as const;

function parseCognitiveScores(value: unknown): CognitiveScores {
  if (!value || typeof value !== "object") {
    return {};
  }

  const scores: CognitiveScores = {};
  COGNITIVE_SCORE_ITEMS.forEach(({ key }) => {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === "") {
      scores[key] = null;
      return;
    }

    const parsed = typeof raw === "number" ? raw : Number(raw);
    scores[key] = Number.isFinite(parsed) ? parsed : null;
  });

  return scores;
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
    parentId: extendedFieldsAvailable ? row.parent_id?.trim() || "" : "",
    parentEmail: extendedFieldsAvailable ? row.parent_email?.trim() || "" : "",
    hasStudentPassword: Boolean(row.gakusei_password),
    hasParentPassword: extendedFieldsAvailable ? Boolean(row.parent_password) : false,
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
      ? parseCognitiveScores(row.cognitive_scores)
      : {},
    extendedFieldsAvailable,
  };
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

  const extendedResult = await supabase
    .from("students")
    .select(EXTENDED_SELECT)
    .eq("gakusei_id", gakuseiId)
    .maybeSingle();

  const extendedFieldsAvailable = !extendedResult.error;

  if (extendedResult.error) {
    console.warn("[student-profile] extended columns unavailable:", extendedResult.error.message);
  }

  return {
    profile: mapStudentProfile(
      {
        ...coreResult.data,
        ...(extendedResult.data ?? {}),
      } as StudentRow,
      extendedFieldsAvailable,
    ),
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

  if (nickname.length < 1 || nickname.length > 12) {
    return NextResponse.json(
      { message: "ニックネームは1文字以上12文字以内で入力してください。" },
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

  const updates: Record<string, string> = {
    nickname,
    class: className,
  };

  if (studentPassword) {
    updates.gakusei_password = studentPassword;
  }

  updates.parent_id = parentId;
  updates.parent_email = parentEmail;

  if (parentPassword) {
    updates.parent_password = parentPassword;
  }

  const { error } = await supabase.from("students").update(updates).eq("gakusei_id", gakuseiId);

  if (error) {
    if (error.message.includes("parent_")) {
      const coreUpdates: Record<string, string> = {
        nickname,
        class: className,
      };
      if (studentPassword) {
        coreUpdates.gakusei_password = studentPassword;
      }

      const { error: coreError } = await supabase
        .from("students")
        .update(coreUpdates)
        .eq("gakusei_id", gakuseiId);

      if (coreError) {
        console.error("[student-profile] update core:", coreError.message);
        return NextResponse.json(
          { message: "学生情報の保存中にエラーが発生しました。" },
          { status: 500 },
        );
      }

      const result = await fetchStudentRow(gakuseiId);
      if (result.error) {
        return result.error;
      }

      return NextResponse.json({
        ...result.profile,
        warning:
          "保護者情報のカラムが未作成のため、基本項目のみ保存しました。SQL マイグレーションを実行してください。",
      });
    }

    console.error("[student-profile] update:", error.message);
    return NextResponse.json(
      { message: "学生情報の保存中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  const result = await fetchStudentRow(gakuseiId);
  if (result.error) {
    return result.error;
  }

  return NextResponse.json(result.profile);
}
