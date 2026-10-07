"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  createEmptyStudentSubmittedForm,
  detailToStudentSubmittedForm,
  formatSubmittedAuthor,
  formatSubmittedDate,
  validateStudentSubmittedForm,
  type StudentSubmittedQuestionDetail,
  type StudentSubmittedQuestionFormState,
  type StudentSubmittedQuestionListItem,
} from "@/lib/studentSubmittedQuestions";

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function StudentSubmittedQuestionsView() {
  const [items, setItems] = useState<StudentSubmittedQuestionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authorLabel, setAuthorLabel] = useState("");
  const [postedAtLabel, setPostedAtLabel] = useState("");
  const [form, setForm] = useState<StudentSubmittedQuestionFormState>(createEmptyStudentSubmittedForm());
  const [search, setSearch] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isBusy = isLoading || isSaving;

  const loadList = useCallback(async (nextSearch: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextSearch.trim()) {
        params.set("search", nextSearch.trim());
      }
      const response = await fetch(`/api/student-submitted-questions?${params.toString()}`);
      const payload = (await response.json()) as {
        items?: StudentSubmittedQuestionListItem[];
        tableMissing?: boolean;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }
      setItems(payload.items ?? []);
      setTableMissing(Boolean(payload.tableMissing));
      if (payload.tableMissing && payload.message) {
        setError(payload.message);
      }
      return payload.items ?? [];
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyDetail = useCallback((detail: StudentSubmittedQuestionDetail) => {
    setSelectedId(detail.id);
    setAuthorLabel(formatSubmittedAuthor(detail));
    setPostedAtLabel(formatSubmittedDate(detail.createdAt));
    setForm(detailToStudentSubmittedForm(detail));
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch(`/api/student-submitted-questions?id=${encodeURIComponent(id)}`);
        const payload = (await response.json()) as {
          detail?: StudentSubmittedQuestionDetail;
          message?: string;
        };
        if (!response.ok || !payload.detail) {
          throw new Error(getApiErrorMessage(response.status, payload.message));
        }
        applyDetail(payload.detail);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "投稿問題の取得に失敗しました。");
      } finally {
        setIsLoading(false);
      }
    },
    [applyDetail],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadList, search]);

  function updateForm<K extends keyof StudentSubmittedQuestionFormState>(
    key: K,
    value: StudentSubmittedQuestionFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!selectedId) {
      return;
    }
    const validationError = validateStudentSubmittedForm(form);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/student-submitted-questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, ...form }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }
      setMessage(payload.message ?? "訂正を保存しました。");
      await loadList(search);
      await loadDetail(selectedId);
      setMessage(payload.message ?? "訂正を保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "訂正の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mcqTab">
      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}

      <div className="mcqBody">
        <section className="mcqListPanel" aria-label="投稿問題一覧">
          <div className="mcqListHeader">
            <h3 className="mcqPanelTitle">投稿問題一覧</h3>
            <span className="mcqCountBadge">{items.length}件</span>
          </div>
          <input
            className="mcqSearch"
            value={search}
            placeholder="検索：問題文 / 投稿者"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mcqListBody">
            {items.length === 0 ? (
              <p className="mcqEmpty">
                {tableMissing ? "テーブル未作成のため一覧を表示できません。" : "投稿された問題はありません。"}
              </p>
            ) : (
              items.map((item) => {
                const isActive = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mcqListItem${isActive ? " mcqListItemActive" : ""}`}
                    onClick={() => void loadDetail(item.id)}
                  >
                    <span className="mcqListItemTitle spqListItemTitle">{item.body}</span>
                    <span className="mcqListItemMeta">
                      {formatSubmittedAuthor(item)} · {formatSubmittedDate(item.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="mcqEditPanel" aria-label="投稿問題の確認と訂正">
          {isBusy ? <PortalLoadingOverlay /> : null}
          {selectedId ? (
            <>
              <div className="mcqEditHeader">
                <div>
                  <h3 className="mcqPanelTitle">投稿問題を確認・訂正</h3>
                  <p className="mcqEditHint">承認はありません。内容を確認し、必要なら訂正して保存してください。</p>
                </div>
              </div>

              <div className="spqMetaGrid">
                <label className="mcqField">
                  <span className="mcqFieldLabel">投稿者</span>
                  <span className="spqReadonly">{authorLabel}</span>
                </label>
                <label className="mcqField">
                  <span className="mcqFieldLabel">投稿日</span>
                  <span className="spqReadonly">{postedAtLabel}</span>
                </label>
                <label className="mcqField">
                  <span className="mcqFieldLabel">科目</span>
                  <input
                    className="mcqInput"
                    value={form.subjectLabel}
                    onChange={(event) => updateForm("subjectLabel", event.target.value)}
                  />
                </label>
              </div>

              <div className="mcqFormScroll">
                <p className="mcqPanelTitle">4択問題</p>
                <label className="mcqField">
                  <span className="mcqFieldLabel">問題文</span>
                  <textarea
                    className="mcqTextarea"
                    value={form.body}
                    onChange={(event) => updateForm("body", event.target.value)}
                  />
                </label>
                <div className="mcqChoiceGrid">
                  {(["choice1", "choice2", "choice3", "choice4"] as const).map((key, index) => (
                    <label key={key} className="mcqField">
                      <span className="mcqFieldLabel">選択肢{index + 1}</span>
                      <input
                        className="mcqInput"
                        value={form[key]}
                        onChange={(event) => updateForm(key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label className="mcqField">
                  <span className="mcqFieldLabel">正解</span>
                  <select
                    className="mcqInput"
                    value={form.correctIndex}
                    onChange={(event) => updateForm("correctIndex", event.target.value)}
                  >
                    <option value="0">選択肢1</option>
                    <option value="1">選択肢2</option>
                    <option value="2">選択肢3</option>
                    <option value="3">選択肢4</option>
                  </select>
                </label>
                <label className="mcqField">
                  <span className="mcqFieldLabel">解説</span>
                  <textarea
                    className="mcqTextarea"
                    value={form.explanation}
                    onChange={(event) => updateForm("explanation", event.target.value)}
                  />
                </label>
              </div>

              <div className="mcqEditFooter">
                <button
                  type="button"
                  className="mcqSaveBtn"
                  disabled={isBusy || tableMissing}
                  onClick={() => void handleSave()}
                >
                  訂正を保存
                </button>
              </div>
            </>
          ) : (
            <div className="mcqEditEmpty">左の一覧から投稿問題を選択してください。</div>
          )}
        </section>
      </div>
    </div>
  );
}
