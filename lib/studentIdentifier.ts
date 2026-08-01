export function normalizeStudentIdentifier(value: string) {
  let trimmed = value.trim();
  if (/^\d+\.0+$/.test(trimmed)) {
    trimmed = trimmed.replace(/\.0+$/, "");
  }
  return trimmed;
}

export type StudentLookupRow = {
  id: number;
  gakusei_id: string;
  name: string | null;
};

export type StudentLookupMaps = {
  byId: Map<number, StudentLookupRow>;
  byGakuseiId: Map<string, StudentLookupRow>;
};

export function buildStudentLookupMaps(students: StudentLookupRow[]): StudentLookupMaps {
  const byId = new Map<number, StudentLookupRow>();
  const byGakuseiId = new Map<string, StudentLookupRow>();

  for (const student of students) {
    byId.set(student.id, student);

    const gakuseiId = String(student.gakusei_id ?? "").trim();
    if (!gakuseiId) {
      continue;
    }

    byGakuseiId.set(gakuseiId, student);
    if (/^\d+$/.test(gakuseiId)) {
      byGakuseiId.set(String(Number(gakuseiId)), student);
    }
  }

  return { byId, byGakuseiId };
}

export function resolveStudentByIdentifier(
  identifier: string,
  maps: StudentLookupMaps,
): StudentLookupRow | null {
  const normalized = normalizeStudentIdentifier(identifier);
  if (!normalized) {
    return null;
  }

  const byGakusei = maps.byGakuseiId.get(normalized);
  if (byGakusei) {
    return byGakusei;
  }

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return maps.byId.get(numeric) ?? maps.byGakuseiId.get(String(numeric)) ?? null;
  }

  return null;
}

/** test_scores.student_id は内部IDまたは旧データの gakusei_id 数値のどちらか */
export function resolveStudentFromTestScoreStudentId(
  rawStudentId: number | string | null | undefined,
  maps: StudentLookupMaps,
): StudentLookupRow | null {
  if (rawStudentId === null || rawStudentId === undefined || rawStudentId === "") {
    return null;
  }

  const normalized = normalizeStudentIdentifier(String(rawStudentId));
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    const byId = maps.byId.get(numeric);
    if (byId) {
      return byId;
    }
  }

  return maps.byGakuseiId.get(normalized) ?? null;
}

export function getCanonicalStudentKey(
  rawStudentId: number | string | null | undefined,
  maps: StudentLookupMaps,
) {
  const student = resolveStudentFromTestScoreStudentId(rawStudentId, maps);
  if (student) {
    return `student:${student.id}`;
  }

  if (rawStudentId === null || rawStudentId === undefined || rawStudentId === "") {
    return null;
  }

  return `raw:${normalizeStudentIdentifier(String(rawStudentId))}`;
}
