import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { formToParentAnnouncementPayload, mapTargetTypeDbToUi } from "@/lib/parentPortalAnnouncement";
import {
  createParentPortalAnnouncement,
  deleteParentPortalAnnouncement,
  getParentPortalAnnouncement,
  listParentPortalAnnouncements,
  updateParentPortalAnnouncement,
} from "@/lib/parentPortalAnnouncement.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type AnnouncementRequestBody = {
  id?: unknown;
  title?: unknown;
  targetClass?: unknown;
  targetType?: unknown;
  content?: unknown;
  imageUrl?: unknown;
  pdfUrl?: unknown;
  fileType?: unknown;
  publish?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: jsonError("ログインが必要です。", 401) };
  }
  return { teacherId };
}

function getSupabaseOrError() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return { error: jsonError("Supabase接続情報が未設定です。", 500) };
  }
  return { supabase };
}

function parseWriteBody(body: AnnouncementRequestBody | null) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, message: "リクエストの形式が正しくありません。" };
  }

  return formToParentAnnouncementPayload(
    {
      title: typeof body.title === "string" ? body.title : "",
      targetClass: typeof body.targetClass === "string" ? body.targetClass : "",
      targetType: mapTargetTypeDbToUi(
        typeof body.targetType === "string" ? body.targetType : "parent",
      ),
      content: typeof body.content === "string" ? body.content : "",
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "",
      pdfUrl: typeof body.pdfUrl === "string" ? body.pdfUrl : "",
      pendingFile: null,
    },
    {
      imageUrl: body.imageUrl === null ? null : typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      pdfUrl: body.pdfUrl === null ? null : typeof body.pdfUrl === "string" ? body.pdfUrl : undefined,
      fileType: typeof body.fileType === "string" ? body.fileType : null,
    },
    { publish: body.publish === true, requirePublish: body.publish === true },
  );
}

export async function GET(request: Request) {
  try {
    const auth = await requireTeacher();
    if ("error" in auth) {
      return auth.error;
    }

    const supabaseResult = getSupabaseOrError();
    if ("error" in supabaseResult) {
      return supabaseResult.error;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();

    if (id) {
      const result = await getParentPortalAnnouncement(supabaseResult.supabase, id);
      if (result.error) {
        return jsonError(result.error, 500);
      }
      if (!result.detail) {
        return jsonError("お知らせが見つかりません。", 404);
      }
      return NextResponse.json({ detail: result.detail });
    }

    const result = await listParentPortalAnnouncements(supabaseResult.supabase, {
      search: searchParams.get("search") ?? undefined,
    });

    if (result.error && !result.tableMissing) {
      return jsonError(result.error, 500);
    }

    return NextResponse.json({
      items: result.items,
      classNames: result.classNames,
      tableMissing: result.tableMissing,
      message: result.tableMissing ? result.error : undefined,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "一覧の取得中にエラーが発生しました。",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireTeacher();
    if ("error" in auth) {
      return auth.error;
    }

    const supabaseResult = getSupabaseOrError();
    if ("error" in supabaseResult) {
      return supabaseResult.error;
    }

    const body = (await request.json().catch(() => null)) as AnnouncementRequestBody | null;
    const parsed = parseWriteBody(body);
    if (!parsed.ok) {
      return jsonError(parsed.message, 400);
    }

    const result = await createParentPortalAnnouncement(supabaseResult.supabase, parsed.payload);
    if (result.error || !result.detail) {
      return jsonError(result.error ?? "お知らせの作成に失敗しました。", 500);
    }

    return NextResponse.json({
      detail: result.detail,
      message: parsed.payload.publish ? "お知らせを公開しました。" : "お知らせを保存しました。",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "お知らせの作成中にエラーが発生しました。",
      500,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireTeacher();
    if ("error" in auth) {
      return auth.error;
    }

    const supabaseResult = getSupabaseOrError();
    if ("error" in supabaseResult) {
      return supabaseResult.error;
    }

    const body = (await request.json().catch(() => null)) as AnnouncementRequestBody | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) {
      return jsonError("お知らせIDが指定されていません。", 400);
    }

    const parsed = parseWriteBody(body);
    if (!parsed.ok) {
      return jsonError(parsed.message, 400);
    }

    const result = await updateParentPortalAnnouncement(
      supabaseResult.supabase,
      id,
      parsed.payload,
    );
    if (result.error || !result.detail) {
      return jsonError(result.error ?? "お知らせの更新に失敗しました。", 500);
    }

    return NextResponse.json({
      detail: result.detail,
      message: parsed.payload.publish ? "お知らせを公開しました。" : "お知らせを保存しました。",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "お知らせの更新中にエラーが発生しました。",
      500,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireTeacher();
    if ("error" in auth) {
      return auth.error;
    }

    const supabaseResult = getSupabaseOrError();
    if ("error" in supabaseResult) {
      return supabaseResult.error;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return jsonError("お知らせIDが指定されていません。", 400);
    }

    const result = await deleteParentPortalAnnouncement(supabaseResult.supabase, id);
    if (!result.ok) {
      return jsonError(result.error ?? "削除に失敗しました。", 500);
    }

    return NextResponse.json({ message: "お知らせを削除しました。" });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "削除中にエラーが発生しました。",
      500,
    );
  }
}
