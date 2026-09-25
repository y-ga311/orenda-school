-- 学生アプリ（Orenda）のクラス別メニュー表示設定
-- students.class と class_name は完全一致させること（前後空白に注意）
-- 行が無いクラスは Orenda 側で全機能 ON 扱い

CREATE TABLE IF NOT EXISTS public.class_app_features (
  class_name text PRIMARY KEY,
  features jsonb NOT NULL DEFAULT '{
    "timer": true,
    "quest": true,
    "record": true,
    "collection": true,
    "ranking": true,
    "mypage": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public.class_app_features IS
  'クラス単位の学生アプリメニュー ON/OFF。Orenda ログイン時に参照。';

COMMENT ON COLUMN public.class_app_features.class_name IS
  'students.class と完全一致するクラス名';

COMMENT ON COLUMN public.class_app_features.features IS
  'JSON: timer/quest/record/collection/ranking/mypage の boolean';
