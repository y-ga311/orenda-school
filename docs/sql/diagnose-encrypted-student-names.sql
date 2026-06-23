-- 氏名が暗号文のまま表示される学生を診断する（読み取りのみ）
-- 実行前: 下記のキー文字列を本番で使っている値に置換
--
-- 現行キー（amt_exam-portal-main / Vercel）: amt-portal-student-name-key-2026
-- 旧キー（テスト学生 11111 など）: ここに暗号化キーを設定

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT
  id,
  gakusei_id,
  length(name) AS name_len,
  (name ~ '[ぁ-んァ-ン一-龥]') AS looks_plain_japanese,
  (name ~ '\s') AS has_whitespace_in_name,
  left(regexp_replace(name, '\s+', '', 'g'), 32) AS name_prefix_no_ws,
  public.decrypt_student_name(name, 'amt-portal-student-name-key-2026') AS decrypted_new_key,
  public.decrypt_student_name(name, 'ここに暗号化キーを設定') AS decrypted_legacy_key
FROM public.students
WHERE name IS NOT NULL
  AND btrim(name) <> ''
  AND name !~ '[ぁ-んァ-ン一-龥]'
ORDER BY gakusei_id;
