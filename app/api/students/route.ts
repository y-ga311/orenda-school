import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseNewStudentRegistrationBody } from "@/lib/newStudentRegistration";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { registerStudent } from "@/lib/studentRegistration.server";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: NextResponse.json({ message: "ログインが必要です。" }, { status: 401 }) };
  }
  return { teacherId };
}

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseNewStudentRegistrationBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { message: parsed.message, errors: parsed.errors },
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

  const result = await registerStudent(supabase, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    message: "学生を登録しました。",
    student: result.student,
  });
}
