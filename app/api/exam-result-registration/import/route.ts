import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { validateImportMeta } from "@/lib/examResultRegistration";
import { importTestScoreResults } from "@/lib/examResultRegistration.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";
import type { TestScoreSubjectColumn } from "@/lib/examSubjects";

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

  const body = (await request.json().catch(() => null)) as {
    testName?: unknown;
    testDate?: unknown;
    rows?: unknown;
  } | null;

  const testName = typeof body?.testName === "string" ? body.testName.trim() : "";
  const testDate = typeof body?.testDate === "string" ? body.testDate.trim() : "";
  const metaError = validateImportMeta(testName, testDate);
  if (metaError) {
    return NextResponse.json({ message: metaError }, { status: 400 });
  }

  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ message: "登録する試験結果がありません。" }, { status: 400 });
  }

  const rows: Array<{
    gakuseiId: string;
    scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
  }> = [];

  for (const row of body.rows) {
    if (!row || typeof row !== "object") {
      return NextResponse.json({ message: "リクエスト形式が不正です。" }, { status: 400 });
    }
    const record = row as Record<string, unknown>;
    const gakuseiId = typeof record.gakuseiId === "string" ? record.gakuseiId.trim() : "";
    if (!gakuseiId) {
      return NextResponse.json({ message: "学籍番号が不正です。" }, { status: 400 });
    }
    rows.push({
      gakuseiId,
      scores: (record.scores ?? {}) as Partial<Record<TestScoreSubjectColumn, number | null>>,
    });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const result = await importTestScoreResults(supabase, { testName, testDate, rows });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    message: `${result.registeredCount}件の試験結果を登録しました（新規${result.inserted}件 / 上書き${result.updated}件）。`,
    registeredCount: result.registeredCount,
    inserted: result.inserted,
    updated: result.updated,
  });
}
