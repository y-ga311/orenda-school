import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseMultipleChoiceCsv } from "@/lib/multipleChoiceQuestions";
import {
  importMultipleChoiceQuestions,
  listMultipleChoiceQuestions,
} from "@/lib/multipleChoiceQuestions.server";
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

export async function POST(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as { csvText?: unknown } | null;
  const csvText = body?.csvText;
  if (typeof csvText !== "string" || !csvText.trim()) {
    return NextResponse.json({ message: "CSVファイルを選択してください。" }, { status: 400 });
  }

  const parsed = parseMultipleChoiceCsv(csvText);
  if (!parsed.ok) {
    return NextResponse.json(
      { message: parsed.message, rowErrors: parsed.rowErrors },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase接続情報が未設定です。" }, { status: 500 });
  }

  const result = await importMultipleChoiceQuestions(supabase, parsed.rows);
  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  const refreshed = await listMultipleChoiceQuestions(supabase);

  return NextResponse.json({
    catalog: refreshed.catalog,
    catalogFromDb: refreshed.catalogFromDb,
    items: refreshed.items,
    totalCount: refreshed.totalCount,
    tableMissing: refreshed.tableMissing,
    importedCount: result.importedCount,
    message: `${result.importedCount}件の4択問題をインポートしました。`,
  });
}
