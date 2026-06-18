"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import {
  QUESTION_COUNT_GROUPS,
  calculateQuestionCountTotal,
  formatQuestionCountTotal,
  getExamTypeLabel,
  getSubjectLabel,
  parseSubjectCountsFromForm,
  toDateInputValue,
  type QuestionCountFilter,
  type QuestionCountListItem,
} from "@/lib/questionCountSettings";

type QuestionCountDetail = QuestionCountListItem & {
  subjects: Partial<Record<TestScoreSubjectColumn, number | null>>;
};

type FormMode = "edit" | "new";

type FormState = {
  testName: string;
  testDate: string;
  counts: Record<TestScoreSubjectColumn, string>;
};

const EMPTY_COUNTS = Object.fromEntries(
  TEST_SCORE_SUBJECTS.map(({ column }) => [column, ""]),
) as Record<TestScoreSubjectColumn, string>;

const FILTER_OPTIONS: { value: QuestionCountFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "mock", label: "模擬試験" },
  { value: "graduation", label: "卒業試験" },
];

function createEmptyForm(): FormState {
  return {
    testName: "",
    testDate: "",
    counts: { ...EMPTY_COUNTS },
  };
}

function detailToForm(detail: QuestionCountDetail): FormState {
  const counts = { ...EMPTY_COUNTS };
  TEST_SCORE_SUBJECTS.forEach(({ column }) => {
    const value = detail.subjects[column];
    counts[column] = value === null || value === undefined ? "" : String(value);
  });

  return {
    testName: detail.testName,
    testDate: toDateInputValue(detail.testDate),
    counts,
  };
}

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 409) {
    return message ?? "同じ試験名が既に登録されています。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function ExamQuestionCountView() {
  const [items, setItems] = useState<QuestionCountListItem[]>([]);
  const [selectedTestName, setSelectedTestName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("edit");
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuestionCountFilter>("all");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const loadList = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("filter", filter);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/question-counts?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as {
        items?: QuestionCountListItem[];
        tableMissing?: boolean;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      setTableMissing(Boolean(payload?.tableMissing));
      setItems(payload?.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      setItems([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [filter, search]);

  const loadDetail = useCallback(async (testName: string) => {
    setIsSaving(false);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/question-counts?${new URLSearchParams({ testName }).toString()}`,
      );
      const payload = (await response.json().catch(() => null)) as {
        item?: QuestionCountDetail;
        message?: string;
      } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      setSelectedTestName(payload.item.testName);
      setSelectedId(payload.item.id);
      setFormMode("edit");
      setForm(detailToForm(payload.item));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "詳細の取得に失敗しました。");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const formTotal = useMemo(() => {
    const counts = parseSubjectCountsFromForm(form.counts);
    return calculateQuestionCountTotal(counts);
  }, [form.counts]);

  const handleSelectItem = (item: QuestionCountListItem) => {
    void loadDetail(item.testName);
  };

  const handleStartNew = () => {
    setSelectedTestName(null);
    setSelectedId(null);
    setFormMode("new");
    setForm(createEmptyForm());
    setMessage(null);
    setError(null);
  };

  const handleFieldChange = (field: "testName" | "testDate", value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCountChange = (column: TestScoreSubjectColumn, value: string) => {
    setForm((current) => ({
      ...current,
      counts: {
        ...current.counts,
        [column]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!form.testName.trim() || !form.testDate.trim()) {
      setError("試験名と実施日を入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const counts = parseSubjectCountsFromForm(form.counts);
    const body = {
      id: selectedId,
      testName: form.testName.trim(),
      previousTestName: selectedTestName,
      testDate: form.testDate.trim(),
      counts,
    };

    try {
      const response = await fetch("/api/question-counts", {
        method: formMode === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        item?: QuestionCountDetail;
        message?: string;
      } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      setSelectedTestName(payload.item.testName);
      setSelectedId(payload.item.id);
      setFormMode("edit");
      setForm(detailToForm(payload.item));
      setMessage(formMode === "new" ? "試験問題数を登録しました。" : "試験問題数を更新しました。");
      await loadList();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (formMode === "new" || !selectedTestName) {
      return;
    }

    const confirmed = window.confirm(`「${selectedTestName}」の試験問題数を削除しますか？`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const params = new URLSearchParams();
      if (selectedId !== null && selectedId !== undefined && selectedId !== "") {
        params.set("id", String(selectedId));
      } else {
        params.set("testName", selectedTestName);
      }

      const response = await fetch(`/api/question-counts?${params.toString()}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      handleStartNew();
      setMessage("試験問題数を削除しました。");
      await loadList();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  const isFormBusy = isSaving || isDeleting;

  return (
    <div className="examQuestionCountPage">
      <header className="examQuestionCountHeader">
        <div>
          <h1 className="examQuestionCountTitle">試験問題数設定</h1>
          <p className="examQuestionCountSubtitle">
            模擬試験・卒業試験ごとの科目別問題数を登録・編集します
          </p>
        </div>
      </header>

      <div className="examQuestionCountWorkspace">
        <aside className="examQuestionCountList">
          <div className="examQuestionCountListHeader">
            <h2 className="examQuestionCountSectionTitle">登録済み試験一覧</h2>
            <button
              type="button"
              className="examQuestionCountNewBtn"
              onClick={handleStartNew}
            >
              ＋ 新規試験登録
            </button>
          </div>

          <input
            type="search"
            className="examQuestionCountSearch"
            placeholder="試験名で検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="examQuestionCountFilterRow">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`examQuestionCountFilterChip${filter === option.value ? " examQuestionCountFilterChipActive" : ""}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="examQuestionCountListBody">
            {isLoadingList ? (
              <p className="examQuestionCountEmpty">読み込み中...</p>
            ) : tableMissing ? (
              <p className="examQuestionCountEmpty">
                question_counts テーブルが見つかりません。
              </p>
            ) : items.length === 0 ? (
              <p className="examQuestionCountEmpty">登録済みの試験がありません。</p>
            ) : (
              items.map((item) => {
                const isSelected =
                  formMode === "edit" && selectedTestName === item.testName;
                return (
                  <button
                    key={`${item.id ?? item.testName}`}
                    type="button"
                    className={`examQuestionCountListItem${isSelected ? " examQuestionCountListItemActive" : ""}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="examQuestionCountListItemTop">
                      <span className="examQuestionCountListName">{item.testName}</span>
                      <span
                        className={`examQuestionCountTypeBadge examQuestionCountTypeBadge${item.examType === "mock" ? "Mock" : item.examType === "graduation" ? "Graduation" : "Other"}`}
                      >
                        {getExamTypeLabel(item.examType)}
                      </span>
                    </div>
                    <div className="examQuestionCountListMeta">
                      <span>{item.testDateLabel ?? "実施日未設定"}</span>
                      <span>{formatQuestionCountTotal(item.totalQuestions)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="examQuestionCountForm">
          <PortalLoadingOverlay active={isFormBusy} label="保存中..." />

          <div className="examQuestionCountFormHeader">
            <h2 className="examQuestionCountSectionTitle">
              {formMode === "new" ? "新規試験登録" : "試験問題数の編集"}
            </h2>
            <div className="examQuestionCountTotalBadge">
              合計 {formatQuestionCountTotal(formTotal)}
            </div>
          </div>

          {error ? <p className="examQuestionCountError">{error}</p> : null}
          {message ? <p className="examQuestionCountMessage">{message}</p> : null}

          <div className="examQuestionCountFormFields">
            <label className="examQuestionCountField">
              <span className="examQuestionCountFieldLabel">試験名</span>
              <input
                type="text"
                className="examQuestionCountInput"
                value={form.testName}
                onChange={(event) => handleFieldChange("testName", event.target.value)}
                placeholder="例: 第1回模擬試験"
              />
            </label>
            <label className="examQuestionCountField">
              <span className="examQuestionCountFieldLabel">実施日</span>
              <input
                type="date"
                className="examQuestionCountInput"
                value={form.testDate}
                onChange={(event) => handleFieldChange("testDate", event.target.value)}
              />
            </label>
          </div>

          <div className="examQuestionCountScrollBody">
            {QUESTION_COUNT_GROUPS.map((group) => (
              <section key={group.key} className="examQuestionCountGroup">
                <h3
                  className={`examQuestionCountGroupTitle examQuestionCountGroupTitle${group.tone.charAt(0).toUpperCase()}${group.tone.slice(1)}`}
                >
                  {group.label}
                </h3>
                <div className="examQuestionCountSubjectGrid">
                  {group.columns.map((column) => (
                    <label key={column} className="examQuestionCountSubjectField">
                      <span className="examQuestionCountSubjectLabel">
                        {getSubjectLabel(column)}
                      </span>
                      <div className="examQuestionCountSubjectInputWrap">
                        <input
                          type="number"
                          min={0}
                          className="examQuestionCountSubjectInput"
                          value={form.counts[column]}
                          onChange={(event) => handleCountChange(column, event.target.value)}
                          placeholder="0"
                        />
                        <span className="examQuestionCountSubjectUnit">問</span>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="examQuestionCountActions">
            {formMode === "edit" && selectedTestName ? (
              <button
                type="button"
                className="examQuestionCountDeleteBtn"
                onClick={() => void handleDelete()}
                disabled={isFormBusy}
              >
                削除
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="examQuestionCountSaveBtn"
              onClick={() => void handleSave()}
              disabled={isFormBusy}
            >
              {formMode === "new" ? "登録する" : "保存する"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
