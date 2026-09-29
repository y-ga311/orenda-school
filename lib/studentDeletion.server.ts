import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentDeletionCounts = Record<string, number>;

const ID_CHUNK_SIZE = 200;

function isSkippableRelationError(message: string, code?: string) {
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  );
}

async function deleteMatchingRows(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string | number,
): Promise<{ count: number; error: string | null }> {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq(column, value);

  if (error) {
    if (isSkippableRelationError(error.message, error.code)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: `${table}: ${error.message}` };
  }

  return { count: count ?? 0, error: null };
}

async function deleteQuestAttemptAnswers(
  supabase: SupabaseClient,
  gakuseiId: string,
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase
    .from("quest_attempts")
    .select("id")
    .eq("gakusei_id", gakuseiId);

  if (error) {
    if (isSkippableRelationError(error.message, error.code)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: `quest_attempts: ${error.message}` };
  }

  const attemptIds = (data ?? [])
    .map((row) => row.id)
    .filter((id): id is string | number => id !== null && id !== undefined);

  if (attemptIds.length === 0) {
    return { count: 0, error: null };
  }

  let deleted = 0;
  for (let index = 0; index < attemptIds.length; index += ID_CHUNK_SIZE) {
    const chunk = attemptIds.slice(index, index + ID_CHUNK_SIZE);
    const result = await supabase
      .from("quest_attempt_answers")
      .delete({ count: "exact" })
      .in("attempt_id", chunk);

    if (result.error) {
      if (isSkippableRelationError(result.error.message, result.error.code)) {
        return { count: deleted, error: null };
      }
      return { count: deleted, error: `quest_attempt_answers: ${result.error.message}` };
    }
    deleted += result.count ?? 0;
  }

  return { count: deleted, error: null };
}

export async function deleteStudentAccount(
  supabase: SupabaseClient,
  gakuseiId: string,
): Promise<
  | { ok: true; gakuseiId: string; deleted: StudentDeletionCounts }
  | { ok: false; status: 404 | 500; message: string }
> {
  const normalizedId = gakuseiId.trim();
  if (!normalizedId) {
    return { ok: false, status: 500, message: "学籍番号が指定されていません。" };
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, gakusei_id")
    .eq("gakusei_id", normalizedId)
    .maybeSingle();

  if (studentError) {
    return { ok: false, status: 500, message: studentError.message };
  }
  if (!student) {
    return { ok: false, status: 404, message: "学生が見つかりません。" };
  }

  const deleted: StudentDeletionCounts = {};

  const answers = await deleteQuestAttemptAnswers(supabase, normalizedId);
  if (answers.error) {
    return { ok: false, status: 500, message: answers.error };
  }
  deleted.quest_attempt_answers = answers.count;

  const steps: Array<{ table: string; column: string; value: string | number }> = [
    { table: "quest_attempts", column: "gakusei_id", value: normalizedId },
    { table: "study_sessions", column: "gakusei_id", value: normalizedId },
    { table: "student_medal_grants", column: "gakusei_id", value: normalizedId },
    { table: "ranking_reward_grants", column: "gakusei_id", value: normalizedId },
    { table: "student_exam_results", column: "gakusei_id", value: normalizedId },
  ];

  for (const step of steps) {
    const result = await deleteMatchingRows(supabase, step.table, step.column, step.value);
    if (result.error) {
      return { ok: false, status: 500, message: result.error };
    }
    deleted[step.table] = result.count;
  }

  const studentId = student.id as string | number | null;
  if (studentId !== null && studentId !== undefined && String(studentId) !== "") {
    const scores = await deleteMatchingRows(supabase, "test_scores", "student_id", studentId);
    if (scores.error) {
      return { ok: false, status: 500, message: scores.error };
    }
    deleted.test_scores = scores.count;
  } else {
    deleted.test_scores = 0;
  }

  const account = await deleteMatchingRows(supabase, "students", "gakusei_id", normalizedId);
  if (account.error) {
    return { ok: false, status: 500, message: account.error };
  }
  if (account.count === 0) {
    return { ok: false, status: 500, message: "学生アカウントの削除に失敗しました。" };
  }
  deleted.students = account.count;

  return { ok: true, gakuseiId: normalizedId, deleted };
}
