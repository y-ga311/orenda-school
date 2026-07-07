/** 所属クラス名から期キーを抽出（例: "25期生昼間部" → "25"） */
export function parseCohortKeyFromClass(className: string | null | undefined): string | null {
  const trimmed = className?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(\d{2,})期/);
  return match?.[1] ?? null;
}

export function formatCohortLabel(cohortKey: string): string {
  return `${cohortKey.trim()}期`;
}

export function formatCohortStudentLabel(cohortKey: string): string {
  return `${cohortKey.trim()}期生`;
}

export function sortCohortKeysDesc(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return numB - numA;
    }
    return b.localeCompare(a, "ja");
  });
}

export function collectCohortKeysFromClassNames(classNames: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  classNames.forEach((className) => {
    const key = parseCohortKeyFromClass(className);
    if (key) {
      keys.add(key);
    }
  });
  return sortCohortKeysDesc([...keys]);
}
