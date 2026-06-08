import { cookies } from "next/headers";
import {
  TEACHER_PENDING_COOKIE,
  TEACHER_SESSION_COOKIE,
} from "@/lib/teacherSession";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

export type TeacherAccount = {
  id: string;
  name: string;
  employeeNumber: string;
};

export async function getTeacherId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TEACHER_SESSION_COOKIE)?.value;
  return value?.trim() || null;
}

export async function getPendingTeacherId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TEACHER_PENDING_COOKIE)?.value;
  return value?.trim() || null;
}

export async function getTeacherAccount(): Promise<TeacherAccount | null> {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    return null;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("teacher_accounts")
    .select("id, name, employee_number")
    .eq("id", teacherId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    employeeNumber: data.employee_number,
  };
}

/** @deprecated getTeacherAccount を使用 */
export async function getTeacherUsername(): Promise<string | null> {
  const teacher = await getTeacherAccount();
  return teacher?.employeeNumber ?? null;
}
