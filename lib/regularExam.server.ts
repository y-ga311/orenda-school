import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectCohortKeysFromClassNames,
  formatCohortLabel,
  parseCohortKeyFromClass,
} from "@/lib/cohort";
import {
  REGULAR_EXAM_TERMS,
  type RegularExamTerm,
  sortRegularExamTerms,
} from "@/lib/regularExam";

type DbRegularExamTermRow = {
  session_key: string;
  grade_year: number;
  term: number;
  session_label: string;
  exam_date?: string | null;
  sort_order: number;
};

type DbRegularExamTermSubjectRow = {
  session_key: string;
  subject_name: string;
  sort_order: number;
};

type DbRegularExamTermDateRow = {
  cohort_key: string;
  session_key: string;
  exam_date: string | null;
};

export type RegularExamCohortOption = {
  cohortKey: string;
  label: string;
};

function isMissingTableError(message: string, code?: string) {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table")
  );
}

function isMissingColumnError(message: string, code?: string) {
  const normalized = message.toLowerCase();
  return code === "42703" || normalized.includes("exam_date") || normalized.includes("does not exist");
}

function buildTermsFromStatic(): RegularExamTerm[] {
  return REGULAR_EXAM_TERMS;
}

function buildTermsFromRows(
  termRows: DbRegularExamTermRow[],
  subjectRows: DbRegularExamTermSubjectRow[],
  examDatesBySessionKey?: Map<string, string | null>,
) {
  const subjectsBySession = new Map<string, { name: string; sortOrder: number }[]>();

  subjectRows.forEach((row) => {
    const sessionKey = String(row.session_key).trim();
    const subjectName = String(row.subject_name).trim();
    if (!sessionKey || !subjectName) {
      return;
    }
    const list = subjectsBySession.get(sessionKey) ?? [];
    list.push({ name: subjectName, sortOrder: Number(row.sort_order) || list.length + 1 });
    subjectsBySession.set(sessionKey, list);
  });

  return sortRegularExamTerms(
    termRows.map((row) => {
      const sessionKey = String(row.session_key).trim();
      const subjects = (subjectsBySession.get(sessionKey) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.name);

      const cohortDate = examDatesBySessionKey?.get(sessionKey);
      const legacyDate =
        cohortDate === undefined &&
        "exam_date" in row &&
        row.exam_date
          ? String(row.exam_date).trim() || null
          : null;

      return {
        sessionKey,
        gradeYear: Number(row.grade_year),
        term: Number(row.term),
        sessionLabel: String(row.session_label).trim(),
        examDate: cohortDate !== undefined ? cohortDate : legacyDate,
        sortOrder: Number(row.sort_order),
        subjects,
      };
    }),
  );
}

function buildExamDateMap(rows: DbRegularExamTermDateRow[]) {
  const map = new Map<string, string | null>();
  rows.forEach((row) => {
    const sessionKey = String(row.session_key).trim();
    if (!sessionKey) {
      return;
    }
    map.set(
      sessionKey,
      row.exam_date ? String(row.exam_date).trim() || null : null,
    );
  });
  return map;
}

export async function loadStudentCohortKeys(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("students").select("class");

  if (error) {
    throw new Error(error.message);
  }

  return collectCohortKeysFromClassNames((data ?? []).map((row) => row.class as string | null));
}

