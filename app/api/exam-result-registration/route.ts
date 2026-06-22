import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getExamRegistrationDetail,
  listRegisteredExams,
  saveExamRegistrationDetail,
} from "@/lib/examResultRegistration.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
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

export async function GET(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

  try {
    if (key) {
      const detail = await getExamRegistrationDetail(supabase, key);
      if (!detail) {
        return NextResponse.json({ message: "試験データが見つかりません。" }, { status: 404 });
      }
      return NextResponse.json({ detail });
    }

    const items = await listRegisteredExams(supabase);
    const filtered = search
      ? items.filter((item) => {
          const haystack = `${item.testName} ${item.testDateLabel ?? ""} ${item.examTypeLabel}`.toLowerCase();
          return haystack.includes(search);
        })
      : items;

    return NextResponse.json({ items: filtered, tableMissing: false });
  } catch (error) {
    console.error("[exam-result-registration] GET:", error);
    return NextResponse.json(
      { message: "試験結果の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as {
    key?: unknown;
    testName?: unknown;
    testDate?: unknown;
    rows?: unknown;
  } | null;

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const testName = typeof body?.testName === "string" ? body.testName.trim() : "";
  const testDate = typeof body?.testDate === "string" ? body.testDate.trim() : "";
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (!key || !testName || !testDate) {
    return NextResponse.json({ message: "試験名と実施日を入力してください。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const result = await saveExamRegistrationDetail(supabase, {
    key,
    testName,
    testDate,
    rows: rows as Parameters<typeof saveExamRegistrationDetail>[1]["rows"],
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  const detail = await getExamRegistrationDetail(supabase, key);
  return NextResponse.json({
    message: "試験結果を保存しました。",
    detail,
  });
}
