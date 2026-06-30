import type { SupabaseClient } from "@supabase/supabase-js";
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
  sort_order: number;
};

type DbRegularExamTermSubjectRow = {
  session_key: string;
  subject_name: string;
  sort_order: number;
};

function isMissingTableError(message: string, code?: string) {
  return code === "42P01" || message.includes("does not exist");
}

function buildTermsFromStatic(): RegularExamTerm[] {
  return REGULAR_EXAM_TERMS;
}

function buildTermsFromRows(
  termRows: DbRegularExamTermRow[],
  subjectRows: DbRegularExamTermSubjectRow[],
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

      return {
        sessionKey,
        gradeYear: Number(row.grade_year),
        term: Number(row.term),
        sessionLabel: String(row.session_label).trim(),
        sortOrder: Number(row.sort_order),
        subjects,
      };
    }),
  );
}

export async function loadRegularExamTerms(supabase: SupabaseClient) {
  const [termsResult, subjectsResult] = await Promise.all([
    supabase
      .from("regular_exam_terms")
      .select("session_key, grade_year, term, session_label, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("regular_exam_term_subjects")
      .select("session_key, subject_name, sort_order")
      .order("session_key", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

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

  if (termRows.length === 0 || subjectRows.length === 0) {
    return {
      terms: buildTermsFromStatic(),
      tableMissing: Boolean(termsResult.error || subjectsResult.error),
    };
  }

  return {
    terms: buildTermsFromRows(termRows, subjectRows),
    tableMissing: false,
  };
}

export function getRegularExamSubjectsForSession(
  terms: RegularExamTerm[],
  sessionKey: string,
) {
  return terms.find((term) => term.sessionKey === sessionKey)?.subjects ?? [];
}
