export type StudentSubmittedQuestionListItem = {
  id: string;
  gakuseiId: string;
  authorName: string;
  className: string;
  subjectLabel: string;
  body: string;
  createdAt: string;
};

export type StudentSubmittedQuestionDetail = StudentSubmittedQuestionListItem & {
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: number;
  explanation: string;
  updatedAt: string | null;
};

export type StudentSubmittedQuestionFormState = {
  subjectLabel: string;
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: string;
  explanation: string;
};

export function createEmptyStudentSubmittedForm(): StudentSubmittedQuestionFormState {
  return {
    subjectLabel: "",
    body: "",
    choice1: "",
    choice2: "",
    choice3: "",
    choice4: "",
    correctIndex: "0",
    explanation: "",
  };
}

export function detailToStudentSubmittedForm(
  detail: StudentSubmittedQuestionDetail,
): StudentSubmittedQuestionFormState {
  return {
    subjectLabel: detail.subjectLabel,
    body: detail.body,
    choice1: detail.choice1,
    choice2: detail.choice2,
    choice3: detail.choice3,
    choice4: detail.choice4,
    correctIndex: String(detail.correctIndex),
    explanation: detail.explanation,
  };
}

export function formatSubmittedDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function formatSubmittedAuthor(item: Pick<StudentSubmittedQuestionListItem, "authorName" | "className" | "gakuseiId">) {
  const name = item.authorName.trim() || item.gakuseiId;
  const className = item.className.trim();
  return className ? `${name}（${className}）` : name;
}

export function validateStudentSubmittedForm(form: StudentSubmittedQuestionFormState) {
  if (!form.body.trim()) {
    return "問題文を入力してください。";
  }
  const choices = [form.choice1, form.choice2, form.choice3, form.choice4];
  if (choices.some((choice) => !choice.trim())) {
    return "選択肢1〜4をすべて入力してください。";
  }
  const correctIndex = Number(form.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return "正解を選択してください。";
  }
  return null;
}
