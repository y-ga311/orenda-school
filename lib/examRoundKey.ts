export type TestScoreExamKind = "mock" | "graduation";

export type TestScoreRoundMatch = {
  examKind: TestScoreExamKind;
  /** 模擬: "1","2"… / 卒業: "A","B"… または "1","2"… */
  roundKey: string;
};

/** 試験名から種別と回次を抽出（期名・日程は無視） */
export function parseTestScoreRoundKey(testName: string): TestScoreRoundMatch | null {
  const trimmed = testName.trim();
  if (!trimmed) {
    return null;
  }

  const mockMatch = trimmed.match(/第(\d+)回模擬試験/);
  if (mockMatch) {
    return { examKind: "mock", roundKey: mockMatch[1] };
  }

  const graduationNumberMatch = trimmed.match(/第(\d+)回卒業試験/);
  if (graduationNumberMatch) {
    return { examKind: "graduation", roundKey: graduationNumberMatch[1] };
  }

  const graduationLetterMatch = trimmed.match(/卒業試験([A-Z])/i);
  if (graduationLetterMatch) {
    return { examKind: "graduation", roundKey: graduationLetterMatch[1].toUpperCase() };
  }

  return null;
}

export function testScoreRoundKeysMatch(testNameA: string, testNameB: string): boolean {
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

/** 不合格者平均の集計キー（科目別推移・レーダー共通） */
export function buildFailedTestScoreRoundLookupKey(
  testName: string,
  subjectName: string,
): string | null {
  const round = parseTestScoreRoundKey(testName);
  if (!round) {
    return null;
  }

  return `failed:${round.examKind}:${round.roundKey}:${subjectName}`;
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
