import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  loadRegularExamCohortOptions,
  loadRegularExamTermsForCohort,
  updateRegularExamTermDates,
} from "@/lib/regularExam.server";
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

function mapTermsResponse(
  terms: Awaited<ReturnType<typeof loadRegularExamTermsForCohort>>["terms"],
) {
  return terms.map((term) => ({
    sessionKey: term.sessionKey,
    sessionLabel: term.sessionLabel,
    gradeYear: term.gradeYear,
    term: term.term,
    examDate: term.examDate,
    sortOrder: term.sortOrder,
    subjectCount: term.subjects.length,
  }));
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
  const requestedCohortKey = url.searchParams.get("cohortKey")?.trim() ?? "";

  try {
    const cohorts = await loadRegularExamCohortOptions(supabase);
    const selectedCohortKey =
      requestedCohortKey && cohorts.some((cohort) => cohort.cohortKey === requestedCohortKey)
        ? requestedCohortKey
        : (cohorts[0]?.cohortKey ?? requestedCohortKey);

    const { terms, tableMissing, datesTableMissing } = await loadRegularExamTermsForCohort(
      supabase,
      selectedCohortKey || null,
    );

    return NextResponse.json({
      cohorts,
      selectedCohortKey: selectedCohortKey || null,
      terms: mapTermsResponse(terms),
      tableMissing,
      datesTableMissing,
    });
  } catch (error) {
    console.error("[regular-exam-terms] GET:", error);
    return NextResponse.json(
      { message: "定期試験マスタの取得中にエラーが発生しました。" },
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
    cohortKey?: unknown;
    terms?: unknown;
  } | null;

  const cohortKey = typeof body?.cohortKey === "string" ? body.cohortKey.trim() : "";
  if (!cohortKey) {
    return NextResponse.json({ message: "期を選択してください。" }, { status: 400 });
  }

  if (!Array.isArray(body?.terms)) {
    return NextResponse.json({ message: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const updates: Array<{ sessionKey: string; examDate: string | null }> = [];
  for (const row of body.terms) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as Record<string, unknown>;
    const sessionKey = typeof record.sessionKey === "string" ? record.sessionKey.trim() : "";
    if (!sessionKey) {
      continue;
    }
    const examDateRaw = record.examDate;
    const examDate =
      examDateRaw === null || examDateRaw === undefined || examDateRaw === ""
        ? null
        : String(examDateRaw).trim();
    updates.push({ sessionKey, examDate });
  }

  if (updates.length === 0) {
    return NextResponse.json({ message: "更新する学期がありません。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const result = await updateRegularExamTermDates(supabase, cohortKey, updates);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  const cohorts = await loadRegularExamCohortOptions(supabase);
  const { terms, tableMissing, datesTableMissing } = await loadRegularExamTermsForCohort(
    supabase,
    cohortKey,
  );

  return NextResponse.json({
    message: "定期試験の実施日を保存しました。",
    cohorts,
    selectedCohortKey: cohortKey,
    terms: mapTermsResponse(terms),
    tableMissing,
    datesTableMissing,
  });
}
