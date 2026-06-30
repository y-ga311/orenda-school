export type NationalExamScheduleFormState = {
  className: string;
  examDate: string;
  isActive: boolean;
};

export type NationalExamScheduleListItem = {
  id: string;
  displayId: string;
  className: string;
  examDate: string;
  examDateLabel: string;
  isActive: boolean;
  statusLabel: string;
  listSubtitle: string;
  updatedAt: string | null;
};

export type NationalExamScheduleDetail = NationalExamScheduleListItem;

export function createEmptyNationalExamScheduleForm(): NationalExamScheduleFormState {
  return {
    className: "",
    examDate: "",
    isActive: true,
  };
}

export function formatNationalExamDateLabel(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ja-JP");
}

export function formatNationalExamDisplayId(id: string) {
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return compact ? `NS-${compact}` : "NS-新規";
}

export function mapNationalExamScheduleListItem(row: {
  id: string;
  className: string;
  examDate: string;
  isActive: boolean;
  updatedAt: string | null;
}): NationalExamScheduleListItem {
  const examDateLabel = formatNationalExamDateLabel(row.examDate);
  return {
    id: row.id,
    displayId: formatNationalExamDisplayId(row.id),
    className: row.className,
    examDate: row.examDate,
    examDateLabel,
    isActive: row.isActive,
    statusLabel: row.isActive ? "有効" : "無効",
    listSubtitle: `${examDateLabel} · ${row.className}`,
    updatedAt: row.updatedAt,
  };
}

export function detailToNationalExamScheduleForm(
  detail: NationalExamScheduleDetail,
): NationalExamScheduleFormState {
  return {
    className: detail.className,
    examDate: detail.examDate,
    isActive: detail.isActive,
  };
}

export function validateNationalExamScheduleForm(
  form: NationalExamScheduleFormState,
): string | null {
  if (!form.className.trim()) {
    return "対象クラスを入力してください。";
  }
  if (!form.examDate.trim()) {
    return "実施日を入力してください。";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.examDate.trim())) {
    return "実施日は YYYY-MM-DD 形式で入力してください。";
  }
  const parsed = new Date(`${form.examDate.trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "実施日が不正です。";
  }
  return null;
}

export function formToNationalExamSchedulePayload(form: NationalExamScheduleFormState) {
  const error = validateNationalExamScheduleForm(form);
  if (error) {
    return { ok: false as const, message: error };
  }

  return {
    ok: true as const,
    payload: {
      className: form.className.trim(),
      examDate: form.examDate.trim(),
      isActive: form.isActive,
    },
  };
}
