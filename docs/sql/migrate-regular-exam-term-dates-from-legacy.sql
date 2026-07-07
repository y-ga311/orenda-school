-- 旧: regular_exam_terms.exam_date（全期共通）を、学生マスタの期ごとにコピー
-- regular_exam_term_dates 作成後、既存の exam_date がある場合のみ実行

INSERT INTO public.regular_exam_term_dates (cohort_key, session_key, exam_date)
SELECT DISTINCT
  (regexp_match(s.class, '(\d{2,})期'))[1] AS cohort_key,
  t.session_key,
  t.exam_date
FROM public.students s
CROSS JOIN public.regular_exam_terms t
WHERE s.class ~ '\d{2,}期'
  AND t.exam_date IS NOT NULL
  AND (regexp_match(s.class, '(\d{2,})期'))[1] IS NOT NULL
ON CONFLICT (cohort_key, session_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
