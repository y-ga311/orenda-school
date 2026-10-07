import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDefaultClassAppFeatures,
  DEFAULT_MENU_ORDER,
  normalizeClassAppFeatures,
  normalizeMenuOrder,
  type ClassAppFeatureKey,
  type ClassAppFeatures,
  type ClassAppFeaturesRow,
} from "@/lib/classAppFeatures";
import { listStudentClassNames } from "@/lib/nationalExamSchedule.server";

type DbClassAppFeaturesRow = {
  class_name: string;
  features: unknown;
  menu_order?: unknown;
  updated_at: string | null;
  updated_by: string | null;
};

const SELECT_COLUMNS = "class_name, features, menu_order, updated_at, updated_by" as const;

function isMissingTableError(message: string) {
  return (
    (message.includes("does not exist") || message.includes("42P01")) &&
    !message.includes("menu_order")
  );
}

function isMissingMenuOrderColumn(message: string, code?: string) {
  return (
    code === "42703" ||
    (message.includes("menu_order") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function mapRow(row: DbClassAppFeaturesRow): ClassAppFeaturesRow {
  return {
    className: String(row.class_name ?? "").trim(),
    features: normalizeClassAppFeatures(row.features),
    menuOrder: normalizeMenuOrder(row.menu_order ?? DEFAULT_MENU_ORDER),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    existsInDb: true,
  };
}

function emptyRow(className: string): ClassAppFeaturesRow {
  return {
    className,
    features: createDefaultClassAppFeatures(),
    menuOrder: [...DEFAULT_MENU_ORDER],
    updatedAt: null,
    updatedBy: null,
    existsInDb: false,
  };
}

export async function listClassAppFeatureSettings(
  supabase: SupabaseClient,
): Promise<{
  items: ClassAppFeaturesRow[];
  classNames: string[];
  tableMissing: boolean;
  error: string | null;
}> {
  const classNamesResult = await listStudentClassNames(supabase);
  if (classNamesResult.error) {
    return {
      items: [],
      classNames: [],
      tableMissing: false,
      error: classNamesResult.error,
    };
  }

  const { data, error } = await supabase
    .from("class_app_features")
    .select(SELECT_COLUMNS)
    .order("class_name", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message) || isMissingMenuOrderColumn(error.message, error.code)) {
      return {
        items: classNamesResult.classNames.map(emptyRow),
        classNames: classNamesResult.classNames,
        tableMissing: true,
        error: null,
      };
    }
    return {
      items: [],
      classNames: classNamesResult.classNames,
      tableMissing: false,
      error: error.message,
    };
  }

  const byClassName = new Map<string, ClassAppFeaturesRow>();
  ((data ?? []) as DbClassAppFeaturesRow[]).forEach((row) => {
    const mapped = mapRow(row);
    if (mapped.className) {
      byClassName.set(mapped.className, mapped);
    }
  });

  const items = classNamesResult.classNames.map(
    (className) => byClassName.get(className) ?? emptyRow(className),
  );

  // DB にだけあるクラス名（学生マスタに無いもの）も末尾に残す
  byClassName.forEach((row, className) => {
    if (!classNamesResult.classNames.includes(className)) {
      items.push(row);
    }
  });

  return {
    items,
    classNames: classNamesResult.classNames,
    tableMissing: false,
    error: null,
  };
}

export async function getClassAppFeatures(
  supabase: SupabaseClient,
  className: string,
): Promise<{
  detail: ClassAppFeaturesRow | null;
  tableMissing: boolean;
  error: string | null;
}> {
  const trimmed = className.trim();
  if (!trimmed) {
    return { detail: null, tableMissing: false, error: "クラス名が指定されていません。" };
  }

  const { data, error } = await supabase
    .from("class_app_features")
    .select(SELECT_COLUMNS)
    .eq("class_name", trimmed)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message) || isMissingMenuOrderColumn(error.message, error.code)) {
      return { detail: emptyRow(trimmed), tableMissing: true, error: null };
    }
    return { detail: null, tableMissing: false, error: error.message };
  }

  if (!data) {
    return { detail: emptyRow(trimmed), tableMissing: false, error: null };
  }

  return {
    detail: mapRow(data as DbClassAppFeaturesRow),
    tableMissing: false,
    error: null,
  };
}

export async function upsertClassAppFeatures(
  supabase: SupabaseClient,
  input: {
    className: string;
    features: ClassAppFeatures;
    menuOrder: ClassAppFeatureKey[];
    updatedBy: string;
  },
): Promise<{
  detail: ClassAppFeaturesRow | null;
  tableMissing: boolean;
  error: string | null;
}> {
  const className = input.className.trim();
  const payload = {
    class_name: className,
    features: input.features,
    menu_order: input.menuOrder,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy,
  };

  const { data, error } = await supabase
    .from("class_app_features")
    .upsert(payload, { onConflict: "class_name" })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (isMissingMenuOrderColumn(error.message, error.code)) {
      return {
        detail: null,
        tableMissing: true,
        error:
          "menu_order 列が未作成です。docs/sql/add-class-app-features-menu-order.sql を Supabase で実行してください。",
      };
    }
    if (isMissingTableError(error.message)) {
      return {
        detail: null,
        tableMissing: true,
        error:
          "class_app_features テーブルが未作成です。docs/sql/create-class-app-features.sql を Supabase で実行してください。",
      };
    }
    return { detail: null, tableMissing: false, error: error.message };
  }

  return {
    detail: mapRow(data as DbClassAppFeaturesRow),
    tableMissing: false,
    error: null,
  };
}
