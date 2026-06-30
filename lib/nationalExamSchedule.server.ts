import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapNationalExamScheduleListItem,
  type NationalExamScheduleDetail,
  type NationalExamScheduleListItem,
} from "@/lib/nationalExamSchedule";

type DbScheduleRow = {
  id: string;
  class_name: string;
  exam_date: string;
  is_active: boolean;
  updated_at: string | null;
};

const SCHEDULE_SELECT = "id, class_name, exam_date, is_active, updated_at" as const;

function isMissingTableError(message: string) {
  return message.includes("does not exist") || message.includes("42P01");
}

function mapRow(row: DbScheduleRow): NationalExamScheduleDetail {
  return mapNationalExamScheduleListItem({
    id: row.id,
    className: row.class_name,
    examDate: row.exam_date,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  });
}

export async function listStudentClassNames(
  supabase: SupabaseClient,
): Promise<{ classNames: string[]; error: string | null }> {
  const { data, error } = await supabase.from("students").select("class");

  if (error) {
    return { classNames: [], error: error.message };
  }

  const names = new Set<string>();
  (data ?? []).forEach((row) => {
    const value = typeof row.class === "string" ? row.class.trim() : "";
    if (value) {
      names.add(value);
    }
  });

  return {
    classNames: [...names].sort((a, b) => a.localeCompare(b, "ja")),
    error: null,
  };
}

export async function listNationalExamSchedules(
  supabase: SupabaseClient,
  options: { search?: string } = {},
): Promise<{
  items: NationalExamScheduleListItem[];
  classNames: string[];
  tableMissing: boolean;
  error: string | null;
}> {
  const classNamesResult = await listStudentClassNames(supabase);

  const { data, error } = await supabase
    .from("national_exam_schedules")
    .select(SCHEDULE_SELECT)
    .order("exam_date", { ascending: false })
    .order("class_name", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      return {
        items: [],
        classNames: classNamesResult.classNames,
        tableMissing: true,
        error: classNamesResult.error,
      };
    }
    return {
      items: [],
      classNames: classNamesResult.classNames,
      tableMissing: false,
      error: error.message,
    };
  }

  const keyword = options.search?.trim().toLowerCase() ?? "";
  const items = ((data ?? []) as DbScheduleRow[])
    .filter((row) => {
      if (!keyword) {
        return true;
      }
      const haystack = [row.class_name, row.exam_date].join(" ").toLowerCase();
      return haystack.includes(keyword);
    })
    .map(mapRow);

  return {
    items,
    classNames: classNamesResult.classNames,
    tableMissing: false,
    error: classNamesResult.error,
  };
}

export async function getNationalExamSchedule(
  supabase: SupabaseClient,
  id: string,
): Promise<{ detail: NationalExamScheduleDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("national_exam_schedules")
    .select(SCHEDULE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message };
  }
  if (!data) {
    return { detail: null, error: null };
  }

  return { detail: mapRow(data as DbScheduleRow), error: null };
}

type ScheduleWritePayload = {
  className: string;
  examDate: string;
  isActive: boolean;
};

export async function createNationalExamSchedule(
  supabase: SupabaseClient,
  payload: ScheduleWritePayload,
): Promise<{ detail: NationalExamScheduleDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("national_exam_schedules")
    .insert({
      class_name: payload.className,
      exam_date: payload.examDate,
      is_active: payload.isActive,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { detail: null, error: "同じ対象クラスの日程が既に登録されています。" };
    }
    return { detail: null, error: error?.message ?? "日程の作成に失敗しました。" };
  }

  return getNationalExamSchedule(supabase, (data as { id: string }).id);
}

export async function updateNationalExamSchedule(
  supabase: SupabaseClient,
  id: string,
  payload: ScheduleWritePayload,
): Promise<{ detail: NationalExamScheduleDetail | null; error: string | null }> {
  const { error } = await supabase
    .from("national_exam_schedules")
    .update({
      class_name: payload.className,
      exam_date: payload.examDate,
      is_active: payload.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { detail: null, error: "同じ対象クラスの日程が既に登録されています。" };
    }
    return { detail: null, error: error.message };
  }

  return getNationalExamSchedule(supabase, id);
}

export async function deleteNationalExamSchedule(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from("national_exam_schedules").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
