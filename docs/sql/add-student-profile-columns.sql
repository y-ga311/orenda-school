-- 学生基本情報（教員ポータル）のスコアサマリー用拡張カラム
-- 保護者情報は students 既存カラムを使用: hogosya_id, hogosya_pass, mail

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pretest_score numeric(5, 1);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS support_area text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS career_education text;

-- 認知特性6項目（integer・Table Editor から直接入力可）
-- ※ カラム追加のみ必要な場合は add-cognitive-score-int-columns.sql を実行
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_camera integer;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_3d integer;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_fantasy integer;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_reading integer;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_sound integer;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_radio integer;

-- 旧方式（JSONB）を既に使っている場合の互換用。新規は int カラムを推奨
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_scores jsonb;

COMMENT ON COLUMN public.students.hogosya_id IS '保護者ログインID';
COMMENT ON COLUMN public.students.hogosya_pass IS '保護者パスワード';
COMMENT ON COLUMN public.students.mail IS '保護者メールアドレス';
COMMENT ON COLUMN public.students.pretest_score IS '入学前プレテストスコア';
COMMENT ON COLUMN public.students.support_area IS 'キャリアサポート：サポート領域';
COMMENT ON COLUMN public.students.career_education IS 'キャリアサポート：キャリア教育';
COMMENT ON COLUMN public.students.cognitive_camera IS '認知特性：カメラ';
COMMENT ON COLUMN public.students.cognitive_3d IS '認知特性：3D';
COMMENT ON COLUMN public.students.cognitive_fantasy IS '認知特性：ファンタジー';
COMMENT ON COLUMN public.students.cognitive_reading IS '認知特性：読書';
COMMENT ON COLUMN public.students.cognitive_sound IS '認知特性：サウンド';
COMMENT ON COLUMN public.students.cognitive_radio IS '認知特性：ラジオ';
COMMENT ON COLUMN public.students.cognitive_scores IS '認知特性（旧JSONB・非推奨）';

-- int カラムのみ追加した場合は migrate-cognitive-scores-to-int-columns.sql の制約も実行推奨
