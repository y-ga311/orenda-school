-- students.name の pgp_sym_encrypt + base64 暗号文を復号する RPC
-- 平文（日本語氏名）はそのまま返す / 暗号文のみ pgp_sym_decrypt
--
-- secret_key が空のときは DB 設定（app.student_name_encryption_key）と
-- レガシーキーも順に試行する。本番 Vercel に環境変数がなくても DB 設定で復号可能。
-- 設定例: docs/sql/set-student-name-encryption-key.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.decrypt_student_name(
  encrypted_name text,
  secret_key text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  normalized_name text;
  decrypted text;
  keys text[];
  candidate_key text;
  db_key text;
  db_legacy_key text;
BEGIN
  IF encrypted_name IS NULL OR btrim(encrypted_name) = '' THEN
    RETURN encrypted_name;
  END IF;

  keys := ARRAY[]::text[];

  IF secret_key IS NOT NULL AND btrim(secret_key) <> '' THEN
    keys := array_append(keys, btrim(secret_key));
  END IF;

  db_key := nullif(btrim(current_setting('app.student_name_encryption_key', true)), '');
  IF db_key IS NOT NULL AND NOT (db_key = ANY (keys)) THEN
    keys := array_append(keys, db_key);
  END IF;

  db_legacy_key := nullif(btrim(current_setting('app.student_name_encryption_key_legacy', true)), '');
  IF db_legacy_key IS NOT NULL AND NOT (db_legacy_key = ANY (keys)) THEN
    keys := array_append(keys, db_legacy_key);
  END IF;

  IF NOT ('ここに暗号化キーを設定' = ANY (keys)) THEN
    keys := array_append(keys, 'ここに暗号化キーを設定');
  END IF;

  normalized_name := regexp_replace(btrim(encrypted_name), '[\r\n\t]', '', 'g');
  normalized_name := replace(normalized_name, ' ', '+');

  IF normalized_name ~ '[ぁ-んァ-ン一-龥]' THEN
    RETURN btrim(encrypted_name);
  END IF;

  IF normalized_name ~ '^[A-Za-z0-9+/]+=*$' THEN
    FOREACH candidate_key IN ARRAY keys LOOP
      BEGIN
        decrypted := pgp_sym_decrypt(
          decode(normalized_name, 'base64'),
          candidate_key
        );
        IF decrypted IS NOT NULL
           AND btrim(decrypted) <> ''
           AND btrim(decrypted) <> normalized_name THEN
          RETURN btrim(decrypted);
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END LOOP;
  END IF;

  RETURN btrim(encrypted_name);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_student_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_student_name(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