export async function loadStudentCohortKey(
  supabase: SupabaseClient,
  gakuseiId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("students")
    .select("class")
    .eq("gakusei_id", gakuseiId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return parseCohortKeyFromClass(data?.class as string | null | undefined);
}

export async function loadRegularExamTermDatesForCohort(
  supabase: SupabaseClient,
  cohortKey: string,
) {
  const normalizedCohortKey = cohortKey.trim();
  if (!normalizedCohortKey) {
    return {
      datesBySessionKey: new Map<string, string | null>(),
      datesTableMissing: false,
    };
  }

  const { data, error } = await supabase
    .from("regular_exam_term_dates")
    .select("cohort_key, session_key, exam_date")
    .eq("cohort_key", normalizedCohortKey);

  if (error) {
    if (isMissingTableError(error.message, error.code)) {
      return {
        datesBySessionKey: new Map<string, string | null>(),
        datesTableMissing: true,
      };
    }
    throw new Error(error.message);
  }

  return {
    datesBySessionKey: buildExamDateMap((data ?? []) as DbRegularExamTermDateRow[]),
    datesTableMissing: false,
  };
}

async function loadLegacyGlobalExamDates(supabase: SupabaseClient) {
  const withDate = await supabase
    .from("regular_exam_terms")
    .select("session_key, exam_date")
    .not("exam_date", "is", null);

  let result = withDate;
  if (withDate.error && isMissingColumnError(withDate.error.message, withDate.error.code)) {
    return new Map<string, string | null>();
  }

  if (result.error) {
    if (isMissingTableError(result.error.message, result.error.code)) {
      return new Map<string, string | null>();
    }
    throw new Error(result.error.message);
  }

  const map = new Map<string, string | null>();
  ((result.data ?? []) as Array<{ session_key: string; exam_date: string | null }>).forEach(
    (row) => {
      const sessionKey = String(row.session_key).trim();
      if (sessionKey && row.exam_date) {
        map.set(sessionKey, String(row.exam_date).trim() || null);
      }
    },
  );
  return map;
}

export async function loadRegularExamTerms(supabase: SupabaseClient) {
  const termsWithDate = await supabase
    .from("regular_exam_terms")
    .select("session_key, grade_year, term, session_label, exam_date, sort_order")
    .order("sort_order", { ascending: true });

  let termsResult = termsWithDate;
  if (termsWithDate.error && isMissingColumnError(termsWithDate.error.message, termsWithDate.error.code)) {
    termsResult = (await supabase
      .from("regular_exam_terms")
      .select("session_key, grade_year, term, session_label, sort_order")
      .order("sort_order", { ascending: true })) as typeof termsWithDate;
  }

  const subjectsResult = await supabase
    .from("regular_exam_term_subjects")
    .select("session_key, subject_name, sort_order")
    .order("session_key", { ascending: true })
    .order("sort_order", { ascending: true });

  if (
    termsResult.error &&
    !isMissingTableError(termsResult.error.message, termsResult.error.code)
  ) {
    throw new Error(termsResult.error.message);
  }

  if (
    subjectsResult.error &&
    !isMissingTableError(subjectsResult.error.message, subjectsResult.error.code)
  ) {
    throw new Error(subjectsResult.error.message);
  }

  const termRows = (termsResult.data ?? []) as DbRegularExamTermRow[];
  const subjectRows = (subjectsResult.data ?? []) as DbRegularExamTermSubjectRow[];

  const hasLoadError = Boolean(termsResult.error || subjectsResult.error);

  if (termRows.length === 0 || subjectRows.length === 0) {
    return {
      terms: buildTermsFromStatic(),
      tableMissing: hasLoadError,
      loadedFromDatabase: false,
    };
  }

  return {
    terms: buildTermsFromRows(termRows, subjectRows),
    tableMissing: false,
    loadedFromDatabase: true,
  };
}

export async function loadRegularExamTermsForCohort(
  supabase: SupabaseClient,
  cohortKey: string | null | undefined,
) {
  const base = await loadRegularExamTerms(supabase);
  const normalizedCohortKey = cohortKey?.trim() ?? "";

  if (!normalizedCohortKey) {
    return {
      ...base,
      datesTableMissing: false,
    };
  }

  const { datesBySessionKey, datesTableMissing } = await loadRegularExamTermDatesForCohort(
    supabase,
    normalizedCohortKey,
  );

  let resolvedDates = datesBySessionKey;
  if (datesTableMissing) {
    resolvedDates = await loadLegacyGlobalExamDates(supabase);
  }

  return {
    ...base,
    terms: base.terms.map((term) => ({
      ...term,
      examDate: resolvedDates.get(term.sessionKey) ?? null,
    })),
    datesTableMissing,
  };
}

export async function loadRegularExamCohortOptions(
  supabase: SupabaseClient,
): Promise<RegularExamCohortOption[]> {
  const cohortKeys = await loadStudentCohortKeys(supabase);
  return cohortKeys.map((cohortKey) => ({
    cohortKey,
    label: formatCohortLabel(cohortKey),
  }));
}

export function getRegularExamSubjectsForSession(
  terms: RegularExamTerm[],
  sessionKey: string,
) {
  return terms.find((term) => term.sessionKey === sessionKey)?.subjects ?? [];
}

export async function updateRegularExamTermDates(
  supabase: SupabaseClient,
  cohortKey: string,
  updates: Array<{ sessionKey: string; examDate: string | null }>,
) {
  const normalizedCohortKey = cohortKey.trim();
  if (!normalizedCohortKey) {
    return { ok: false as const, message: "期を選択してください。" };
  }

  for (const update of updates) {
    const sessionKey = update.sessionKey.trim();
    if (!sessionKey) {
      continue;
    }

    const examDate = update.examDate?.trim() || null;
    const { error } = await supabase.from("regular_exam_term_dates").upsert(
      {
        cohort_key: normalizedCohortKey,
        session_key: sessionKey,
        exam_date: examDate,
      },
      { onConflict: "cohort_key,session_key" },
    );

    if (error) {
      if (isMissingTableError(error.message, error.code)) {
        return {
          ok: false as const,
          message:
            "regular_exam_term_dates テーブルが未作成です。docs/sql/create-regular-exam-term-dates.sql を実行してください。",
        };
      }
      return { ok: false as const, message: "定期試験の実施日の保存に失敗しました。" };
    }
  }

  return { ok: true as const };
}
