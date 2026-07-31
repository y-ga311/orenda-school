-- 暗号化キーが環境変数・Supabase DB 設定で整合しているか確認する（読み取りのみ）
-- 実行前: 下記 secret_key を STUDENT_NAME_ENCRYPTION_KEY の実値に置換
--
-- 本番で必須なのは Vercel の環境変数（2プロジェクト同一）:
--   1. Orenda-School … STUDENT_NAME_ENCRYPTION_KEY
--   2. amt_exam-portal-main … STUDENT_NAME_ENCRYPTION_KEY
--
-- DB パラメータ app.student_name_encryption_key は Supabase では設定不可なことが多い（任意）

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) ラウンドトリップ（RPC）
SELECT
  '暗号化キー検証テスト' AS plain_input,
  public.encrypt_student_name(
    '暗号化キー検証テスト',
    'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'
  ) AS encrypted,
  public.decrypt_student_name(
    public.encrypt_student_name(
      '暗号化キー検証テスト',
      'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'
    ),
    'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'
  ) AS decrypted_with_explicit_key,
  public.decrypt_student_name(
    public.encrypt_student_name(
      '暗号化キー検証テスト',
      'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'
    ),
    NULL
  ) AS decrypted_with_db_key;

-- 2) DB 設定キーの確認（値そのものは表示されない場合あり）
SELECT
  nullif(btrim(current_setting('app.student_name_encryption_key', true)), '') IS NOT NULL
    AS db_primary_key_is_set,
  nullif(btrim(current_setting('app.student_name_encryption_key_legacy', true)), '') IS NOT NULL
    AS db_legacy_key_is_set;

-- 3) 復号できない学生（暗号文のまま表示される行）
SELECT
  gakusei_id,
  left(name, 48) AS name_prefix,
  public.decrypt_student_name(name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定') AS decrypted_explicit,
  public.decrypt_student_name(name, NULL) AS decrypted_db_key
FROM public.students
WHERE name IS NOT NULL
  AND btrim(name) <> ''
  AND name !~ '[ぁ-んァ-ン一-龥]'
  AND (
    public.decrypt_student_name(name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定') IS NULL
    OR public.decrypt_student_name(name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定') = name
    OR public.decrypt_student_name(name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定') !~ '[ぁ-んァ-ン一-龥]'
  )
ORDER BY gakusei_id
LIMIT 20;
