import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  loadMedalSettings,
  saveMedalGrantUpdates,
  type MedalGrantUpdate,
} from "@/lib/medalSettings.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type SaveRequestBody = {
  updates?: unknown;
};

async function requireTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return { error: NextResponse.json({ message: "ログインが必要です。" }, { status: 401 }) };
  }
  return { teacherId };
}

function getSupabaseOrError() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { message: "Supabase接続情報が未設定です。" },
        { status: 500 },
      ),
    };
  }
  return { supabase };
}

function parseUpdates(value: unknown): { ok: true; updates: MedalGrantUpdate[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: "更新内容の形式が正しくありません。" };
  }

  const updates: MedalGrantUpdate[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as {
      gakuseiId?: unknown;
      achievementId?: unknown;
      granted?: unknown;
    };

    if (
      typeof row.gakuseiId !== "string" ||
      !row.gakuseiId.trim() ||
      typeof row.achievementId !== "string" ||
      !row.achievementId.trim() ||
      typeof row.granted !== "boolean"
    ) {
      continue;
    }

    updates.push({
      gakuseiId: row.gakuseiId.trim(),
      achievementId: row.achievementId.trim(),
      granted: row.granted,
    });
  }

  if (updates.length === 0) {
    return { ok: false, message: "保存する変更がありません。" };
  }

  return { ok: true, updates };
}

export async function GET() {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const result = await loadMedalSettings(supabaseResult.supabase);
  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
}

export async function PUT(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const body = (await request.json().catch(() => null)) as SaveRequestBody | null;
  const parsed = parseUpdates(body?.updates);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const saveResult = await saveMedalGrantUpdates(
    supabaseResult.supabase,
    parsed.updates,
    auth.teacherId,
  );

  if (!saveResult.ok) {
    return NextResponse.json(
      { message: saveResult.error ?? "メダル設定の保存に失敗しました。" },
      { status: 500 },
    );
  }

  const reload = await loadMedalSettings(supabaseResult.supabase);
  if (reload.error) {
    return NextResponse.json({ message: reload.error }, { status: 500 });
  }

  return NextResponse.json({
    ...reload.data,
    message: "メダル設定を保存しました。",
  });
}
