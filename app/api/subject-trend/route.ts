import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSubjectTrendSubjectOptions } from "@/lib/subjectTrend";
import { buildSubjectTrendData } from "@/lib/subjectTrend.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();

  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const gakuseiId = url.searchParams.get("gakuseiId")?.trim();
  const examTypeRaw = url.searchParams.get("examType")?.trim();
  const subjectName = url.searchParams.get("subjectName")?.trim() ?? "";
  const examType = examTypeRaw === "mock" ? "mock" : "regular";

  if (!gakuseiId) {
    return NextResponse.json({ message: "学生が選択されていません。" }, { status: 400 });
  }

  const subjectOptions = getSubjectTrendSubjectOptions(examType);
  const resolvedSubject = subjectOptions.includes(subjectName)
    ? subjectName
    : (subjectOptions[0] ?? "");

  if (!resolvedSubject) {
    return NextResponse.json({ message: "表示できる科目がありません。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  try {
    const data = await buildSubjectTrendData(supabase, {
      gakuseiId,
      examType,
      subjectName: resolvedSubject,
    });

    return NextResponse.json({
      ...data,
      subjectOptions,
      selectedSubjectName: resolvedSubject,
    });
  } catch (error) {
    console.error("[subject-trend] GET:", error);
    return NextResponse.json(
      { message: "科目別推移の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
