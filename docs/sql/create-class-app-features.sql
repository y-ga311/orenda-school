-- 学生アプリ（Orenda）のクラス別メニュー表示設定
-- students.class と class_name は完全一致させること（前後空白に注意）
-- 行が無いクラスは Orenda 側で全機能 ON・既定順

CREATE TABLE IF NOT EXISTS public.class_app_features (
  class_name text PRIMARY KEY,
  features jsonb NOT NULL DEFAULT '{
    "timer": true,
    "quest": true,
    "student_quest": true,
    "tsubotomy": true,
    "grades": true,
    "portfolio": true,
    "links": true,
    "record": true,
    "collection": true,
    "ranking": true,
    "mypage": true
  }'::jsonb,
  menu_order jsonb NOT NULL DEFAULT '[
    "timer",
    "quest",
    "student_quest",
    "tsubotomy",
    "grades",
    "portfolio",
    "links",
    "record",
    "collection",
    "ranking",
    "mypage"
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public.class_app_features IS
  'クラス単位の学生アプリメニュー ON/OFF。Orenda ログイン時に参照。';

COMMENT ON COLUMN public.class_app_features.class_name IS
  'students.class と完全一致するクラス名';

COMMENT ON COLUMN public.class_app_features.features IS
  'JSON boolean: timer/quest/student_quest/tsubotomy/grades/portfolio/links/record/collection/ranking/mypage';

COMMENT ON COLUMN public.class_app_features.menu_order IS
  'ホームメニューの上からの表示順（feature key の JSON 配列）。欠落キーはアプリ側で末尾に補完。';
