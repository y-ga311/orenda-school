-- 国家試験日程（学生アプリ Orenda の national_exam_schedules と共有）
-- Orenda は class_name / exam_date / is_active のみ参照

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.national_exam_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL,
  exam_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT national_exam_schedules_class_name_key UNIQUE (class_name)
);

CREATE INDEX IF NOT EXISTS national_exam_schedules_exam_date_idx
  ON public.national_exam_schedules (exam_date DESC);

CREATE INDEX IF NOT EXISTS national_exam_schedules_is_active_idx
  ON public.national_exam_schedules (is_active);

COMMENT ON TABLE public.national_exam_schedules IS '国家試験日程（students.class と class_name を照合）';
COMMENT ON COLUMN public.national_exam_schedules.class_name IS '対象クラス名（students.class と完全一致で照合）';
COMMENT ON COLUMN public.national_exam_schedules.exam_date IS '試験日（YYYY-MM-DD）';
COMMENT ON COLUMN public.national_exam_schedules.is_active IS 'true の行のみ学生アプリで採用';
