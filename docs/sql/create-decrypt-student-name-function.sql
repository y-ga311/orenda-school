-- students.name の pgp_sym_encrypt + base64 暗号文を復号する RPC
-- 平文（日本語氏名）はそのまま返す / 暗号文のみ pgp_sym_decrypt

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.decrypt_student_name(
  encrypted_name text,
  secret_key text
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
BEGIN
  IF encrypted_name IS NULL OR btrim(encrypted_name) = '' THEN
    RETURN encrypted_name;
  END IF;

  IF secret_key IS NULL OR btrim(secret_key) = '' THEN
    RETURN btrim(encrypted_name);
  END IF;

  normalized_name := regexp_replace(btrim(encrypted_name), '\s+', '', 'g');

  IF normalized_name ~ '[ぁ-んァ-ン一-龥]' THEN
    RETURN btrim(encrypted_name);
  END IF;

  IF normalized_name ~ '^[A-Za-z0-9+/]+=*$' THEN
    BEGIN
      decrypted := pgp_sym_decrypt(
        decode(normalized_name, 'base64'),
        secret_key
      );
      RETURN btrim(decrypted);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN btrim(encrypted_name);
    END;
  END IF;

  RETURN btrim(encrypted_name);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_student_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_student_name(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
