import { parseCorrectAnswerIndex, type MultipleChoiceAnswerIndex } from "@/lib/multipleChoiceQuestions";

export const TEACHER_QUEST_MAX_QUESTIONS = 5;

export type TeacherQuestStatus = "draft" | "published";

export type TeacherQuestTeacherOption = {
  employeeNumber: string;
  name: string;
};

export type TeacherQuestQuestionFormState = {
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: string;
  explanation: string;
};

export type TeacherQuestFormState = {
  title: string;
  teacherEmployeeNumber: string;
  publishDate: string;
  endDate: string;
  questions: TeacherQuestQuestionFormState[];
};

export type TeacherQuestListItem = {
  id: string;
  title: string;
  teacherName: string;
  publishDate: string;
  publishDateLabel: string;
  endDate: string;
  status: TeacherQuestStatus;
  statusLabel: string;
  filledQuestionCount: number;
  questionCountLabel: string;
  updatedAt: string | null;
};

export type TeacherQuestQuestionDetail = {
  questionNumber: number;
  body: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  correctIndex: MultipleChoiceAnswerIndex | null;
  explanation: string;
};

export type TeacherQuestDetail = TeacherQuestListItem & {
  teacherEmployeeNumber: string;
  questions: TeacherQuestQuestionDetail[];
};

function createEmptyQuestion(): TeacherQuestQuestionFormState {
  return {
    body: "",
    choice1: "",
    choice2: "",
    choice3: "",
    choice4: "",
    correctIndex: "0",
    explanation: "",
  };
}

export function createEmptyTeacherQuestForm(
  teacherEmployeeNumber = "",
): TeacherQuestFormState {
  return {
    title: "",
    teacherEmployeeNumber,
    publishDate: "",
    endDate: "",
    questions: Array.from({ length: TEACHER_QUEST_MAX_QUESTIONS }, () => createEmptyQuestion()),
  };
}

export function formatTeacherQuestDateLabel(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ja-JP");
}

export function getTeacherQuestStatusLabel(status: TeacherQuestStatus) {
  return status === "published" ? "公開" : "下書き";
}

export function isTeacherQuestQuestionFilled(question: TeacherQuestQuestionFormState) {
  return Boolean(
    question.body.trim() &&
      question.choice1.trim() &&
      question.choice2.trim() &&
      question.choice3.trim() &&
      question.choice4.trim() &&
      parseCorrectAnswerIndex(question.correctIndex) !== null,
  );
}

export function countFilledTeacherQuestQuestions(questions: TeacherQuestQuestionFormState[]) {
  return questions.filter(isTeacherQuestQuestionFilled).length;
}

export function detailToTeacherQuestForm(detail: TeacherQuestDetail): TeacherQuestFormState {
  const questions = Array.from({ length: TEACHER_QUEST_MAX_QUESTIONS }, (_, index) => {
    const slot = detail.questions.find((item) => item.questionNumber === index + 1);
    if (!slot) {
      return createEmptyQuestion();
    }
    return {
      body: slot.body,
      choice1: slot.choice1,
      choice2: slot.choice2,
      choice3: slot.choice3,
      choice4: slot.choice4,
      correctIndex: slot.correctIndex === null ? "0" : String(slot.correctIndex),
      explanation: slot.explanation,
    };
  });

  return {
    title: detail.title,
    teacherEmployeeNumber: detail.teacherEmployeeNumber,
    publishDate: detail.publishDate,
    endDate: detail.endDate,
    questions,
  };
}

function validateQuestionSlot(
  question: TeacherQuestQuestionFormState,
  questionNumber: number,
  requireComplete: boolean,
): string | null {
  const hasAny =
    question.body.trim() ||
    question.choice1.trim() ||
    question.choice2.trim() ||
    question.choice3.trim() ||
    question.choice4.trim() ||
    question.explanation.trim();

  if (!hasAny) {
    return null;
  }

  if (!question.body.trim()) {
    return `問題${questionNumber}の問題文を入力してください。`;
  }
  if (!question.choice1.trim() || !question.choice2.trim() || !question.choice3.trim() || !question.choice4.trim()) {
    return `問題${questionNumber}の選択肢A〜Dをすべて入力してください。`;
  }

  const correctIndex = parseCorrectAnswerIndex(question.correctIndex);
  if (correctIndex === null) {
    return `問題${questionNumber}の正解は A〜D または 1〜4 で指定してください。`;
  }

  if (requireComplete && !isTeacherQuestQuestionFilled(question)) {
    return `問題${questionNumber}の入力が不完全です。`;
  }

  return null;
}

export function validateTeacherQuestForm(
  form: TeacherQuestFormState,
  status: TeacherQuestStatus,
): string | null {
  if (!form.title.trim()) {
    return "クエスト名を入力してください。";
  }
  if (!form.teacherEmployeeNumber.trim()) {
    return "作成教員を選択してください。";
  }
  if (!form.publishDate.trim()) {
    return "公開日を入力してください。";
  }
  if (!form.endDate.trim()) {
    return "終了日を入力してください。";
  }
  if (form.endDate < form.publishDate) {
    return "終了日は公開日以降に設定してください。";
  }

  const filledCount = countFilledTeacherQuestQuestions(form.questions);
  if (status === "published" && filledCount === 0) {
    return "公開するには少なくとも1問入力してください。";
  }

  for (let index = 0; index < form.questions.length; index += 1) {
    const error = validateQuestionSlot(
      form.questions[index],
      index + 1,
      status === "published",
    );
    if (error) {
      return error;
    }
  }

  return null;
}

export function formToTeacherQuestPayload(
  form: TeacherQuestFormState,
  status: TeacherQuestStatus,
) {
  const error = validateTeacherQuestForm(form, status);
  if (error) {
    return { ok: false as const, message: error };
  }

  const questions = form.questions
    .map((question, index) => {
      if (!isTeacherQuestQuestionFilled(question)) {
        return null;
      }
      const correctIndex = parseCorrectAnswerIndex(question.correctIndex);
      if (correctIndex === null) {
        return null;
      }
      return {
        questionNumber: index + 1,
        body: question.body.trim(),
        choice1: question.choice1.trim(),
        choice2: question.choice2.trim(),
        choice3: question.choice3.trim(),
        choice4: question.choice4.trim(),
        correctIndex,
        explanation: question.explanation.trim(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    ok: true as const,
    payload: {
      title: form.title.trim(),
      teacherEmployeeNumber: form.teacherEmployeeNumber.trim(),
      publishDate: form.publishDate.trim(),
      endDate: form.endDate.trim(),
      status,
      questions,
    },
  };
}
