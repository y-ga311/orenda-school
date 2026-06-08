import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

export const runtime = "nodejs";

const STUDENT_ID_COOKIE = "student_id";

type StudySessionRequestBody = {
  subjectId?: unknown;
  subjectName?: unknown;
  durationMinutes?: unknown;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const studentId = cookieStore.get(STUDENT_ID_COOKIE)?.value?.trim();

  if (!studentId) {
    return NextResponse.json(
      { message: "ログイン情報が確認できません。" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | StudySessionRequestBody
    | null;
  const subjectId = typeof body?.subjectId === "string" ? body.subjectId.trim() : "";
  const subjectName =
    typeof body?.subjectName === "string" ? body.subjectName.trim() : "";
  const durationMinutes =
    typeof body?.durationMinutes === "number" ? body.durationMinutes : Number.NaN;

  if (!subjectId || !subjectName) {
    return NextResponse.json(
      { message: "科目情報を指定してください。" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    return NextResponse.json(
      { message: "1分以上学習してから登録してください。" },
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

  const { error } = await supabase.from("study_sessions").insert({
    gakusei_id: studentId,
    subject_id: subjectId,
    subject_name: subjectName,
    duration_minutes: durationMinutes,
    studied_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[study-sessions] insert:", error.message);
    return NextResponse.json(
      { message: "学習記録の保存中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
