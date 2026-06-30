export const NOTICE_ATTACHMENT_BUCKET =
  process.env.NOTICE_ATTACHMENT_BUCKET?.trim() || "notice-attachments";

export const NOTICE_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const NOTICE_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const NOTICE_FILE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export type NoticeAttachmentKind = "image" | "pdf";

export function detectNoticeFileTypeFromName(fileName: string): NoticeAttachmentKind | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
    return "image";
  }
  return null;
}

export function detectNoticeFileTypeFromMime(mimeType: string): NoticeAttachmentKind | null {
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return "image";
  }
  return null;
}

export function detectNoticeAttachmentKind(file: File): NoticeAttachmentKind | null {
  return detectNoticeFileTypeFromMime(file.type) ?? detectNoticeFileTypeFromName(file.name);
}

export function validateNoticeAttachmentFile(file: File): string | null {
  const kind = detectNoticeAttachmentKind(file);
  if (!kind) {
    return "JPG、PNG、PDF のみ添付できます。";
  }
  if (file.size > NOTICE_MAX_ATTACHMENT_BYTES) {
    return "ファイルサイズは 10MB 以下にしてください。";
  }
  return null;
}

export function inferNoticeFileType(
  imageUrl: string | null,
  pdfUrl: string | null,
  fileType: string | null,
): NoticeAttachmentKind | "" {
  const normalized = fileType?.trim().toLowerCase() ?? "";
  if (normalized === "image" || normalized === "pdf") {
    return normalized;
  }
  if (imageUrl?.trim()) {
    return "image";
  }
  if (pdfUrl?.trim()) {
    return "pdf";
  }
  return "";
}

export function buildNoticeAttachmentFields(
  imageUrl: string | null,
  pdfUrl: string | null,
  fileType?: string | null,
) {
  const image = imageUrl?.trim() || null;
  const pdf = pdfUrl?.trim() || null;
  const resolvedType = inferNoticeFileType(image, pdf, fileType ?? null);

  return {
    imageUrl: resolvedType === "image" ? image : null,
    pdfUrl: resolvedType === "pdf" ? pdf : null,
    fileType: resolvedType || null,
  };
}
