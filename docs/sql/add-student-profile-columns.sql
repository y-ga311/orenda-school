-- 学生基本情報（教員ポータル）のスコアサマリー用拡張カラム
-- 保護者情報は students 既存カラムを使用: hogosya_id, hogosya_pass, mail

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pretest_score numeric(5, 1);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS support_area text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS career_education text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cognitive_scores jsonb;

COMMENT ON COLUMN public.students.hogosya_id IS '保護者ログインID';
COMMENT ON COLUMN public.students.hogosya_pass IS '保護者パスワード';
COMMENT ON COLUMN public.students.mail IS '保護者メールアドレス';
COMMENT ON COLUMN public.students.pretest_score IS '入学前プレテストスコア';
COMMENT ON COLUMN public.students.support_area IS 'キャリアサポート：サポート領域';
COMMENT ON COLUMN public.students.career_education IS 'キャリアサポート：キャリア教育';
COMMENT ON COLUMN public.students.cognitive_scores IS '認知特性スコア（camera/3d/fantasy/reading/sound/radio）';
