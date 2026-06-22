import { LoginForm } from "@/components/LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="loginPage">
      <div className="loginPageBackground" aria-hidden="true" />

      <section className="loginLeft" aria-label="Orenda School 紹介">
        <div className="loginHeadline">
          <h1 className="loginTitle">Orenda School</h1>
          <p className="loginSubtitle">教員ポータルへようこそ</p>
          <p className="loginDescription">
            生徒一人ひとりの学びと成長を支えるために、日々の業務をもっと簡単に、もっとつながりやすく。
          </p>
        </div>

        <div className="loginSpacer" />

        <div className="loginFeatures">
          <article className="loginFeature">
            <div className="loginFeatureIcon" aria-hidden="true">
              ⏱
            </div>
            <h2 className="loginFeatureTitle">業務をもっと効率的に</h2>
            <p className="loginFeatureText">
              {"授業・成績・連絡などの\n業務をスムーズにサポートします。"}
            </p>
          </article>

          <article className="loginFeature">
            <div className="loginFeatureIcon" aria-hidden="true">
              🤝
            </div>
            <h2 className="loginFeatureTitle">つながる学校づくり</h2>
            <p className="loginFeatureText">
              {"生徒・保護者・教職員が\n情報を共有しやすくなります。"}
            </p>
          </article>
        </div>
      </section>

      <section className="loginRight" aria-label="ログインフォーム">
        <LoginForm initialMessage={params.message ?? null} />
      </section>
    </main>
  );
}
