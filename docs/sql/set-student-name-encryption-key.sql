-- 本番 Supabase で復号キーを DB に登録する（Vercel 環境変数のバックアップ）
-- Supabase Dashboard > SQL Editor で実行してください。
-- secret_key は amt_exam-portal-main の STUDENT_NAME_ENCRYPTION_KEY と同一にすること。

ALTER DATABASE postgres
  SET app.student_name_encryption_key = 'ここに暗号化キーを設定';

-- 旧キーで暗号化された氏名がある場合のみ
-- ALTER DATABASE postgres
--   SET app.student_name_encryption_key_legacy = '旧キー';

-- 設定確認（平文 test / テスト など暗号化済み行の復号テスト）
-- SELECT
--   gakusei_id,
--   left(name, 48) AS encrypted,
--   public.decrypt_student_name(name, NULL) AS decrypted
-- FROM public.students
-- WHERE name ~ '^[A-Za-z0-9+/=]+$';
