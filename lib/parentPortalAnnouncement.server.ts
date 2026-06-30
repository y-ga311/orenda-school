import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNoticeAttachmentFields } from "@/lib/noticeAttachment";
import {
  mapParentAnnouncementListItem,
  type NoticeTargetTypeDb,
  type ParentAnnouncementDetail,
  type ParentAnnouncementListItem,
} from "@/lib/parentPortalAnnouncement";

type DbNoticeRow = {
  id: string | number;
  title: string | null;
  content: string | null;
  target_type: string | null;
  target_class: string | null;
  image_url: string | null;
  pdf_url: string | null;
  file_type: string | null;
};

const NOTICE_SELECT =
  "id, title, content, target_type, target_class, image_url, pdf_url, file_type" as const;

function isMissingTableError(message: string) {
  return message.includes("does not exist") || message.includes("42P01");
}

function isMissingColumnError(message: string) {
  return message.includes("column") && message.includes("does not exist");
}

function mapRow(row: DbNoticeRow): ParentAnnouncementListItem {
  const targetTypeDb = (row.target_type?.trim() || "parent") as NoticeTargetTypeDb;

  return mapParentAnnouncementListItem({
    id: String(row.id),
    title: row.title ?? "",
    targetClass: row.target_class,
    targetTypeDb,
    content: row.content ?? "",
    imageUrl: row.image_url,
    pdfUrl: row.pdf_url,
    fileType: row.file_type,
    updatedAt: null,
    createdAt: null,
  });
}

export async function listStudentClassNames(
  supabase: SupabaseClient,
): Promise<{ classNames: string[]; error: string | null }> {
  const { data, error } = await supabase.from("students").select("class");

  if (error) {
    return { classNames: [], error: error.message };
  }

  const names = new Set<string>();
  (data ?? []).forEach((row) => {
    const value = typeof row.class === "string" ? row.class.trim() : "";
    if (value) {
      names.add(value);
    }
  });

  return {
    classNames: [...names].sort((a, b) => a.localeCompare(b, "ja")),
    error: null,
  };
}

export async function listParentPortalAnnouncements(
  supabase: SupabaseClient,
  options: { search?: string } = {},
): Promise<{
  items: ParentAnnouncementListItem[];
  classNames: string[];
  tableMissing: boolean;
  error: string | null;
}> {
  const classNamesResult = await listStudentClassNames(supabase);

  const { data, error } = await supabase
    .from("notice")
    .select(NOTICE_SELECT)
    .order("id", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) {
      return {
        items: [],
        classNames: classNamesResult.classNames,
        tableMissing: true,
        error: isMissingColumnError(error.message) ? error.message : classNamesResult.error,
      };
    }
    return {
      items: [],
      classNames: classNamesResult.classNames,
      tableMissing: false,
      error: error.message,
    };
  }

  const keyword = options.search?.trim().toLowerCase() ?? "";
  const items = ((data ?? []) as DbNoticeRow[])
    .filter((row) => {
      if (!keyword) {
        return true;
      }
      const targetClassLabel = row.target_class?.trim() || "全保護者";
      const haystack = [row.title ?? "", targetClassLabel, row.content ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    })
    .map(mapRow);

  return {
    items,
    classNames: classNamesResult.classNames,
    tableMissing: false,
    error: null,
  };
}

export async function getParentPortalAnnouncement(
  supabase: SupabaseClient,
  id: string,
): Promise<{ detail: ParentAnnouncementDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("notice")
    .select(NOTICE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message };
  }
  if (!data) {
    return { detail: null, error: null };
  }

  return { detail: mapRow(data as DbNoticeRow), error: null };
}

type NoticeWritePayload = {
  title: string;
  targetClass: string | null;
  targetType: NoticeTargetTypeDb;
  content: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  fileType: string | null;
  publish: boolean;
};

function buildWriteRow(payload: NoticeWritePayload) {
  void payload.publish;

  const attachmentFields = buildNoticeAttachmentFields(
    payload.imageUrl,
    payload.pdfUrl,
    payload.fileType,
  );

  return {
    title: payload.title,
    content: payload.content,
    target_type: payload.targetType,
    target_class: payload.targetClass,
    image_url: attachmentFields.imageUrl,
    pdf_url: attachmentFields.pdfUrl,
    file_type: attachmentFields.fileType,
  };
}

export async function createParentPortalAnnouncement(
  supabase: SupabaseClient,
  payload: NoticeWritePayload,
): Promise<{ detail: ParentAnnouncementDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("notice")
    .insert(buildWriteRow(payload))
    .select("id")
    .single();

  if (error || !data) {
    return { detail: null, error: error?.message ?? "お知らせの作成に失敗しました。" };
  }

  return getParentPortalAnnouncement(supabase, String((data as { id: string | number }).id));
}

export async function updateParentPortalAnnouncement(
  supabase: SupabaseClient,
  id: string,
  payload: NoticeWritePayload,
): Promise<{ detail: ParentAnnouncementDetail | null; error: string | null }> {
  const { error } = await supabase.from("notice").update(buildWriteRow(payload)).eq("id", id);

  if (error) {
    return { detail: null, error: error.message };
  }

  return getParentPortalAnnouncement(supabase, id);
}

export async function deleteParentPortalAnnouncement(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from("notice").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
