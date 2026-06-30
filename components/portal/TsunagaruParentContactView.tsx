"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  NOTICE_FILE_INPUT_ACCEPT,
  detectNoticeAttachmentKind,
  inferNoticeFileType,
  validateNoticeAttachmentFile,
} from "@/lib/noticeAttachment";
import {
  PARENT_NOTICE_TARGET_TYPE_OPTIONS,
  createEmptyParentAnnouncementForm,
  detailToParentAnnouncementForm,
  getNoticeAttachmentFileName,
  getNoticeAttachmentLabel,
  type NoticeTargetTypeUi,
  type ParentAnnouncementDetail,
  type ParentAnnouncementFormState,
  type ParentAnnouncementListItem,
} from "@/lib/parentPortalAnnouncement";

type ListResponse = {
  items?: ParentAnnouncementListItem[];
  classNames?: string[];
  tableMissing?: boolean;
  message?: string;
};

type DetailResponse = {
  detail?: ParentAnnouncementDetail;
  message?: string;
};

type UploadResponse = {
  imageUrl?: string | null;
  pdfUrl?: string | null;
  fileType?: string | null;
  fileName?: string;
  message?: string;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return message ?? "お知らせが見つかりません。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

async function readApiJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function getEmptyResponseMessage(response: Response) {
  if (response.status === 401) {
    return "ログインが必要です。再度ログインしてください。";
  }
  return `サーバーから不正な応答が返されました（HTTP ${response.status}）。`;
}

export function TsunagaruParentContactView() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ParentAnnouncementListItem[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ParentAnnouncementFormState>(
    createEmptyParentAnnouncementForm(),
  );
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isSaving = isPublishing || isDeleting;
  const isEditPanelBusy = isLoadingDetail || isSaving;
  const showEditForm = isNew || Boolean(selectedId);

  const selectedMeta = useMemo(() => {
    if (isNew) {
      return null;
    }
    return items.find((item) => item.id === selectedId) ?? null;
  }, [isNew, items, selectedId]);

  const effectiveFileType = useMemo(() => {
    if (form.pendingFile) {
      return detectNoticeAttachmentKind(form.pendingFile) ?? "";
    }
    return inferNoticeFileType(form.imageUrl, form.pdfUrl, selectedMeta?.fileType ?? null);
  }, [form.imageUrl, form.pdfUrl, form.pendingFile, selectedMeta?.fileType]);

  const attachmentLabel = getNoticeAttachmentLabel(effectiveFileType);
  const attachmentFileName = getNoticeAttachmentFileName(
    effectiveFileType,
    form.imageUrl || selectedMeta?.imageUrl || null,
    form.pdfUrl || selectedMeta?.pdfUrl || null,
    form.pendingFile?.name ?? null,
  );

  const loadList = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/parent-portal-announcements?${params.toString()}`);
      const payload = await readApiJson<ListResponse>(response);

      if (!payload) {
        throw new Error(getEmptyResponseMessage(response));
      }

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
      setIsLoadingList(false);
    }
  }, [search]);

  const loadDetail = useCallback(async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(`/api/parent-portal-announcements?id=${encodeURIComponent(id)}`);
      const payload = await readApiJson<DetailResponse>(response);

      if (!payload) {
        throw new Error(getEmptyResponseMessage(response));
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }
      if (!payload.detail) {
        throw new Error("お知らせが見つかりません。");
      }

      setSelectedId(payload.detail.id);
      setIsNew(false);
      setForm(detailToParentAnnouncementForm(payload.detail));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "詳細の取得に失敗しました。");
    } finally {
      setIsLoadingDetail(false);
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
    setForm(createEmptyParentAnnouncementForm());
    setError(null);
    setMessage(null);
  }

  function handleSelectItem(id: string) {
    setError(null);
    setMessage(null);
    void loadDetail(id);
  }

  function updateFormField<K extends keyof ParentAnnouncementFormState>(
    key: K,
    value: ParentAnnouncementFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleAttachmentSelect(file: File) {
    const validationError = validateNoticeAttachmentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setForm((current) => ({
      ...current,
      pendingFile: file,
      imageUrl: "",
      pdfUrl: "",
    }));
  }

  function handleRemoveAttachment() {
    setForm((current) => ({
      ...current,
      pendingFile: null,
      imageUrl: "",
      pdfUrl: "",
    }));
  }

  async function uploadPendingAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/parent-portal-announcements/upload", {
      method: "POST",
      body: formData,
    });
    const payload = await readApiJson<UploadResponse>(response);

    if (!payload) {
      throw new Error(getEmptyResponseMessage(response));
    }
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response.status, payload.message));
    }

    return payload;
  }

  async function handlePublish() {
    setIsPublishing(true);
    setError(null);
    setMessage(null);

    try {
      let imageUrl: string | null = form.imageUrl.trim() || null;
      let pdfUrl: string | null = form.pdfUrl.trim() || null;
      let fileType: string | null = inferNoticeFileType(imageUrl, pdfUrl, null) || null;

      if (form.pendingFile) {
        const uploaded = await uploadPendingAttachment(form.pendingFile);
        imageUrl = uploaded.imageUrl ?? null;
        pdfUrl = uploaded.pdfUrl ?? null;
        fileType = uploaded.fileType ?? null;
      } else if (!imageUrl && !pdfUrl) {
        imageUrl = null;
        pdfUrl = null;
        fileType = null;
      }

      const response = await fetch("/api/parent-portal-announcements", {
        method: isNew || !selectedId ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId ?? undefined,
          title: form.title,
          targetClass: form.targetClass,
          targetType: form.targetType,
          content: form.content,
          imageUrl,
          pdfUrl,
          fileType,
          publish: true,
        }),
      });

      const payload = await readApiJson<DetailResponse>(response);

      if (!payload) {
        throw new Error(getEmptyResponseMessage(response));
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      await loadList();
      if (payload.detail) {
        setSelectedId(payload.detail.id);
        setIsNew(false);
        setForm(detailToParentAnnouncementForm(payload.detail));
      }
      setMessage(payload.message ?? "お知らせを公開しました。");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "公開に失敗しました。");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || isNew) {
      return;
    }
    if (!window.confirm("このお知らせを削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/parent-portal-announcements?id=${encodeURIComponent(selectedId)}`,
        { method: "DELETE" },
      );
      const payload = await readApiJson<{ message?: string }>(response);

      if (!payload) {
        throw new Error(getEmptyResponseMessage(response));
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setSelectedId(null);
      setIsNew(false);
      setForm(createEmptyParentAnnouncementForm());
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
    <div className="tpcPage">
      <header className="tpcHeader">
        <div>
          <h1 className="tpcTitle">つながるポータル保護者連絡</h1>
          <p className="tpcSubtitle">保護者向けポータルへの連絡・お知らせ管理</p>
        </div>
      </header>

      {tableMissing ? (
        <p className="mcqWarning">
          notice テーブルまたは必要なカラムが未作成です。docs/sql/create-notice-table.sql
          を参考に、title / content / target_type / target_class / image_url / pdf_url /
          file_type を確認してください。
        </p>
      ) : null}

      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}

      <section className="tpcWorkspace">
        <div className="tpcSectionIntro">
          <h2 className="tpcSectionTitle">保護者向けお知らせ</h2>
          <p className="tpcSectionHint">保護者ポータルに配信するお知らせを作成・編集できます。</p>
        </div>

        <div className="mcqBody">
          <aside className="mcqListPanel">
            <div className="mcqListHeader">
              <h3 className="mcqPanelTitle">登録済み</h3>
              <span className="mcqCountBadge">全{items.length}件</span>
            </div>

            <div className="tpcListFilters">
              <input
                className="mcqSearch tpcSearch"
                type="search"
                placeholder="検索：タイトル / 対象クラス"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="mcqListBody">
              {isLoadingList && items.length === 0 ? (
                <p className="mcqEmpty">読み込み中...</p>
              ) : items.length === 0 ? (
                <p className="mcqEmpty">登録済みのお知らせがありません。</p>
              ) : (
                items.map((item) => {
                  const isActive = item.id === selectedId && !isNew;
                  const itemAttachmentLabel = getNoticeAttachmentLabel(item.fileType);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`mcqListItem tpcListItem${isActive ? " mcqListItemActive" : ""}`}
                      onClick={() => handleSelectItem(item.id)}
                    >
                      <span className="tpcListItemTop">
                        <span className="mcqListItemTitle">{item.title}</span>
                        {itemAttachmentLabel ? (
                          <span
                            className={`tpcAttachmentBadge tpcAttachmentBadge${item.fileType === "pdf" ? "Pdf" : "Image"}`}
                          >
                            {itemAttachmentLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="mcqListItemMeta">
                        {item.targetType} · {item.listSubtitle}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="mcqCreateBtn"
              onClick={handleCreateNew}
              disabled={isSaving}
            >
              ＋ 新規お知らせ作成
            </button>
          </aside>

          <section className="mcqEditPanel">
            <PortalLoadingOverlay
              active={isEditPanelBusy}
              label={isPublishing ? "公開中..." : isDeleting ? "削除中..." : undefined}
            />

            <div className="mcqEditHeader">
              <div>
                <h3 className="mcqPanelTitle">{isNew ? "お知らせを新規作成" : "お知らせを編集"}</h3>
                <p className="mcqEditHint">
                  選択したお知らせの内容を確認・編集し、保護者ポータルへ配信できます。
                </p>
              </div>
              {selectedMeta ? (
                <p className="mcqEditMeta">
                  ID: {selectedMeta.displayId}
                  {" · "}
                  最終更新{" "}
                  {selectedMeta.updatedAt
                    ? new Date(selectedMeta.updatedAt).toLocaleDateString("ja-JP")
                    : "—"}
                </p>
              ) : null}
            </div>

            {!showEditForm ? (
              <div className="mcqEditEmpty">
                左の一覧からお知らせを選択するか、「＋ 新規お知らせ作成」を押してください。
              </div>
            ) : (
              <>
                <div className="mcqFormScroll">
                  <label className="mcqField">
                    <span className="mcqFieldLabel">タイトル</span>
                    <input
                      className="mcqInput"
                      type="text"
                      value={form.title}
                      onChange={(event) => updateFormField("title", event.target.value)}
                      placeholder="例: 【重要】定期試験の日程について"
                      disabled={isEditPanelBusy}
                    />
                  </label>

                  <div className="mcqMetaGrid">
                    <label className="mcqField">
                      <span className="mcqFieldLabel">対象クラス</span>
                      <select
                        className="mcqInput"
                        value={form.targetClass}
                        onChange={(event) => updateFormField("targetClass", event.target.value)}
                        disabled={isEditPanelBusy}
                      >
                        <option value="">全クラス</option>
                        {classNames.map((className) => (
                          <option key={className} value={className}>
                            {className}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="mcqField">
                      <span className="mcqFieldLabel">対象者</span>
                      <select
                        className="mcqInput"
                        value={form.targetType}
                        onChange={(event) =>
                          updateFormField("targetType", event.target.value as NoticeTargetTypeUi)
                        }
                        disabled={isEditPanelBusy}
                      >
                        {PARENT_NOTICE_TARGET_TYPE_OPTIONS.map((targetType) => (
                          <option key={targetType} value={targetType}>
                            {targetType}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mcqField">
                    <span className="mcqFieldLabel">本文</span>
                    <textarea
                      className="mcqTextarea mcqTextareaLarge"
                      value={form.content}
                      onChange={(event) => updateFormField("content", event.target.value)}
                      placeholder="お知らせの本文を入力してください。"
                      disabled={isEditPanelBusy}
                    />
                  </label>

                  <div className="tpcAttachmentSection">
                    <span className="mcqFieldLabel">添付ファイル</span>
                    <p className="tpcAttachmentHint">
                      画像（JPG / PNG）または PDF を添付できます。種別は自動判定されます。
                    </p>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={NOTICE_FILE_INPUT_ACCEPT}
                      className="tpcAttachmentFileInput"
                      disabled={isEditPanelBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) {
                          handleAttachmentSelect(file);
                        }
                      }}
                    />

                    <button
                      type="button"
                      className="tpcAttachmentDropzone"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isEditPanelBusy}
                    >
                      <span className="tpcAttachmentDropzoneLabel">＋ ファイルを選択</span>
                      <span className="tpcAttachmentDropzoneMeta">JPG · PNG · PDF ／ 最大 10MB</span>
                    </button>

                    {attachmentLabel && attachmentFileName ? (
                      <div className="tpcAttachmentFile">
                        <div className="tpcAttachmentFileMain">
                          <span
                            className={`tpcAttachmentBadge tpcAttachmentBadge${effectiveFileType === "pdf" ? "Pdf" : "Image"}`}
                          >
                            {attachmentLabel}
                          </span>
                          <span className="tpcAttachmentFileName">{attachmentFileName}</span>
                        </div>
                        <button
                          type="button"
                          className="tpcAttachmentRemoveBtn"
                          onClick={handleRemoveAttachment}
                          disabled={isEditPanelBusy}
                          aria-label="添付を削除"
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="tpcEditFooter">
                  <button
                    type="button"
                    className="mcqSaveBtn tpcPublishBtn"
                    onClick={() => void handlePublish()}
                    disabled={isSaving}
                  >
                    お知らせを公開
                  </button>
                  {!isNew && selectedId ? (
                    <button
                      type="button"
                      className="mcqDeleteBtn"
                      onClick={() => void handleDelete()}
                      disabled={isEditPanelBusy}
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
