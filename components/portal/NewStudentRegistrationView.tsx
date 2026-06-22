"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  NEW_STUDENT_FIELD_LABELS,
  createEmptyNewStudentForm,
  downloadStudentRegistrationTemplate,
  parseStudentRegistrationCsv,
  validateNewStudentRegistrationForm,
  type NewStudentRegistrationFieldErrors,
  type NewStudentRegistrationFormState,
  type StudentRegistrationRowError,
} from "@/lib/newStudentRegistration";

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 409) {
    return message ?? "同じIDまたは学生IDが既に登録されています。";
  }
  if (status === 400) {
    return message ?? "入力内容を確認してください。";
  }
  return message ?? "学生の登録中にエラーが発生しました。";
}

function formatRowErrors(rowErrors: StudentRegistrationRowError[]) {
  return rowErrors
    .slice(0, 8)
    .map((item) => `${item.rowNumber}行目: ${item.message}`)
    .join("\n");
}

export function NewStudentRegistrationView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<NewStudentRegistrationFormState>(createEmptyNewStudentForm);
  const [fieldErrors, setFieldErrors] = useState<NewStudentRegistrationFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importDetail, setImportDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const isBusy = isSubmitting || isImporting;

  const updateField = <K extends keyof NewStudentRegistrationFormState>(
    key: K,
    value: NewStudentRegistrationFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
    setError(null);
    setMessage(null);
    setImportDetail(null);
  };

  const handleSubmit = async () => {
    const validation = validateNewStudentRegistrationForm(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setError("入力内容を確認してください。");
      setMessage(null);
      setImportDetail(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    setImportDetail(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        errors?: NewStudentRegistrationFieldErrors;
      } | null;

      if (!response.ok) {
        if (payload?.errors) {
          setFieldErrors(payload.errors);
        }
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      setForm(createEmptyNewStudentForm());
      setMessage(payload?.message ?? "学生を登録しました。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登録に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push("/student-info");
  };

  const handleDownloadTemplate = () => {
    downloadStudentRegistrationTemplate();
  };

  const handleImportClick = () => {
    if (isBusy) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setError(null);
    setMessage(null);
    setImportDetail(null);
    setFieldErrors({});

    try {
      const text = await file.text();
      const parsed = parseStudentRegistrationCsv(text);

      if (!parsed.ok) {
        if (parsed.rowErrors?.length) {
          setImportDetail(formatRowErrors(parsed.rowErrors));
        }
        throw new Error(parsed.message);
      }

      const response = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: parsed.rows,
          rowNumbers: parsed.rowNumbers,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        registeredCount?: number;
        rowErrors?: StudentRegistrationRowError[];
      } | null;

      if (!response.ok) {
        if (payload?.rowErrors?.length) {
          setImportDetail(formatRowErrors(payload.rowErrors));
        }
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      const skippedNotes: string[] = [];
      if (parsed.skippedSampleRows > 0) {
        skippedNotes.push(`記入例 ${parsed.skippedSampleRows}行をスキップ`);
      }
      if (parsed.skippedEmptyRows > 0) {
        skippedNotes.push(`空行 ${parsed.skippedEmptyRows}行をスキップ`);
      }

      setMessage(payload?.message ?? `${parsed.rows.length}件の学生を登録しました。`);
      if (skippedNotes.length > 0) {
        setImportDetail(skippedNotes.join(" / "));
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSVインポートに失敗しました。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="newStudentRegPage">
      <header className="newStudentRegHeader">
        <div>
          <h1 className="newStudentRegTitle">新規学生登録</h1>
          <p className="newStudentRegSubtitle">学生の基本情報とアカウントを新規登録します</p>
        </div>
        <div className="newStudentRegCsvActions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="newStudentRegFileInput"
            onChange={(event) => void handleImportFile(event)}
          />
          <button
            type="button"
            className="newStudentRegCsvBtn"
            onClick={handleImportClick}
            disabled={isBusy}
          >
            {isImporting ? "インポート中..." : "CSVインポート"}
          </button>
          <button
            type="button"
            className="newStudentRegCsvBtn newStudentRegCsvBtnPrimary"
            onClick={handleDownloadTemplate}
            disabled={isBusy}
          >
            テンプレートをダウンロード
          </button>
        </div>
      </header>

      <section className="newStudentRegCard">
        <div className="newStudentRegCardHeader">
          <h2 className="newStudentRegSectionTitle">登録情報</h2>
          <p className="newStudentRegCsvHint">
            テンプレートを記入してCSVインポートするか、下のフォームから1件ずつ登録できます
          </p>
        </div>

        {error ? <p className="newStudentRegError">{error}</p> : null}
        {message ? <p className="newStudentRegMessage">{message}</p> : null}
        {importDetail ? <pre className="newStudentRegImportDetail">{importDetail}</pre> : null}

        <div className="newStudentRegFormGrid">
          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.studentId}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.studentId ? " newStudentRegInputError" : ""}`}
              type="text"
              inputMode="numeric"
              value={form.studentId}
              placeholder="例: 1001"
              onChange={(event) => updateField("studentId", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.studentId ? (
              <span className="newStudentRegFieldError">{fieldErrors.studentId}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.name}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.name ? " newStudentRegInputError" : ""}`}
              type="text"
              value={form.name}
              placeholder="氏名"
              onChange={(event) => updateField("name", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.name ? (
              <span className="newStudentRegFieldError">{fieldErrors.name}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.gakuseiId}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.gakuseiId ? " newStudentRegInputError" : ""}`}
              type="text"
              value={form.gakuseiId}
              placeholder="学生アプリのログインID"
              onChange={(event) => updateField("gakuseiId", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.gakuseiId ? (
              <span className="newStudentRegFieldError">{fieldErrors.gakuseiId}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.gakuseiPassword}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.gakuseiPassword ? " newStudentRegInputError" : ""}`}
              type="password"
              value={form.gakuseiPassword}
              onChange={(event) => updateField("gakuseiPassword", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.gakuseiPassword ? (
              <span className="newStudentRegFieldError">{fieldErrors.gakuseiPassword}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.hogosyaId}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.hogosyaId ? " newStudentRegInputError" : ""}`}
              type="text"
              value={form.hogosyaId}
              onChange={(event) => updateField("hogosyaId", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.hogosyaId ? (
              <span className="newStudentRegFieldError">{fieldErrors.hogosyaId}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.hogosyaPassword}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.hogosyaPassword ? " newStudentRegInputError" : ""}`}
              type="password"
              value={form.hogosyaPassword}
              onChange={(event) => updateField("hogosyaPassword", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.hogosyaPassword ? (
              <span className="newStudentRegFieldError">{fieldErrors.hogosyaPassword}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.parentEmail}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.parentEmail ? " newStudentRegInputError" : ""}`}
              type="email"
              value={form.parentEmail}
              placeholder="未設定可"
              onChange={(event) => updateField("parentEmail", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.parentEmail ? (
              <span className="newStudentRegFieldError">{fieldErrors.parentEmail}</span>
            ) : null}
          </label>

          <label className="studentInfoField">
            <span className="studentInfoFieldLabel">{NEW_STUDENT_FIELD_LABELS.className}</span>
            <input
              className={`studentInfoFieldInput${fieldErrors.className ? " newStudentRegInputError" : ""}`}
              type="text"
              value={form.className}
              placeholder="例: A組"
              onChange={(event) => updateField("className", event.target.value)}
              disabled={isBusy}
            />
            {fieldErrors.className ? (
              <span className="newStudentRegFieldError">{fieldErrors.className}</span>
            ) : null}
          </label>
        </div>

        <div className="newStudentRegFooter">
          <button
            type="button"
            className="studentInfoCancelBtn"
            onClick={handleCancel}
            disabled={isBusy}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="studentInfoSaveBtn"
            onClick={() => void handleSubmit()}
            disabled={isBusy}
          >
            {isSubmitting ? "登録中..." : "登録する"}
          </button>
        </div>

        <PortalLoadingOverlay
          active={isBusy}
          label={isImporting ? "インポート中..." : "登録中..."}
        />
      </section>

      <p className="newStudentRegFootnote">
        登録後、学生アプリから学生IDと学生パスワードでログインできます。
        詳細は
        <Link href="/student-info" className="newStudentRegFootnoteLink">
          学生基本情報
        </Link>
        から編集できます。
      </p>
    </div>
  );
}
