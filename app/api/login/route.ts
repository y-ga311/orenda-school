import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import {
  TEACHER_PENDING_COOKIE,
  TEACHER_PENDING_MAX_AGE,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_MAX_AGE,
  isInitialTeacherPassword,
} from "@/lib/teacherSession";

export const runtime = "nodejs";

type LoginRequestBody = {
  employeeNumber?: unknown;
  adminUserId?: unknown;
  password?: unknown;
  remember?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
  const employeeNumber =
    typeof body?.employeeNumber === "string"
      ? body.employeeNumber.trim()
      : typeof body?.adminUserId === "string"
        ? body.adminUserId.trim()
        : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const remember = body?.remember === true;

  if (!employeeNumber || !password) {
    return NextResponse.json(
      { message: "社員番号とパスワードを入力してください。" },
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

  const { data, error } = await supabase
    .from("teacher_accounts")
    .select("id, name, employee_number, password")
    .eq("employee_number", employeeNumber)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    console.error("[login] teacher_accounts:", error.message);
    return NextResponse.json(
      { message: "ログイン処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: "社員番号またはパスワードが正しくありません。" },
      { status: 401 },
    );
  }

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  if (isInitialTeacherPassword(data.password)) {
    const response = NextResponse.json({
      requiresPasswordChange: true,
      teacherName: data.name,
      employeeNumber: data.employee_number,
    });

    response.cookies.set(TEACHER_PENDING_COOKIE, data.id, {
      ...cookieOptions,
      maxAge: TEACHER_PENDING_MAX_AGE,
    });
    response.cookies.set(TEACHER_SESSION_COOKIE, "", {
      ...cookieOptions,
      maxAge: 0,
    });

    return response;
  }

  const response = NextResponse.json({
    requiresPasswordChange: false,
    teacherName: data.name,
    employeeNumber: data.employee_number,
  });

  response.cookies.set(TEACHER_SESSION_COOKIE, data.id, {
    ...cookieOptions,
    ...(remember ? { maxAge: TEACHER_SESSION_MAX_AGE } : {}),
  });
  response.cookies.set(TEACHER_PENDING_COOKIE, "", {
    ...cookieOptions,
    maxAge: 0,
  });

  return response;
}
