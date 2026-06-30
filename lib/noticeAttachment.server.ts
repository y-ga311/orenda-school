import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOTICE_ATTACHMENT_BUCKET,
  NOTICE_MAX_ATTACHMENT_BYTES,
  buildNoticeAttachmentFields,
  detectNoticeAttachmentKind,
  detectNoticeFileTypeFromMime,
  detectNoticeFileTypeFromName,
  type NoticeAttachmentKind,
} from "@/lib/noticeAttachment";

type UploadInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  size: number;
};

function getFileExtension(fileName: string, mimeType: string) {
  const fromMime = detectNoticeFileTypeFromMime(mimeType);
  if (fromMime === "pdf") {
    return "pdf";
  }
  if (fromMime === "image") {
    if (mimeType === "image/png") {
      return "png";
    }
    return "jpg";
  }

  const fromName = detectNoticeFileTypeFromName(fileName);
  if (fromName === "pdf") {
    return "pdf";
  }
  if (fileName.toLowerCase().endsWith(".png")) {
    return "png";
  }
  if (fromName === "image") {
    return "jpg";
  }

  return "bin";
}

function buildStoragePath(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName, mimeType);
  return `notices/${randomUUID()}.${extension}`;
}

function getPublicUrl(supabase: SupabaseClient, path: string) {
  const { data } = supabase.storage.from(NOTICE_ATTACHMENT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function mapUploadedNoticeAttachment(
  kind: NoticeAttachmentKind,
  publicUrl: string,
  fileName: string,
) {
  const fields = buildNoticeAttachmentFields(
    kind === "image" ? publicUrl : null,
    kind === "pdf" ? publicUrl : null,
    kind,
  );

  return {
    ...fields,
    fileName,
  };
}

export async function uploadNoticeAttachment(
  supabase: SupabaseClient,
  input: UploadInput,
): Promise<{
  imageUrl: string | null;
  pdfUrl: string | null;
  fileType: string | null;
  fileName: string;
  error: string | null;
}> {
  const kind =
    detectNoticeFileTypeFromMime(input.mimeType) ?? detectNoticeFileTypeFromName(input.fileName);

  if (!kind) {
    return {
      imageUrl: null,
      pdfUrl: null,
      fileType: null,
      fileName: input.fileName,
      error: "JPG、PNG、PDF のみ添付できます。",
    };
  }

  if (input.size > NOTICE_MAX_ATTACHMENT_BYTES) {
    return {
      imageUrl: null,
      pdfUrl: null,
      fileType: null,
      fileName: input.fileName,
      error: "ファイルサイズは 10MB 以下にしてください。",
    };
  }

  const path = buildStoragePath(input.fileName, input.mimeType);
  const { error } = await supabase.storage.from(NOTICE_ATTACHMENT_BUCKET).upload(path, input.buffer, {
    contentType: input.mimeType,
    upsert: false,
  });

  if (error) {
    const message = error.message.includes("Bucket not found")
      ? `Storage バケット「${NOTICE_ATTACHMENT_BUCKET}」が見つかりません。Supabase で作成してください。`
      : error.message;
    return {
      imageUrl: null,
      pdfUrl: null,
      fileType: null,
      fileName: input.fileName,
      error: message,
    };
  }

  const publicUrl = getPublicUrl(supabase, path);
  const mapped = mapUploadedNoticeAttachment(kind, publicUrl, input.fileName);

  return {
    imageUrl: mapped.imageUrl,
    pdfUrl: mapped.pdfUrl,
    fileType: mapped.fileType,
    fileName: mapped.fileName,
    error: null,
  };
}
