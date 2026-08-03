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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const gakuseiId = process.argv[2] || "234019";
const subject = process.argv[3] || "解剖学";

const res = await fetch(
  `http://localhost:3000/api/subject-trend?gakuseiId=${encodeURIComponent(gakuseiId)}&subjectName=${encodeURIComponent(subject)}`,
  { headers: { cookie: process.env.DIAG_COOKIE || "" } },
).catch(() => null);

if (!res || !res.ok) {
  console.log("API not available, using direct logic check");
  const { data: students } = await supabase.from("students").select("gakusei_id, class").ilike("class", "%22期%");
  const ids = new Set((students ?? []).map((s) => String(s.gakusei_id).trim()));
  const { data: rows } = await supabase
    .from("student_exam_results")
    .select("gakusei_id, session_key, subject_name, score")
    .eq("exam_type", "regular")
    .like("subject_name", "解剖学%");
  const byKey = new Map();
  (rows ?? []).forEach((row) => {
    const gid = String(row.gakusei_id).trim();
    if (!ids.has(gid)) return;
    const sn = String(row.subject_name).trim();
    if (!sn.startsWith("解剖学")) return;
    const key = `regular:${row.session_key}:${sn}`;
    const list = byKey.get(key) ?? [];
    list.push(Number(row.score));
    byKey.set(key, list);
  });
  for (const [key, scores] of [...byKey.entries()].slice(0, 8)) {
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    console.log(key, "n=", scores.length, "avg=", avg, "sample=", scores.slice(0, 5));
  }
} else {
  const data = await res.json();
  console.log("cohortLabel:", data.cohortAverageLabel);
  data.points.forEach((p) => {
    console.log(
      p.sourceType,
      p.sessionLabel.slice(0, 28),
      "self=",
      p.chartValue,
      "cohort=",
      p.cohortAverage,
    );
  });
}
