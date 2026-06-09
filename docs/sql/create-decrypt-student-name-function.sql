-- students.name の pgp_sym_encrypt + base64 暗号文を復号する RPC
-- アプリ側 decrypt_student_name から呼び出す

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
BEGIN
  IF encrypted_name IS NULL OR btrim(encrypted_name) = '' THEN
    RETURN encrypted_name;
  END IF;

  IF secret_key IS NULL OR btrim(secret_key) = '' THEN
    RETURN encrypted_name;
  END IF;

  normalized_name := regexp_replace(btrim(encrypted_name), '\s+', '', 'g');

  RETURN pgp_sym_decrypt(
    decode(normalized_name, 'base64'),
    secret_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_student_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_student_name(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
