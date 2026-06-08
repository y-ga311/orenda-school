-- 教員ポータル用アカウントテーブル
-- Supabase SQL Editor または CLI で実行してください。

CREATE TABLE IF NOT EXISTS public.teacher_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  employee_number text NOT NULL,
  password text NOT NULL DEFAULT '0000',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_accounts_employee_number_key UNIQUE (employee_number),
  CONSTRAINT teacher_accounts_password_min_length CHECK (char_length(password) >= 4)
);

COMMENT ON TABLE public.teacher_accounts IS 'Orenda School 教員ポータルの教員アカウント';
COMMENT ON COLUMN public.teacher_accounts.name IS '教員氏名';
COMMENT ON COLUMN public.teacher_accounts.employee_number IS '社員番号（ログインID）';
COMMENT ON COLUMN public.teacher_accounts.password IS 'パスワード（初期値 0000。初回ログイン後に 8 桁以上へ変更）';

CREATE INDEX IF NOT EXISTS idx_teacher_accounts_employee_number
  ON public.teacher_accounts (employee_number);

CREATE OR REPLACE FUNCTION public.set_teacher_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_accounts_updated_at ON public.teacher_accounts;

CREATE TRIGGER trg_teacher_accounts_updated_at
BEFORE UPDATE ON public.teacher_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_teacher_accounts_updated_at();

ALTER TABLE public.teacher_accounts ENABLE ROW LEVEL SECURITY;

-- サンプル教員（必要に応じて削除・変更）
INSERT INTO public.teacher_accounts (name, employee_number)
VALUES
  ('山田 太郎', 'T001'),
  ('佐藤 花子', 'T002')
ON CONFLICT (employee_number) DO NOTHING;
