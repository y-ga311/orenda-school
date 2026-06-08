"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  initialMessage?: string | null;
};

export function LoginForm({ initialMessage = null }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError("ユーザー名とパスワードを入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedUsername,
        password,
      });

      if (signInError) {
        setError("ユーザー名またはパスワードが正しくありません。");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("ログイン処理中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("パスワード再設定メールを送るには、ユーザー名を入力してください。");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/login`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedUsername,
        { redirectTo },
      );

      if (resetError) {
        setError("パスワード再設定メールの送信に失敗しました。");
        return;
      }

      setMessage("パスワード再設定用のメールを送信しました。");
    } catch {
      setError("パスワード再設定処理中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="loginCard" onSubmit={handleSubmit}>
      <div className="loginCardHead">
        <div className="loginLockCircle" aria-hidden="true">
          🔒
        </div>
        <h1 className="loginCardTitle">教員ログイン</h1>
        <p className="loginCardSubtitle">
          ユーザー名とパスワードでログインしてください
        </p>
      </div>

      {error ? <p className="loginError">{error}</p> : null}
      {message ? <p className="loginMessage">{message}</p> : null}

      <div className="loginField">
        <label className="loginLabel" htmlFor="username">
          ユーザー名
        </label>
        <div className="loginInputRow">
          <span className="loginInputIcon" aria-hidden="true">
            👤
          </span>
          <input
            id="username"
            className="loginInput"
            type="email"
            name="username"
            autoComplete="username"
            placeholder="ユーザー名を入力"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="loginField">
        <label className="loginLabel" htmlFor="password">
          パスワード
        </label>
        <div className="loginInputRow">
          <span className="loginInputIcon" aria-hidden="true">
            🔒
          </span>
          <input
            id="password"
            className="loginInput"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete={remember ? "current-password" : "off"}
            placeholder="パスワードを入力"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
          <button
            type="button"
            className="loginTogglePassword"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            onClick={() => setShowPassword((current) => !current)}
            disabled={isSubmitting}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <div className="loginOptions">
        <label className="loginRemember">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={isSubmitting}
          />
          ログインしたままにする
        </label>
        <button
          type="button"
          className="loginForgot"
          onClick={handleForgotPassword}
          disabled={isSubmitting}
        >
          パスワードを忘れた場合
        </button>
      </div>

      <button className="loginSubmit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
