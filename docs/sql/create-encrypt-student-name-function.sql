-- students.name を pgp_sym_encrypt + base64 で暗号化する RPC
-- アプリ側 prepareStudentNameForStorage から呼び出す
-- 既に暗号化済みの値は二重暗号化しない

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.encrypt_student_name(
  plain_name text,
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
BEGIN
  IF plain_name IS NULL OR btrim(plain_name) = '' THEN
    RETURN plain_name;
  END IF;

  IF secret_key IS NULL OR btrim(secret_key) = '' THEN
    RAISE EXCEPTION 'secret_key is required';
  END IF;

  normalized_name := regexp_replace(btrim(plain_name), '\s+', '', 'g');

  IF normalized_name !~ '[ぁ-んァ-ン一-龥]'
     AND normalized_name ~ '^[A-Za-z0-9+/]+=*$' THEN
    BEGIN
      IF length(decode(normalized_name, 'base64')) >= 8 THEN
        RETURN normalized_name;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN encode(
    pgp_sym_encrypt(btrim(plain_name), secret_key),
    'base64'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_student_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_student_name(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
