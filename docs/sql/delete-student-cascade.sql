-- 学生アカウントと関連データの物理削除
-- 教員ポータルは service role から同等の削除を実行する。
-- この RPC は Supabase 上で一括実行したい場合の参照用。
-- ranking_reward_grants のマーカー行（gakusei_id = '__none__'）は対象外。

CREATE OR REPLACE FUNCTION public.delete_student_cascade(p_gakusei_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := btrim(p_gakusei_id);
  v_student_id bigint;
  v_counts jsonb := '{}'::jsonb;
  n int;
BEGIN
  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'invalid_gakusei_id' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE gakusei_id = v_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'student_not_found: %', v_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.quest_attempt_answers aa
  USING public.quest_attempts a
  WHERE aa.attempt_id = a.id
    AND a.gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quest_attempt_answers', n);

  DELETE FROM public.quest_attempts WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quest_attempts', n);

  DELETE FROM public.study_sessions WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('study_sessions', n);

  DELETE FROM public.student_medal_grants WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('student_medal_grants', n);

  DELETE FROM public.ranking_reward_grants WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ranking_reward_grants', n);

  DELETE FROM public.student_exam_results WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('student_exam_results', n);

  DELETE FROM public.test_scores
  WHERE student_id::text = v_student_id::text;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('test_scores', n);

  DELETE FROM public.students WHERE gakusei_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('students', n);

  RETURN jsonb_build_object('gakusei_id', v_id, 'deleted', v_counts);
END;
$$;
