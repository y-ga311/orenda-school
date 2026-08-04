-- 卒業生の国家試験合格フラグ（学生基本情報・一括編集から設定）
-- national_exam_failed と排他的（両方 true は不可）

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS national_exam_passed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.national_exam_passed IS '国家試験合格（true = 合格）';

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_national_exam_status_exclusive;

ALTER TABLE public.students
  ADD CONSTRAINT students_national_exam_status_exclusive
  CHECK (NOT (national_exam_failed = true AND national_exam_passed = true));

CREATE INDEX IF NOT EXISTS students_national_exam_passed_idx
  ON public.students (national_exam_passed)
  WHERE national_exam_passed = true;

NOTIFY pgrst, 'reload schema';
