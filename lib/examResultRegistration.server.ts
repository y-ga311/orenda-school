import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import {
  buildExamResultListKey,
  calculateCorrectRate,
  calculateTotalCorrect,
  formatListTestDateLabel,
  getExamRegistrationTypeLabel,
  inferExamRegistrationType,
  parseExamResultListKey,
  type ExamRegistrationDetail,
  type ExamRegistrationExamType,
  type ExamRegistrationListItem,
  type ExamRegistrationScoreRow,
} from "@/lib/examResultRegistration";
import { decryptStudentName } from "@/lib/studentNameCrypto.server";
import {
  getRegularExamSubjectsForSession,
  loadRegularExamTerms,
} from "@/lib/regularExam.server";
import { getRegularExamTerm } from "@/lib/regularExam";
import { TEST_SCORES_SELECT, type TestScoreRow } from "@/lib/testScores";
import {
  QUESTION_COUNTS_SELECT,
  buildQuestionCountMap,
  type QuestionCountRow,
} from "@/lib/questionCounts";
import { buildQuestionCountPayload, rowToSubjectCounts } from "@/lib/questionCountSettings";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import {
  buildStudentLookupMaps,
  getCanonicalStudentKey,
  resolveStudentByIdentifier,
  resolveStudentFromTestScoreStudentId,
  type StudentLookupMaps,
  type StudentLookupRow,
} from "@/lib/studentIdentifier";

type DbExamResultRow = {
  id?: number | string | null;
  gakusei_id: string;
  exam_type: string;
  session_key: string;
  session_label: string;
  subject_name: string;
  score: number | string;
};

function isMissingTableError(message: string, code?: string) {
  return code === "42P01" || message.includes("does not exist");
}

function isMissingColumnError(message: string) {
  return message.includes("does not exist") || message.includes("42703");
}

function parseDbScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rowToSubjectScoreMap(row: TestScoreRow) {
  const scores: Partial<Record<TestScoreSubjectColumn, number | null>> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    scores[column] = parseDbScore(row[column]);
  });
  return scores;
}

function buildScorePayload(scores: Partial<Record<TestScoreSubjectColumn, number | null>>) {
  const payload: Record<string, number | null> = {};
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    payload[column] = scores[column] ?? null;
  });
  return payload;
}

async function ensureQuestionCountExists(
  supabase: SupabaseClient,
  testName: string,
  testDate: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmedName = testName.trim();
  const trimmedDate = testDate.trim();

  const { data: existing, error: selectError } = await supabase
    .from("question_counts")
    .select("test_name")
    .eq("test_name", trimmedName)
    .maybeSingle();

  if (selectError && !isMissingTableError(selectError.message, selectError.code)) {
    return {
      ok: false,
      message: `問題数マスタの確認に失敗しました: ${selectError.message}`,
    };
  }

  if (existing) {
    if (trimmedDate) {
      const { error: updateError } = await supabase
        .from("question_counts")
        .update({ test_date: trimmedDate })
        .eq("test_name", trimmedName);

      if (updateError && !isMissingColumnError(updateError.message)) {
        return {
          ok: false,
          message: `問題数マスタの更新に失敗しました: ${updateError.message}`,
        };
      }
    }
    return { ok: true };
  }

  const payload = buildQuestionCountPayload(trimmedName, trimmedDate, {});
  const { error } = await supabase
    .from("question_counts")
    .upsert(payload, { onConflict: "test_name" });

  if (error) {
    if (isMissingColumnError(error.message)) {
      const { test_date: _ignored, ...withoutDate } = payload;
      const retry = await supabase
        .from("question_counts")
        .upsert(withoutDate, { onConflict: "test_name" });
      if (retry.error) {
        return {
          ok: false,
          message: `試験「${trimmedName}」の問題数マスタ作成に失敗しました: ${retry.error.message}`,
        };
      }
      return { ok: true };
    }

    return {
      ok: false,
      message: `試験「${trimmedName}」の問題数マスタ作成に失敗しました: ${error.message}`,
    };
  }

  return { ok: true };
}

