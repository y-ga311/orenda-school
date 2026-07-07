-- 学生基本情報：スコアサマリー拡張
-- 学習能力チェック（3項目）・医療系専門基礎テスト（スコアのみ）

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS learning_ability_reading integer,
  ADD COLUMN IF NOT EXISTS learning_ability_calculation integer,
  ADD COLUMN IF NOT EXISTS learning_ability_data_reading integer,
  ADD COLUMN IF NOT EXISTS medical_foundation_test_score numeric(5, 1);

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_learning_ability_reading_range_chk,
  DROP CONSTRAINT IF EXISTS students_learning_ability_calculation_range_chk,
  DROP CONSTRAINT IF EXISTS students_learning_ability_data_reading_range_chk,
  DROP CONSTRAINT IF EXISTS students_medical_foundation_test_score_range_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_learning_ability_reading_range_chk
    CHECK (learning_ability_reading IS NULL OR learning_ability_reading BETWEEN 0 AND 999),
  ADD CONSTRAINT students_learning_ability_calculation_range_chk
    CHECK (learning_ability_calculation IS NULL OR learning_ability_calculation BETWEEN 0 AND 999),
  ADD CONSTRAINT students_learning_ability_data_reading_range_chk
    CHECK (learning_ability_data_reading IS NULL OR learning_ability_data_reading BETWEEN 0 AND 999),
  ADD CONSTRAINT students_medical_foundation_test_score_range_chk
    CHECK (
      medical_foundation_test_score IS NULL
      OR medical_foundation_test_score BETWEEN 0 AND 9999.9
    );

COMMENT ON COLUMN public.students.learning_ability_reading IS '学習能力チェック：文章読解力';
COMMENT ON COLUMN public.students.learning_ability_calculation IS '学習能力チェック：計算力';
COMMENT ON COLUMN public.students.learning_ability_data_reading IS '学習能力チェック：資料読解力';
COMMENT ON COLUMN public.students.medical_foundation_test_score IS '医療系専門基礎テストスコア';

NOTIFY pgrst, 'reload schema';
