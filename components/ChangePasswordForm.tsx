"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_TEACHER_PASSWORD_LENGTH } from "@/lib/teacherSession";

type ChangePasswordFormProps = {
  teacherName?: string | null;
};

export function ChangePasswordForm({ teacherName = null }: ChangePasswordFormProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < MIN_TEACHER_PASSWORD_LENGTH) {
      setError(`新しいパスワードは${MIN_TEACHER_PASSWORD_LENGTH}文字以上で入力してください。`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.message ?? "パスワード変更に失敗しました。");
        return;
      }

      router.push("/learning-time");
      router.refresh();
    } catch {
      setError("パスワード変更処理中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="loginCard" onSubmit={handleSubmit}>
      <div className="loginCardHead">
        <div className="loginLockCircle" aria-hidden="true">
          🔑
        </div>
        <h1 className="loginCardTitle">パスワード設定</h1>
        <p className="loginCardSubtitle">
          {teacherName ? `${teacherName} さん、` : ""}
          初回ログインのため新しいパスワードを設定してください（{MIN_TEACHER_PASSWORD_LENGTH}文字以上）
        </p>
      </div>

      {error ? <p className="loginError">{error}</p> : null}

      <div className="loginField">
        <label className="loginLabel" htmlFor="newPassword">
          新しいパスワード
        </label>
        <div className="loginInputRow">
          <span className="loginInputIcon" aria-hidden="true">
            🔒
          </span>
          <input
            id="newPassword"
            className="loginInput"
            type={showPassword ? "text" : "password"}
            name="newPassword"
            autoComplete="new-password"
            placeholder={`${MIN_TEACHER_PASSWORD_LENGTH}文字以上`}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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

      <div className="loginField">
        <label className="loginLabel" htmlFor="confirmPassword">
          新しいパスワード（確認）
        </label>
        <div className="loginInputRow">
          <span className="loginInputIcon" aria-hidden="true">
            🔒
          </span>
          <input
            id="confirmPassword"
            className="loginInput"
            type={showPassword ? "text" : "password"}
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="もう一度入力"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <button className="loginSubmit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "設定中..." : "パスワードを設定する"}
      </button>
    </form>
  );
}