export async function listRegisteredExams(supabase: SupabaseClient) {
  const items = new Map<string, ExamRegistrationListItem>();
  const studentMaps = await loadStudentsById(supabase);

  const [testScoreRows, questionCountRows, examResultRows] = await Promise.all([
    fetchAllRows<{ test_name: string | null; test_date?: string | null; student_id: number | string | null }>(
      supabase,
      "test_scores",
      "test_name, test_date, student_id",
    ).catch((error) => {
      if (isMissingTableError(error.message)) {
        return [];
      }
      throw error;
    }),
    fetchAllRows<QuestionCountRow>(supabase, "question_counts", "test_name, test_date").catch(
      (error) => {
        if (isMissingTableError(error.message)) {
          return [];
        }
        throw error;
      },
    ),
    fetchAllRows<{
      exam_type: string | null;
      session_key: string | null;
      session_label: string | null;
      gakusei_id: string | null;
    }>(supabase, "student_exam_results", "exam_type, session_key, session_label, gakusei_id").catch(
      (error) => {
        if (isMissingTableError(error.message)) {
          return [];
        }
        throw error;
      },
    ),
  ]);

  const questionCountByName = buildQuestionCountMap(questionCountRows);

  const grouped = new Map<string, Set<string>>();

  testScoreRows.forEach((row) => {
    const testName = String(row.test_name ?? "").trim();
    if (!testName) {
      return;
    }
    const key = buildExamResultListKey("test_scores", testName);
    const studentKeys = grouped.get(key) ?? new Set<string>();
    const canonicalKey = getCanonicalStudentKey(row.student_id, studentMaps);
    if (canonicalKey) {
      studentKeys.add(canonicalKey);
    }
    grouped.set(key, studentKeys);
  });

  grouped.forEach((studentKeys, key) => {
    const testName = decodeURIComponent(key.slice(3));
    const questionCount = questionCountByName.get(testName);
    const matchedRow = testScoreRows.find((row) => String(row.test_name).trim() === testName);
    const testDate =
      matchedRow?.test_date?.trim() || questionCount?.test_date?.trim() || null;
    const examType = inferExamRegistrationType(testName);

    items.set(key, {
      key,
      source: "test_scores",
      testName,
      testDate,
      testDateLabel: formatListTestDateLabel(testDate),
      examType,
      examTypeLabel: getExamRegistrationTypeLabel(examType),
      registeredCount: studentKeys.size,
    });
  });

  const regularGrouped = new Map<
    string,
    { examType: ExamRegistrationExamType; sessionKey: string; testName: string; students: Set<string> }
  >();

  examResultRows.forEach((row) => {
    const examType = inferExamRegistrationType(row.session_label ?? "", row.exam_type);
    const sessionKey = String(row.session_key ?? "").trim();
    const testName = String(row.session_label ?? "").trim();
    if (!sessionKey || !testName) {
      return;
    }
    const key = buildExamResultListKey("student_exam_results", testName, sessionKey, examType);
    const current = regularGrouped.get(key) ?? {
      examType,
      sessionKey,
      testName,
      students: new Set<string>(),
    };
    if (row.gakusei_id) {
      current.students.add(String(row.gakusei_id).trim());
    }
    regularGrouped.set(key, current);
  });

  regularGrouped.forEach((value, key) => {
    items.set(key, {
      key,
      source: "student_exam_results",
      testName: value.testName,
      testDate: value.sessionKey,
      testDateLabel: value.testName,
      examType: value.examType,
      examTypeLabel: getExamRegistrationTypeLabel(value.examType),
      registeredCount: value.students.size,
      sessionKey: value.sessionKey,
    });
  });

  return [...items.values()].sort((a, b) => {
    const dateA = a.testDate ?? "";
    const dateB = b.testDate ?? "";
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    return a.testName.localeCompare(b.testName, "ja");
  });
}

