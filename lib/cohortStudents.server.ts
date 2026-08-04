import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCohortKeyFromClass } from "@/lib/cohort";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import {
  buildStudentLookupMaps,
  resolveStudentFromTestScoreStudentId,
  type StudentLookupMaps,
  type StudentLookupRow,
} from "@/lib/studentIdentifier";

import { isMissingNationalExamPassedColumn } from "@/lib/nationalExamStatus";

const STUDENT_COHORT_SELECT =
  "id, gakusei_id, class, national_exam_failed, national_exam_passed";
const STUDENT_COHORT_FAILED_ONLY_SELECT = "id, gakusei_id, class, national_exam_failed";
const STUDENT_COHORT_LEGACY_SELECT = "id, gakusei_id, class";

export type CohortStudentSets = {
  gakuseiIdSet: Set<string>;
  studentIdSet: Set<string>;
  failedGakuseiIdSet: Set<string>;
  failedStudentIdSet: Set<string>;
  passedGakuseiIdSet: Set<string>;
  passedStudentIdSet: Set<string>;
};

export type CohortStudentContext = {
  rows: StudentCohortRow[];
  studentLookupMaps: StudentLookupMaps;
  nationalExamFailedAvailable: boolean;
  nationalExamPassedAvailable: boolean;
};

type StudentCohortRow = StudentLookupRow & {
  class: string | null;
  national_exam_failed?: boolean | null;
  national_exam_passed?: boolean | null;
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
  nationalExamPassedAvailable: boolean;
}> {
  try {
    const rows = await fetchAllRows<StudentCohortRow>(
      supabase,
      "students",
      STUDENT_COHORT_SELECT,
    );
    return {
      rows,
      nationalExamFailedAvailable: true,
      nationalExamPassedAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingNationalExamPassedColumn(message)) {
      const rows = await fetchAllRows<StudentCohortRow>(
        supabase,
        "students",
        STUDENT_COHORT_FAILED_ONLY_SELECT,
      );
      return {
        rows,
        nationalExamFailedAvailable: true,
        nationalExamPassedAvailable: false,
      };
    }
    if (!isMissingNationalExamFailedColumn(message)) {
      throw error;
    }

    const rows = await fetchAllRows<StudentCohortRow>(
      supabase,
      "students",
      STUDENT_COHORT_LEGACY_SELECT,
    );
    return {
      rows,
      nationalExamFailedAvailable: false,
      nationalExamPassedAvailable: false,
    };
  }
}

export async function loadCohortStudentContext(
  supabase: SupabaseClient,
): Promise<CohortStudentContext> {
  const { rows, nationalExamFailedAvailable, nationalExamPassedAvailable } =
    await loadStudentCohortRows(supabase);
  return {
    rows,
    studentLookupMaps: buildStudentLookupMaps(rows),
    nationalExamFailedAvailable,
    nationalExamPassedAvailable,
  };
}

export function buildCohortStudentSets(
  rows: StudentCohortRow[],
  cohortKey: string,
  nationalExamFailedAvailable: boolean,
  nationalExamPassedAvailable: boolean,
): CohortStudentSets {
  const gakuseiIdSet = new Set<string>();
  const studentIdSet = new Set<string>();
  const failedGakuseiIdSet = new Set<string>();
  const failedStudentIdSet = new Set<string>();
  const passedGakuseiIdSet = new Set<string>();
  const passedStudentIdSet = new Set<string>();

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
    const nationalExamPassed =
      nationalExamPassedAvailable && row.national_exam_passed === true;

    gakuseiIdSet.add(gakuseiId);
    studentIdSet.add(canonicalStudentId);

    if (nationalExamFailed) {
      failedGakuseiIdSet.add(gakuseiId);
      failedStudentIdSet.add(canonicalStudentId);
    }

    if (nationalExamPassed) {
      passedGakuseiIdSet.add(gakuseiId);
      passedStudentIdSet.add(canonicalStudentId);
    }
  });

  return {
    gakuseiIdSet,
    studentIdSet,
    failedGakuseiIdSet,
    failedStudentIdSet,
    passedGakuseiIdSet,
    passedStudentIdSet,
  };
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

/** 国家試験合格者の全学生（期を問わない） */
export function buildAllNationalExamPassedStudentSets(
  rows: StudentCohortRow[],
  nationalExamPassedAvailable: boolean,
): Pick<CohortStudentSets, "passedGakuseiIdSet" | "passedStudentIdSet"> {
  const passedGakuseiIdSet = new Set<string>();
  const passedStudentIdSet = new Set<string>();

  if (!nationalExamPassedAvailable) {
    return { passedGakuseiIdSet, passedStudentIdSet };
  }

  rows.forEach((row) => {
    if (row.national_exam_passed !== true) {
      return;
    }

    const gakuseiId = String(row.gakusei_id ?? "").trim();
    const studentId = row.id;
    if (!gakuseiId || studentId === null || studentId === undefined) {
      return;
    }

    passedGakuseiIdSet.add(gakuseiId);
    passedStudentIdSet.add(String(studentId));
  });

  return { passedGakuseiIdSet, passedStudentIdSet };
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
    context.nationalExamPassedAvailable,
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
