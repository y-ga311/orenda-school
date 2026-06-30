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
import { rowToSubjectCounts } from "@/lib/questionCountSettings";

type DbStudent = {
  id: number | string;
  gakusei_id: string;
  name: string | null;
};

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

export async function listRegisteredExams(supabase: SupabaseClient) {
  const items = new Map<string, ExamRegistrationListItem>();

  const [testScoresResult, questionCountsResult, examResultsResult] = await Promise.all([
    supabase.from("test_scores").select("test_name, test_date, student_id"),
    supabase.from("question_counts").select("test_name, test_date"),
    supabase
      .from("student_exam_results")
      .select("exam_type, session_key, session_label, gakusei_id"),
  ]);

  const questionCountByName = buildQuestionCountMap(
    (questionCountsResult.data ?? []) as QuestionCountRow[],
  );

  if (!testScoresResult.error) {
    const grouped = new Map<string, Set<number | string>>();

    (testScoresResult.data ?? []).forEach((row) => {
      const testName = String(row.test_name ?? "").trim();
      if (!testName) {
        return;
      }
      const key = buildExamResultListKey("test_scores", testName);
      const studentIds = grouped.get(key) ?? new Set<number | string>();
      if (row.student_id !== null && row.student_id !== undefined) {
        studentIds.add(row.student_id);
      }
      grouped.set(key, studentIds);
    });

    grouped.forEach((studentIds, key) => {
      const testName = decodeURIComponent(key.slice(3));
      const questionCount = questionCountByName.get(testName);
      const matchedRow = (testScoresResult.data ?? []).find(
        (row) => String(row.test_name).trim() === testName,
      );
      const testDate =
        (matchedRow?.test_date as string | null | undefined) ?? questionCount?.test_date ?? null;
      const examType = inferExamRegistrationType(testName);

      items.set(key, {
        key,
        source: "test_scores",
        testName,
        testDate: testDate?.trim() || null,
        testDateLabel: formatListTestDateLabel(testDate),
        examType,
        examTypeLabel: getExamRegistrationTypeLabel(examType),
        registeredCount: studentIds.size,
      });
    });
  } else if (!isMissingTableError(testScoresResult.error.message, testScoresResult.error.code)) {
    throw new Error(testScoresResult.error.message);
  }

  if (!examResultsResult.error) {
    const grouped = new Map<
      string,
      { examType: ExamRegistrationExamType; sessionKey: string; testName: string; students: Set<string> }
    >();

    (examResultsResult.data ?? []).forEach((row) => {
      const examType = inferExamRegistrationType(row.session_label, row.exam_type);
      const sessionKey = String(row.session_key ?? "").trim();
      const testName = String(row.session_label ?? "").trim();
      if (!sessionKey || !testName) {
        return;
      }
      const key = buildExamResultListKey("student_exam_results", testName, sessionKey, examType);
      const current = grouped.get(key) ?? {
        examType,
        sessionKey,
        testName,
        students: new Set<string>(),
      };
      if (row.gakusei_id) {
        current.students.add(String(row.gakusei_id));
      }
      grouped.set(key, current);
    });

    grouped.forEach((value, key) => {
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
  } else if (
    !isMissingTableError(examResultsResult.error.message, examResultsResult.error.code)
  ) {
    throw new Error(examResultsResult.error.message);
  }

  return [...items.values()].sort((a, b) => {
    const dateA = a.testDate ?? "";
    const dateB = b.testDate ?? "";
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    return a.testName.localeCompare(b.testName, "ja");
  });
}

async function loadStudentsById(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("students").select("id, gakusei_id, name");
  if (error) {
    throw new Error(error.message);
  }

  const byId = new Map<number, DbStudent>();
  const byGakuseiId = new Map<string, DbStudent>();

  await Promise.all(
    ((data ?? []) as DbStudent[]).map(async (student) => {
      const id = Number(student.id);
      const decryptedName = student.name ? await decryptStudentName(student.name) : null;
      const normalized = {
        ...student,
        id,
        name: decryptedName ?? student.name,
      };
      byId.set(id, normalized);
      byGakuseiId.set(student.gakusei_id, normalized);
    }),
  );

  return { byId, byGakuseiId };
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

    const { byId } = await loadStudentsById(supabase);
    const examType = inferExamRegistrationType(parsedKey.testName);
    const testDate =
      (data?.[0] as { test_date?: string | null } | undefined)?.test_date ??
      questionCountRow?.test_date ??
      null;

    const rows: ExamRegistrationScoreRow[] = ((data ?? []) as unknown as TestScoreRow[]).map((row) => {
      const scores = rowToSubjectScoreMap(row);
      const student = byId.get(Number(row.student_id));
      return {
        recordId: (row as { id?: number | string }).id ?? null,
        studentId: Number(row.student_id),
        gakuseiId: student?.gakusei_id ?? String(row.student_id),
        studentName: student?.name?.trim() || "名前未設定",
        scores,
        totalCorrect: calculateTotalCorrect(scores),
        correctRate: calculateCorrectRate(scores, questionCounts),
      };
    });

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

  const { byGakuseiId } = await loadStudentsById(supabase);
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
      studentId: Number(byGakuseiId.get(gakuseiId)?.id ?? 0) || null,
      studentName: byGakuseiId.get(gakuseiId)?.name?.trim() || "名前未設定",
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

    for (const row of input.rows) {
      if (!row.studentId) {
        continue;
      }

      const payload = {
        student_id: row.studentId,
        test_name: input.testName.trim(),
        test_date: input.testDate.trim(),
        ...buildScorePayload(row.scores ?? {}),
      };

      if (row.recordId) {
        const { error } = await supabase
          .from("test_scores")
          .update(payload)
          .eq("id", row.recordId);
        if (error) {
          if (isMissingColumnError(error.message)) {
            const { test_date: _ignored, ...withoutDate } = payload;
            const retry = await supabase.from("test_scores").update(withoutDate).eq("id", row.recordId);
            if (retry.error) {
              return { ok: false as const, message: "試験結果の保存に失敗しました。" };
            }
          } else {
            return { ok: false as const, message: "試験結果の保存に失敗しました。" };
          }
        }
      } else {
        const { data: existing } = await supabase
          .from("test_scores")
          .select("id")
          .eq("student_id", row.studentId)
          .eq("test_name", previousTestName)
          .maybeSingle();

        if (existing?.id) {
          const updateResult = await supabase
            .from("test_scores")
            .update(payload)
            .eq("id", existing.id);
          if (updateResult.error) {
            return { ok: false as const, message: "試験結果の保存に失敗しました。" };
          }
        } else {
          const insertResult = await supabase.from("test_scores").insert(payload);
          if (insertResult.error) {
            return { ok: false as const, message: "試験結果の保存に失敗しました。" };
          }
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
      studentId: number;
      scores: Partial<Record<TestScoreSubjectColumn, number | null>>;
    }>;
  },
) {
  const { byId } = await loadStudentsById(supabase);
  const missingStudents: number[] = [];

  input.rows.forEach((row) => {
    if (!byId.has(row.studentId)) {
      missingStudents.push(row.studentId);
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
    const payload = {
      student_id: row.studentId,
      test_name: input.testName.trim(),
      test_date: input.testDate.trim(),
      ...buildScorePayload(row.scores),
    };

    const { data: existing } = await supabase
      .from("test_scores")
      .select("id")
      .eq("student_id", row.studentId)
      .eq("test_name", input.testName.trim())
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from("test_scores").update(payload).eq("id", existing.id);
      if (error) {
        if (isMissingColumnError(error.message)) {
          const { test_date: _ignored, ...withoutDate } = payload;
          const retry = await supabase.from("test_scores").update(withoutDate).eq("id", existing.id);
          if (retry.error) {
            return { ok: false as const, message: `学籍番号 ${row.studentId} の更新に失敗しました。` };
          }
        } else {
          return { ok: false as const, message: `学籍番号 ${row.studentId} の更新に失敗しました。` };
        }
      }
      updated += 1;
    } else {
      const { error } = await supabase.from("test_scores").insert(payload);
      if (error) {
        if (isMissingColumnError(error.message)) {
          const { test_date: _ignored, ...withoutDate } = payload;
          const retry = await supabase.from("test_scores").insert(withoutDate);
          if (retry.error) {
            return { ok: false as const, message: `学籍番号 ${row.studentId} の登録に失敗しました。` };
          }
        } else {
          return { ok: false as const, message: `学籍番号 ${row.studentId} の登録に失敗しました。` };
        }
      }
      inserted += 1;
    }
  }

  const { data: questionCount } = await supabase
    .from("question_counts")
    .select("test_name")
    .eq("test_name", input.testName.trim())
    .maybeSingle();

  if (!questionCount) {
    await supabase.from("question_counts").upsert(
      {
        test_name: input.testName.trim(),
        test_date: input.testDate.trim(),
      },
      { onConflict: "test_name" },
    );
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
      studentId: number;
      scores: Record<string, number | null>;
    }>;
  },
) {
  const term = getRegularExamTerm(input.sessionKey);
  if (!term) {
    return { ok: false as const, message: "学期が選択されていません。" };
  }

  const { byId } = await loadStudentsById(supabase);
  const missingStudents: number[] = [];

  input.rows.forEach((row) => {
    if (!byId.has(row.studentId)) {
      missingStudents.push(row.studentId);
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
    const student = byId.get(row.studentId);
    if (!student?.gakusei_id) {
      continue;
    }

    for (const subjectName of term.subjects) {
      const score = row.scores[subjectName];
      if (score === null || score === undefined) {
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
            message: `学籍番号 ${row.studentId} の更新に失敗しました。`,
          };
        }
        updated += 1;
      } else {
        const { error } = await supabase.from("student_exam_results").insert(payload);
        if (error) {
          return {
            ok: false as const,
            message: `学籍番号 ${row.studentId} の登録に失敗しました。`,
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
