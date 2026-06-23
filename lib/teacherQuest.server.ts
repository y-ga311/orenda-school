import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatTeacherQuestDateLabel,
  getTeacherQuestStatusLabel,
  TEACHER_QUEST_MAX_QUESTIONS,
  type TeacherQuestDetail,
  type TeacherQuestListItem,
  type TeacherQuestQuestionDetail,
  type TeacherQuestStatus,
  type TeacherQuestTeacherOption,
} from "@/lib/teacherQuest";

type DbQuestRow = {
  id: string;
  title: string;
  teacher_employee_number: string;
  teacher_name: string;
  publish_date: string;
  end_date: string;
  status: TeacherQuestStatus;
  updated_at: string | null;
};

type DbQuestionRow = {
  id: string;
  quest_id: string;
  question_number: number;
  body: string;
  choice_1: string;
  choice_2: string;
  choice_3: string;
  choice_4: string;
  correct_index: number | null;
  explanation: string | null;
};

type DbTeacherRow = {
  employee_number: string;
  name: string;
};

const QUEST_SELECT =
  "id, title, teacher_employee_number, teacher_name, publish_date, end_date, status, updated_at" as const;

const QUESTION_SELECT =
  "id, quest_id, question_number, body, choice_1, choice_2, choice_3, choice_4, correct_index, explanation" as const;

function isMissingTableError(message: string) {
  return message.includes("does not exist") || message.includes("42P01");
}

function countFilledQuestions(questions: DbQuestionRow[]) {
  return questions.filter(
    (row) =>
      row.body.trim() &&
      row.choice_1.trim() &&
      row.choice_2.trim() &&
      row.choice_3.trim() &&
      row.choice_4.trim() &&
      row.correct_index !== null,
  ).length;
}

function mapListItem(row: DbQuestRow, filledQuestionCount: number): TeacherQuestListItem {
  return {
    id: row.id,
    title: row.title,
    teacherName: row.teacher_name,
    publishDate: row.publish_date,
    publishDateLabel: formatTeacherQuestDateLabel(row.publish_date),
    endDate: row.end_date,
    status: row.status,
    statusLabel: getTeacherQuestStatusLabel(row.status),
    filledQuestionCount,
    questionCountLabel: `${filledQuestionCount} / ${TEACHER_QUEST_MAX_QUESTIONS}問`,
    updatedAt: row.updated_at,
  };
}

function mapQuestionDetail(row: DbQuestionRow): TeacherQuestQuestionDetail {
  return {
    questionNumber: row.question_number,
    body: row.body,
    choice1: row.choice_1,
    choice2: row.choice_2,
    choice3: row.choice_3,
    choice4: row.choice_4,
    correctIndex:
      row.correct_index === null || row.correct_index < 0 || row.correct_index > 3
        ? null
        : (row.correct_index as 0 | 1 | 2 | 3),
    explanation: row.explanation ?? "",
  };
}

export async function listTeacherOptions(
  supabase: SupabaseClient,
): Promise<{ teachers: TeacherQuestTeacherOption[]; error: string | null }> {
  const { data, error } = await supabase
    .from("teacher_accounts")
    .select("employee_number, name")
    .order("employee_number", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      return { teachers: [], error: null };
    }
    return { teachers: [], error: error.message };
  }

  const teachers = ((data ?? []) as DbTeacherRow[]).map((row) => ({
    employeeNumber: row.employee_number,
    name: row.name,
  }));

  return { teachers, error: null };
}

export async function listTeacherQuests(
  supabase: SupabaseClient,
  options: { search?: string } = {},
): Promise<{
  items: TeacherQuestListItem[];
  teachers: TeacherQuestTeacherOption[];
  tableMissing: boolean;
  error: string | null;
}> {
  const teachersResult = await listTeacherOptions(supabase);

  const { data, error } = await supabase
    .from("teacher_quests")
    .select(QUEST_SELECT)
    .order("publish_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      return {
        items: [],
        teachers: teachersResult.teachers,
        tableMissing: true,
        error: null,
      };
    }
    return {
      items: [],
      teachers: teachersResult.teachers,
      tableMissing: false,
      error: error.message,
    };
  }

  const questRows = (data ?? []) as DbQuestRow[];
  const questIds = questRows.map((row) => row.id);

  let questionRows: DbQuestionRow[] = [];
  if (questIds.length > 0) {
    const questionsResult = await supabase
      .from("teacher_quest_questions")
      .select(QUESTION_SELECT)
      .in("quest_id", questIds);

    if (questionsResult.error && !isMissingTableError(questionsResult.error.message)) {
      return {
        items: [],
        teachers: teachersResult.teachers,
        tableMissing: false,
        error: questionsResult.error.message,
      };
    }

    questionRows = (questionsResult.data ?? []) as DbQuestionRow[];
  }

  const filledCountByQuestId = new Map<string, number>();
  questionRows.forEach((row) => {
    const current = filledCountByQuestId.get(row.quest_id) ?? 0;
    const isFilled =
      row.body.trim() &&
      row.choice_1.trim() &&
      row.choice_2.trim() &&
      row.choice_3.trim() &&
      row.choice_4.trim() &&
      row.correct_index !== null;
    filledCountByQuestId.set(row.quest_id, current + (isFilled ? 1 : 0));
  });

  const keyword = options.search?.trim().toLowerCase() ?? "";
  const items = questRows
    .filter((row) => {
      if (!keyword) {
        return true;
      }
      const haystack = [row.title, row.teacher_name, row.publish_date, row.end_date]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    })
    .map((row) => mapListItem(row, filledCountByQuestId.get(row.id) ?? 0));

  return {
    items,
    teachers: teachersResult.teachers,
    tableMissing: false,
    error: teachersResult.error,
  };
}

