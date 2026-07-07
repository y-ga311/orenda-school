"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import { toDateInputValue } from "@/lib/questionCountSettings";

type RegularExamCohortOption = {
  cohortKey: string;
  label: string;
};

type RegularExamTermRow = {
  sessionKey: string;
  sessionLabel: string;
  gradeYear: number;
  term: number;
  examDate: string | null;
  sortOrder: number;
  subjectCount: number;
};

type TermFormRow = {
  sessionKey: string;
  sessionLabel: string;
  subjectCount: number;
  examDate: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function RegularExamTermSettings() {
  const [cohorts, setCohorts] = useState<RegularExamCohortOption[]>([]);
  const [selectedCohortKey, setSelectedCohortKey] = useState("");
  const [rows, setRows] = useState<TermFormRow[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [datesTableMissing, setDatesTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTerms = useCallback(async (cohortKey?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const query = cohortKey ? `?cohortKey=${encodeURIComponent(cohortKey)}` : "";
      const response = await fetch(`/api/regular-exam-terms${query}`);
      const payload = (await response.json().catch(() => null)) as {
        cohorts?: RegularExamCohortOption[];
        selectedCohortKey?: string | null;
        terms?: RegularExamTermRow[];
        tableMissing?: boolean;
        datesTableMissing?: boolean;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      setCohorts(payload?.cohorts ?? []);
      setSelectedCohortKey(payload?.selectedCohortKey ?? "");
      setTableMissing(Boolean(payload?.tableMissing));
      setDatesTableMissing(Boolean(payload?.datesTableMissing));
      setRows(
        (payload?.terms ?? []).map((term) => ({
          sessionKey: term.sessionKey,
          sessionLabel: term.sessionLabel,
          subjectCount: term.subjectCount,
          examDate: toDateInputValue(term.examDate),
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTerms();
  }, [loadTerms]);

  const handleCohortChange = (cohortKey: string) => {
    setSelectedCohortKey(cohortKey);
    setMessage(null);
    void loadTerms(cohortKey);
  };

  const handleDateChange = (sessionKey: string, examDate: string) => {
    setRows((current) =>
      current.map((row) => (row.sessionKey === sessionKey ? { ...row, examDate } : row)),
    );
  };

  const handleSave = async () => {
    if (!selectedCohortKey.trim()) {
      setError("期を選択してください。");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/regular-exam-terms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortKey: selectedCohortKey,
          terms: rows.map((row) => ({
            sessionKey: row.sessionKey,
            examDate: row.examDate.trim() || null,
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        cohorts?: RegularExamCohortOption[];
        selectedCohortKey?: string | null;
        terms?: RegularExamTermRow[];
        datesTableMissing?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      if (payload?.cohorts) {
        setCohorts(payload.cohorts);
      }
      if (payload?.selectedCohortKey) {
        setSelectedCohortKey(payload.selectedCohortKey);
      }
      setDatesTableMissing(Boolean(payload?.datesTableMissing));

      if (payload?.terms) {
        setRows(
          payload.terms.map((term) => ({
            sessionKey: term.sessionKey,
            sessionLabel: term.sessionLabel,
            subjectCount: term.subjectCount,
            examDate: toDateInputValue(term.examDate),
          })),
        );
      }

      setMessage(payload?.message ?? "定期試験の実施日を保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="regularExamTermSettings">
      <PortalLoadingOverlay active={isLoading || isSaving} label={isSaving ? "保存中..." : "読み込み中..."} />

      <div className="regularExamTermSettingsIntro">
        <h2 className="examQuestionCountSectionTitle">定期試験の実施日</h2>
        <p className="examQuestionCountSubtitle">
          期ごとに学期の定期試験実施日を設定します。科目別推移の並び順に使用されます。
        </p>
      </div>

      {error ? <p className="examQuestionCountError">{error}</p> : null}
      {message ? <p className="examQuestionCountMessage">{message}</p> : null}

      {datesTableMissing ? (
        <p className="examQuestionCountEmpty">
          regular_exam_term_dates テーブルが見つかりません。docs/sql/create-regular-exam-term-dates.sql
          を実行してください。
        </p>
      ) : null}

      {tableMissing ? (
        <p className="examQuestionCountEmpty">
          regular_exam_terms テーブルが見つかりません。SQL マスタを実行してください。
        </p>
      ) : (
        <>
          <div className="regularExamTermCohortRow">
            <label className="regularExamTermCohortLabel">
              <span className="examResultRegFieldLabel">期</span>
              <select
                className="examResultRegSelect regularExamTermCohortSelect"
                value={selectedCohortKey}
                onChange={(event) => handleCohortChange(event.target.value)}
                disabled={isSaving || cohorts.length === 0}
              >
                {cohorts.length === 0 ? (
                  <option value="">期を取得できません</option>
                ) : (
                  cohorts.map((cohort) => (
                    <option key={cohort.cohortKey} value={cohort.cohortKey}>
                      {cohort.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            {cohorts.length === 0 ? (
              <p className="examQuestionCountHint">
                学生の所属クラス（例: 25期生昼間部）から期を自動取得します。
              </p>
            ) : null}
          </div>

          <div className="regularExamTermTableWrap">
            <table className="regularExamTermTable">
              <thead>
                <tr>
                  <th>学期</th>
                  <th>科目数</th>
                  <th>実施日</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sessionKey}>
                    <td>{row.sessionLabel}</td>
                    <td>{row.subjectCount}科目</td>
                    <td>
                      <input
                        type="date"
                        className="examQuestionCountInput regularExamTermDateInput"
                        value={row.examDate}
                        onChange={(event) =>
                          handleDateChange(row.sessionKey, event.target.value)
                        }
                        disabled={isSaving || !selectedCohortKey}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="regularExamTermActions">
            <button
              type="button"
              className="examQuestionCountSaveBtn"
              onClick={() => void handleSave()}
              disabled={isSaving || rows.length === 0 || !selectedCohortKey}
            >
              保存する
            </button>
          </div>
        </>
      )}
    </div>
  );
}
