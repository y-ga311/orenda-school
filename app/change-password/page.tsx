import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPendingTeacherId, getTeacherId } from "@/lib/teacherSession.server";

export default async function ChangePasswordPage() {
  if (await getTeacherId()) {
    redirect("/learning-time");
  }

  const pendingTeacherId = await getPendingTeacherId();
  if (!pendingTeacherId) {
    redirect("/login");
  }

  const supabase = createServiceRoleClient();
  let teacherName: string | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("teacher_accounts")
      .select("name")
      .eq("id", pendingTeacherId)
      .maybeSingle();
    teacherName = data?.name ?? null;
  }

  return (
    <main className="loginPage loginPageSingle">
      <section className="loginRight loginRightFull" aria-label="パスワード設定">
        <ChangePasswordForm teacherName={teacherName} />
      </section>
    </main>
  );
}
