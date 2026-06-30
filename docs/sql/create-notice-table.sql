-- つながるポータルお知らせ（notice テーブル・保護者ポータルと Supabase 共有）

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  target_type text NOT NULL DEFAULT 'parent',
  target_class text,
  image_url text,
  pdf_url text,
  file_type text
);

CREATE INDEX IF NOT EXISTS notice_target_class_idx ON public.notice (target_class);

COMMENT ON TABLE public.notice IS '保護者ポータル向けお知らせ';
COMMENT ON COLUMN public.notice.title IS 'タイトル';
COMMENT ON COLUMN public.notice.content IS '本文';
COMMENT ON COLUMN public.notice.target_type IS '対象者（all=学生・保護者, parent=保護者, student=学生）';
COMMENT ON COLUMN public.notice.target_class IS '対象クラス（NULL または空文字は全保護者）';
COMMENT ON COLUMN public.notice.image_url IS '添付画像 URL';
COMMENT ON COLUMN public.notice.pdf_url IS '添付 PDF URL';
COMMENT ON COLUMN public.notice.file_type IS '添付種別（image / pdf 等）';

-- Supabase Dashboard > Storage で public バケット「notice-attachments」を作成してください。
-- 別名にする場合は .env.local の NOTICE_ATTACHMENT_BUCKET を設定します。
