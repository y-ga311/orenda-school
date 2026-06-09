import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  COGNITIVE_SCORE_ITEMS,
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
  "gakusei_id, name, class, nickname, gakusei_password, hogosya_id, hogosya_pass, mail" as const;

const EXTENDED_SELECT =
  "pretest_score, support_area, career_education, cognitive_scores" as const;

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

  const row = {
    ...coreResult.data,
    ...(extendedResult.data ?? {}),
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

  updates.hogosya_id = parentId;
  updates.mail = parentEmail;

  if (parentPassword) {
    updates.hogosya_pass = parentPassword;
  }

  const { error } = await supabase.from("students").update(updates).eq("gakusei_id", gakuseiId);

  if (error) {
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
