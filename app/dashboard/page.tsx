import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="dashboardShell">
      <section className="dashboardCard">
        <h1 className="dashboardTitle">教員ポータル</h1>
        <p className="dashboardText">
          ログインに成功しました。Phase 1 の成績確認画面はこのあと実装します。
          <br />
          ログイン中: {user.email}
        </p>
        <LogoutButton />
      </section>
    </main>
  );
}
