import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCohortKeyFromClass } from "@/lib/cohort";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import {
  buildStudentLookupMaps,
  resolveStudentFromTestScoreStudentId,
  type StudentLookupMaps,
  type StudentLookupRow,
} from "@/lib/studentIdentifier";

const STUDENT_COHORT_SELECT = "id, gakusei_id, class, national_exam_failed";
const STUDENT_COHORT_LEGACY_SELECT = "id, gakusei_id, class";

export type CohortStudentSets = {
  gakuseiIdSet: Set<string>;
  studentIdSet: Set<string>;
  failedGakuseiIdSet: Set<string>;
  failedStudentIdSet: Set<string>;
};

export type CohortStudentContext = {
  rows: StudentCohortRow[];
  studentLookupMaps: StudentLookupMaps;
  nationalExamFailedAvailable: boolean;
};

type StudentCohortRow = StudentLookupRow & {
  class: string | null;
  national_exam_failed?: boolean | null;
};

function isMissingNationalExamFailedColumn(message: string) {
  return (
    message.includes("national_exam_failed") &&
    (message.includes("does not exist") || message.includes("42703"))
  );
}

async function loadStudentCohortRows(supabase: SupabaseClient): Promise<{
  rows: StudentCohortRow[];
  nationalExamFailedAvailable: boolean;
}> {
  try {
    const rows = await fetchAllRows<StudentCohortRow>(
      supabase,
      "students",
      STUDENT_COHORT_SELECT,
    );
    return { rows, nationalExamFailedAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingNationalExamFailedColumn(message)) {
      throw error;
    }

    const rows = await fetchAllRows<StudentCohortRow>(
      supabase,
      "students",
      STUDENT_COHORT_LEGACY_SELECT,
    );
    return { rows, nationalExamFailedAvailable: false };
  }
}

export async function loadCohortStudentContext(
  supabase: SupabaseClient,
): Promise<CohortStudentContext> {
  const { rows, nationalExamFailedAvailable } = await loadStudentCohortRows(supabase);
  return {
    rows,
    studentLookupMaps: buildStudentLookupMaps(rows),
    nationalExamFailedAvailable,
  };
}

export function buildCohortStudentSets(
  rows: StudentCohortRow[],
  cohortKey: string,
  nationalExamFailedAvailable: boolean,
): CohortStudentSets {
  const gakuseiIdSet = new Set<string>();
  const studentIdSet = new Set<string>();
  const failedGakuseiIdSet = new Set<string>();
  const failedStudentIdSet = new Set<string>();

  rows.forEach((row) => {
    const rowCohortKey = parseCohortKeyFromClass(row.class);
    const gakuseiId = String(row.gakusei_id ?? "").trim();
    const studentId = row.id;

    if (rowCohortKey !== cohortKey || !gakuseiId || studentId === null || studentId === undefined) {
      return;
    }

    const canonicalStudentId = String(studentId);
    const nationalExamFailed =
      nationalExamFailedAvailable && row.national_exam_failed === true;

    gakuseiIdSet.add(gakuseiId);
    studentIdSet.add(canonicalStudentId);

    if (nationalExamFailed) {
      failedGakuseiIdSet.add(gakuseiId);
      failedStudentIdSet.add(canonicalStudentId);
    }
  });

  return { gakuseiIdSet, studentIdSet, failedGakuseiIdSet, failedStudentIdSet };
}

/** 国家試験不合格の全学生（期を問わない） */
export function buildAllNationalExamFailedStudentSets(
  rows: StudentCohortRow[],
  nationalExamFailedAvailable: boolean,
): Pick<CohortStudentSets, "failedGakuseiIdSet" | "failedStudentIdSet"> {
  const failedGakuseiIdSet = new Set<string>();
  const failedStudentIdSet = new Set<string>();

  if (!nationalExamFailedAvailable) {
    return { failedGakuseiIdSet, failedStudentIdSet };
  }

  rows.forEach((row) => {
    if (row.national_exam_failed !== true) {
      return;
    }

    const gakuseiId = String(row.gakusei_id ?? "").trim();
    const studentId = row.id;
    if (!gakuseiId || studentId === null || studentId === undefined) {
      return;
    }

    failedGakuseiIdSet.add(gakuseiId);
    failedStudentIdSet.add(String(studentId));
  });

  return { failedGakuseiIdSet, failedStudentIdSet };
}

export function isTestScoreRowInStudentIdSet(
  rawStudentId: number | string | null | undefined,
  studentIdSet: Set<string>,
  studentLookupMaps: StudentLookupMaps,
) {
  const student = resolveStudentFromTestScoreStudentId(rawStudentId, studentLookupMaps);
  if (student) {
    return studentIdSet.has(String(student.id));
  }

  if (rawStudentId === null || rawStudentId === undefined || rawStudentId === "") {
    return false;
  }

  return studentIdSet.has(String(rawStudentId));
}

export async function loadCohortStudentIdSet(
  supabase: SupabaseClient,
  cohortKey: string,
  options: {
    nationalExamFailedOnly?: boolean;
    context?: CohortStudentContext;
  } = {},
) {
  const context = options.context ?? (await loadCohortStudentContext(supabase));
  const sets = buildCohortStudentSets(
    context.rows,
    cohortKey,
    context.nationalExamFailedAvailable,
  );

  if (options.nationalExamFailedOnly && !context.nationalExamFailedAvailable) {
    return {
      studentIdSet: new Set<string>(),
      studentLookupMaps: context.studentLookupMaps,
    };
  }

  return {
    studentIdSet: options.nationalExamFailedOnly
      ? sets.failedStudentIdSet
      : sets.studentIdSet,
    studentLookupMaps: context.studentLookupMaps,
  };
}
