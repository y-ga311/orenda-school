import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewStudentRegistrationPayload } from "@/lib/newStudentRegistration";
import { prepareStudentNameForStorage } from "@/lib/studentNameCrypto.server";

export type RegisterStudentResult =
  | {
      ok: true;
      student: {
        studentId: number;
        gakuseiId: string;
        name: string;
        className: string;
      };
    }
  | { ok: false; status: 409 | 500; message: string };

export type BulkRegisterRowError = {
  rowNumber: number;
  message: string;
};

export type BulkRegisterResult =
  | {
      ok: true;
      registeredCount: number;
      students: Array<{
        studentId: number;
        gakuseiId: string;
        name: string;
        className: string;
      }>;
    }
  | {
      ok: false;
      message: string;
      rowErrors?: BulkRegisterRowError[];
    };

async function findExistingStudentConflicts(
  supabase: SupabaseClient,
  rows: NewStudentRegistrationPayload[],
) {
  const studentIds = [...new Set(rows.map((row) => row.studentId))];
  const gakuseiIds = [...new Set(rows.map((row) => row.gakuseiId))];

  const [byIdResult, byGakuseiResult] = await Promise.all([
    supabase.from("students").select("id").in("id", studentIds),
    supabase.from("students").select("gakusei_id").in("gakusei_id", gakuseiIds),
  ]);

  if (byIdResult.error) {
    throw new Error(byIdResult.error.message);
  }
  if (byGakuseiResult.error) {
    throw new Error(byGakuseiResult.error.message);
  }

  return {
    existingIds: new Set((byIdResult.data ?? []).map((row) => Number(row.id))),
    existingGakuseiIds: new Set(
      (byGakuseiResult.data ?? []).map((row) => String(row.gakusei_id)),
    ),
  };
}

export async function registerStudent(
  supabase: SupabaseClient,
  data: NewStudentRegistrationPayload,
): Promise<RegisterStudentResult> {
  const encryptedName = await prepareStudentNameForStorage(data.name);
  if (!encryptedName) {
    return {
      ok: false,
      status: 500,
      message:
        "氏名の暗号化に失敗しました。STUDENT_NAME_ENCRYPTION_KEY と encrypt_student_name RPC を確認してください。",
    };
  }

  const { existingIds, existingGakuseiIds } = await findExistingStudentConflicts(supabase, [data]);

  if (existingIds.has(data.studentId)) {
    return {
      ok: false,
      status: 409,
      message: "同じIDの学生が既に登録されています。",
    };
  }

  if (existingGakuseiIds.has(data.gakuseiId)) {
    return {
      ok: false,
      status: 409,
      message: "同じ学生IDが既に登録されています。",
    };
  }

  const { error } = await supabase.from("students").insert({
    id: data.studentId,
    name: encryptedName,
    gakusei_id: data.gakuseiId,
    gakusei_password: data.gakuseiPassword,
    hogosya_id: data.hogosyaId,
    hogosya_pass: data.hogosyaPassword,
    class: data.className,
    mail: data.parentEmail,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[students] insert:", error.message);

    if (error.code === "23505") {
      return {
        ok: false,
        status: 409,
        message: "同じIDまたは学生IDが既に登録されています。",
      };
    }

    return {
      ok: false,
      status: 500,
      message: "学生の登録中にエラーが発生しました。",
    };
  }

  return {
    ok: true,
    student: {
      studentId: data.studentId,
      gakuseiId: data.gakuseiId,
      name: data.name,
      className: data.className,
    },
  };
}

export async function registerStudentsBulk(
  supabase: SupabaseClient,
  rows: NewStudentRegistrationPayload[],
  rowNumbers: number[],
): Promise<BulkRegisterResult> {
  const rowErrors: BulkRegisterRowError[] = [];

  const seenIds = new Map<number, number>();
  const seenGakuseiIds = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = rowNumbers[index] ?? index + 2;

    if (seenIds.has(row.studentId)) {
      rowErrors.push({
        rowNumber,
        message: `ID ${row.studentId} が${seenIds.get(row.studentId)}行目と重複しています。`,
      });
    } else {
      seenIds.set(row.studentId, rowNumber);
    }

    if (seenGakuseiIds.has(row.gakuseiId)) {
      rowErrors.push({
        rowNumber,
        message: `学生ID ${row.gakuseiId} が${seenGakuseiIds.get(row.gakuseiId)}行目と重複しています。`,
      });
    } else {
      seenGakuseiIds.set(row.gakuseiId, rowNumber);
    }
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message: "CSV内に重複するIDまたは学生IDがあります。",
      rowErrors,
    };
  }

  let existingIds = new Set<number>();
  let existingGakuseiIds = new Set<string>();

  try {
    const conflicts = await findExistingStudentConflicts(supabase, rows);
    existingIds = conflicts.existingIds;
    existingGakuseiIds = conflicts.existingGakuseiIds;
  } catch (error) {
    console.error("[students] bulk conflict check:", error);
    return {
      ok: false,
      message: "既存学生の確認中にエラーが発生しました。",
    };
  }

  rows.forEach((row, index) => {
    const rowNumber = rowNumbers[index] ?? index + 2;

    if (existingIds.has(row.studentId)) {
      rowErrors.push({
        rowNumber,
        message: `ID ${row.studentId} は既に登録されています。`,
      });
    }

    if (existingGakuseiIds.has(row.gakuseiId)) {
      rowErrors.push({
        rowNumber,
        message: `学生ID ${row.gakuseiId} は既に登録されています。`,
      });
    }
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message: "登録済みのIDまたは学生IDが含まれています。",
      rowErrors,
    };
  }

  const encryptedNames = await Promise.all(
    rows.map((row) => prepareStudentNameForStorage(row.name)),
  );

  encryptedNames.forEach((encryptedName, index) => {
    if (!encryptedName) {
      rowErrors.push({
        rowNumber: rowNumbers[index] ?? index + 2,
        message: "氏名の暗号化に失敗しました。",
      });
    }
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message:
        "氏名の暗号化に失敗しました。STUDENT_NAME_ENCRYPTION_KEY と encrypt_student_name RPC を確認してください。",
      rowErrors,
    };
  }

  const insertPayload = rows.map((row, index) => ({
    id: row.studentId,
    name: encryptedNames[index] as string,
    gakusei_id: row.gakuseiId,
    gakusei_password: row.gakuseiPassword,
    hogosya_id: row.hogosyaId,
    hogosya_pass: row.hogosyaPassword,
    class: row.className,
    mail: row.parentEmail,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("students").insert(insertPayload);

  if (error) {
    console.error("[students] bulk insert:", error.message);

    if (error.code === "23505") {
      return {
        ok: false,
        message: "同じIDまたは学生IDが既に登録されています。",
      };
    }

    return {
      ok: false,
      message: "学生の一括登録中にエラーが発生しました。",
    };
  }

  return {
    ok: true,
    registeredCount: rows.length,
    students: rows.map((row) => ({
      studentId: row.studentId,
      gakuseiId: row.gakuseiId,
      name: row.name,
      className: row.className,
    })),
  };
}
