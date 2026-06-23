"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  countFilledTeacherQuestQuestions,
  createEmptyTeacherQuestForm,
  detailToTeacherQuestForm,
  formatTeacherQuestDateLabel,
  TEACHER_QUEST_MAX_QUESTIONS,
  type TeacherQuestDetail,
  type TeacherQuestFormState,
  type TeacherQuestListItem,
  type TeacherQuestQuestionFormState,
  type TeacherQuestStatus,
  type TeacherQuestTeacherOption,
} from "@/lib/teacherQuest";

type ListResponse = {
  items?: TeacherQuestListItem[];
  teachers?: TeacherQuestTeacherOption[];
  tableMissing?: boolean;
  message?: string;
};

type DetailResponse = {
  detail?: TeacherQuestDetail;
  message?: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return message ?? "クエストが見つかりません。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

const CHOICE_LABELS = ["A", "B", "C", "D"] as const;

export function TeacherQuestView() {
  const [items, setItems] = useState<TeacherQuestListItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherQuestTeacherOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherQuestFormState>(createEmptyTeacherQuestForm());
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isBusy = isLoading || isSaving || isDeleting;

  const selectedMeta = useMemo(() => {
    if (isNew) {
      return null;
    }
    return items.find((item) => item.id === selectedId) ?? null;
  }, [isNew, items, selectedId]);

  const filledCount = useMemo(() => countFilledTeacherQuestQuestions(form.questions), [form.questions]);
  const activeQuestion = form.questions[activeQuestionIndex];

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/teacher-quests?${params.toString()}`);
      const payload = (await response.json()) as ListResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setItems(payload.items ?? []);
      setTeachers(payload.teachers ?? []);
      setTableMissing(Boolean(payload.tableMissing));
      return payload.items ?? [];
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  const loadDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/teacher-quests?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as DetailResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }
      if (!payload.detail) {
        throw new Error("クエストが見つかりません。");
      }

      setSelectedId(payload.detail.id);
      setIsNew(false);
      setForm(detailToTeacherQuestForm(payload.detail));
      setActiveQuestionIndex(0);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "詳細の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  function handleCreateNew() {
    setSelectedId(null);
    setIsNew(true);
    setForm(createEmptyTeacherQuestForm());
    setActiveQuestionIndex(0);
    setError(null);
    setMessage(null);
  }

  function handleSelectItem(id: string) {
    setError(null);
    setMessage(null);
    void loadDetail(id);
  }

  function updateFormField<K extends keyof Omit<TeacherQuestFormState, "questions">>(
    key: K,
    value: TeacherQuestFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateQuestionField<K extends keyof TeacherQuestQuestionFormState>(
    key: K,
    value: TeacherQuestQuestionFormState[K],
  ) {
    setForm((current) => {
      const questions = [...current.questions];
      questions[activeQuestionIndex] = {
        ...questions[activeQuestionIndex],
        [key]: value,
      };
      return { ...current, questions };
    });
  }

  async function handleSave(nextStatus: TeacherQuestStatus) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/teacher-quests", {
        method: isNew || !selectedId ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId ?? undefined,
          title: form.title,
          teacherEmployeeNumber: form.teacherEmployeeNumber,
          publishDate: form.publishDate,
          endDate: form.endDate,
          status: nextStatus,
          questions: form.questions,
        }),
      });

      const payload = (await response.json()) as DetailResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      await loadList();
      if (payload.detail) {
        setSelectedId(payload.detail.id);
        setIsNew(false);
        setForm(detailToTeacherQuestForm(payload.detail));
      }
      setMessage(payload.message ?? "クエストを保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || isNew) {
      return;
    }
    if (!window.confirm("このクエストを削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/teacher-quests?id=${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSelectedId(null);
      setIsNew(false);
      setForm(createEmptyTeacherQuestForm());
      const nextItems = await loadList();
      if (nextItems.length > 0) {
        void loadDetail(nextItems[0].id);
      }
      setMessage(payload.message ?? "削除しました。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="tqTab">
      {tableMissing ? (
        <p className="mcqWarning">
          teacher_quests テーブルが未作成です。docs/sql/create-teacher-quests-tables.sql を実行してください。
        </p>
      ) : null}

      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}

      <div className="mcqBody">
        <aside className="mcqListPanel">
          <div className="mcqListHeader">
            <h3 className="mcqPanelTitle">登録済みクエスト</h3>
            <span className="mcqCountBadge">全{items.length}件</span>
          </div>

          <div className="mcqListFilters">
            <input
              className="mcqSearch"
              type="search"
              placeholder="検索：クエスト名・教員名"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mcqListBody">
            {isLoading && items.length === 0 ? (
              <p className="mcqEmpty">読み込み中...</p>
            ) : items.length === 0 ? (
              <p className="mcqEmpty">登録済みのクエストがありません。</p>
            ) : (
              items.map((item) => {
                const isActive = item.id === selectedId && !isNew;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mcqListItem${isActive ? " mcqListItemActive" : ""}`}
                    onClick={() => handleSelectItem(item.id)}
                  >
                    <span className="mcqListItemTitle">{item.title}</span>
                    <span className="mcqListItemMeta">
                      {item.publishDateLabel} 〜 {formatTeacherQuestDateLabel(item.endDate)}
                      {" · "}
                      {item.teacherName}
                      {" · "}
                      <span className={`tqStatusBadge tqStatusBadge${item.status === "published" ? "Published" : "Draft"}`}>
                        {item.statusLabel}
                      </span>
                      {" · "}
                      {item.questionCountLabel}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button type="button" className="mcqCreateBtn" onClick={handleCreateNew} disabled={isBusy}>
            ＋ 新規作成
          </button>
        </aside>

        <section className="mcqEditPanel">
          <PortalLoadingOverlay
            active={isBusy}
            label={isSaving ? "保存中..." : isDeleting ? "削除中..." : undefined}
          />

          <div className="mcqEditHeader">
            <div>
              <h3 className="mcqPanelTitle">{isNew ? "クエストを新規作成" : "クエストを編集"}</h3>
              <p className="mcqEditHint">最大5問の4択問題を登録できます。</p>
            </div>
            {selectedMeta ? (
              <p className="mcqEditMeta">
                {selectedMeta.statusLabel}
                {" · "}
                {selectedMeta.questionCountLabel}
                {selectedMeta.updatedAt
                  ? ` · 最終更新 ${new Date(selectedMeta.updatedAt).toLocaleDateString("ja-JP")}`
                  : ""}
              </p>
            ) : null}
          </div>

          {!isNew && !selectedId && items.length === 0 ? (
            <div className="mcqEditEmpty">左の一覧からクエストを選択するか、新規作成してください。</div>
          ) : !isNew && !selectedId ? (
            <div className="mcqEditEmpty">左の一覧からクエストを選択してください。</div>
          ) : (
            <>
              <div className="mcqFormScroll">
                <label className="mcqField">
                  <span className="mcqFieldLabel">クエスト名</span>
                  <input
                    className="mcqInput"
                    type="text"
                    value={form.title}
                    onChange={(event) => updateFormField("title", event.target.value)}
                    disabled={isBusy}
                  />
                </label>

                <div className="mcqMetaGrid">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">作成教員</span>
                    <select
                      className="mcqInput"
                      value={form.teacherEmployeeNumber}
                      onChange={(event) => updateFormField("teacherEmployeeNumber", event.target.value)}
                      disabled={isBusy}
                    >
                      <option value="">選択してください</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.employeeNumber} value={teacher.employeeNumber}>
                          {teacher.name}（{teacher.employeeNumber}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mcqField">
                    <span className="mcqFieldLabel">公開日</span>
                    <input
                      className="mcqInput"
                      type="date"
                      value={form.publishDate}
                      onChange={(event) => updateFormField("publishDate", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                  <label className="mcqField">
                    <span className="mcqFieldLabel">終了日</span>
                    <input
                      className="mcqInput"
                      type="date"
                      value={form.endDate}
                      onChange={(event) => updateFormField("endDate", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                </div>

                <div className="tqQuestionSection">
                  <div className="tqQuestionSectionHeader">
                    <span className="mcqFieldLabel">問題</span>
                    <span className="tqProgressBadge">
                      {filledCount} / {TEACHER_QUEST_MAX_QUESTIONS}問 入力中
                    </span>
                  </div>

                  <div className="tqQuestionTabs" role="tablist" aria-label="問題タブ">
                    {form.questions.map((question, index) => {
                      const isActive = index === activeQuestionIndex;
                      const isFilled = Boolean(
                        question.body.trim() ||
                          question.choice1.trim() ||
                          question.choice2.trim() ||
                          question.choice3.trim() ||
                          question.choice4.trim(),
                      );
                      return (
                        <button
                          key={`question-tab-${index}`}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`tqQuestionTab${isActive ? " tqQuestionTabActive" : ""}${isFilled ? " tqQuestionTabFilled" : ""}`}
                          onClick={() => setActiveQuestionIndex(index)}
                          disabled={isBusy}
                        >
                          問題{index + 1}
                        </button>
                      );
                    })}
                  </div>

                  <label className="mcqField">
                    <span className="mcqFieldLabel">問題文</span>
                    <textarea
                      className="mcqTextarea"
                      value={activeQuestion.body}
                      onChange={(event) => updateQuestionField("body", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>

                  <div className="mcqChoiceGrid">
                    {(["choice1", "choice2", "choice3", "choice4"] as const).map((key, index) => (
                      <label key={key} className="mcqField">
                        <span className="mcqFieldLabel">選択肢{CHOICE_LABELS[index]}</span>
                        <input
                          className="mcqInput"
                          type="text"
                          value={activeQuestion[key]}
                          onChange={(event) => updateQuestionField(key, event.target.value)}
                          disabled={isBusy}
                        />
                      </label>
                    ))}
                  </div>

                  <label className="mcqField">
                    <span className="mcqFieldLabel">正解</span>
                    <select
                      className="mcqInput"
                      value={activeQuestion.correctIndex}
                      onChange={(event) => updateQuestionField("correctIndex", event.target.value)}
                      disabled={isBusy}
                    >
                      <option value="0">A</option>
                      <option value="1">B</option>
                      <option value="2">C</option>
                      <option value="3">D</option>
                    </select>
                  </label>

                  <label className="mcqField">
                    <span className="mcqFieldLabel">解説</span>
                    <textarea
                      className="mcqTextarea mcqTextareaLarge"
                      value={activeQuestion.explanation}
                      onChange={(event) => updateQuestionField("explanation", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                </div>
              </div>

              <div className="mcqEditFooter tqEditFooter">
                <div className="tqSaveActions">
                  <button
                    type="button"
                    className="mcqSecondaryBtn"
                    onClick={() => void handleSave("draft")}
                    disabled={isBusy}
                  >
                    下書き保存
                  </button>
                  <button
                    type="button"
                    className="mcqSaveBtn"
                    onClick={() => void handleSave("published")}
                    disabled={isBusy}
                  >
                    公開して保存
                  </button>
                </div>
                {!isNew && selectedId ? (
                  <button
                    type="button"
                    className="mcqDeleteBtn"
                    onClick={() => void handleDelete()}
                    disabled={isBusy}
                  >
                    削除
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}