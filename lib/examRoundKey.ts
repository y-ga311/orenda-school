export type TestScoreExamKind = "mock" | "graduation";

export type TestScoreRoundMatch = {
  examKind: TestScoreExamKind;
  /** 模擬: "1","2"… / 卒業: "A","B"… または "1","2"… */
  roundKey: string;
  /** 試験名の「N年次」から抽出（なければ null） */
  gradeYear: string | null;
};

/** 試験名から学年（1〜3年次）を抽出 */
export function parseGradeYearFromTestName(testName: string): string | null {
  const match = testName.trim().match(/(\d)年次/);
  return match ? match[1] : null;
}

/** 試験名から種別・回次・学年を抽出（期名・日程は無視） */
export function parseTestScoreRoundKey(testName: string): TestScoreRoundMatch | null {
  const trimmed = testName.trim();
  if (!trimmed) {
    return null;
  }

  const gradeYear = parseGradeYearFromTestName(trimmed);

  const mockMatch = trimmed.match(/第(\d+)回模擬試験/);
  if (mockMatch) {
    return { examKind: "mock", roundKey: mockMatch[1], gradeYear };
  }

  const graduationNumberMatch = trimmed.match(/第(\d+)回卒業試験/);
  if (graduationNumberMatch) {
    return { examKind: "graduation", roundKey: graduationNumberMatch[1], gradeYear };
  }

  const graduationLetterMatch = trimmed.match(/卒業試験([A-Z])/i);
  if (graduationLetterMatch) {
    return {
      examKind: "graduation",
      roundKey: graduationLetterMatch[1].toUpperCase(),
      gradeYear,
    };
  }

  return null;
}

function gradeYearsMatch(gradeYearA: string | null, gradeYearB: string | null): boolean {
  if (gradeYearA === null && gradeYearB === null) {
    return true;
  }
  if (gradeYearA === null || gradeYearB === null) {
    return false;
  }
  return gradeYearA === gradeYearB;
}

/** 種別・回次・学年が一致（学年照合あり） */
export function testScoreRoundKeysMatch(testNameA: string, testNameB: string): boolean {
  const roundA = parseTestScoreRoundKey(testNameA);
  const roundB = parseTestScoreRoundKey(testNameB);
  if (!roundA || !roundB) {
    return false;
  }

  return (
    roundA.examKind === roundB.examKind &&
    roundA.roundKey === roundB.roundKey &&
    gradeYearsMatch(roundA.gradeYear, roundB.gradeYear)
  );
}

/** 種別・回次のみ一致（学年照合なし・フォールバック用） */
export function testScoreRoundKeysMatchLoose(testNameA: string, testNameB: string): boolean {
  const roundA = parseTestScoreRoundKey(testNameA);
  const roundB = parseTestScoreRoundKey(testNameB);
  if (!roundA || !roundB) {
    return false;
  }

  return roundA.examKind === roundB.examKind && roundA.roundKey === roundB.roundKey;
}

export function getTestScoreKeyword(examKind: TestScoreExamKind): string {
  return examKind === "mock" ? "模擬試験" : "卒業試験";
}

function formatNationalExamOutcomeLookupGradeYear(gradeYear: string | null): string {
  return gradeYear ?? "none";
}

function buildNationalExamOutcomeTestScoreRoundLookupKey(
  outcome: "failed" | "passed",
  testName: string,
  subjectName: string,
): string | null {
  const round = parseTestScoreRoundKey(testName);
  if (!round) {
    return null;
  }

  return `${outcome}:${round.examKind}:${formatNationalExamOutcomeLookupGradeYear(round.gradeYear)}:${round.roundKey}:${subjectName}`;
}

function buildNationalExamOutcomeTestScoreLooseLookupKey(
  outcome: "failed" | "passed",
  testName: string,
  subjectName: string,
): string | null {
  const round = parseTestScoreRoundKey(testName);
  if (!round) {
    return null;
  }

  return `${outcome}:${round.examKind}:*:${round.roundKey}:${subjectName}`;
}

function resolveNationalExamOutcomeTestScoreAverage(
  outcome: "failed" | "passed",
  averages: Map<string, number>,
  testName: string,
  subjectName: string,
): number | null {
  const strictKey = buildNationalExamOutcomeTestScoreRoundLookupKey(
    outcome,
    testName,
    subjectName,
  );
  if (strictKey && averages.has(strictKey)) {
    return averages.get(strictKey) ?? null;
  }

  const looseKey = buildNationalExamOutcomeTestScoreLooseLookupKey(
    outcome,
    testName,
    subjectName,
  );
  if (looseKey && averages.has(looseKey)) {
    return averages.get(looseKey) ?? null;
  }

  return null;
}

/** 不合格者平均の集計キー（学年込み・科目別推移・レーダー共通） */
export function buildFailedTestScoreRoundLookupKey(
  testName: string,
  subjectName: string,
): string | null {
  return buildNationalExamOutcomeTestScoreRoundLookupKey("failed", testName, subjectName);
}

/** 不合格者平均の集計キー（回次のみ・同学年データがないときのフォールバック） */
export function buildFailedTestScoreLooseLookupKey(
  testName: string,
  subjectName: string,
): string | null {
  return buildNationalExamOutcomeTestScoreLooseLookupKey("failed", testName, subjectName);
}

export function resolveFailedTestScoreAverage(
  averages: Map<string, number>,
  testName: string,
  subjectName: string,
): number | null {
  return resolveNationalExamOutcomeTestScoreAverage(
    "failed",
    averages,
    testName,
    subjectName,
  );
}

/** 合格者平均の集計キー（学年込み・科目別推移・レーダー共通） */
export function buildPassedTestScoreRoundLookupKey(
  testName: string,
  subjectName: string,
): string | null {
  return buildNationalExamOutcomeTestScoreRoundLookupKey("passed", testName, subjectName);
}

/** 合格者平均の集計キー（回次のみ・同学年データがないときのフォールバック） */
export function buildPassedTestScoreLooseLookupKey(
  testName: string,
  subjectName: string,
): string | null {
  return buildNationalExamOutcomeTestScoreLooseLookupKey("passed", testName, subjectName);
}

export function resolvePassedTestScoreAverage(
  averages: Map<string, number>,
  testName: string,
  subjectName: string,
): number | null {
  return resolveNationalExamOutcomeTestScoreAverage(
    "passed",
    averages,
    testName,
    subjectName,
  );
}

/** @deprecated use parseTestScoreRoundKey */
export function normalizeMockExamRoundKey(testName: string): string | null {
  const round = parseTestScoreRoundKey(testName);
  if (!round || round.examKind !== "mock") {
    return null;
  }
  return `round-${round.roundKey}`;
}

/** @deprecated use buildFailedTestScoreRoundLookupKey */
export function buildFailedMockTrendAverageKey(testName: string, subjectName: string) {
  return buildFailedTestScoreRoundLookupKey(testName, subjectName);
}
