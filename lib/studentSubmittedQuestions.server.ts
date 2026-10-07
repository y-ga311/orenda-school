import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptStudentRows } from "@/lib/studentNameCrypto.server";
import type {
  StudentSubmittedQuestionDetail,
  StudentSubmittedQuestionFormState,
  StudentSubmittedQuestionListItem,
} from "@/lib/studentSubmittedQuestions";
import { validateStudentSubmittedForm } from "@/lib/studentSubmittedQuestions";

const QUESTION_SELECT =
  "id, gakusei_id, subject_label, body, choice_1, choice_2, choice_3, choice_4, correct_index, explanation, created_at, updated_at";

type QuestionRow = {
  id: string;
  gakusei_id: string;
  subject_label: string | null;
  body: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  correct_index: number;
  explanation: string | null;
  created_at: string;
  updated_at: string | null;
};

type AuthorRow = {
  gakusei_id: string;
  name: string | null;
  class: string | null;
};

function isMissingRelationError(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("42P01") ||
    message.includes("PGRST205") ||
    message.includes("schema cache")
  );
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ja");
}

async function loadAuthors(supabase: SupabaseClient, gakuseiIds: string[]) {
  const authors = new Map<string, { name: string; className: string }>();
  if (gakuseiIds.length === 0) {
    return authors;
  }

  const { data, error } = await supabase
    .from("students")
    .select("gakusei_id, name, class")
    .in("gakusei_id", gakuseiIds);

  if (error || !data) {
    return authors;
  }

  const decrypted = await decryptStudentRows(data as AuthorRow[]);
  decrypted.forEach((row) => {
    authors.set(row.gakusei_id, {
      name: row.name?.trim() ?? "",
      className: row.class?.trim() ?? "",
    });
  });
  return authors;
}

function toListItem(row: QuestionRow, authors: Map<string, { name: string; className: string }>): StudentSubmittedQuestionListItem {
  const author = authors.get(row.gakusei_id);
  return {
    id: row.id,
    gakuseiId: row.gakusei_id,
    authorName: author?.name ?? "",
    className: author?.className ?? "",
    subjectLabel: row.subject_label?.trim() ?? "",
    body: row.body,
    createdAt: row.created_at,
  };
}

function toDetail(
  row: QuestionRow,
  authors: Map<string, { name: string; className: string }>,
): StudentSubmittedQuestionDetail {
  return {
    ...toListItem(row, authors),
    choice1: row.choice_1 ?? "",
    choice2: row.choice_2 ?? "",
    choice3: row.choice_3 ?? "",
    choice4: row.choice_4 ?? "",
    correctIndex: row.correct_index,
    explanation: row.explanation ?? "",
    updatedAt: row.updated_at,
  };
}

export async function listStudentSubmittedQuestions(
  supabase: SupabaseClient,
  search: string,
): Promise<
  | { ok: true; items: StudentSubmittedQuestionListItem[]; tableMissing: boolean }
  | { ok: false; message: string; tableMissing: boolean }
> {
  const { data, error } = await supabase
    .from("student_submitted_questions")
    .select(QUESTION_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error.message)) {
      return { ok: true, items: [], tableMissing: true };
    }
    return { ok: false, message: "投稿問題の取得に失敗しました。", tableMissing: false };
  }

  const rows = (data ?? []) as QuestionRow[];
  const authors = await loadAuthors(supabase, [...new Set(rows.map((row) => row.gakusei_id))]);
  const needle = normalizeSearchText(search);
  const items = rows
    .map((row) => toListItem(row, authors))
    .filter((item) => {
      if (!needle) {
        return true;
      }
      const haystack = [item.body, item.subjectLabel, item.authorName, item.className, item.gakuseiId]
        .join(" ")
        .toLocaleLowerCase("ja");
      return haystack.includes(needle);
    });

  return { ok: true, items, tableMissing: false };
}

export async function getStudentSubmittedQuestion(
  supabase: SupabaseClient,
  id: string,
): Promise<
  | { ok: true; detail: StudentSubmittedQuestionDetail }
  | { ok: false; message: string; status: number }
> {
  const { data, error } = await supabase
    .from("student_submitted_questions")
    .select(QUESTION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return {
        ok: false,
        status: 404,
        message:
          "student_submitted_questions テーブルが未作成です。docs/sql/create-student-submitted-questions.sql を Supabase で実行してください。",
      };
    }
    return { ok: false, status: 500, message: "投稿問題の取得に失敗しました。" };
  }

  if (!data) {
    return { ok: false, status: 404, message: "投稿問題が見つかりません。" };
  }

  const row = data as QuestionRow;
  const authors = await loadAuthors(supabase, [row.gakusei_id]);
  return { ok: true, detail: toDetail(row, authors) };
}

export async function updateStudentSubmittedQuestion(
  supabase: SupabaseClient,
  id: string,
  form: StudentSubmittedQuestionFormState,
  teacherId: string,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const validationError = validateStudentSubmittedForm(form);
  if (validationError) {
    return { ok: false, status: 400, message: validationError };
  }

  const { data, error } = await supabase
    .from("student_submitted_questions")
    .update({
      subject_label: form.subjectLabel.trim(),
      body: form.body.trim(),
      choice_1: form.choice1.trim(),
      choice_2: form.choice2.trim(),
      choice_3: form.choice3.trim(),
      choice_4: form.choice4.trim(),
      correct_index: Number(form.correctIndex),
      explanation: form.explanation.trim(),
      updated_at: new Date().toISOString(),
      updated_by: teacherId,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return {
        ok: false,
        status: 404,
        message:
          "student_submitted_questions テーブルが未作成です。docs/sql/create-student-submitted-questions.sql を Supabase で実行してください。",
      };
    }
    return { ok: false, status: 500, message: "訂正の保存に失敗しました。" };
  }

  if (!data) {
    return { ok: false, status: 404, message: "投稿問題が見つかりません。" };
  }

  return { ok: true };
}
