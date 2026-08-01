#!/usr/bin/env node
/**
 * 緊急用: students.name を平文に戻す（本番 Vercel に復号キーが無く表示が壊れた場合）。
 * 通常は Vercel の STUDENT_NAME_ENCRYPTION_KEY 設定 + 再デプロイを推奨。
 *
 *   node scripts/restore-student-names-plaintext.mjs           # 診断
 *   node scripts/restore-student-names-plaintext.mjs --apply   # 平文化して UPDATE
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const primaryKey = process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim();

function containsJapanese(value) {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(value);
}

function normalizeEncryptedName(value) {
  return value.trim().replace(/ /g, "+").replace(/\s+/g, "");
}

function looksLikeEncryptedStudentName(value) {
  const normalized = normalizeEncryptedName(value);
  if (!normalized || containsJapanese(normalized)) return false;
  if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) return false;
  try {
    return Buffer.from(normalized, "base64").length >= 8;
  } catch {
    return false;
  }
}

async function decryptWithRpc(supabase, encrypted, encryptionKey) {
  const { data, error } = await supabase.rpc("decrypt_student_name", {
    encrypted_name: encrypted,
    secret_key: encryptionKey,
  });
  if (error || typeof data !== "string") return null;
  const decrypted = data.trim();
  if (!decrypted || decrypted === encrypted) return null;
  if (normalizeEncryptedName(decrypted) === encrypted) return null;
  return decrypted;
}

if (!supabaseUrl || !serviceRoleKey || !primaryKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STUDENT_NAME_ENCRYPTION_KEY が必要です。",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: students, error } = await supabase
  .from("students")
  .select("id, gakusei_id, name")
  .order("gakusei_id");

if (error) {
  console.error("students 取得エラー:", error.message);
  process.exit(1);
}

const targets = [];
for (const row of students ?? []) {
  const raw = row.name ?? "";
  if (!looksLikeEncryptedStudentName(raw)) continue;

  const decrypted = await decryptWithRpc(
    supabase,
    normalizeEncryptedName(raw),
    primaryKey,
  );
  if (!decrypted || looksLikeEncryptedStudentName(decrypted)) {
    console.error(`✗ 復号不可: gakusei_id=${row.gakusei_id}`);
    continue;
  }
  targets.push({ ...row, plaintext: decrypted });
}

console.log(`\n平文化対象: ${targets.length} / ${students?.length ?? 0} 件\n`);
if (targets.length > 0) {
  for (const row of targets.slice(0, 5)) {
    console.log(`  gakusei_id=${row.gakusei_id} -> "${row.plaintext}"`);
  }
  if (targets.length > 5) console.log(`  ...他 ${targets.length - 5} 件`);
  console.log("");
}

if (!APPLY) {
  console.log("実行するには: node scripts/restore-student-names-plaintext.mjs --apply\n");
  process.exit(0);
}

let updated = 0;
for (const row of targets) {
  const { error: updateError } = await supabase
    .from("students")
    .update({ name: row.plaintext, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateError) {
    console.error(`✗ UPDATE 失敗 gakusei_id=${row.gakusei_id}:`, updateError.message);
    continue;
  }
  updated += 1;
}

console.log(`完了: ${updated} 件を平文に戻しました。\n`);
