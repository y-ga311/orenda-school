import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { uploadNoticeAttachment } from "@/lib/noticeAttachment.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
    if (!teacherId) {
      return jsonError("ログインが必要です。", 401);
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return jsonError("Supabase接続情報が未設定です。", 500);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("添付ファイルが指定されていません。", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadNoticeAttachment(supabase, {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      size: file.size,
    });

    if (result.error) {
      return jsonError(result.error, 400);
    }

    return NextResponse.json({
      imageUrl: result.imageUrl,
      pdfUrl: result.pdfUrl,
      fileType: result.fileType,
      fileName: result.fileName,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "ファイルのアップロードに失敗しました。",
      500,
    );
  }
}
