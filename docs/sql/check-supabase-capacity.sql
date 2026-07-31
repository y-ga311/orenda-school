-- Supabase プロジェクトの容量・使用量を確認する（読み取り専用）
-- Supabase Dashboard → SQL Editor に本文を貼り付けて実行してください。
--
-- 注意:
-- - プラン上限（Free / Pro の DB 容量・Storage 容量等）は Dashboard の Settings → Usage で確認
-- - 本 SQL は PostgreSQL 内の実使用量を集計するものです

-- ---------------------------------------------------------------------------
-- 1. データベース全体のサイズ
-- ---------------------------------------------------------------------------
SELECT
  current_database() AS database_name,
  pg_size_pretty(pg_database_size(current_database())) AS database_total_size;

-- ---------------------------------------------------------------------------
-- 2. スキーマ別サイズ（public / auth / storage 等）
-- ---------------------------------------------------------------------------
SELECT
  nspname AS schema_name,
  pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'm', 'i', 't', 'p')
  AND nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY nspname
ORDER BY SUM(pg_total_relation_size(c.oid)) DESC;

-- ---------------------------------------------------------------------------
-- 3. public テーブル別サイズ（大きい順）
-- ---------------------------------------------------------------------------
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS indexes_size
FROM pg_catalog.pg_statio_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- ---------------------------------------------------------------------------
-- 4. public テーブル別 推定行数（pg_stat ベース・ ANALYZE 後に近い値）
-- ---------------------------------------------------------------------------
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC NULLS LAST, relname;

-- ---------------------------------------------------------------------------
-- 5. Storage バケット別使用量（Supabase Storage）
--    storage スキーマが無い / 権限が無い場合はエラーになることがあります
-- ---------------------------------------------------------------------------
SELECT
  bucket_id,
  COUNT(*) AS object_count,
  pg_size_pretty(COALESCE(SUM((metadata ->> 'size')::bigint), 0)) AS total_file_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY COALESCE(SUM((metadata ->> 'size')::bigint), 0) DESC;

-- ---------------------------------------------------------------------------
-- 6. Storage 全体サマリー
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*) AS total_objects,
  pg_size_pretty(COALESCE(SUM((metadata ->> 'size')::bigint), 0)) AS total_file_size
FROM storage.objects;

-- ---------------------------------------------------------------------------
-- 7. 教員ポータル関連テーブルの行数・サイズ（運用目安）
-- ---------------------------------------------------------------------------
WITH portal_tables AS (
  SELECT unnest(
    ARRAY[
      'students',
      'teacher_accounts',
      'test_scores',
      'student_exam_results',
      'regular_exam_subjects',
      'regular_exam_term_dates',
      'question_counts',
      'quest_questions',
      'teacher_quests',
      'teacher_quest_questions',
      'medal_achievements',
      'medal_student_assignments',
      'national_exam_schedules',
      'notices',
      'study_records'
    ]
  ) AS table_name
)
SELECT
  pt.table_name,
  CASE
    WHEN to_regclass(format('public.%I', pt.table_name)) IS NULL THEN '（未作成）'
    ELSE (
      SELECT pg_size_pretty(pg_total_relation_size(format('public.%I', pt.table_name)))
    )
  END AS total_size,
  CASE
    WHEN to_regclass(format('public.%I', pt.table_name)) IS NULL THEN NULL
    ELSE (
      SELECT n_live_tup::bigint
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname = pt.table_name
    )
  END AS estimated_rows
FROM portal_tables pt
ORDER BY pt.table_name;
