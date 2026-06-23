-- 4択問題に国家試験の出典（第○回・問番号）を追加
-- quest_questions テーブルに適用

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS national_exam_round integer;

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS national_exam_question_no integer;

COMMENT ON COLUMN public.quest_questions.national_exam_round IS '国家試験の回数（例: 115 = 第115回）';
COMMENT ON COLUMN public.quest_questions.national_exam_question_no IS '国家試験の問番号（例: 42 = 問42）';

ALTER TABLE public.quest_questions
  DROP CONSTRAINT IF EXISTS quest_questions_national_exam_round_check;

ALTER TABLE public.quest_questions
  ADD CONSTRAINT quest_questions_national_exam_round_check
  CHECK (national_exam_round IS NULL OR national_exam_round > 0);

ALTER TABLE public.quest_questions
  DROP CONSTRAINT IF EXISTS quest_questions_national_exam_question_no_check;

ALTER TABLE public.quest_questions
  ADD CONSTRAINT quest_questions_national_exam_question_no_check
  CHECK (national_exam_question_no IS NULL OR national_exam_question_no > 0);

ALTER TABLE public.quest_questions
  DROP CONSTRAINT IF EXISTS quest_questions_national_exam_pair_check;

ALTER TABLE public.quest_questions
  ADD CONSTRAINT quest_questions_national_exam_pair_check
  CHECK (
    (national_exam_round IS NULL AND national_exam_question_no IS NULL)
    OR (national_exam_round IS NOT NULL AND national_exam_question_no IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS quest_questions_national_exam_idx
  ON public.quest_questions (national_exam_round, national_exam_question_no)
  WHERE national_exam_round IS NOT NULL;
