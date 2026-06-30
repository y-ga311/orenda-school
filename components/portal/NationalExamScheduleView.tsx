"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  createEmptyNationalExamScheduleForm,
  detailToNationalExamScheduleForm,
  type NationalExamScheduleDetail,
  type NationalExamScheduleFormState,
  type NationalExamScheduleListItem,
} from "@/lib/nationalExamSchedule";

type ListResponse = {
  items?: NationalExamScheduleListItem[];
  classNames?: string[];
  tableMissing?: boolean;
  message?: string;
};

type DetailResponse = {
  detail?: NationalExamScheduleDetail;
  message?: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return message ?? "日程が見つかりません。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function NationalExamScheduleView() {
  const [items, setItems] = useState<NationalExamScheduleListItem[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<NationalExamScheduleFormState>(
    createEmptyNationalExamScheduleForm(),
  );
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

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/national-exam-schedules?${params.toString()}`);
      const payload = (await response.json()) as ListResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setItems(payload.items ?? []);
      setClassNames(payload.classNames ?? []);
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
      const response = await fetch(`/api/national-exam-schedules?id=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as DetailResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }
      if (!payload.detail) {
        throw new Error("日程が見つかりません。");
      }

      setSelectedId(payload.detail.id);
      setIsNew(false);
      setForm(detailToNationalExamScheduleForm(payload.detail));
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
    setForm(createEmptyNationalExamScheduleForm());
    setError(null);
    setMessage(null);
  }

  function handleSelectItem(id: string) {
    setError(null);
    setMessage(null);
    void loadDetail(id);
  }

  function updateFormField<K extends keyof NationalExamScheduleFormState>(
    key: K,
    value: NationalExamScheduleFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/national-exam-schedules", {
        method: isNew || !selectedId ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId ?? undefined,
          className: form.className,
          examDate: form.examDate,
          isActive: form.isActive,
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
        setForm(detailToNationalExamScheduleForm(payload.detail));
      }
      setMessage(payload.message ?? "日程を保存しました。");
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
    if (!window.confirm("この日程を削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/national-exam-schedules?id=${encodeURIComponent(selectedId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSelectedId(null);
      setIsNew(false);
      setForm(createEmptyNationalExamScheduleForm());
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
    <div className="nesTab">
      {tableMissing ? (
        <p className="mcqWarning">
          national_exam_schedules テーブルが未作成です。
          docs/sql/create-national-exam-schedules-table.sql を実行してください。
        </p>
      ) : null}

      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}

      <div className="mcqBody">
        <aside className="mcqListPanel">
          <div className="mcqListHeader">
            <h3 className="mcqPanelTitle">登録済み日程</h3>
            <span className="mcqCountBadge">全{items.length}件</span>
          </div>

          <div className="mcqListFilters">
            <input
              className="mcqSearch"
              type="search"
              placeholder="検索：クラス名 / 実施日"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mcqListBody">
            {isLoading && items.length === 0 ? (
              <p className="mcqEmpty">読み込み中...</p>
            ) : items.length === 0 ? (
              <p className="mcqEmpty">登録済みの日程がありません。</p>
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
                    <span className="mcqListItemTitle">{item.className}</span>
                    <span className="mcqListItemMeta">
                      {item.listSubtitle}
                      {" · "}
                      <span
                        className={`nesStatusBadge nesStatusBadge${item.isActive ? "Active" : "Inactive"}`}
                      >
                        {item.statusLabel}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button type="button" className="mcqCreateBtn" onClick={handleCreateNew} disabled={isBusy}>
            ＋ 新規日程登録
          </button>
        </aside>

        <section className="mcqEditPanel">
          <PortalLoadingOverlay
            active={isBusy}
            label={isSaving ? "保存中..." : isDeleting ? "削除中..." : undefined}
          />

          <div className="mcqEditHeader">
            <div>
              <h3 className="mcqPanelTitle">{isNew ? "日程を新規登録" : "日程を編集"}</h3>
              <p className="mcqEditHint">国家試験の日程を登録・編集できます。</p>
            </div>
            {selectedMeta ? (
              <p className="mcqEditMeta">
                ID: {selectedMeta.displayId}
                {" · "}
                {selectedMeta.statusLabel}
                {selectedMeta.updatedAt
                  ? ` · 最終更新 ${new Date(selectedMeta.updatedAt).toLocaleDateString("ja-JP")}`
                  : ""}
              </p>
            ) : null}
          </div>

          {!isNew && !selectedId && items.length === 0 ? (
            <div className="mcqEditEmpty">左の一覧から日程を選択するか、新規登録してください。</div>
          ) : !isNew && !selectedId ? (
            <div className="mcqEditEmpty">左の一覧から日程を選択してください。</div>
          ) : (
            <>
              <div className="mcqFormScroll">
                <label className="mcqField">
                  <span className="mcqFieldLabel">対象クラス</span>
                  <span className="mcqFieldHint">
                    students.class と完全一致する値を指定してください（Orenda が照合に使用）
                  </span>
                  <input
                    className="mcqInput"
                    type="text"
                    list="national-exam-class-names"
                    value={form.className}
                    onChange={(event) => updateFormField("className", event.target.value)}
                    placeholder="例: 25期生昼間部"
                    disabled={isBusy}
                  />
                  <datalist id="national-exam-class-names">
                    {classNames.map((className) => (
                      <option key={className} value={className} />
                    ))}
                  </datalist>
                </label>

                <div className="mcqMetaGrid">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">実施日</span>
                    <input
                      className="mcqInput"
                      type="date"
                      value={form.examDate}
                      onChange={(event) => updateFormField("examDate", event.target.value)}
                      disabled={isBusy}
                    />
                  </label>

                  <label className="mcqField nesActiveField">
                    <span className="mcqFieldLabel">有効</span>
                    <label className="nesActiveToggle">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(event) => updateFormField("isActive", event.target.checked)}
                        disabled={isBusy}
                      />
                      <span>{form.isActive ? "有効（学生アプリに反映）" : "無効"}</span>
                    </label>
                  </label>
                </div>
              </div>

              <div className="mcqEditFooter">
                <button
                  type="button"
                  className="mcqSaveBtn"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                >
                  変更を保存
                </button>
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
