-- 定期試験マスタ（学期・科目配分）
-- 成績本体は student_exam_results（exam_type = regular）を使用

CREATE TABLE IF NOT EXISTS public.regular_exam_terms (
  session_key text PRIMARY KEY,
  grade_year smallint NOT NULL CHECK (grade_year BETWEEN 1 AND 3),
  term smallint NOT NULL CHECK (term BETWEEN 1 AND 3),
  session_label text NOT NULL,
  exam_date date,
  sort_order integer NOT NULL,
  CONSTRAINT regular_exam_terms_grade_term_unique UNIQUE (grade_year, term)
);

CREATE INDEX IF NOT EXISTS regular_exam_terms_sort_order_idx
  ON public.regular_exam_terms (sort_order ASC);

CREATE TABLE IF NOT EXISTS public.regular_exam_term_subjects (
  session_key text NOT NULL REFERENCES public.regular_exam_terms (session_key) ON DELETE CASCADE,
  subject_name text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (session_key, subject_name)
);

CREATE INDEX IF NOT EXISTS regular_exam_term_subjects_session_sort_idx
  ON public.regular_exam_term_subjects (session_key, sort_order ASC);

-- 科目別推移用（模擬試験とはり/きゅうを橋渡しする際に使用。定期は科目名そのまま表示）
CREATE TABLE IF NOT EXISTS public.regular_exam_trend_mappings (
  subject_name text NOT NULL,
  trend_track_code text NOT NULL,
  PRIMARY KEY (subject_name, trend_track_code)
);

COMMENT ON TABLE public.regular_exam_terms IS '定期試験の学期マスタ（1年1学期〜3年3学期）';
COMMENT ON COLUMN public.regular_exam_terms.exam_date IS '（非推奨）旧来の全期共通実施日。期別は regular_exam_term_dates を使用';
COMMENT ON TABLE public.regular_exam_term_subjects IS '学期ごとの定期試験科目リスト';
COMMENT ON TABLE public.regular_exam_trend_mappings IS '定期科目→推移トラック（はりきゅう理論ははり/きゅう両方に反映）';

-- PostgREST のスキーマキャッシュを更新（テーブル作成直後に API から参照できるようにする）
NOTIFY pgrst, 'reload schema';
