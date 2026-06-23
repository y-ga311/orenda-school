-- 4択問題（クエスト）用テーブル
-- 学生アプリ Orenda と同一 Supabase を共有する想定
-- 既にテーブルがある環境では IF NOT EXISTS / ADD COLUMN IF NOT EXISTS のみ適用されます

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.quest_subjects (
  id text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quest_subcategories (
  id text PRIMARY KEY,
  subject_id text NOT NULL REFERENCES public.quest_subjects (id) ON UPDATE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quest_subcategories_subject_id_idx
  ON public.quest_subcategories (subject_id);

CREATE TABLE IF NOT EXISTS public.quest_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL REFERENCES public.quest_subjects (id) ON UPDATE CASCADE,
  subcategory_id text NOT NULL REFERENCES public.quest_subcategories (id) ON UPDATE CASCADE,
  body text NOT NULL,
  choice_1 text NOT NULL,
  choice_2 text NOT NULL,
  choice_3 text NOT NULL,
  choice_4 text NOT NULL,
  correct_index smallint NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
  explanation text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  national_exam_round integer,
  national_exam_question_no integer,
  source text,
  quest_scope text NOT NULL DEFAULT 'subject',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quest_questions_scope_check CHECK (quest_scope IN ('subject', 'teacher', 'review'))
);

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS explanation text NOT NULL DEFAULT '';

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS quest_scope text NOT NULL DEFAULT 'subject';

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS national_exam_round integer;

ALTER TABLE public.quest_questions
  ADD COLUMN IF NOT EXISTS national_exam_question_no integer;

CREATE INDEX IF NOT EXISTS quest_questions_subject_subcategory_idx
  ON public.quest_questions (subject_id, subcategory_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS quest_questions_scope_active_idx
  ON public.quest_questions (quest_scope, is_active);

CREATE OR REPLACE VIEW public.quest_subcategory_question_counts AS
SELECT
  subject_id,
  subcategory_id,
  COUNT(*)::integer AS question_count
FROM public.quest_questions
WHERE is_active = true
  AND quest_scope = 'subject'
GROUP BY subject_id, subcategory_id;

COMMENT ON TABLE public.quest_subjects IS 'クエスト科目マスタ（教員ポータル・学生アプリ共通）';
COMMENT ON TABLE public.quest_subcategories IS 'クエスト中分類マスタ';
COMMENT ON TABLE public.quest_questions IS '4択問題（科目クエスト用）';
COMMENT ON VIEW public.quest_subcategory_question_counts IS '中分類ごとの登録問題数';

-- 科目・中分類の初期データは seed-quest-catalog.sql を実行してください
