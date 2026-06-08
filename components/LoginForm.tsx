"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  initialMessage?: string | null;
};

export function LoginForm({ initialMessage = null }: LoginFormProps) {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState("");
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

    const trimmedEmployeeNumber = employeeNumber.trim();
    if (!trimmedEmployeeNumber || !password) {
      setError("社員番号とパスワードを入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeNumber: trimmedEmployeeNumber,
          password,
          remember,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        requiresPasswordChange?: boolean;
      } | null;

      if (!response.ok) {
        setError(payload?.message ?? "ログイン処理中にエラーが発生しました。");
        return;
      }

      if (payload?.requiresPasswordChange) {
        router.push("/change-password");
        router.refresh();
        return;
      }

      router.push("/learning-time");
      router.refresh();
    } catch {
      setError("ログイン処理中にエラーが発生しました。");
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
          社員番号とパスワードでログインしてください
        </p>
      </div>

      {error ? <p className="loginError">{error}</p> : null}
      {message ? <p className="loginMessage">{message}</p> : null}

      <div className="loginField">
        <label className="loginLabel" htmlFor="employeeNumber">
          社員番号
        </label>
        <div className="loginInputRow">
          <span className="loginInputIcon" aria-hidden="true">
            👤
          </span>
          <input
            id="employeeNumber"
            className="loginInput"
            type="text"
            name="employeeNumber"
            autoComplete="username"
            placeholder="社員番号を入力"
            value={employeeNumber}
            onChange={(event) => setEmployeeNumber(event.target.value)}
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
        <span className="loginForgotHint">パスワードを忘れた場合は管理者へ連絡</span>
      </div>

      <button className="loginSubmit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
