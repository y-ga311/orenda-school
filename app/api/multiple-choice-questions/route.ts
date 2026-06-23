import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { formToMultipleChoicePayload } from "@/lib/multipleChoiceQuestions";
import {
  createMultipleChoiceQuestion,
  deleteMultipleChoiceQuestion,
  getMultipleChoiceQuestion,
  listMultipleChoiceQuestions,
  updateMultipleChoiceQuestion,
} from "@/lib/multipleChoiceQuestions.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type QuestionRequestBody = {
  id?: unknown;
  subjectId?: unknown;
  subcategoryId?: unknown;
  body?: unknown;
  choice1?: unknown;
  choice2?: unknown;
  choice3?: unknown;
  choice4?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
  nationalExamRound?: unknown;
  nationalExamQuestionNo?: unknown;
};

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
      error: NextResponse.json(
        { message: "Supabase接続情報が未設定です。" },
        { status: 500 },
      ),
    };
  }
  return { supabase };
}

function parseWriteBody(body: QuestionRequestBody | null) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, message: "リクエストの形式が正しくありません。" };
  }

  return formToMultipleChoicePayload({
    subjectId: typeof body.subjectId === "string" ? body.subjectId : "",
    subcategoryId: typeof body.subcategoryId === "string" ? body.subcategoryId : "",
    body: typeof body.body === "string" ? body.body : "",
    choice1: typeof body.choice1 === "string" ? body.choice1 : "",
    choice2: typeof body.choice2 === "string" ? body.choice2 : "",
    choice3: typeof body.choice3 === "string" ? body.choice3 : "",
    choice4: typeof body.choice4 === "string" ? body.choice4 : "",
    correctIndex:
      typeof body.correctIndex === "number"
        ? String(body.correctIndex)
        : typeof body.correctIndex === "string"
          ? body.correctIndex
          : "0",
    explanation: typeof body.explanation === "string" ? body.explanation : "",
    nationalExamRound:
      typeof body.nationalExamRound === "number"
        ? String(body.nationalExamRound)
        : typeof body.nationalExamRound === "string"
          ? body.nationalExamRound
          : "",
    nationalExamQuestionNo:
      typeof body.nationalExamQuestionNo === "number"
        ? String(body.nationalExamQuestionNo)
        : typeof body.nationalExamQuestionNo === "string"
          ? body.nationalExamQuestionNo
          : "",
  });
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
  const id = searchParams.get("id")?.trim();

  if (id) {
    const result = await getMultipleChoiceQuestion(supabaseResult.supabase, id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }
    if (!result.detail) {
      return NextResponse.json({ message: "問題が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ detail: result.detail });
  }

  const result = await listMultipleChoiceQuestions(supabaseResult.supabase, {
    search: searchParams.get("search") ?? undefined,
    subjectId: searchParams.get("subjectId") ?? undefined,
    subcategoryId: searchParams.get("subcategoryId") ?? undefined,
  });

  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json({
    catalog: result.catalog,
    catalogFromDb: result.catalogFromDb,
    items: result.items,
    totalCount: result.totalCount,
    tableMissing: result.tableMissing,
  });
}

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const body = (await request.json().catch(() => null)) as QuestionRequestBody | null;
  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await createMultipleChoiceQuestion(supabaseResult.supabase, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "問題の作成に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "問題を作成しました。",
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

  const body = (await request.json().catch(() => null)) as QuestionRequestBody | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ message: "問題IDが指定されていません。" }, { status: 400 });
  }

  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await updateMultipleChoiceQuestion(supabaseResult.supabase, id, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "問題の更新に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "問題を保存しました。",
  });
}

export async function DELETE(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ message: "問題IDが指定されていません。" }, { status: 400 });
  }

  const result = await deleteMultipleChoiceQuestion(supabaseResult.supabase, id);
  if (!result.ok) {
    return NextResponse.json({ message: result.error ?? "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ message: "問題を削除しました。" });
}
