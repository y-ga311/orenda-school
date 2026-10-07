import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getStudentSubmittedQuestion,
  listStudentSubmittedQuestions,
  updateStudentSubmittedQuestion,
} from "@/lib/studentSubmittedQuestions.server";
import type { StudentSubmittedQuestionFormState } from "@/lib/studentSubmittedQuestions";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

const TABLE_MISSING_MESSAGE =
  "student_submitted_questions テーブルが未作成です。docs/sql/create-student-submitted-questions.sql を Supabase で実行してください。";

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: NextResponse.json({ message: "ログインが必要です。" }, { status: 401 }) };
  }
  return { teacherId };
}

function getSupabaseOrError() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ message: "Supabase接続情報が未設定です。" }, { status: 500 }),
    };
  }
  return { supabase };
}

function readForm(body: Record<string, unknown>): StudentSubmittedQuestionFormState {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const correctIndex =
    typeof body.correctIndex === "number"
      ? String(body.correctIndex)
      : typeof body.correctIndex === "string"
        ? body.correctIndex
        : "0";

  return {
    subjectLabel: text(body.subjectLabel),
    body: text(body.body),
    choice1: text(body.choice1),
    choice2: text(body.choice2),
    choice3: text(body.choice3),
    choice4: text(body.choice4),
    correctIndex,
    explanation: text(body.explanation),
  };
}

export async function GET(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";

  if (id) {
    const result = await getStudentSubmittedQuestion(supabaseResult.supabase, id);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }
    return NextResponse.json({ detail: result.detail });
  }

  const result = await listStudentSubmittedQuestions(
    supabaseResult.supabase,
    searchParams.get("search")?.trim() ?? "",
  );
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  return NextResponse.json({
    items: result.items,
    tableMissing: result.tableMissing,
    message: result.tableMissing ? TABLE_MISSING_MESSAGE : undefined,
  });
}

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ message: "投稿問題が指定されていません。" }, { status: 400 });
  }

  const result = await updateStudentSubmittedQuestion(
    supabaseResult.supabase,
    id,
    readForm(body ?? {}),
    auth.teacherId,
  );
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ message: "訂正を保存しました。" });
}
