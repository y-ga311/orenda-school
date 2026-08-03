import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore
    }
  }
}

function parseCohortKeyFromClass(className) {
  const trimmed = className?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{2,})期/);
  return match?.[1] ?? null;
}

loadEnv();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const gakuseiId = process.argv[2] || "2340029";
const testName = process.argv[3] || "第1回模擬試験(22期生3年次)";

const { data: target } = await supabase
  .from("students")
  .select("id, gakusei_id, class, national_exam_failed")
  .eq("gakusei_id", gakuseiId)
  .maybeSingle();

const cohortKey = parseCohortKeyFromClass(target?.class);
console.log("Target", target?.gakusei_id, "cohort", cohortKey);

const { data: allStudents, error } = await supabase
  .from("students")
  .select("id, gakusei_id, class, national_exam_failed");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const failedStudentIdSet = new Set();
const studentIdSet = new Set();
for (const row of allStudents ?? []) {
  const rowCohort = parseCohortKeyFromClass(row.class);
  if (rowCohort !== cohortKey) continue;
  studentIdSet.add(String(row.id));
  if (row.national_exam_failed === true) {
    failedStudentIdSet.add(String(row.id));
  }
}

console.log("cohort students:", studentIdSet.size, "failed:", failedStudentIdSet.size);

const { data: scores } = await supabase
  .from("test_scores")
  .select("student_id, test_name, anatomy")
  .eq("test_name", testName);

const failedScores = (scores ?? []).filter((r) =>
  failedStudentIdSet.has(String(r.student_id)),
);
console.log(`scores for "${testName}" from failed:`, failedScores.length);
if (failedScores[0]) {
  console.log("sample anatomy values:", failedScores.map((r) => r.anatomy).slice(0, 7));
}

// Check column read issue: typeof national_exam_failed
const failedRaw = (allStudents ?? []).filter((s) => s.national_exam_failed);
const failedStrict = (allStudents ?? []).filter((s) => s.national_exam_failed === true);
console.log("failed truthy:", failedRaw.length, "failed === true:", failedStrict.length);
