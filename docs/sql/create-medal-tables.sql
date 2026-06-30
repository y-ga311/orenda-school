-- メダル達成項目マスタ & 学生への付与記録
-- 教員ポータルで付与し、学生アプリ Orenda のメダル画面と連携する想定

CREATE TABLE IF NOT EXISTS public.medal_achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  medal_no text NOT NULL,
  tier text NOT NULL DEFAULT 'G',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medal_achievements_tier_check CHECK (tier IN ('G', 'S', 'C'))
);

CREATE INDEX IF NOT EXISTS medal_achievements_sort_order_idx
  ON public.medal_achievements (sort_order ASC);

CREATE INDEX IF NOT EXISTS medal_achievements_is_active_idx
  ON public.medal_achievements (is_active);

CREATE TABLE IF NOT EXISTS public.student_medal_grants (
  gakusei_id text NOT NULL,
  achievement_id text NOT NULL REFERENCES public.medal_achievements (id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text,
  PRIMARY KEY (gakusei_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS student_medal_grants_achievement_id_idx
  ON public.student_medal_grants (achievement_id);

COMMENT ON TABLE public.medal_achievements IS '達成メダル項目マスタ（教員が付与する対象）';
COMMENT ON TABLE public.student_medal_grants IS '学生ごとのメダル付与記録';
COMMENT ON COLUMN public.medal_achievements.medal_no IS 'Orenda アプリのメダル画像番号（例: 001）';
COMMENT ON COLUMN public.medal_achievements.tier IS 'メダル画像ティア G/S/C';