async function loadStudentsById(supabase: SupabaseClient): Promise<StudentLookupMaps> {
  const data = await fetchAllRows<{
    id: number | string;
    gakusei_id: string;
    name: string | null;
  }>(supabase, "students", "id, gakusei_id, name");

  const students: StudentLookupRow[] = await Promise.all(
    data.map(async (student) => {
      const decryptedName = student.name ? await decryptStudentName(student.name) : null;
      return {
        id: Number(student.id),
        gakusei_id: String(student.gakusei_id ?? "").trim(),
        name: decryptedName ?? student.name,
      };
    }),
  );

  return buildStudentLookupMaps(students);
}

async function writeTestScoreRow(
  supabase: SupabaseClient,
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  rowId?: number | string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const attempt = async (data: Record<string, unknown>) => {
    if (mode === "update" && rowId !== undefined) {
      return supabase.from("test_scores").update(data).eq("id", rowId);
    }
    return supabase.from("test_scores").insert(data);
  };

  const { error } = await attempt(payload);
  if (!error) {
    return { ok: true };
  }

  if (isMissingColumnError(error.message) && "test_date" in payload) {
    const { test_date: _ignored, ...withoutDate } = payload;
    const retry = await attempt(withoutDate);
    if (!retry.error) {
      return { ok: true };
    }
    return { ok: false, message: retry.error.message };
  }

  return { ok: false, message: error.message };
}

async function saveTestScoreRow(
  supabase: SupabaseClient,
  student: StudentLookupRow,
  testName: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; action: "inserted" | "updated" } | { ok: false; message: string }> {
  const trimmedName = testName.trim();
  const candidateIds: (number | string)[] = [student.id];
  const gakuseiId = student.gakusei_id.trim();
  if (/^\d+$/.test(gakuseiId)) {
    candidateIds.push(Number(gakuseiId));
  }

  const { data: existingRows, error: selectError } = await supabase
    .from("test_scores")
    .select("id, student_id")
    .eq("test_name", trimmedName)
    .in("student_id", candidateIds);

  if (selectError) {
    return { ok: false, message: selectError.message };
  }

  const rows = existingRows ?? [];
  const primary =
    rows.find((row) => Number(row.student_id) === student.id) ?? rows[0] ?? null;

  const writePayload = {
    ...payload,
    student_id: student.id,
    test_name: trimmedName,
  };

  if (primary?.id) {
    const writeResult = await writeTestScoreRow(supabase, "update", writePayload, primary.id);
    if (!writeResult.ok) {
      return writeResult;
    }

    const duplicateIds = rows
      .map((row) => row.id)
      .filter((id): id is number | string => id != null && id !== primary.id);

    if (duplicateIds.length > 0) {
      await supabase.from("test_scores").delete().in("id", duplicateIds);
    }

    return { ok: true, action: "updated" };
  }

  const writeResult = await writeTestScoreRow(supabase, "insert", writePayload);
  if (!writeResult.ok) {
    return writeResult;
  }

  return { ok: true, action: "inserted" };
}

function resolveStudentByGakuseiId(gakuseiId: string, maps: StudentLookupMaps) {
  return resolveStudentByIdentifier(gakuseiId, maps);
}

