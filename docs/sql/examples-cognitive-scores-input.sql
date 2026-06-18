-- 認知特性スコアの入力例
-- ============================================================
-- 【重要】先に docs/sql/add-cognitive-score-int-columns.sql を実行すること
-- ============================================================
-- 方法A: integer カラム（推奨・Table Editor で数値入力可）
-- ============================================================

UPDATE public.students
SET
  cognitive_camera = 12,
  cognitive_3d = 8,
  cognitive_fantasy = 15,
  cognitive_reading = 20,
  cognitive_sound = 10,
  cognitive_radio = 18
WHERE gakusei_id = '学籍番号をここに';

-- 1項目だけ更新
UPDATE public.students
SET cognitive_reading = 25
WHERE gakusei_id = '学籍番号をここに';

-- ============================================================
-- 方法B: JSONB カラム（cognitive_scores）で int を入れる
--   数値は JSON ではクォートしない（"12" 文字列ではなく 12）
-- ============================================================

-- 6項目まとめて
UPDATE public.students
SET cognitive_scores = jsonb_build_object(
  'camera', 12,
  '3d', 8,
  'fantasy', 15,
  'reading', 20,
  'sound', 10,
  'radio', 18
)
WHERE gakusei_id = '学籍番号をここに';

-- 文字列リテラルで JSON を書く場合
UPDATE public.students
SET cognitive_scores = '{
  "camera": 12,
  "3d": 8,
  "fantasy": 15,
  "reading": 20,
  "sound": 10,
  "radio": 18
}'::jsonb
WHERE gakusei_id = '学籍番号をここに';

-- 1項目だけ追加・更新（他キーは保持）
UPDATE public.students
SET cognitive_scores = COALESCE(cognitive_scores, '{}'::jsonb) || '{"reading": 25}'::jsonb
WHERE gakusei_id = '学籍番号をここに';

-- ============================================================
-- よくある間違い
-- ============================================================
-- NG: 数値を文字列にする → アプリは動くが型が string になる
-- SET cognitive_scores = '{"camera": "12"}'::jsonb;
--
-- NG: Table Editor で cognitive_scores に 12 とだけ入力
--     → 有効な JSON オブジェクトではない
--
-- OK: jsonb_build_object または '{"camera":12,...}'::jsonb
