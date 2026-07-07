-- 定期試験の実施日（科目別推移の日程順ソート用）
-- 学期ごとに1日を設定（例: 1年/1学期の定期試験実施日）

ALTER TABLE public.regular_exam_terms
  ADD COLUMN IF NOT EXISTS exam_date date;

COMMENT ON COLUMN public.regular_exam_terms.exam_date IS '定期試験の実施日（科目別推移の並び順に使用）';

-- 例: 学年・学期に応じて更新してください
-- UPDATE public.regular_exam_terms SET exam_date = '2024-06-15' WHERE session_key = '1-1';

NOTIFY pgrst, 'reload schema';