export async function getExamRegistrationDetail(
  supabase: SupabaseClient,
  key: string,
): Promise<ExamRegistrationDetail | null> {
  const parsedKey = parseExamResultListKey(key);
  if (!parsedKey) {
    return null;
  }

  if (parsedKey.source === "test_scores") {
    const { data, error } = await supabase
      .from("test_scores")
      .select(TEST_SCORES_SELECT)
      .eq("test_name", parsedKey.testName)
      .order("student_id", { ascending: true });

    if (error) {
      if (isMissingTableError(error.message, error.code)) {
        return null;
      }
      throw new Error(error.message);
    }

    const questionCountsResult = await supabase
      .from("question_counts")
      .select(QUESTION_COUNTS_SELECT)
      .eq("test_name", parsedKey.testName)
      .maybeSingle();

    const questionCountRow = questionCountsResult.data as unknown as QuestionCountRow | null;
    const questionCounts =
      questionCountsResult.error || !questionCountRow
        ? null
        : rowToSubjectCounts(questionCountRow);
    const questionCountsMissing = Boolean(questionCountsResult.error) || !questionCountRow;

    const studentMaps = await loadStudentsById(supabase);
    const examType = inferExamRegistrationType(parsedKey.testName);
    const testDate =
      (data?.[0] as { test_date?: string | null } | undefined)?.test_date ??
      questionCountRow?.test_date ??
      null;

    const rowsByStudent = new Map<string, ExamRegistrationScoreRow>();

    ((data ?? []) as unknown as TestScoreRow[]).forEach((row) => {
      const scores = rowToSubjectScoreMap(row);
      const student = resolveStudentFromTestScoreStudentId(row.student_id, studentMaps);
      const canonicalKey = student ? String(student.id) : String(row.student_id);
      const mappedRow: ExamRegistrationScoreRow = {
        recordId: (row as { id?: number | string }).id ?? null,
        studentId: student?.id ?? (Number(row.student_id) || null),
        gakuseiId: student?.gakusei_id ?? String(row.student_id),
        studentName: student?.name?.trim() || "名前未設定",
        scores,
        totalCorrect: calculateTotalCorrect(scores),
        correctRate: calculateCorrectRate(scores, questionCounts),
      };

      const existing = rowsByStudent.get(canonicalKey);
      if (!existing || student?.id === Number(row.student_id)) {
        rowsByStudent.set(canonicalKey, mappedRow);
      }
    });

    const rows = [...rowsByStudent.values()].sort((a, b) =>
      a.gakuseiId.localeCompare(b.gakuseiId, "ja"),
    );

    return {
      key,
      source: "test_scores",
      testName: parsedKey.testName,
      testDate: testDate?.trim() || null,
      testDateLabel: formatListTestDateLabel(testDate),
      examType,
      examTypeLabel: getExamRegistrationTypeLabel(examType),
      questionCountsMissing,
      subjects: TEST_SCORE_SUBJECTS.map((subject) => ({
        column: subject.column,
        label: subject.label,
      })),
      rows,
    };
  }

  const { data, error } = await supabase
    .from("student_exam_results")
    .select("id, gakusei_id, exam_type, session_key, session_label, subject_name, score")
    .eq("exam_type", parsedKey.examType)
    .eq("session_key", parsedKey.sessionKey)
    .order("gakusei_id", { ascending: true })
    .order("subject_name", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message, error.code)) {
      return null;
    }
    throw new Error(error.message);
  }

  const studentMaps = await loadStudentsById(supabase);
  const { terms } = await loadRegularExamTerms(supabase);
  const masterSubjects = getRegularExamSubjectsForSession(terms, parsedKey.sessionKey);
  const subjectNamesFromData = [
    ...new Set((data ?? []).map((row) => String(row.subject_name).trim())),
  ].filter(Boolean);
  const subjectNames =
    masterSubjects.length > 0
      ? masterSubjects
      : subjectNamesFromData.sort((a, b) => a.localeCompare(b, "ja"));

  const grouped = new Map<string, ExamRegistrationScoreRow>();
  (data ?? []).forEach((row: DbExamResultRow) => {
    const gakuseiId = String(row.gakusei_id);
    const current = grouped.get(gakuseiId) ?? {
      recordId: row.id ?? null,
      gakuseiId,
      studentId: Number(studentMaps.byGakuseiId.get(gakuseiId)?.id ?? 0) || null,
      studentName: studentMaps.byGakuseiId.get(gakuseiId)?.name?.trim() || "名前未設定",
      scores: {},
      subjectScores: {},
      totalCorrect: null,
      correctRate: null,
    };
    current.subjectScores = current.subjectScores ?? {};
    current.subjectScores[row.subject_name] = parseDbScore(row.score);
    grouped.set(gakuseiId, current);
  });

  const rows = [...grouped.values()].map((row) => {
    const values = Object.values(row.subjectScores ?? {}).filter(
      (value) => value !== null && value !== undefined,
    ) as number[];
    const average = values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
    return {
      ...row,
      correctRate: average,
      totalCorrect: null,
    };
  });

  return {
    key,
    source: "student_exam_results",
    testName: parsedKey.testName,
    testDate: parsedKey.sessionKey,
    testDateLabel: formatListTestDateLabel(parsedKey.sessionKey),
    examType: parsedKey.examType,
    examTypeLabel: getExamRegistrationTypeLabel(parsedKey.examType),
    sessionKey: parsedKey.sessionKey,
    questionCountsMissing: false,
    subjects: subjectNames.map((label) => ({ label })),
    rows,
  };
}

