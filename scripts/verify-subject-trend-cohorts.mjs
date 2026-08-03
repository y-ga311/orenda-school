import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  try {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return;
        const i = t.indexOf("=");
        if (i < 0) return;
        process.env[t.slice(0, i).trim()] ||= t
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
      });
  } catch {
    // ignore
  }
}

function parseCohort(className) {
  const trimmed = className?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{2,})期/);
  return match?.[1] ?? null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: students } = await supabase
  .from("students")
  .select("gakusei_id, class, national_exam_failed");

const cohortStats = new Map();
for (const row of students ?? []) {
  const cohort = parseCohort(row.class);
  if (!cohort) continue;
  const stat = cohortStats.get(cohort) ?? { students: 0, failed: 0, sampleGakuseiId: null };
  stat.students += 1;
  if (row.national_exam_failed === true) stat.failed += 1;
  if (!stat.sampleGakuseiId) stat.sampleGakuseiId = row.gakusei_id;
  cohortStats.set(cohort, stat);
}

console.log("=== 期別 学生数 ===");
[...cohortStats.entries()]
  .sort((a, b) => Number(b[0]) - Number(a[0]))
  .forEach(([cohort, stat]) => {
    console.log(`${cohort}期: ${stat.students}人 (不合格${stat.failed}) sample=${stat.sampleGakuseiId}`);
  });

const { data: examRows } = await supabase
  .from("student_exam_results")
  .select("gakusei_id, session_key, subject_name, score, exam_type")
  .eq("exam_type", "regular")
  .like("subject_name", "解剖学%");

const { data: mockRows } = await supabase
  .from("test_scores")
  .select("student_id, test_name, anatomy")
  .ilike("test_name", "%模擬試験%");

const { data: allStudents } = await supabase.from("students").select("id, gakusei_id, class");

const gakuseiById = new Map((allStudents ?? []).map((s) => [String(s.id), s]));
const cohortByGakusei = new Map(
  (allStudents ?? []).map((s) => [String(s.gakusei_id).trim(), parseCohort(s.class)]),
);

function roundAvg(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

for (const cohort of [...cohortStats.keys()].sort((a, b) => Number(b) - Number(a))) {
  const gakuseiSet = new Set(
    (allStudents ?? [])
      .filter((s) => parseCohort(s.class) === cohort)
      .map((s) => String(s.gakusei_id).trim()),
  );
  const idSet = new Set(
    (allStudents ?? []).filter((s) => parseCohort(s.class) === cohort).map((s) => String(s.id)),
  );

  const perStudentSession = new Map();
  for (const row of examRows ?? []) {
    const gid = String(row.gakusei_id).trim();
    if (!gakuseiSet.has(gid)) continue;
    const key = `${gid}::${row.session_key}`;
    const list = perStudentSession.get(key) ?? [];
    list.push(Number(row.score));
    perStudentSession.set(key, list);
  }

  const sessionAvgs = new Map();
  perStudentSession.forEach((scores, key) => {
    const sessionKey = key.split("::")[1];
    const avg = roundAvg(scores);
    if (avg === null) return;
    const list = sessionAvgs.get(sessionKey) ?? [];
    list.push(avg);
    sessionAvgs.set(sessionKey, list);
  });

  const regularSession1 = roundAvg(sessionAvgs.get("1-1") ?? []);
  const mockScores = [];
  for (const row of mockRows ?? []) {
    const student = gakuseiById.get(String(row.student_id));
    const gid = student ? String(student.gakusei_id).trim() : null;
    if (!gid || !gakuseiSet.has(gid)) continue;
    const score = Number(row.anatomy);
    if (Number.isFinite(score)) mockScores.push(score);
  }

  console.log(
    `\n${cohort}期 解剖学: 定期1-1平均=${regularSession1 ?? "—"} 模擬(anatomy)件数=${mockScores.length} 模擬平均=${roundAvg(mockScores) ?? "—"}`,
  );
}
