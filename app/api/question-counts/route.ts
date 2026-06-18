import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import {
  buildQuestionCountPayload,
  getExamTypeFromTestName,
  toQuestionCountListItem,
  type QuestionCountFilter,
} from "@/lib/questionCountSettings";
import {
  QUESTION_COUNTS_SELECT,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type QuestionCountRequestBody = {
  id?: unknown;
  testName?: unknown;
  previousTestName?: unknown;
  testDate?: unknown;
  counts?: unknown;
};

function requireTeacherSession() {
  return cookies().then((cookieStore) => {
    const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
    if (!teacherId) {
      return null;
    }
    return teacherId;
  });
}

function isMissingTableError(message: string, code?: string) {
  return code === "42P01" || message.includes("question_counts");
}

function parseCountsInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const counts: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    const raw = (value as Record<string, unknown>)[column];
    if (raw === null || raw === undefined || raw === "") {
      counts[column] = null;
      return;
    }

    const parsed = typeof raw === "number" ? raw : Number(raw);
    counts[column] = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });

  return counts;
}

function mapDetailItem(row: QuestionCountRow) {
  const subjects: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    const raw = row[column];
    if (raw === null || raw === undefined || raw === "") {
      subjects[column] = null;
      return;
    }
    const parsed = typeof raw === "number" ? raw : Number(raw);
    subjects[column] = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });

  return {
    ...toQuestionCountListItem(row),
    subjects,
  };
}

function matchesFilter(testName: string, filter: QuestionCountFilter) {
  if (filter === "all") {
    return true;
  }
  return getExamTypeFromTestName(testName) === filter;
}

export async function GET(request: Request) {
  const teacherId = await requireTeacherSession();
  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const testName = url.searchParams.get("testName")?.trim() ?? "";
  const filterParam = url.searchParams.get("filter")?.trim() ?? "all";
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const filter: QuestionCountFilter =
    filterParam === "mock" || filterParam === "graduation" ? filterParam : "all";

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  let query = supabase
    .from("question_counts")
    .select(QUESTION_COUNTS_SELECT)
    .order("test_date", { ascending: true })
    .order("test_name", { ascending: true });

  if (testName) {
    query = query.eq("test_name", testName);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error.message, error.code)) {
      return NextResponse.json({
        items: [],
        item: null,
        tableMissing: true,
      });
    }

    console.error("[question-counts] GET:", error.message);
    return NextResponse.json(
      { message: "試験問題数の取得中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as QuestionCountRow[];

  if (testName) {
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ message: "試験が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ item: mapDetailItem(row) });
  }

  const items = rows
    .filter((row) => matchesFilter(row.test_name, filter))
    .filter((row) => {
      if (!search) {
        return true;
      }
      return row.test_name.toLowerCase().includes(search);
    })
    .map((row) => toQuestionCountListItem(row));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const teacherId = await requireTeacherSession();
  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as QuestionCountRequestBody | null;
  const testName = typeof body?.testName === "string" ? body.testName.trim() : "";
  const testDate = typeof body?.testDate === "string" ? body.testDate.trim() : "";
  const counts = parseCountsInput(body?.counts);

  if (!testName || !testDate) {
    return NextResponse.json(
      { message: "試験名と実施日を入力してください。" },
      { status: 400 },
    );
  }

  if (!counts) {
    return NextResponse.json({ message: "科目別問題数を指定してください。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("question_counts")
    .select("id")
    .eq("test_name", testName)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError.message, existingError.code)) {
      return NextResponse.json(
        { message: "question_counts テーブルが見つかりません。" },
        { status: 500 },
      );
    }
    console.error("[question-counts] POST check:", existingError.message);
    return NextResponse.json(
      { message: "試験問題数の登録中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  if (existing) {
    return NextResponse.json(
      { message: "同じ試験名が既に登録されています。" },
      { status: 409 },
    );
  }

  const payload = buildQuestionCountPayload(testName, testDate, counts);
  const { data, error } = await supabase
    .from("question_counts")
    .insert(payload)
    .select(QUESTION_COUNTS_SELECT)
    .single();

  if (error) {
    console.error("[question-counts] POST:", error.message);
    return NextResponse.json(
      { message: "試験問題数の登録中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: mapDetailItem(data as unknown as QuestionCountRow) });
}

export async function PUT(request: Request) {
  const teacherId = await requireTeacherSession();
  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as QuestionCountRequestBody | null;
  const id = body?.id;
  const testName = typeof body?.testName === "string" ? body.testName.trim() : "";
  const previousTestName =
    typeof body?.previousTestName === "string" ? body.previousTestName.trim() : "";
  const testDate = typeof body?.testDate === "string" ? body.testDate.trim() : "";
  const counts = parseCountsInput(body?.counts);

  if ((id === null || id === undefined || id === "") && !previousTestName) {
    return NextResponse.json({ message: "更新対象の試験が指定されていません。" }, { status: 400 });
  }

  if (!testName || !testDate) {
    return NextResponse.json(
      { message: "試験名と実施日を入力してください。" },
      { status: 400 },
    );
  }

  if (!counts) {
    return NextResponse.json({ message: "科目別問題数を指定してください。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  if (previousTestName && previousTestName !== testName) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("question_counts")
      .select("id")
      .eq("test_name", testName)
      .maybeSingle();

    if (duplicateError) {
      console.error("[question-counts] PUT duplicate:", duplicateError.message);
      return NextResponse.json(
        { message: "試験問題数の更新中にエラーが発生しました。" },
        { status: 500 },
      );
    }

    if (duplicate) {
      return NextResponse.json(
        { message: "同じ試験名が既に登録されています。" },
        { status: 409 },
      );
    }
  }

  const payload = buildQuestionCountPayload(testName, testDate, counts);
  let updateQuery = supabase.from("question_counts").update(payload);

  if (id !== null && id !== undefined && id !== "") {
    updateQuery = updateQuery.eq("id", id);
  } else {
    updateQuery = updateQuery.eq("test_name", previousTestName);
  }

  const { data, error } = await updateQuery.select(QUESTION_COUNTS_SELECT).single();

  if (error) {
    console.error("[question-counts] PUT:", error.message);
    return NextResponse.json(
      { message: "試験問題数の更新中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: mapDetailItem(data as unknown as QuestionCountRow) });
}

export async function DELETE(request: Request) {
  const teacherId = await requireTeacherSession();
  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const testName = url.searchParams.get("testName")?.trim();

  if (!id && !testName) {
    return NextResponse.json({ message: "削除対象の試験が指定されていません。" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase接続情報が未設定です。" },
      { status: 500 },
    );
  }

  let deleteQuery = supabase.from("question_counts").delete();
  if (id) {
    deleteQuery = deleteQuery.eq("id", id);
  } else if (testName) {
    deleteQuery = deleteQuery.eq("test_name", testName);
  }

  const { error } = await deleteQuery;

  if (error) {
    console.error("[question-counts] DELETE:", error.message);
    return NextResponse.json(
      { message: "試験問題数の削除中にエラーが発生しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