export async function saveExamRegistrationDetail(
  supabase: SupabaseClient,
  input: {
    key: string;
    testName: string;
    testDate: string;
    rows: Array<{
      recordId?: number | string | null;
      studentId?: number | null;
      gakuseiId: string;
      scores?: Partial<Record<TestScoreSubjectColumn, number | null>>;
      subjectScores?: Record<string, number | null>;
    }>;
  },
) {
  const parsedKey = parseExamResultListKey(input.key);
  if (!parsedKey) {
    return { ok: false as const, message: "試験データが見つかりません。" };
  }

  if (parsedKey.source === "test_scores") {
    const previousTestName = parsedKey.testName;
    const studentMaps = await loadStudentsById(supabase);
    const questionCountResult = await ensureQuestionCountExists(
      supabase,
      input.testName,
      input.testDate,
    );
    if (!questionCountResult.ok) {
      return questionCountResult;
    }

    for (const row of input.rows) {
      const student =
        resolveStudentByGakuseiId(row.gakuseiId, studentMaps) ??
        (row.studentId ? studentMaps.byId.get(row.studentId) ?? null : null);
      if (!student) {
        continue;
      }

      const payload = {
        test_date: input.testDate.trim(),
        ...buildScorePayload(row.scores ?? {}),
      };

      if (row.recordId) {
        const writeResult = await writeTestScoreRow(
          supabase,
          "update",
          {
            ...payload,
            student_id: student.id,
            test_name: input.testName.trim(),
          },
          row.recordId,
        );
        if (!writeResult.ok) {
          return { ok: false as const, message: "試験結果の保存に失敗しました。" };
        }
      } else {
        const saveResult = await saveTestScoreRow(
          supabase,
          student,
          previousTestName,
          payload,
        );
        if (!saveResult.ok) {
          return { ok: false as const, message: "試験結果の保存に失敗しました。" };
        }
      }
    }

    if (input.testName.trim() !== previousTestName) {
      await supabase
        .from("test_scores")
        .update({ test_name: input.testName.trim() })
        .eq("test_name", previousTestName);
    }

    return { ok: true as const };
  }

  for (const row of input.rows) {
    if (!row.gakuseiId || !row.subjectScores) {
      continue;
    }

    for (const [subjectName, score] of Object.entries(row.subjectScores)) {
      if (score === null || score === undefined) {
        continue;
      }

      const { error } = await supabase.from("student_exam_results").upsert(
        {
          gakusei_id: row.gakuseiId,
          exam_type: parsedKey.examType,
          session_key: parsedKey.sessionKey,
          session_label: input.testName.trim(),
          subject_name: subjectName,
          score,
        },
        { onConflict: "gakusei_id,exam_type,session_key,subject_name" },
      );

      if (error) {
        return { ok: false as const, message: "試験結果の保存に失敗しました。" };
      }
    }
  }

  return { ok: true as const };
}

