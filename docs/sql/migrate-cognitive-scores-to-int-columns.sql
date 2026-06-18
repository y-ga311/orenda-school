-- ============================================================
-- （任意）旧 JSONB cognitive_scores から int カラムへデータコピー
-- 先に add-cognitive-score-int-columns.sql を実行してから使う
-- cognitive_scores カラムが無い DB ではスキップされます
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'students'
      AND column_name = 'cognitive_scores'
  ) THEN
    RAISE NOTICE 'cognitive_scores カラムが無いため、JSONB からのコピーはスキップしました。';
    RETURN;
  END IF;

  UPDATE public.students AS s
  SET
    cognitive_camera = CASE
      WHEN s.cognitive_camera IS NOT NULL THEN s.cognitive_camera
      WHEN s.cognitive_scores->>'camera' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'camera')::integer
      ELSE NULL
    END,
    cognitive_3d = CASE
      WHEN s.cognitive_3d IS NOT NULL THEN s.cognitive_3d
      WHEN s.cognitive_scores->>'3d' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'3d')::integer
      ELSE NULL
    END,
    cognitive_fantasy = CASE
      WHEN s.cognitive_fantasy IS NOT NULL THEN s.cognitive_fantasy
      WHEN s.cognitive_scores->>'fantasy' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'fantasy')::integer
      ELSE NULL
    END,
    cognitive_reading = CASE
      WHEN s.cognitive_reading IS NOT NULL THEN s.cognitive_reading
      WHEN s.cognitive_scores->>'reading' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'reading')::integer
      ELSE NULL
    END,
    cognitive_sound = CASE
      WHEN s.cognitive_sound IS NOT NULL THEN s.cognitive_sound
      WHEN s.cognitive_scores->>'sound' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'sound')::integer
      ELSE NULL
    END,
    cognitive_radio = CASE
      WHEN s.cognitive_radio IS NOT NULL THEN s.cognitive_radio
      WHEN s.cognitive_scores->>'radio' ~ '^-?\d+$'
        THEN (s.cognitive_scores->>'radio')::integer
      ELSE NULL
    END
  WHERE s.cognitive_scores IS NOT NULL;
END $$;
