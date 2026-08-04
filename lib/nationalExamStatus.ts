export type NationalExamStatus = "unset" | "passed" | "failed";

export const NATIONAL_EXAM_STATUS_LABELS: Record<NationalExamStatus, string> = {
  unset: "未設定",
  passed: "国家試験合格（卒業生）",
  failed: "国家試験不合格（卒業生）",
};

export const NATIONAL_EXAM_BULK_SELECT_OPTIONS = [
  { value: "", label: "未設定" },
  { value: "passed", label: "合格" },
  { value: "failed", label: "不合格" },
] as const;

export function parseNationalExamStatusFromRow(row: {
  national_exam_failed?: boolean | null;
  national_exam_passed?: boolean | null;
}): NationalExamStatus {
  if (row.national_exam_failed === true) {
    return "failed";
  }
  if (row.national_exam_passed === true) {
    return "passed";
  }
  return "unset";
}

export function buildNationalExamStatusDbUpdate(status: NationalExamStatus) {
  return {
    national_exam_failed: status === "failed",
    national_exam_passed: status === "passed",
  };
}

export function parseNationalExamStatusInput(value: unknown): NationalExamStatus | null {
  if (value === "unset" || value === "passed" || value === "failed") {
    return value;
  }
  return null;
}

export function parseNationalExamStatusFromBulkValue(value: string): NationalExamStatus {
  const trimmed = value.trim();
  if (trimmed === "passed" || trimmed === "failed") {
    return trimmed;
  }
  return "unset";
}

export function formatNationalExamStatusForBulk(status: NationalExamStatus): string {
  return status === "unset" ? "" : status;
}

export function isMissingNationalExamPassedColumn(message: string) {
  return (
    message.includes("national_exam_passed") &&
    (message.includes("does not exist") || message.includes("42703"))
  );
}
