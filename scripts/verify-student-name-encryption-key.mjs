#!/usr/bin/env node
/**
 * 学生氏名の暗号化キーが Supabase RPC と整合しているか検証する。
 * Orenda-School / amt_exam-portal-main で同じ STUDENT_NAME_ENCRYPTION_KEY を使う前提。
 *
 * 使い方:
 *   node scripts/verify-student-name-encryption-key.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SAMPLE_PLAIN = "暗号化キー検証テスト";

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local が無い場合は既存の process.env を使う
  }
}

function fingerprint(value) {
  if (!value) {
    return "(未設定)";
  }
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const encryptionKey = process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim();
const legacyKey = process.env.STUDENT_NAME_ENCRYPTION_KEY_LEGACY?.trim();

console.log("\n[Orenda-School] 学生氏名暗号化キー検証\n");

const missing = [];
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!encryptionKey) missing.push("STUDENT_NAME_ENCRYPTION_KEY");

if (missing.length > 0) {
  console.error("未設定の環境変数:", missing.join(", "));
  process.exit(1);
}

console.log(`STUDENT_NAME_ENCRYPTION_KEY fingerprint: ${fingerprint(encryptionKey)}`);
if (legacyKey) {
  console.log(`STUDENT_NAME_ENCRYPTION_KEY_LEGACY fingerprint: ${fingerprint(legacyKey)}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;

function fail(message) {
  console.error(`✗ ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`✓ ${message}`);
}

const { data: encrypted, error: encryptError } = await supabase.rpc(
  "encrypt_student_name",
  {
    plain_name: SAMPLE_PLAIN,
    secret_key: encryptionKey,
  },
);

if (encryptError) {
  fail(`encrypt_student_name RPC: ${encryptError.message}`);
  process.exit(1);
}

if (typeof encrypted !== "string" || !encrypted) {
  fail("encrypt_student_name が空を返しました");
  process.exit(1);
}

pass("encrypt_student_name RPC は利用可能");

const { data: decryptedWithKey, error: decryptError } = await supabase.rpc(
  "decrypt_student_name",
  {
    encrypted_name: encrypted,
    secret_key: encryptionKey,
  },
);

if (decryptError) {
  fail(`decrypt_student_name (明示キー): ${decryptError.message}`);
} else if (decryptedWithKey?.trim() === SAMPLE_PLAIN) {
  pass("decrypt_student_name（環境変数キー）で復号成功");
} else {
  fail(
    `decrypt_student_name（環境変数キー）の結果が不一致: "${decryptedWithKey ?? ""}"`,
  );
}

const { data: decryptedDbKey, error: decryptDbError } = await supabase.rpc(
  "decrypt_student_name",
  {
    encrypted_name: encrypted,
    secret_key: null,
  },
);

if (decryptDbError) {
  console.warn(`⚠ decrypt_student_name (DBキー): ${decryptDbError.message}`);
  console.warn(
    "  Supabase では DB パラメータ設定が権限不足で不可なことがあります。Vercel の STUDENT_NAME_ENCRYPTION_KEY を揃えれば問題ありません。",
  );
} else if (decryptedDbKey?.trim() === SAMPLE_PLAIN) {
  pass("decrypt_student_name（Supabase DB 設定キー）で復号成功");
} else {
  console.warn(
    "⚠ Supabase DB の app.student_name_encryption_key は未設定です（Supabase ホスティングでは通常）。",
  );
  console.warn(
    "  Vercel（Orenda-School / amt_exam-portal-main）の STUDENT_NAME_ENCRYPTION_KEY を同一にしてください。",
  );
}

const { data: students, error: studentsError } = await supabase
  .from("students")
  .select("gakusei_id, name")
  .not("name", "is", null)
  .limit(5);

if (studentsError) {
  fail(`students サンプル取得: ${studentsError.message}`);
} else if (!students?.length) {
  console.log("ℹ students テーブルにサンプル行がありません（スキップ）");
} else {
  let sampleOk = 0;
  let sampleFail = 0;
  for (const row of students) {
    const { data: name } = await supabase.rpc("decrypt_student_name", {
      encrypted_name: row.name,
      secret_key: encryptionKey,
    });
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || trimmed === row.name?.trim()) {
      sampleFail += 1;
    } else {
      sampleOk += 1;
    }
  }
  if (sampleFail > 0) {
    fail(
      `既存学生 ${sampleFail}/${students.length} 件を環境変数キーで復号できません（レガシーキーまたは DB 修復が必要な可能性）`,
    );
  } else {
    pass(`既存学生サンプル ${sampleOk} 件を環境変数キーで復号成功`);
  }
}

console.log("");
if (failed) {
  process.exit(1);
}

console.log("すべての検証に合格しました。");
console.log(
  "本番: Vercel（Orenda-School / amt_exam-portal-main）の STUDENT_NAME_ENCRYPTION_KEY も同一 fingerprint に揃えてください。\n",
);