export async function importTestScoreResults(
  supabase: SupabaseClient,
  input: {
    testName: string;
    testDate: string;
    rows: Array<{
      gakuseiId: string;
      scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
    }>;
  },
) {
  const studentMaps = await loadStudentsById(supabase);
  const missingStudents: string[] = [];

  input.rows.forEach((row) => {
    if (!resolveStudentByGakuseiId(row.gakuseiId, studentMaps)) {
      missingStudents.push(row.gakuseiId);
    }
  });

  if (missingStudents.length > 0) {
    return {
      ok: false as const,
      message: `存在しない学籍番号があります: ${missingStudents.slice(0, 5).join(", ")}`,
    };
  }

  const questionCountResult = await ensureQuestionCountExists(
    supabase,
    input.testName,
    input.testDate,
  );
  if (!questionCountResult.ok) {
    return questionCountResult;
  }

  let inserted = 0;
  let updated = 0;

  for (const row of input.rows) {
    const student = resolveStudentByGakuseiId(row.gakuseiId, studentMaps);
    if (!student) {
      continue;
    }

    const payload = {
      test_date: input.testDate.trim(),
      ...buildScorePayload(row.scores),
    };

    const saveResult = await saveTestScoreRow(
      supabase,
      student,
      input.testName.trim(),
      payload,
    );

    if (!saveResult.ok) {
      return {
        ok: false as const,
        message: `学籍番号 ${row.gakuseiId} の登録に失敗しました: ${saveResult.message}`,
      };
    }

    if (saveResult.action === "updated") {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  return {
    ok: true as const,
    inserted,
    updated,
    registeredCount: input.rows.length,
  };
}

export async function importRegularExamResults(
  supabase: SupabaseClient,
  input: {
    sessionKey: string;
    rows: Array<{
      gakuseiId: string;
      scores: Record<string, number | null>;
    }>;
  },
) {
  const term = getRegularExamTerm(input.sessionKey);
  if (!term) {
    return { ok: false as const, message: "学期が選択されていません。" };
  }

  const studentMaps = await loadStudentsById(supabase);
  const missingStudents: string[] = [];

  input.rows.forEach((row) => {
    if (!resolveStudentByGakuseiId(row.gakuseiId, studentMaps)) {
      missingStudents.push(row.gakuseiId);
    }
  });

  if (missingStudents.length > 0) {
    return {
      ok: false as const,
      message: `存在しない学籍番号があります: ${missingStudents.slice(0, 5).join(", ")}`,
    };
  }

  let inserted = 0;
  let updated = 0;

  for (const row of input.rows) {
    const student = resolveStudentByGakuseiId(row.gakuseiId, studentMaps);
    if (!student?.gakusei_id) {
      continue;
    }

    for (const subjectName of term.subjects) {
      const score = row.scores[subjectName] ?? null;
      if (score === null) {
        const { data: existing } = await supabase
          .from("student_exam_results")
          .select("id")
          .eq("gakusei_id", student.gakusei_id)
          .eq("exam_type", "regular")
          .eq("session_key", term.sessionKey)
          .eq("subject_name", subjectName)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from("student_exam_results")
            .delete()
            .eq("id", existing.id);
          if (error) {
            return {
              ok: false as const,
              message: `学籍番号 ${row.gakuseiId} の更新に失敗しました。`,
            };
          }
          updated += 1;
        }
        continue;
      }

      const { data: existing } = await supabase
        .from("student_exam_results")
        .select("id")
        .eq("gakusei_id", student.gakusei_id)
        .eq("exam_type", "regular")
        .eq("session_key", term.sessionKey)
        .eq("subject_name", subjectName)
        .maybeSingle();

      const payload = {
        gakusei_id: student.gakusei_id,
        exam_type: "regular",
        session_key: term.sessionKey,
        session_label: term.sessionLabel,
        subject_name: subjectName,
        score,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("student_exam_results")
          .update(payload)
          .eq("id", existing.id);
        if (error) {
          return {
            ok: false as const,
            message: `学籍番号 ${row.gakuseiId} の更新に失敗しました。`,
          };
        }
        updated += 1;
      } else {
        const { error } = await supabase.from("student_exam_results").insert(payload);
        if (error) {
          return {
            ok: false as const,
            message: `学籍番号 ${row.gakuseiId} の登録に失敗しました。`,
          };
        }
        inserted += 1;
      }
    }
  }

  return {
    ok: true as const,
    inserted,
    updated,
    registeredCount: input.rows.length,
    sessionKey: term.sessionKey,
    sessionLabel: term.sessionLabel,
  };
}
