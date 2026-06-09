import { redirect } from "next/navigation";
import { StudyTimeRankingView } from "@/components/portal/StudyTimeRankingView";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getTeacherId } from "@/lib/teacherSession.server";

export default async function StudyTimeRankingPage() {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    redirect("/login");
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase接続情報が未設定です。");
  }

  const { data, error } = await supabase.from("students").select("class");

  if (error) {
    console.error("[study-time-ranking] students:", error.message);
    throw new Error("クラス一覧の取得に失敗しました。");
  }

  const classOptions = [
    ...new Set(
      (data ?? [])
        .map((student) => student.class?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b, "ja"));

  return <StudyTimeRankingView classOptions={classOptions} />;
}
