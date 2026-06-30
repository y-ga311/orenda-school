import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  MEDAL_ACHIEVEMENT_CATALOG,
  type MedalAchievement,
} from "@/lib/medalCatalog";
import { decryptStudentRows } from "@/lib/studentNameCrypto.server";

type DbAchievementRow = {
  id: string;
  title: string;
  description: string;
  medal_no: string;
  tier: "G" | "S" | "C";
  sort_order: number;
  is_active: boolean;
};

type DbGrantRow = {
  gakusei_id: string;
  achievement_id: string;
};

export type MedalSettingsStudent = {
  gakuseiId: string;
  name: string;
  className: string | null;
};

export type MedalSettingsData = {
  catalog: MedalAchievement[];
  students: MedalSettingsStudent[];
  grantsByGakuseiId: Record<string, string[]>;
  tableMissing: boolean;
};

function isMissingTableError(message: string) {
  return message.includes("does not exist") || message.includes("42P01");
}

function mapAchievement(row: DbAchievementRow): MedalAchievement {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    medalNo: row.medal_no,
    tier: row.tier,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function buildGrantsMap(rows: DbGrantRow[]) {
  const grantsByGakuseiId: Record<string, string[]> = {};

  rows.forEach((row) => {
    const current = grantsByGakuseiId[row.gakusei_id] ?? [];
    current.push(row.achievement_id);
    grantsByGakuseiId[row.gakusei_id] = current;
  });

  return grantsByGakuseiId;
}

async function fetchStudents(supabase: SupabaseClient): Promise<{
  students: MedalSettingsStudent[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("students")
    .select("gakusei_id, name, class")
    .order("name", { ascending: true });

  if (error) {
    return { students: [], error: error.message };
  }

  const decrypted = await decryptStudentRows((data ?? []) as StudentRow[]);
  const students = decrypted
    .map((student) => ({
      gakuseiId: student.gakusei_id,
      name: student.name ?? "",
      className: student.class?.trim() || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return { students, error: null };
}

export async function loadMedalSettings(
  supabase: SupabaseClient,
): Promise<{ data: MedalSettingsData; error: string | null }> {
  const studentsResult = await fetchStudents(supabase);
  if (studentsResult.error) {
    return {
      data: {
        catalog: MEDAL_ACHIEVEMENT_CATALOG,
        students: [],
        grantsByGakuseiId: {},
        tableMissing: false,
      },
      error: studentsResult.error,
    };
  }

  const { data: achievementRows, error: achievementError } = await supabase
    .from("medal_achievements")
    .select("id, title, description, medal_no, tier, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (achievementError) {
    if (isMissingTableError(achievementError.message)) {
      return {
        data: {
          catalog: MEDAL_ACHIEVEMENT_CATALOG,
          students: studentsResult.students,
          grantsByGakuseiId: {},
          tableMissing: true,
        },
        error: null,
      };
    }

    return {
      data: {
        catalog: MEDAL_ACHIEVEMENT_CATALOG,
        students: studentsResult.students,
        grantsByGakuseiId: {},
        tableMissing: false,
      },
      error: achievementError.message,
    };
  }

  const catalog =
    (achievementRows ?? []).length > 0
      ? (achievementRows as DbAchievementRow[]).map(mapAchievement)
      : MEDAL_ACHIEVEMENT_CATALOG;

  const gakuseiIds = studentsResult.students.map((student) => student.gakuseiId);
  let grantsByGakuseiId: Record<string, string[]> = {};

  if (gakuseiIds.length > 0) {
    const { data: grantRows, error: grantError } = await supabase
      .from("student_medal_grants")
      .select("gakusei_id, achievement_id")
      .in("gakusei_id", gakuseiIds);

    if (grantError && !isMissingTableError(grantError.message)) {
      return {
        data: {
          catalog,
          students: studentsResult.students,
          grantsByGakuseiId: {},
          tableMissing: false,
        },
        error: grantError.message,
      };
    }

    grantsByGakuseiId = buildGrantsMap((grantRows ?? []) as DbGrantRow[]);
  }

  return {
    data: {
      catalog,
      students: studentsResult.students,
      grantsByGakuseiId,
      tableMissing: false,
    },
    error: null,
  };
}

export type MedalGrantUpdate = {
  gakuseiId: string;
  achievementId: string;
  granted: boolean;
};

export async function saveMedalGrantUpdates(
  supabase: SupabaseClient,
  updates: MedalGrantUpdate[],
  grantedBy?: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (updates.length === 0) {
    return { ok: true, error: null };
  }

  const toGrant = updates.filter((item) => item.granted);
  const toRevoke = updates.filter((item) => !item.granted);

  if (toGrant.length > 0) {
    const { error } = await supabase.from("student_medal_grants").upsert(
      toGrant.map((item) => ({
        gakusei_id: item.gakuseiId,
        achievement_id: item.achievementId,
        granted_by: grantedBy ?? null,
        granted_at: new Date().toISOString(),
      })),
      { onConflict: "gakusei_id,achievement_id" },
    );

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  for (const item of toRevoke) {
    const { error } = await supabase
      .from("student_medal_grants")
      .delete()
      .eq("gakusei_id", item.gakuseiId)
      .eq("achievement_id", item.achievementId);

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: true, error: null };
}
