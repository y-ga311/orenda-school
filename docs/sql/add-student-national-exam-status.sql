-- 卒業生の国家試験不合格フラグ（学生基本情報画面から設定）
-- Orenda-School / amt_exam-portal-main / 学生アプリ Orenda で共有

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS national_exam_failed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.national_exam_failed IS '国家試験不合格（true = 不合格）';

CREATE INDEX IF NOT EXISTS students_national_exam_failed_idx
  ON public.students (national_exam_failed)
  WHERE national_exam_failed = true;

-- 例: 特定学生を国家試験不合格に設定
-- UPDATE public.students
-- SET national_exam_failed = true, updated_at = now()
-- WHERE gakusei_id = '235016';

-- 例: 国家試験不合格の学生一覧
-- SELECT gakusei_id, class, national_exam_failed
-- FROM public.students
-- WHERE national_exam_failed = true
-- ORDER BY gakusei_id;

NOTIFY pgrst, 'reload schema';
