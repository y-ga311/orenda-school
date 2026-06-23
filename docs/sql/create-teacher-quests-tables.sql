-- 教員クエスト（デイリークエスト）用テーブル
-- 学生アプリ Orenda の教員クエスト機能と連携する想定（現状は仮データのみ）

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.teacher_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  teacher_employee_number text NOT NULL,
  teacher_name text NOT NULL,
  publish_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_quests_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT teacher_quests_date_range_check CHECK (end_date >= publish_date)
);

CREATE INDEX IF NOT EXISTS teacher_quests_publish_date_idx
  ON public.teacher_quests (publish_date DESC);

CREATE INDEX IF NOT EXISTS teacher_quests_status_idx
  ON public.teacher_quests (status);

CREATE TABLE IF NOT EXISTS public.teacher_quest_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.teacher_quests (id) ON DELETE CASCADE,
  question_number smallint NOT NULL,
  body text NOT NULL DEFAULT '',
  choice_1 text NOT NULL DEFAULT '',
  choice_2 text NOT NULL DEFAULT '',
  choice_3 text NOT NULL DEFAULT '',
  choice_4 text NOT NULL DEFAULT '',
  correct_index smallint,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_quest_questions_number_check
    CHECK (question_number >= 1 AND question_number <= 5),
  CONSTRAINT teacher_quest_questions_correct_index_check
    CHECK (correct_index IS NULL OR (correct_index >= 0 AND correct_index <= 3)),
  CONSTRAINT teacher_quest_questions_quest_number_unique
    UNIQUE (quest_id, question_number)
);

CREATE INDEX IF NOT EXISTS teacher_quest_questions_quest_id_idx
  ON public.teacher_quest_questions (quest_id, question_number);

COMMENT ON TABLE public.teacher_quests IS '教員クエスト（公開期間・作成教員・ステータス）';
COMMENT ON TABLE public.teacher_quest_questions IS '教員クエストに紐づく4択問題（最大5問）';
COMMENT ON COLUMN public.teacher_quests.status IS 'draft=下書き, published=公開';
