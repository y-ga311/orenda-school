-- medal_achievements 初期データ（26項目・表示順固定）
-- create-medal-tables.sql 実行後に適用
-- 画像は medal_no + tier で指定（例: 001S → source-images/medal/001S.png）

INSERT INTO public.medal_achievements (id, title, description, medal_no, tier, sort_order, is_active)
VALUES
  ('career-nav', 'キャリアnavi', 'キャリアnaviプログラム参加', '001', 'S', 10, true),
  ('company-session', '企業説明会', '企業説明会への参加', '002', 'G', 20, true),
  ('ankoku-term1', '暗刻(1学期)', '暗記コンテスト「暗刻」1学期達成', '003', 'C', 30, true),
  ('ankoku-term2', '暗刻(2学期)', '暗記コンテスト「暗刻」2学期達成', '003', 'S', 40, true),
  ('ankoku-term3', '暗刻(3学期)', '暗記コンテスト「暗刻」3学期達成', '003', 'G', 50, true),
  ('attendance-y1s1', '出席率95%以上(1年1学期)', '1年1学期の出席率95%以上を達成', '004', 'C', 60, true),
  ('attendance-y1s2', '出席率95%以上(1年2学期)', '1年2学期の出席率95%以上を達成', '004', 'S', 70, true),
  ('attendance-y1s3', '出席率95%以上(1年3学期)', '1年3学期の出席率95%以上を達成', '004', 'G', 80, true),
  ('mogusa-factory', 'もぐさ工場見学', 'もぐさ工場見学への参加', '005', 'G', 90, true),
  ('career-nav2', 'キャリアnavi2', 'キャリアnavi2プログラム参加', '001', 'G', 100, true),
  ('anmame-term1', '暗豆(1学期)', '暗記コンテスト「暗豆」1学期達成', '006', 'C', 110, true),
  ('anmame-term2', '暗豆(2学期)', '暗記コンテスト「暗豆」2学期達成', '006', 'S', 120, true),
  ('anmame-term3', '暗豆(3学期)', '暗記コンテスト「暗豆」3学期達成', '006', 'G', 130, true),
  ('attendance-y2s1', '出席率95%以上(2年1学期)', '2年1学期の出席率95%以上を達成', '007', 'C', 140, true),
  ('attendance-y2s2', '出席率95%以上(2年2学期)', '2年2学期の出席率95%以上を達成', '007', 'S', 150, true),
  ('attendance-y2s3', '出席率95%以上(2年3学期)', '2年3学期の出席率95%以上を達成', '007', 'G', 160, true),
  ('job-session', '就職説明会', '就職説明会への参加', '008', 'G', 170, true),
  ('anki-term1', '暗爺(1学期)', '暗記コンテスト「暗爺」1学期達成', '009', 'C', 180, true),
  ('anki-term2', '暗爺(2学期)', '暗記コンテスト「暗爺」2学期達成', '009', 'S', 190, true),
  ('anki-term3', '暗爺(3学期)', '暗記コンテスト「暗爺」3学期達成', '009', 'G', 200, true),
  ('attendance-y3s1', '出席率95%以上(3年1学期)', '3年1学期の出席率95%以上を達成', '010', 'C', 210, true),
  ('attendance-y3s2', '出席率95%以上(3年2学期)', '3年2学期の出席率95%以上を達成', '010', 'S', 220, true),
  ('attendance-y3s3', '出席率95%以上(3年3学期)', '3年3学期の出席率95%以上を達成', '010', 'G', 230, true),
  ('sports-win', '球技大会優勝', '球技大会で優勝', '011', 'G', 240, true),
  ('mock-exam-1st', '模擬試験1位', '模擬試験で1位', '012', 'G', 250, true),
  ('regular-exam-1st', '定期試験1位', '定期試験で1位', '013', 'G', 260, true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  medal_no = EXCLUDED.medal_no,
  tier = EXCLUDED.tier,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 旧バージョンの達成項目を無効化（既にシード済みの場合）
UPDATE public.medal_achievements
SET is_active = false, updated_at = now()
WHERE id IN (
  'first-login',
  'daily-quest-7',
  'correct-100',
  'mock-exam-80',
  'ankoku',
  'anmame',
  'anki',
  'attendance-95'
);
