import type { SupabaseClient } from "@supabase/supabase-js";
import {
  QUEST_CATALOG_SUBCATEGORIES_BY_SUBJECT,
  QUEST_CATALOG_SUBJECTS,
  type QuestCatalogSubcategory,
  type QuestCatalogSubject,
} from "@/lib/questCatalog";
import {
  formatCorrectAnswerLabel,
  formatNationalExamLabel,
  formatQuestionDisplayId,
  formatQuestionUpdatedLabel,
  type MultipleChoiceImportRow,
  type MultipleChoiceQuestionDetail,
  type MultipleChoiceQuestionListItem,
} from "@/lib/multipleChoiceQuestions";

type DbQuestionRow = {
  id: string;
  subject_id: string;
  subcategory_id: string;
  body: string;
  choice_1: string;
  choice_2: string;
  choice_3: string;
  choice_4: string;
  correct_index: number;
  explanation: string | null;
  sort_order: number | null;
  national_exam_round: number | null;
  national_exam_question_no: number | null;
  updated_at: string | null;
  created_at: string | null;
};

type DbSubjectRow = {
  id: string;
  label: string;
  sort_order: number | null;
};

type DbSubcategoryRow = {
  id: string;
  subject_id: string;
  label: string;
  sort_order: number | null;
};

export type MultipleChoiceCatalog = {
  subjects: QuestCatalogSubject[];
  subcategoriesBySubject: Record<string, QuestCatalogSubcategory[]>;
};

const QUESTION_SELECT =
  "id, subject_id, subcategory_id, body, choice_1, choice_2, choice_3, choice_4, correct_index, explanation, sort_order, national_exam_round, national_exam_question_no, updated_at, created_at" as const;

function isMissingTableError(message: string) {
  return message.includes("does not exist") || message.includes("42P01");
}

function mapListItem(
  row: DbQuestionRow,
  subjectLabel: string,
  subcategoryLabel: string,
): MultipleChoiceQuestionListItem {
  const nationalExamRound = row.national_exam_round ?? null;
  const nationalExamQuestionNo = row.national_exam_question_no ?? null;

  return {
    id: row.id,
    displayId: formatQuestionDisplayId(row.id),
    subjectId: row.subject_id,
    subjectLabel,
    subcategoryId: row.subcategory_id,
    subcategoryLabel,
    body: row.body,
    correctLabel: formatCorrectAnswerLabel(row.correct_index),
    nationalExamRound,
    nationalExamQuestionNo,
    nationalExamLabel: formatNationalExamLabel(nationalExamRound, nationalExamQuestionNo),
    updatedAt: row.updated_at,
    updatedAtLabel: formatQuestionUpdatedLabel(row.updated_at),
  };
}

function mapDetail(
  row: DbQuestionRow,
  subjectLabel: string,
  subcategoryLabel: string,
): MultipleChoiceQuestionDetail {
  return {
    ...mapListItem(row, subjectLabel, subcategoryLabel),
    choice1: row.choice_1,
    choice2: row.choice_2,
    choice3: row.choice_3,
    choice4: row.choice_4,
    correctIndex: row.correct_index as 0 | 1 | 2 | 3,
    explanation: row.explanation ?? "",
  };
}

function buildStaticCatalog(): MultipleChoiceCatalog {
  return {
    subjects: QUEST_CATALOG_SUBJECTS,
    subcategoriesBySubject: QUEST_CATALOG_SUBCATEGORIES_BY_SUBJECT,
  };
}

