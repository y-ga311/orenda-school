import {
  buildNoticeAttachmentFields,
  inferNoticeFileType,
  type NoticeAttachmentKind,
} from "@/lib/noticeAttachment";

export type ParentAnnouncementFilter = "all";

export type ParentAnnouncementFormState = {
  title: string;
  targetClass: string;
  targetType: NoticeTargetTypeUi;
  content: string;
  imageUrl: string;
  pdfUrl: string;
  pendingFile: File | null;
};

export type ParentAnnouncementListItem = {
  id: string;
  displayId: string;
  title: string;
  targetClass: string | null;
  targetClassLabel: string;
  targetType: NoticeTargetTypeUi;
  targetTypeDb: NoticeTargetTypeDb;
  content: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  fileType: string | null;
  listSubtitle: string;
  updatedAt: string | null;
  createdAt: string | null;
};

export type ParentAnnouncementDetail = ParentAnnouncementListItem;

export const PARENT_NOTICE_TARGET_TYPE_OPTIONS = ["学生", "保護者", "学生・保護者"] as const;

export type NoticeTargetTypeUi = (typeof PARENT_NOTICE_TARGET_TYPE_OPTIONS)[number];

export type NoticeTargetTypeDb = "all" | "parent" | "student";

const TARGET_TYPE_UI_TO_DB: Record<NoticeTargetTypeUi, NoticeTargetTypeDb> = {
  学生: "student",
  保護者: "parent",
  "学生・保護者": "all",
};

const TARGET_TYPE_DB_TO_UI: Record<NoticeTargetTypeDb, NoticeTargetTypeUi> = {
  all: "学生・保護者",
  parent: "保護者",
  student: "学生",
};

export function mapTargetTypeUiToDb(value: string): NoticeTargetTypeDb | null {
  const trimmed = value.trim();
  if (trimmed in TARGET_TYPE_UI_TO_DB) {
    return TARGET_TYPE_UI_TO_DB[trimmed as NoticeTargetTypeUi];
  }
  if (trimmed === "all" || trimmed === "parent" || trimmed === "student") {
    return trimmed;
  }
  return null;
}

export function mapTargetTypeDbToUi(value: string | null | undefined): NoticeTargetTypeUi {
  const trimmed = value?.trim() ?? "";
  if (trimmed in TARGET_TYPE_DB_TO_UI) {
    return TARGET_TYPE_DB_TO_UI[trimmed as NoticeTargetTypeDb];
  }
  if (trimmed in TARGET_TYPE_UI_TO_DB) {
    return trimmed as NoticeTargetTypeUi;
  }
  return "保護者";
}

export function formatTargetTypeLabel(value: string | null | undefined) {
  return mapTargetTypeDbToUi(value);
}

export function createEmptyParentAnnouncementForm(): ParentAnnouncementFormState {
  return {
    title: "",
    targetClass: "",
    targetType: "保護者",
    content: "",
    imageUrl: "",
    pdfUrl: "",
    pendingFile: null,
  };
}

export function formatParentAnnouncementDisplayId(id: string | number) {
  const compact = String(id).replace(/-/g, "").slice(0, 4).toUpperCase();
  return compact ? `N-${compact}` : "N-新規";
}

export function formatTargetClassLabel(targetClass: string | null) {
  const trimmed = targetClass?.trim() ?? "";
  return trimmed || "全クラス";
}

export function formatNoticeCreatedLabel(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${date.getMonth() + 1}/${date.getDate()}登録`;
}

export { inferNoticeFileType };

export function mapParentAnnouncementListItem(row: {
  id: string;
  title: string;
  targetClass: string | null;
  targetTypeDb: string;
  content: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  fileType: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}): ParentAnnouncementListItem {
  const targetClassLabel = formatTargetClassLabel(row.targetClass);
  const attachmentFields = buildNoticeAttachmentFields(row.imageUrl, row.pdfUrl, row.fileType);
  const targetTypeDb = mapTargetTypeUiToDb(row.targetTypeDb) ?? "parent";
  const targetType = mapTargetTypeDbToUi(targetTypeDb);

  return {
    id: row.id,
    displayId: formatParentAnnouncementDisplayId(row.id),
    title: row.title,
    targetClass: row.targetClass,
    targetClassLabel,
    targetType,
    targetTypeDb,
    content: row.content,
    imageUrl: attachmentFields.imageUrl,
    pdfUrl: attachmentFields.pdfUrl,
    fileType: attachmentFields.fileType,
    listSubtitle: row.createdAt
      ? `${targetClassLabel} · ${formatNoticeCreatedLabel(row.createdAt)}`
      : targetClassLabel,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export function detailToParentAnnouncementForm(
  detail: ParentAnnouncementDetail,
): ParentAnnouncementFormState {
  return {
    title: detail.title,
    targetClass: detail.targetClass ?? "",
    targetType: detail.targetType,
    content: detail.content,
    imageUrl: detail.imageUrl ?? "",
    pdfUrl: detail.pdfUrl ?? "",
    pendingFile: null,
  };
}

export function validateParentAnnouncementForm(
  form: ParentAnnouncementFormState,
  options: { requirePublish?: boolean } = {},
): string | null {
  if (!form.title.trim()) {
    return "タイトルを入力してください。";
  }
  if (options.requirePublish && !form.content.trim()) {
    return "本文を入力してください。";
  }
  if (
    !PARENT_NOTICE_TARGET_TYPE_OPTIONS.includes(form.targetType)
  ) {
    return "対象者が不正です。";
  }
  return null;
}

export function formToParentAnnouncementPayload(
  form: ParentAnnouncementFormState,
  attachment: {
    imageUrl?: string | null;
    pdfUrl?: string | null;
    fileType?: string | null;
  } = {},
  options: { requirePublish?: boolean; publish?: boolean } = {},
) {
  const error = validateParentAnnouncementForm(form, { requirePublish: options.requirePublish });
  if (error) {
    return { ok: false as const, message: error };
  }

  const targetClass = form.targetClass.trim();
  const targetTypeDb = mapTargetTypeUiToDb(form.targetType);
  if (!targetTypeDb) {
    return { ok: false as const, message: "対象者が不正です。" };
  }
  const attachmentFields = buildNoticeAttachmentFields(
    attachment.imageUrl ?? form.imageUrl,
    attachment.pdfUrl ?? form.pdfUrl,
    attachment.fileType ?? null,
  );

  return {
    ok: true as const,
    payload: {
      title: form.title.trim(),
      targetClass: targetClass || null,
      targetType: targetTypeDb,
      content: form.content.trim(),
      imageUrl: attachmentFields.imageUrl,
      pdfUrl: attachmentFields.pdfUrl,
      fileType: attachmentFields.fileType,
      publish: Boolean(options.publish),
    },
  };
}

export function getNoticeAttachmentLabel(fileType: string | null | NoticeAttachmentKind | "") {
  if (fileType === "image") {
    return "IMG";
  }
  if (fileType === "pdf") {
    return "PDF";
  }
  return null;
}

export function getNoticeAttachmentFileName(
  fileType: string | null | NoticeAttachmentKind | "",
  imageUrl: string | null,
  pdfUrl: string | null,
  pendingFileName?: string | null,
) {
  if (pendingFileName?.trim()) {
    return pendingFileName.trim();
  }

  const url = fileType === "pdf" ? pdfUrl : fileType === "image" ? imageUrl : null;
  if (!url?.trim()) {
    return null;
  }
  const segments = url.split("/");
  const last = segments[segments.length - 1]?.trim();
  return last || url;
}
