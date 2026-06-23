import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { formToTeacherQuestPayload, type TeacherQuestStatus } from "@/lib/teacherQuest";
import {
  createTeacherQuest,
  deleteTeacherQuest,
  getTeacherQuest,
  listTeacherQuests,
  updateTeacherQuest,
} from "@/lib/teacherQuest.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type QuestionRequestBody = {
  questionNumber?: unknown;
  body?: unknown;
  choice1?: unknown;
  choice2?: unknown;
  choice3?: unknown;
  choice4?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
};

type QuestRequestBody = {
  id?: unknown;
  title?: unknown;
  teacherEmployeeNumber?: unknown;
  publishDate?: unknown;
  endDate?: unknown;
  status?: unknown;
  questions?: unknown;
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

function parseStatus(value: unknown): TeacherQuestStatus {
  return value === "published" ? "published" : "draft";
}

function parseQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as QuestionRequestBody;
    return {
      body: typeof row.body === "string" ? row.body : "",
      choice1: typeof row.choice1 === "string" ? row.choice1 : "",
      choice2: typeof row.choice2 === "string" ? row.choice2 : "",
      choice3: typeof row.choice3 === "string" ? row.choice3 : "",
      choice4: typeof row.choice4 === "string" ? row.choice4 : "",
      correctIndex:
        typeof row.correctIndex === "number"
          ? String(row.correctIndex)
          : typeof row.correctIndex === "string"
            ? row.correctIndex
            : "0",
      explanation: typeof row.explanation === "string" ? row.explanation : "",
    };
  });
}

function parseWriteBody(body: QuestRequestBody | null) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, message: "リクエストの形式が正しくありません。" };
  }

  const status = parseStatus(body.status);
  const questions = parseQuestions(body.questions);

  while (questions.length < 5) {
    questions.push({
      body: "",
      choice1: "",
      choice2: "",
      choice3: "",
      choice4: "",
      correctIndex: "0",
      explanation: "",
    });
  }

  return formToTeacherQuestPayload(
    {
      title: typeof body.title === "string" ? body.title : "",
      teacherEmployeeNumber:
        typeof body.teacherEmployeeNumber === "string" ? body.teacherEmployeeNumber : "",
      publishDate: typeof body.publishDate === "string" ? body.publishDate : "",
      endDate: typeof body.endDate === "string" ? body.endDate : "",
      questions: questions.slice(0, 5),
    },
    status,
  );
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
    const result = await getTeacherQuest(supabaseResult.supabase, id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }
    if (!result.detail) {
      return NextResponse.json({ message: "クエストが見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ detail: result.detail });
  }

  const result = await listTeacherQuests(supabaseResult.supabase, {
    search: searchParams.get("search") ?? undefined,
  });

  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json({
    items: result.items,
    teachers: result.teachers,
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

  const body = (await request.json().catch(() => null)) as QuestRequestBody | null;
  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await createTeacherQuest(supabaseResult.supabase, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "クエストの作成に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "クエストを保存しました。",
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

  const body = (await request.json().catch(() => null)) as QuestRequestBody | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ message: "クエストIDが指定されていません。" }, { status: 400 });
  }

  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await updateTeacherQuest(supabaseResult.supabase, id, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "クエストの更新に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "クエストを保存しました。",
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
    return NextResponse.json({ message: "クエストIDが指定されていません。" }, { status: 400 });
  }

  const result = await deleteTeacherQuest(supabaseResult.supabase, id);
  if (!result.ok) {
    return NextResponse.json({ message: result.error ?? "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ message: "クエストを削除しました。" });
}
