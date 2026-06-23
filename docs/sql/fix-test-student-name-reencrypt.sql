-- 「テスト」学生（gakusei_id=11111 など）の氏名を現行キーで再暗号化する
-- 他の学生は更新しない
--
-- 手順:
--   1) docs/sql/diagnose-encrypted-student-names.sql で対象を確認
--   2) 下記 BEGIN 内の gakusei_id / secret_key を確認
--   3) 復号テストが「テスト」になることを確認してから COMMIT
--
-- 前提: docs/sql/create-decrypt-student-name-function.sql が最新版であること

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 対象確認（読み取りのみ）
SELECT
  gakusei_id,
  left(name, 40) AS encrypted_name,
  public.decrypt_student_name(name, 'amt-portal-student-name-key-2026') AS d_new,
  public.decrypt_student_name(name, 'ここに暗号化キーを設定') AS d_legacy
FROM public.students
WHERE gakusei_id IN ('11111')
   OR btrim(name) IN ('テスト', 'test');

BEGIN;

-- 平文化（どちらのキーでも復号できる行のみ）
UPDATE public.students AS s
SET
  name = coalesce(
    nullif(public.decrypt_student_name(s.name, 'amt-portal-student-name-key-2026'), s.name),
    nullif(public.decrypt_student_name(s.name, 'ここに暗号化キーを設定'), s.name)
  ),
  updated_at = NOW()
WHERE s.gakusei_id IN ('11111')
   OR btrim(s.name) IN ('テスト', 'test')
   OR public.decrypt_student_name(s.name, 'amt-portal-student-name-key-2026') IN ('テスト', 'test')
   OR public.decrypt_student_name(s.name, 'ここに暗号化キーを設定') IN ('テスト', 'test');

-- 現行キーで1層だけ再暗号化
UPDATE public.students AS s
SET
  name = public.encrypt_student_name(s.name, 'amt-portal-student-name-key-2026'),
  updated_at = NOW()
WHERE s.gakusei_id IN ('11111')
   OR btrim(s.name) IN ('テスト', 'test');

-- 確認（「テスト」と表示されれば OK）
SELECT
  gakusei_id,
  left(name, 40) AS encrypted_name,
  public.decrypt_student_name(name, 'amt-portal-student-name-key-2026') AS decrypted_name
FROM public.students
WHERE gakusei_id IN ('11111')
   OR public.decrypt_student_name(name, 'amt-portal-student-name-key-2026') IN ('テスト', 'test');

-- 問題なければ COMMIT、やり直すなら ROLLBACK;
-- COMMIT;
