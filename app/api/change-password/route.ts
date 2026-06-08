import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPendingTeacherId } from "@/lib/teacherSession.server";
import {
  TEACHER_PENDING_COOKIE,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_MAX_AGE,
  isInitialTeacherPassword,
  isValidNewTeacherPassword,
} from "@/lib/teacherSession";

export const runtime = "nodejs";

type ChangePasswordRequestBody = {
  newPassword?: unknown;
  confirmPassword?: unknown;
};

export async function POST(request: Request) {
  const pendingTeacherId = await getPendingTeacherId();
  if (!pendingTeacherId) {
    return NextResponse.json(
      { message: "パスワード変更の有効期限が切れました。再度ログインしてください。" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | ChangePasswordRequestBody
    | null;
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

  if (!newPassword || !confirmPassword) {
    return NextResponse.json(
      { message: "新しいパスワードを入力してください。" },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { message: "新しいパスワードが一致しません。" },
      { status: 400 },
    );
  }

  if (!isValidNewTeacherPassword(newPassword)) {
    return NextResponse.json(
      { message: "新しいパスワードは8文字以上で入力してください。" },
      { status: 400 },
    );
  }

  if (isInitialTeacherPassword(newPassword)) {
    return NextResponse.json(
      { message: "初期パスワード（0000）は使用できません。別のパスワードを設定してください。" },
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

  const { data: teacher, error: fetchError } = await supabase
    .from("teacher_accounts")
    .select("id, password")
    .eq("id", pendingTeacherId)
    .maybeSingle();

  if (fetchError) {
    console.error("[change-password] fetch:", fetchError.message);
    return NextResponse.json(
      { message: "パスワード変更処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  if (!teacher || !isInitialTeacherPassword(teacher.password)) {
    return NextResponse.json(
      { message: "パスワード変更が必要なアカウントではありません。" },
      { status: 403 },
    );
  }

  const { error: updateError } = await supabase
    .from("teacher_accounts")
    .update({ password: newPassword })
    .eq("id", pendingTeacherId);

  if (updateError) {
    console.error("[change-password] update:", updateError.message);
    return NextResponse.json(
      { message: "パスワードの更新に失敗しました。" },
      { status: 500 },
    );
  }

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  const response = NextResponse.json({ ok: true });
  response.cookies.set(TEACHER_SESSION_COOKIE, pendingTeacherId, {
    ...cookieOptions,
    maxAge: TEACHER_SESSION_MAX_AGE,
  });
  response.cookies.set(TEACHER_PENDING_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
  });

  return response;
}
