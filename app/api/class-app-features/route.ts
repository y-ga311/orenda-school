import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseClassAppFeaturesPayload } from "@/lib/classAppFeatures";
import {
  getClassAppFeatures,
  listClassAppFeatureSettings,
  upsertClassAppFeatures,
} from "@/lib/classAppFeatures.server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

type WriteBody = {
  className?: unknown;
  features?: unknown;
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

export async function GET(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const supabaseResult = getSupabaseOrError();
  if ("error" in supabaseResult) {
    return supabaseResult.error;
  }

  const { searchParams } = new URL(request.url);
  const className = searchParams.get("className")?.trim();

  if (className) {
    const result = await getClassAppFeatures(supabaseResult.supabase, className);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }
    return NextResponse.json({
      detail: result.detail,
      tableMissing: result.tableMissing,
    });
  }

  const result = await listClassAppFeatureSettings(supabaseResult.supabase);
  if (result.error) {
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json({
    items: result.items,
    classNames: result.classNames,
    tableMissing: result.tableMissing,
  });
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

  const body = (await request.json().catch(() => null)) as WriteBody | null;
  const parsed = parseClassAppFeaturesPayload({
    className: body?.className,
    features: body?.features,
  });

  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await upsertClassAppFeatures(supabaseResult.supabase, {
    className: parsed.className,
    features: parsed.features,
    updatedBy: auth.teacherId,
  });

  if (result.tableMissing) {
    return NextResponse.json(
      { message: result.error, tableMissing: true },
      { status: 500 },
    );
  }

  if (result.error || !result.detail) {
    return NextResponse.json(
      { message: result.error ?? "設定の保存に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    detail: result.detail,
    message: "学生アプリメニュー設定を保存しました。",
  });
}
