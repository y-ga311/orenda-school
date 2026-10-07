-- 学生が Orenda から投稿した4択問題
-- 承認ステータスは持たない。教員ポータルは内容の確認と訂正のみ行う。

CREATE TABLE IF NOT EXISTS public.student_submitted_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gakusei_id text NOT NULL,
  subject_label text NOT NULL DEFAULT '',
  body text NOT NULL,
  choice_1 text NOT NULL DEFAULT '',
  choice_2 text NOT NULL DEFAULT '',
  choice_3 text NOT NULL DEFAULT '',
  choice_4 text NOT NULL DEFAULT '',
  correct_index smallint NOT NULL DEFAULT 0 CHECK (correct_index >= 0 AND correct_index <= 3),
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS student_submitted_questions_created_at_idx
  ON public.student_submitted_questions (created_at DESC);

CREATE INDEX IF NOT EXISTS student_submitted_questions_gakusei_id_idx
  ON public.student_submitted_questions (gakusei_id);

COMMENT ON TABLE public.student_submitted_questions IS
  '学生投稿の4択問題。承認フローは無く、教員は内容の確認と訂正のみ行う。';