function sortCatalogSubjects(subjects: QuestCatalogSubject[]) {
  return [...subjects].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function sortCatalogSubcategories(subcategories: QuestCatalogSubcategory[]) {
  return [...subcategories].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

export async function fetchMultipleChoiceCatalog(
  supabase: SupabaseClient,
): Promise<{ catalog: MultipleChoiceCatalog; catalogFromDb: boolean; error: string | null }> {
  const [subjectsResult, subcategoriesResult] = await Promise.all([
    supabase
      .from("quest_subjects")
      .select("id, label, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quest_subcategories")
      .select("id, subject_id, label, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (subjectsResult.error && !isMissingTableError(subjectsResult.error.message)) {
    return { catalog: buildStaticCatalog(), catalogFromDb: false, error: subjectsResult.error.message };
  }
  if (subcategoriesResult.error && !isMissingTableError(subcategoriesResult.error.message)) {
    return {
      catalog: buildStaticCatalog(),
      catalogFromDb: false,
      error: subcategoriesResult.error.message,
    };
  }

  const subjectRows = (subjectsResult.data ?? []) as DbSubjectRow[];
  const subcategoryRows = (subcategoriesResult.data ?? []) as DbSubcategoryRow[];

  if (subjectRows.length === 0 || subcategoryRows.length === 0) {
    return { catalog: buildStaticCatalog(), catalogFromDb: false, error: null };
  }

  const subjects = sortCatalogSubjects(
    subjectRows.map((row) => ({ id: row.id, label: row.label })),
  );

  const subcategoriesBySubject: Record<string, QuestCatalogSubcategory[]> = {};
  subcategoryRows.forEach((row) => {
    const current = subcategoriesBySubject[row.subject_id] ?? [];
    current.push({ id: row.id, label: row.label });
    subcategoriesBySubject[row.subject_id] = current;
  });

  Object.keys(subcategoriesBySubject).forEach((subjectId) => {
    subcategoriesBySubject[subjectId] = sortCatalogSubcategories(subcategoriesBySubject[subjectId]);
  });

  return {
    catalog: { subjects, subcategoriesBySubject },
    catalogFromDb: true,
    error: null,
  };
}

function getLabelMaps(catalog: MultipleChoiceCatalog) {
  const subjectLabelById = new Map(catalog.subjects.map((item) => [item.id, item.label]));
  const subcategoryLabelById = new Map<string, string>();

  Object.entries(catalog.subcategoriesBySubject).forEach(([subjectId, subcategories]) => {
    subcategories.forEach((item) => {
      subcategoryLabelById.set(`${subjectId}::${item.id}`, item.label);
    });
  });

  return { subjectLabelById, subcategoryLabelById };
}

export async function listMultipleChoiceQuestions(
  supabase: SupabaseClient,
  options: {
    search?: string;
    subjectId?: string;
    subcategoryId?: string;
  } = {},
): Promise<{
  catalog: MultipleChoiceCatalog;
  catalogFromDb: boolean;
  items: MultipleChoiceQuestionListItem[];
  totalCount: number;
  tableMissing: boolean;
  error: string | null;
}> {
  const catalogResult = await fetchMultipleChoiceCatalog(supabase);
  if (catalogResult.error) {
    return {
      catalog: catalogResult.catalog,
      catalogFromDb: catalogResult.catalogFromDb,
      items: [],
      totalCount: 0,
      tableMissing: false,
      error: catalogResult.error,
    };
  }

  let query = supabase
    .from("quest_questions")
    .select(QUESTION_SELECT)
    .eq("quest_scope", "subject")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (options.subjectId) {
    query = query.eq("subject_id", options.subjectId);
  }
  if (options.subcategoryId) {
    query = query.eq("subcategory_id", options.subcategoryId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error.message)) {
      return {
        catalog: catalogResult.catalog,
        catalogFromDb: catalogResult.catalogFromDb,
        items: [],
        totalCount: 0,
        tableMissing: true,
        error: null,
      };
    }
    return {
      catalog: catalogResult.catalog,
      catalogFromDb: catalogResult.catalogFromDb,
      items: [],
      totalCount: 0,
      tableMissing: false,
      error: error.message,
    };
  }

  const { subjectLabelById, subcategoryLabelById } = getLabelMaps(catalogResult.catalog);
  const keyword = options.search?.trim().toLowerCase() ?? "";

  const rows = ((data ?? []) as DbQuestionRow[]).filter((row) => {
    if (!keyword) {
      return true;
    }
    const haystack = [
      row.body,
      row.choice_1,
      row.choice_2,
      row.choice_3,
      row.choice_4,
      subjectLabelById.get(row.subject_id),
      subcategoryLabelById.get(`${row.subject_id}::${row.subcategory_id}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });

  const items = rows.map((row) =>
    mapListItem(
      row,
      subjectLabelById.get(row.subject_id) ?? row.subject_id,
      subcategoryLabelById.get(`${row.subject_id}::${row.subcategory_id}`) ?? row.subcategory_id,
    ),
  );

  return {
    catalog: catalogResult.catalog,
    catalogFromDb: catalogResult.catalogFromDb,
    items,
    totalCount: items.length,
    tableMissing: false,
    error: null,
  };
}

export async function getMultipleChoiceQuestion(
  supabase: SupabaseClient,
  id: string,
): Promise<{ detail: MultipleChoiceQuestionDetail | null; error: string | null }> {
  const catalogResult = await fetchMultipleChoiceCatalog(supabase);
  const { data, error } = await supabase
    .from("quest_questions")
    .select(QUESTION_SELECT)
    .eq("id", id)
    .eq("quest_scope", "subject")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message };
  }
  if (!data) {
    return { detail: null, error: null };
  }

  const row = data as DbQuestionRow;
  const { subjectLabelById, subcategoryLabelById } = getLabelMaps(catalogResult.catalog);

  return {
    detail: mapDetail(
      row,
      subjectLabelById.get(row.subject_id) ?? row.subject_id,
      subcategoryLabelById.get(`${row.subject_id}::${row.subcategory_id}`) ?? row.subcategory_id,
    ),
    error: null,
  };
}

type QuestionWritePayload = {
  subjectId: string;
  subcategoryId: string;
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: number;
  explanation: string;
  nationalExamRound: number | null;
  nationalExamQuestionNo: number | null;
};

function buildWriteRecord(payload: QuestionWritePayload, source = "teacher-portal") {
  return {
    subject_id: payload.subjectId,
    subcategory_id: payload.subcategoryId,
    body: payload.body,
    choice_1: payload.choice1,
    choice_2: payload.choice2,
    choice_3: payload.choice3,
    choice_4: payload.choice4,
    correct_index: payload.correctIndex,
    explanation: payload.explanation,
    sort_order: 0,
    national_exam_round: payload.nationalExamRound,
    national_exam_question_no: payload.nationalExamQuestionNo,
    source,
    quest_scope: "subject",
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

export async function createMultipleChoiceQuestion(
  supabase: SupabaseClient,
  payload: QuestionWritePayload,
): Promise<{ detail: MultipleChoiceQuestionDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("quest_questions")
    .insert(buildWriteRecord(payload))
    .select(QUESTION_SELECT)
    .single();

  if (error) {
    return { detail: null, error: error.message };
  }

  return getMultipleChoiceQuestion(supabase, (data as DbQuestionRow).id);
}

export async function updateMultipleChoiceQuestion(
  supabase: SupabaseClient,
  id: string,
  payload: QuestionWritePayload,
): Promise<{ detail: MultipleChoiceQuestionDetail | null; error: string | null }> {
  const { error } = await supabase
    .from("quest_questions")
    .update(buildWriteRecord(payload))
    .eq("id", id)
    .eq("quest_scope", "subject");

  if (error) {
    return { detail: null, error: error.message };
  }

  return getMultipleChoiceQuestion(supabase, id);
}

export async function deleteMultipleChoiceQuestion(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from("quest_questions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("quest_scope", "subject");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function importMultipleChoiceQuestions(
  supabase: SupabaseClient,
  rows: MultipleChoiceImportRow[],
): Promise<{ importedCount: number; error: string | null }> {
  if (rows.length === 0) {
    return { importedCount: 0, error: "インポート対象がありません。" };
  }

  const records = rows.map((row) =>
    buildWriteRecord(
      {
        subjectId: row.subjectId,
        subcategoryId: row.subcategoryId,
        body: row.body,
        choice1: row.choice1,
        choice2: row.choice2,
        choice3: row.choice3,
        choice4: row.choice4,
        correctIndex: row.correctIndex,
        explanation: row.explanation,
        nationalExamRound: row.nationalExamRound,
        nationalExamQuestionNo: row.nationalExamQuestionNo,
      },
      "teacher-portal-csv",
    ),
  );

  const { error } = await supabase.from("quest_questions").insert(records);
  if (error) {
    return { importedCount: 0, error: error.message };
  }

  return { importedCount: rows.length, error: null };
}
