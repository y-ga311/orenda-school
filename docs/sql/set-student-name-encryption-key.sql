-- 本番 Supabase で復号キーを DB に登録する（Vercel 環境変数のバックアップ）
--
-- 【重要】Supabase ホスティングでは SQL Editor の権限不足により、
-- 次の ALTER DATABASE は多くの場合エラーになります:
--   ERROR 42501: permission denied to set parameter "app.student_name_encryption_key"
--
-- その場合は DB 設定はスキップして構いません。
-- 代わりに次の2箇所で同一キーを設定してください（こちらが本番の正):
--   1. Orenda-School（Vercel）…… STUDENT_NAME_ENCRYPTION_KEY
--   2. amt_exam-portal-main（Vercel）…… STUDENT_NAME_ENCRYPTION_KEY
--
-- ローカル確認: npm run verify:student-name-key
-- SQL確認: docs/sql/verify-student-name-encryption-key.sql
--
-- 自前 Postgres（スーパーユーザー権限あり）の場合のみ以下を実行:

-- ALTER DATABASE postgres
--   SET app.student_name_encryption_key = 'ここに暗号化キーを設定';

-- 旧キーで暗号化された氏名がある場合のみ
-- ALTER DATABASE postgres
--   SET app.student_name_encryption_key_legacy = '旧キー';

-- 設定確認（DB キーが使える環境のみ）
-- SELECT
--   gakusei_id,
--   left(name, 48) AS encrypted,
--   public.decrypt_student_name(name, NULL) AS decrypted
-- FROM public.students
-- WHERE name ~ '^[A-Za-z0-9+/=]+$';
