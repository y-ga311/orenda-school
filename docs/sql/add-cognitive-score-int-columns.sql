-- ============================================================
-- 認知特性スコア6項目を integer カラムとして追加
-- Supabase SQL Editor で「このファイルだけ」先に実行してください
-- （UPDATE より前に実行しないと cognitive_camera does not exist になります）
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cognitive_camera integer,
  ADD COLUMN IF NOT EXISTS cognitive_3d integer,
  ADD COLUMN IF NOT EXISTS cognitive_fantasy integer,
  ADD COLUMN IF NOT EXISTS cognitive_reading integer,
  ADD COLUMN IF NOT EXISTS cognitive_sound integer,
  ADD COLUMN IF NOT EXISTS cognitive_radio integer;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_cognitive_camera_range_chk,
  DROP CONSTRAINT IF EXISTS students_cognitive_3d_range_chk,
  DROP CONSTRAINT IF EXISTS students_cognitive_fantasy_range_chk,
  DROP CONSTRAINT IF EXISTS students_cognitive_reading_range_chk,
  DROP CONSTRAINT IF EXISTS students_cognitive_sound_range_chk,
  DROP CONSTRAINT IF EXISTS students_cognitive_radio_range_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_cognitive_camera_range_chk
    CHECK (cognitive_camera IS NULL OR cognitive_camera BETWEEN 0 AND 999),
  ADD CONSTRAINT students_cognitive_3d_range_chk
    CHECK (cognitive_3d IS NULL OR cognitive_3d BETWEEN 0 AND 999),
  ADD CONSTRAINT students_cognitive_fantasy_range_chk
    CHECK (cognitive_fantasy IS NULL OR cognitive_fantasy BETWEEN 0 AND 999),
  ADD CONSTRAINT students_cognitive_reading_range_chk
    CHECK (cognitive_reading IS NULL OR cognitive_reading BETWEEN 0 AND 999),
  ADD CONSTRAINT students_cognitive_sound_range_chk
    CHECK (cognitive_sound IS NULL OR cognitive_sound BETWEEN 0 AND 999),
  ADD CONSTRAINT students_cognitive_radio_range_chk
    CHECK (cognitive_radio IS NULL OR cognitive_radio BETWEEN 0 AND 999);

COMMENT ON COLUMN public.students.cognitive_camera IS '認知特性：カメラ';
COMMENT ON COLUMN public.students.cognitive_3d IS '認知特性：3D';
COMMENT ON COLUMN public.students.cognitive_fantasy IS '認知特性：ファンタジー';
COMMENT ON COLUMN public.students.cognitive_reading IS '認知特性：読書';
COMMENT ON COLUMN public.students.cognitive_sound IS '認知特性：サウンド';
COMMENT ON COLUMN public.students.cognitive_radio IS '認知特性：ラジオ';

-- 追加確認（実行後に結果が6行出ればOK）
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'students'
  AND column_name LIKE 'cognitive_%'
ORDER BY column_name;
