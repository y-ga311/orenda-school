-- 定期試験の実施日（期 × 学期）
-- 成績は student_exam_results.session_key（1-1 等）のまま、実施日だけ期ごとに管理

CREATE TABLE IF NOT EXISTS public.regular_exam_term_dates (
  cohort_key text NOT NULL,
  session_key text NOT NULL REFERENCES public.regular_exam_terms (session_key) ON DELETE CASCADE,
  exam_date date,
  PRIMARY KEY (cohort_key, session_key)
);

CREATE INDEX IF NOT EXISTS regular_exam_term_dates_cohort_idx
  ON public.regular_exam_term_dates (cohort_key);

COMMENT ON TABLE public.regular_exam_term_dates IS '定期試験の実施日（期 × 学期）。cohort_key は所属クラスから抽出（例: 25期生昼間部 → 25）';
COMMENT ON COLUMN public.regular_exam_term_dates.cohort_key IS '期キー（数字のみ。例: 23, 24, 25）';
COMMENT ON COLUMN public.regular_exam_term_dates.exam_date IS '当該期・学期の定期試験実施日';

NOTIFY pgrst, 'reload schema';
