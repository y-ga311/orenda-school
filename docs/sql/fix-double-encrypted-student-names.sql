-- 二重暗号化された students.name を一括修復する
-- 実行前: secret_key を STUDENT_NAME_ENCRYPTION_KEY の実値に置換
-- 前提: docs/sql/apply-student-name-crypto-rpc.sql を適用済みであること
--
-- 手順:
--   1) 下記「診断」で対象件数を確認
--   2) BEGIN 内の secret_key を確認
--   3) 「修復後確認」で日本語氏名が返ることを確認してから COMMIT
--
-- ローカルから実行する場合（推奨）:
--   node scripts/repair-student-names.mjs          # 診断
--   node scripts/repair-student-names.mjs --apply  # 修復

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) 診断: 1回復号後もまだ暗号文っぽい行
SELECT
  count(*) AS rows_likely_double_encrypted
FROM public.students AS s
WHERE s.name IS NOT NULL
  AND btrim(s.name) <> ''
  AND s.name !~ '[ぁ-んァ-ン一-龥]'
  AND public.decrypt_student_name(s.name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定')
      ~ '^[A-Za-z0-9+/]+=*$'
  AND public.decrypt_student_name(s.name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定')
      !~ '[ぁ-んァ-ン一-龥]';

BEGIN;

-- 2) 平文化（最大2層まで剥がす）
UPDATE public.students AS s
SET
  name = coalesce(
    nullif(
      public.decrypt_student_name(
        public.decrypt_student_name(s.name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'),
        'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'
      ),
      s.name
    ),
    nullif(
      public.decrypt_student_name(s.name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'),
      s.name
    )
  ),
  updated_at = NOW()
WHERE s.name IS NOT NULL
  AND btrim(s.name) <> ''
  AND s.name !~ '[ぁ-んァ-ン一-龥]';

-- 3) 現行キーで1層だけ再暗号化
UPDATE public.students AS s
SET
  name = public.encrypt_student_name(s.name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定'),
  updated_at = NOW()
WHERE s.name IS NOT NULL
  AND btrim(s.name) <> ''
  AND s.name ~ '[ぁ-んァ-ン一-龥]';

-- 4) 修復後確認（先頭10件）
SELECT
  gakusei_id,
  left(name, 48) AS encrypted_prefix,
  public.decrypt_student_name(name, 'ここにSTUDENT_NAME_ENCRYPTION_KEYを設定') AS decrypted_name
FROM public.students
WHERE name IS NOT NULL
  AND btrim(name) <> ''
ORDER BY gakusei_id
LIMIT 10;

-- 問題なければ COMMIT、やり直すなら ROLLBACK;
-- COMMIT;
