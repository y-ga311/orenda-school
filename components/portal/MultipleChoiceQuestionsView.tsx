"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import type { QuestCatalogSubcategory, QuestCatalogSubject } from "@/lib/questCatalog";
import {
  createEmptyMultipleChoiceForm,
  detailToMultipleChoiceForm,
  downloadMultipleChoiceTemplate,
  formatCorrectAnswerLabel,
  formatMultipleChoiceRowErrors,
  groupMultipleChoiceListItems,
  validateMultipleChoiceTemplateSelection,
  type MultipleChoiceQuestionDetail,
  type MultipleChoiceQuestionFormState,
  type MultipleChoiceQuestionListItem,
  type MultipleChoiceRowError,
} from "@/lib/multipleChoiceQuestions";

type CatalogResponse = {
  catalog?: {
    subjects: QuestCatalogSubject[];
    subcategoriesBySubject: Record<string, QuestCatalogSubcategory[]>;
  };
  items?: MultipleChoiceQuestionListItem[];
  totalCount?: number;
  tableMissing?: boolean;
  message?: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return message ?? "問題が見つかりません。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function MultipleChoiceQuestionsView() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<QuestCatalogSubject[]>([]);
  const [subcategoriesBySubject, setSubcategoriesBySubject] = useState<
    Record<string, QuestCatalogSubcategory[]>
  >({});
  const [items, setItems] = useState<MultipleChoiceQuestionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<MultipleChoiceQuestionFormState>(createEmptyMultipleChoiceForm());
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importDetail, setImportDetail] = useState<string | null>(null);
  const [templateSubjectId, setTemplateSubjectId] = useState("");
  const [templateSubcategoryId, setTemplateSubcategoryId] = useState("");

  const isBusy = isLoading || isSaving || isDeleting || isImporting;

  const subcategoryOptions = useMemo(() => {
    if (subjectFilter === "all") {
      return [];
    }
    return subcategoriesBySubject[subjectFilter] ?? [];
  }, [subjectFilter, subcategoriesBySubject]);

  const formSubcategoryOptions = useMemo(() => {
    if (!form.subjectId) {
      return [];
    }
    return subcategoriesBySubject[form.subjectId] ?? [];
  }, [form.subjectId, subcategoriesBySubject]);

  const templateSubcategoryOptions = useMemo(() => {
    if (!templateSubjectId) {
      return [];
    }
    return subcategoriesBySubject[templateSubjectId] ?? [];
  }, [templateSubjectId, subcategoriesBySubject]);

  const canDownloadTemplate = Boolean(
    templateSubjectId && templateSubcategoryId && !validateMultipleChoiceTemplateSelection(
      templateSubjectId,
      templateSubcategoryId,
    ),
  );

  const groupedItems = useMemo(() => groupMultipleChoiceListItems(items), [items]);

  const selectedMeta = useMemo(() => {
    if (isNew) {
      return null;
    }
    return items.find((item) => item.id === selectedId) ?? null;
  }, [isNew, items, selectedId]);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (subjectFilter !== "all") {
        params.set("subjectId", subjectFilter);
      }
      if (subcategoryFilter !== "all") {
        params.set("subcategoryId", subcategoryFilter);
      }

      const response = await fetch(`/api/multiple-choice-questions?${params.toString()}`);
      const payload = (await response.json()) as CatalogResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSubjects(payload.catalog?.subjects ?? []);
      setSubcategoriesBySubject(payload.catalog?.subcategoriesBySubject ?? {});
      setItems(payload.items ?? []);
      setTableMissing(Boolean(payload.tableMissing));
      return payload.items ?? [];
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [search, subjectFilter, subcategoryFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/multiple-choice-questions?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as {
        detail?: MultipleChoiceQuestionDetail;
        message?: string;
      };

      if (!response.ok || !payload.detail) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setForm(detailToMultipleChoiceForm(payload.detail));
      setSelectedId(id);
      setIsNew(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "詳細の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (subjectFilter === "all") {
      setSubcategoryFilter("all");
    } else if (
      subcategoryFilter !== "all" &&
      !subcategoryOptions.some((item) => item.id === subcategoryFilter)
    ) {
      setSubcategoryFilter("all");
    }
  }, [subjectFilter, subcategoryFilter, subcategoryOptions]);

  useEffect(() => {
    if (isNew || selectedId) {
      return;
    }
    if (items.length > 0) {
      void loadDetail(items[0].id);
    }
  }, [isNew, items, loadDetail, selectedId]);

  function handleSelectItem(id: string) {
    void loadDetail(id);
  }

  function handleCreateNew() {
    const defaultSubject = subjectFilter !== "all" ? subjectFilter : subjects[0]?.id ?? "";
    const defaultSubcategory =
      subcategoryFilter !== "all"
        ? subcategoryFilter
        : subcategoriesBySubject[defaultSubject]?.[0]?.id ?? "";

    setSelectedId(null);
    setIsNew(true);
    setForm(createEmptyMultipleChoiceForm(defaultSubject, defaultSubcategory));
    setMessage(null);
    setError(null);
  }

  function updateForm<K extends keyof MultipleChoiceQuestionFormState>(
    key: K,
    value: MultipleChoiceQuestionFormState[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "subjectId" && value !== current.subjectId) {
        const firstSubcategory = subcategoriesBySubject[String(value)]?.[0]?.id ?? "";
        next.subcategoryId = firstSubcategory;
      }
      return next;
    });
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/multiple-choice-questions", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: selectedId }),
          subjectId: form.subjectId,
          subcategoryId: form.subcategoryId,
          body: form.body,
          choice1: form.choice1,
          choice2: form.choice2,
          choice3: form.choice3,
          choice4: form.choice4,
          correctIndex: form.correctIndex,
          explanation: form.explanation,
          nationalExamRound: form.nationalExamRound,
          nationalExamQuestionNo: form.nationalExamQuestionNo,
        }),
      });

      const payload = (await response.json()) as {
        detail?: MultipleChoiceQuestionDetail;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      await loadList();
      if (payload.detail) {
        setSelectedId(payload.detail.id);
        setIsNew(false);
        setForm(detailToMultipleChoiceForm(payload.detail));
      }
      setMessage(payload.message ?? "保存しました。");
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
    if (!window.confirm("この問題を削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/multiple-choice-questions?id=${encodeURIComponent(selectedId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSelectedId(null);
      setIsNew(false);
      setForm(createEmptyMultipleChoiceForm());
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

  async function handleImport(file: File) {
    setIsImporting(true);
    setError(null);
    setMessage(null);
    setImportDetail(null);

    try {
      const csvText = await file.text();
      const response = await fetch("/api/multiple-choice-questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });

      const payload = (await response.json()) as CatalogResponse & {
        importedCount?: number;
        rowErrors?: MultipleChoiceRowError[];
      };

      if (!response.ok) {
        if (payload.rowErrors?.length) {
          setImportDetail(formatMultipleChoiceRowErrors(payload.rowErrors));
        }
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSubjects(payload.catalog?.subjects ?? []);
      setSubcategoriesBySubject(payload.catalog?.subcategoriesBySubject ?? {});
      setItems(payload.items ?? []);
      setTableMissing(Boolean(payload.tableMissing));
      setMessage(payload.message ?? "インポートしました。");

      if ((payload.items ?? []).length > 0) {
        void loadDetail(payload.items![0].id);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSVインポートに失敗しました。");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDownloadTemplate() {
    const validationError = validateMultipleChoiceTemplateSelection(
      templateSubjectId,
      templateSubcategoryId,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    downloadMultipleChoiceTemplate(templateSubjectId, templateSubcategoryId);
  }

  return (
    <div className="mcqTab">
      <div className="mcqCsvBar">
        <div className="mcqCsvActions">
          <div className="mcqTemplateSelectors">
            <select
              className="mcqFilterSelect"
              value={templateSubjectId}
              onChange={(event) => {
                setTemplateSubjectId(event.target.value);
                setTemplateSubcategoryId("");
              }}
              disabled={isBusy}
              aria-label="テンプレートの科目"
            >
              <option value="">科目を選択</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
            <select
              className="mcqFilterSelect"
              value={templateSubcategoryId}
              onChange={(event) => setTemplateSubcategoryId(event.target.value)}
              disabled={isBusy || !templateSubjectId}
              aria-label="テンプレートの中分類"
            >
              <option value="">中分類を選択</option>
              {templateSubcategoryOptions.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="mcqSecondaryBtn"
            onClick={handleDownloadTemplate}
            disabled={isBusy || !canDownloadTemplate}
          >
            ↓ テンプレートダウンロード
          </button>
          <button
            type="button"
            className="mcqSecondaryBtn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            {isImporting ? "インポート中..." : "↑ CSVインポート"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="mcqFileInput"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImport(file);
              }
            }}
          />
        </div>
      </div>

      {tableMissing ? (
        <p className="mcqWarning">
          quest_questions テーブルが未作成です。docs/sql/create-quest-questions-tables.sql と
          seed-quest-catalog.sql を実行してください。
        </p>
      ) : null}

      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}
      {importDetail ? <pre className="mcqImportDetail">{importDetail}</pre> : null}

      <div className="mcqBody">
        <aside className="mcqListPanel">
          <div className="mcqListHeader">
            <h3 className="mcqPanelTitle">登録済み問題</h3>
            <span className="mcqCountBadge">全{items.length}問</span>
          </div>

          <div className="mcqListFilters">
            <input
              className="mcqSearch"
              type="search"
              placeholder="検索：問題文・選択肢・科目・中分類"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="mcqFilterSelect"
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
            >
              <option value="all">科目</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
            <select
              className="mcqFilterSelect"
              value={subcategoryFilter}
              onChange={(event) => setSubcategoryFilter(event.target.value)}
              disabled={subjectFilter === "all"}
            >
              <option value="all">中分類</option>
              {subcategoryOptions.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mcqListBody">
            {isLoading && items.length === 0 ? (
              <p className="mcqEmpty">読み込み中...</p>
            ) : groupedItems.length === 0 ? (
              <p className="mcqEmpty">登録済みの問題がありません。</p>
            ) : (
              groupedItems.map((group) => {
                const groupKey = `${group.subjectId}::${group.subcategoryId}`;
                const collapsed = collapsedGroups.has(groupKey);
                return (
                  <section key={groupKey} className="mcqGroup">
                    <button
                      type="button"
                      className="mcqGroupHeader"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <span>{collapsed ? "▶" : "▼"} {group.subcategoryLabel}</span>
                      <span className="mcqGroupCount">{group.items.length}問</span>
                    </button>
                    {!collapsed ? (
                      <div className="mcqGroupItems">
                        {group.items.map((item) => {
                          const isActive = item.id === selectedId && !isNew;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`mcqListItem${isActive ? " mcqListItemActive" : ""}`}
                              onClick={() => handleSelectItem(item.id)}
                            >
                              <span className="mcqListItemTitle">{item.body}</span>
                              <span className="mcqListItemMeta">
                                {item.nationalExamLabel ? `${item.nationalExamLabel} · ` : ""}
                                正解{item.correctLabel}
                                {item.updatedAtLabel ? ` · 更新 ${item.updatedAtLabel}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
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
            label={isImporting ? "インポート中..." : isSaving ? "保存中..." : undefined}
          />

          <div className="mcqEditHeader">
            <div>
              <h3 className="mcqPanelTitle">{isNew ? "問題を新規作成" : "問題を編集"}</h3>
              <p className="mcqEditHint">選択した問題の内容を確認・編集できます。</p>
            </div>
            {selectedMeta ? (
              <p className="mcqEditMeta">
                ID: {selectedMeta.displayId}
                {selectedMeta.nationalExamLabel ? ` · ${selectedMeta.nationalExamLabel}` : ""}
                {selectedMeta.updatedAt
                  ? ` · 最終更新 ${new Date(selectedMeta.updatedAt).toLocaleDateString("ja-JP")}`
                  : ""}
              </p>
            ) : null}
          </div>

          {!isNew && !selectedId && items.length === 0 ? (
            <div className="mcqEditEmpty">左の一覧から問題を選択するか、新規作成してください。</div>
          ) : (
            <>
              <div className="mcqFormScroll">
                <label className="mcqField">
                  <span className="mcqFieldLabel">問題文</span>
                  <textarea
                    className="mcqTextarea"
                    value={form.body}
                    onChange={(event) => updateForm("body", event.target.value)}
                    disabled={isBusy}
                  />
                </label>

                <div className="mcqChoiceGrid">
                  {(["choice1", "choice2", "choice3", "choice4"] as const).map((key, index) => (
                    <label key={key} className="mcqField">
                      <span className="mcqFieldLabel">選択肢{index + 1}</span>
                      <input
                        className="mcqInput"
                        type="text"
                        value={form[key]}
                        onChange={(event) => updateForm(key, event.target.value)}
                        disabled={isBusy}
                      />
                    </label>
                  ))}
                </div>

                <div className="mcqMetaGrid">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">科目</span>
                    <select
                      className="mcqInput"
                      value={form.subjectId}
                      onChange={(event) => updateForm("subjectId", event.target.value)}
                      disabled={isBusy}
                    >
                      <option value="">選択してください</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mcqField">
                    <span className="mcqFieldLabel">中分類</span>
                    <select
                      className="mcqInput"
                      value={form.subcategoryId}
                      onChange={(event) => updateForm("subcategoryId", event.target.value)}
                      disabled={isBusy || !form.subjectId}
                    >
                      <option value="">選択してください</option>
                      {formSubcategoryOptions.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.id}>
                          {subcategory.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mcqMetaGrid">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">国家試験回数</span>
                    <input
                      className="mcqInput"
                      type="text"
                      inputMode="numeric"
                      placeholder="例: 115"
                      value={form.nationalExamRound}
                      onChange={(event) => updateForm("nationalExamRound", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                  <label className="mcqField">
                    <span className="mcqFieldLabel">問番号</span>
                    <input
                      className="mcqInput"
                      type="text"
                      inputMode="numeric"
                      placeholder="例: 42"
                      value={form.nationalExamQuestionNo}
                      onChange={(event) =>
                        updateForm("nationalExamQuestionNo", event.target.value)
                      }
                      disabled={isBusy}
                    />
                  </label>
                </div>
                <p className="mcqFieldHint">
                  国家試験の出典がある場合のみ入力してください（例: 第115回 問42）。回数と問番号はセットで入力します。
                </p>

                <div className="mcqMetaGrid">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">正解</span>
                    <select
                      className="mcqInput"
                      value={form.correctIndex}
                      onChange={(event) => updateForm("correctIndex", event.target.value)}
                      disabled={isBusy}
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <option key={index} value={String(index)}>
                          選択肢{index + 1}（{formatCorrectAnswerLabel(index)}）
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mcqField">
                  <span className="mcqFieldLabel">解説</span>
                  <textarea
                    className="mcqTextarea mcqTextareaLarge"
                    value={form.explanation}
                    onChange={(event) => updateForm("explanation", event.target.value)}
                    disabled={isBusy}
                  />
                </label>
              </div>

              <div className="mcqEditFooter">
                {!isNew && selectedId ? (
                  <button
                    type="button"
                    className="mcqDeleteBtn"
                    onClick={() => void handleDelete()}
                    disabled={isBusy}
                  >
                    削除
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="mcqSaveBtn"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                >
                  {isSaving ? "保存中..." : "変更を保存"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
