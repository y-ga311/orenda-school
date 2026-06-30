import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { formToNationalExamSchedulePayload } from "@/lib/nationalExamSchedule";
import {
  createNationalExamSchedule,
  deleteNationalExamSchedule,
  getNationalExamSchedule,
  listNationalExamSchedules,
  updateNationalExamSchedule,
} from "@/lib/nationalExamSchedule.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type ScheduleRequestBody = {
  id?: unknown;
  className?: unknown;
  examDate?: unknown;
  isActive?: unknown;
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

function parseWriteBody(body: ScheduleRequestBody | null) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, message: "リクエストの形式が正しくありません。" };
  }

  return formToNationalExamSchedulePayload({
    className: typeof body.className === "string" ? body.className : "",
    examDate: typeof body.examDate === "string" ? body.examDate : "",
    isActive: body.isActive !== false,
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
    const result = await getNationalExamSchedule(supabaseResult.supabase, id);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }
    if (!result.detail) {
      return NextResponse.json({ message: "日程が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ detail: result.detail });
  }

  const result = await listNationalExamSchedules(supabaseResult.supabase, {
    search: searchParams.get("search") ?? undefined,
  });

  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json({
    items: result.items,
    classNames: result.classNames,
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

  const body = (await request.json().catch(() => null)) as ScheduleRequestBody | null;
  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await createNationalExamSchedule(supabaseResult.supabase, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "日程の作成に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "日程を登録しました。",
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

  const body = (await request.json().catch(() => null)) as ScheduleRequestBody | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ message: "日程IDが指定されていません。" }, { status: 400 });
  }

  const parsed = parseWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await updateNationalExamSchedule(supabaseResult.supabase, id, parsed.payload);
  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "日程の更新に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "日程を保存しました。",
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
    return NextResponse.json({ message: "日程IDが指定されていません。" }, { status: 400 });
  }

  const result = await deleteNationalExamSchedule(supabaseResult.supabase, id);
  if (!result.ok) {
    return NextResponse.json({ message: result.error ?? "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ message: "日程を削除しました。" });
}
