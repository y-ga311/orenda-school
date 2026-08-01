import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}
