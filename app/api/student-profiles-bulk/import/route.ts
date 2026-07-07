import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseStudentBulkScoreImportBody } from "@/lib/studentBulkScoreImport";
import { importStudentBulkScores } from "@/lib/studentBulkScoreImport.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";
import { GET as getBulkRows } from "@/app/api/student-profiles-bulk/route";

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
  const parsed = parseStudentBulkScoreImportBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { message: parsed.message, rowErrors: parsed.rowErrors },
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

  const importRows =
    parsed.group === "cognitive"
      ? (parsed.cognitiveRows ?? [])
      : parsed.group === "learningAbility"
        ? (parsed.learningAbilityRows ?? [])
        : parsed.group === "medicalFoundationTest"
          ? (parsed.medicalFoundationTestRows ?? [])
          : (parsed.scoreSummaryRows ?? []);

  const result = await importStudentBulkScores(supabase, parsed.group, importRows);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message, rowErrors: result.rowErrors },
      { status: result.rowErrors ? 400 : 500 },
    );
  }

  const refreshed = await getBulkRows();
  const refreshedPayload = await refreshed.json();

  const labelByGroup = {
    cognitive: "認知特性スコア",
    scoreSummary: "入学前プレ・キャリアサポート",
    learningAbility: "学習能力チェック",
    medicalFoundationTest: "医療系専門基礎テスト",
  } as const;

  return NextResponse.json({
    ...refreshedPayload,
    updatedCount: result.updatedCount,
    message: `${result.updatedCount}件の${labelByGroup[parsed.group]}を更新しました。`,
  });
}
