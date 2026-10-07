-- 既存 class_app_features にメニュー表示順カラムを追加
-- （create-class-app-features.sql を再実行してもよいが、本ファイル単体でも可）

ALTER TABLE public.class_app_features
  ADD COLUMN IF NOT EXISTS menu_order jsonb;

UPDATE public.class_app_features
SET menu_order = '[
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
]'::jsonb
WHERE menu_order IS NULL;

ALTER TABLE public.class_app_features
  ALTER COLUMN menu_order SET DEFAULT '[
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
  ]'::jsonb;

ALTER TABLE public.class_app_features
  ALTER COLUMN menu_order SET NOT NULL;

COMMENT ON COLUMN public.class_app_features.menu_order IS
  'ホームメニューの上からの表示順（feature key の JSON 配列）。欠落キーはアプリ側で末尾に補完。';
