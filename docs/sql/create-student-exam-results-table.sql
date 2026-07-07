-- 学生試験成績（定期試験 / 模擬試験 / 卒業試験）
-- exam_type: regular | mock | graduation

create table if not exists student_exam_results (
  id uuid primary key default gen_random_uuid(),
  gakusei_id text not null,
  exam_type text not null check (exam_type in ('regular', 'mock', 'graduation')),
  session_key text not null,
  session_label text not null,
  subject_name text not null,
  score numeric(5, 1) not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now(),
  unique (gakusei_id, exam_type, session_key, subject_name)
);

create index if not exists idx_student_exam_results_lookup
  on student_exam_results (gakusei_id, exam_type, session_key);

NOTIFY pgrst, 'reload schema';
