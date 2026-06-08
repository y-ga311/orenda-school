import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { LearningTimeView } from "@/components/portal/LearningTimeView";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import { getTeacherId } from "@/lib/teacherSession.server";

export default async function LearningTimePage() {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    redirect("/login");
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase接続情報が未設定です。");
  }

  const { data, error } = await supabase
    .from("students")
    .select("gakusei_id, name, class")
    .order("name", { ascending: true });

  if (error) {
    console.error("[learning-time] students:", error.message);
    throw new Error("学生一覧の取得に失敗しました。");
  }

  const students = (data ?? []) as StudentRow[];

  return <LearningTimeView students={students} />;
}