export async function getTeacherQuest(
  supabase: SupabaseClient,
  id: string,
): Promise<{ detail: TeacherQuestDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("teacher_quests")
    .select(QUEST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message };
  }
  if (!data) {
    return { detail: null, error: null };
  }

  const questRow = data as DbQuestRow;
  const { data: questionData, error: questionError } = await supabase
    .from("teacher_quest_questions")
    .select(QUESTION_SELECT)
    .eq("quest_id", id)
    .order("question_number", { ascending: true });

  if (questionError) {
    return { detail: null, error: questionError.message };
  }

  const questionRows = (questionData ?? []) as DbQuestionRow[];
  const questions = questionRows.map(mapQuestionDetail);
  const filledQuestionCount = countFilledQuestions(questionRows);

  return {
    detail: {
      ...mapListItem(questRow, filledQuestionCount),
      teacherEmployeeNumber: questRow.teacher_employee_number,
      questions,
    },
    error: null,
  };
}

type QuestWritePayload = {
  title: string;
  teacherEmployeeNumber: string;
  publishDate: string;
  endDate: string;
  status: TeacherQuestStatus;
  questions: Array<{
    questionNumber: number;
    body: string;
    choice1: string;
    choice2: string;
    choice3: string;
    choice4: string;
    correctIndex: 0 | 1 | 2 | 3;
    explanation: string;
  }>;
};

async function resolveTeacherName(
  supabase: SupabaseClient,
  employeeNumber: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("teacher_accounts")
    .select("name")
    .eq("employee_number", employeeNumber)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return (data as { name: string }).name;
}

async function replaceQuestQuestions(
  supabase: SupabaseClient,
  questId: string,
  questions: QuestWritePayload["questions"],
) {
  const { error: deleteError } = await supabase
    .from("teacher_quest_questions")
    .delete()
    .eq("quest_id", questId);

  if (deleteError) {
    return deleteError.message;
  }

  if (questions.length === 0) {
    return null;
  }

  const { error: insertError } = await supabase.from("teacher_quest_questions").insert(
    questions.map((question) => ({
      quest_id: questId,
      question_number: question.questionNumber,
      body: question.body,
      choice_1: question.choice1,
      choice_2: question.choice2,
      choice_3: question.choice3,
      choice_4: question.choice4,
      correct_index: question.correctIndex,
      explanation: question.explanation,
    })),
  );

  return insertError?.message ?? null;
}

export async function createTeacherQuest(
  supabase: SupabaseClient,
  payload: QuestWritePayload,
): Promise<{ detail: TeacherQuestDetail | null; error: string | null }> {
  const teacherName = await resolveTeacherName(supabase, payload.teacherEmployeeNumber);
  if (!teacherName) {
    return { detail: null, error: "作成教員が見つかりません。" };
  }

  const { data, error } = await supabase
    .from("teacher_quests")
    .insert({
      title: payload.title,
      teacher_employee_number: payload.teacherEmployeeNumber,
      teacher_name: teacherName,
      publish_date: payload.publishDate,
      end_date: payload.endDate,
      status: payload.status,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { detail: null, error: error?.message ?? "クエストの作成に失敗しました。" };
  }

  const questId = (data as { id: string }).id;
  const questionError = await replaceQuestQuestions(supabase, questId, payload.questions);
  if (questionError) {
    await supabase.from("teacher_quests").delete().eq("id", questId);
    return { detail: null, error: questionError };
  }

  return getTeacherQuest(supabase, questId);
}

export async function updateTeacherQuest(
  supabase: SupabaseClient,
  id: string,
  payload: QuestWritePayload,
): Promise<{ detail: TeacherQuestDetail | null; error: string | null }> {
  const teacherName = await resolveTeacherName(supabase, payload.teacherEmployeeNumber);
  if (!teacherName) {
    return { detail: null, error: "作成教員が見つかりません。" };
  }

  const { error } = await supabase
    .from("teacher_quests")
    .update({
      title: payload.title,
      teacher_employee_number: payload.teacherEmployeeNumber,
      teacher_name: teacherName,
      publish_date: payload.publishDate,
      end_date: payload.endDate,
      status: payload.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { detail: null, error: error.message };
  }

  const questionError = await replaceQuestQuestions(supabase, id, payload.questions);
  if (questionError) {
    return { detail: null, error: questionError };
  }

  return getTeacherQuest(supabase, id);
}

export async function deleteTeacherQuest(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from("teacher_quests").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
