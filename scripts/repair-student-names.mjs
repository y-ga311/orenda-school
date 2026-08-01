#!/usr/bin/env node
/**
 * 氏名が暗号文のまま表示される students 行を診断・修復する。
 *
 * 使い方:
 *   node scripts/repair-student-names.mjs           # 診断のみ（デフォルト）
 *   node scripts/repair-student-names.mjs --apply   # 復号できる行を現行キーで再暗号化して UPDATE
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const LEGACY_PLACEHOLDER_KEY = "ここに暗号化キーを設定";
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

function getEncryptionKeys() {
  const keys = [];
  const add = (value) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
  };
  add(primaryKey);
  add(process.env.STUDENT_NAME_ENCRYPTION_KEY_LEGACY);
  if (!keys.includes(LEGACY_PLACEHOLDER_KEY)) add(LEGACY_PLACEHOLDER_KEY);
  return keys;
}

function normalizeEncryptedName(value) {
  return value.trim().replace(/ /g, "+").replace(/\s+/g, "");
}

function containsJapanese(value) {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(value);
}

function base64DecodedLength(value) {
  try {
    return Buffer.from(value, "base64").length;
  } catch {
    return 0;
  }
}

function looksLikeEncryptedStudentName(value) {
  const normalized = normalizeEncryptedName(value);
  if (!normalized) return false;
  if (containsJapanese(normalized)) return false;
  if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) return false;
  return base64DecodedLength(normalized) >= 8;
}

function formatStudentNameForDisplay(value) {
  const trimmed = value.trim();
  if (!trimmed || looksLikeEncryptedStudentName(trimmed)) return trimmed;
  if (containsJapanese(trimmed) || /^[A-Za-z]/.test(trimmed)) {
    return trimmed.replace(/\+/g, " ");
  }
  return trimmed;
}

async function decryptWithRpc(supabase, encrypted, encryptionKey) {
  const { data, error } = await supabase.rpc("decrypt_student_name", {
    encrypted_name: encrypted,
    secret_key: encryptionKey?.trim() || "",
  });
  if (error || typeof data !== "string") return null;
  const decrypted = data.trim();
  if (!decrypted || decrypted === encrypted) return null;
  if (normalizeEncryptedName(decrypted) === encrypted) return null;
  return decrypted;
}

async function encryptWithRpc(supabase, plainName, encryptionKey) {
  const { data, error } = await supabase.rpc("encrypt_student_name", {
    plain_name: plainName,
    secret_key: encryptionKey,
  });
  if (error || typeof data !== "string") return null;
  const encrypted = normalizeEncryptedName(data);
  if (!encrypted || !looksLikeEncryptedStudentName(encrypted)) return null;
  return encrypted;
}

async function resolvePlaintext(supabase, rawName) {
  const trimmed = rawName.trim();
  if (!trimmed) return { plaintext: trimmed, status: "empty" };

  if (!looksLikeEncryptedStudentName(trimmed)) {
    return {
      plaintext: formatStudentNameForDisplay(trimmed),
      status: containsJapanese(trimmed) ? "already_plain" : "plain_ascii",
    };
  }

  const keys = getEncryptionKeys();
  let candidate = normalizeEncryptedName(trimmed);

  for (let depth = 0; depth < 5; depth++) {
    if (!looksLikeEncryptedStudentName(candidate)) {
      return {
        plaintext: formatStudentNameForDisplay(candidate),
        status: depth === 0 ? "already_plain" : "decrypted_multi_layer",
      };
    }

    let decrypted = null;
    for (const key of keys) {
      decrypted = await decryptWithRpc(supabase, candidate, key);
      if (decrypted) break;
    }
    if (!decrypted) {
      decrypted = await decryptWithRpc(supabase, candidate, "");
    }
    if (!decrypted) break;
    candidate = decrypted.trim();
  }

  if (!looksLikeEncryptedStudentName(candidate)) {
    return {
      plaintext: formatStudentNameForDisplay(candidate),
      status: "decrypted",
    };
  }

  return { plaintext: null, status: "unrecoverable", raw: trimmed };
}

if (!supabaseUrl || !serviceRoleKey || !primaryKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STUDENT_NAME_ENCRYPTION_KEY が必要です。");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\n学生氏名 診断${APPLY ? "・修復" : ""} (${APPLY ? "--apply" : "dry-run"})\n`);

const { data: students, error } = await supabase
  .from("students")
  .select("id, gakusei_id, name")
  .order("gakusei_id");

if (error) {
  console.error("students 取得エラー:", error.message);
  process.exit(1);
}

const results = [];
for (const row of students ?? []) {
  const resolved = await resolvePlaintext(supabase, row.name ?? "");
  const singleDecrypt = await decryptWithRpc(
    supabase,
    normalizeEncryptedName(row.name ?? ""),
    primaryKey,
  );
  const stillEncryptedAfterOneLayer =
    Boolean(singleDecrypt) && looksLikeEncryptedStudentName(singleDecrypt);
  const needsDoubleDecrypt =
    looksLikeEncryptedStudentName(row.name ?? "") &&
    resolved.status === "decrypted_multi_layer" &&
    stillEncryptedAfterOneLayer;

  results.push({
    id: row.id,
    gakusei_id: row.gakusei_id,
    status: resolved.status,
    plaintext: resolved.plaintext,
    needsRepair: needsDoubleDecrypt && Boolean(resolved.plaintext),
    unrecoverable:
      looksLikeEncryptedStudentName(row.name ?? "") && !resolved.plaintext,
    currentLooksEncrypted: looksLikeEncryptedStudentName(row.name ?? ""),
    healthy:
      !looksLikeEncryptedStudentName(row.name ?? "") ||
      (Boolean(singleDecrypt) && !looksLikeEncryptedStudentName(singleDecrypt)),
  });
}

const broken = results.filter((r) => r.unrecoverable);
const repairable = results.filter((r) => r.needsRepair);
const ok = results.filter((r) => r.healthy);

console.log(`全件: ${results.length}`);
console.log(`表示OK（平文 or 復号可能な1層暗号）: ${ok.length}`);
console.log(`修復可能（平文化でき再暗号化）: ${repairable.length}`);
console.log(`修復不可（手動対応が必要）: ${broken.length}\n`);

if (repairable.length > 0) {
  console.log("--- 修復対象 ---");
  for (const r of repairable) {
    console.log(
      `  gakusei_id=${r.gakusei_id} id=${r.id} status=${r.status} -> "${r.plaintext}"`,
    );
  }
  console.log("");
}

if (broken.length > 0) {
  console.log("--- 修復不可 ---");
  for (const r of broken) {
    console.log(`  gakusei_id=${r.gakusei_id} id=${r.id}`);
  }
  console.log("");
}

if (!APPLY) {
  if (repairable.length > 0) {
    console.log("修復を実行するには: node scripts/repair-student-names.mjs --apply\n");
  }
  process.exit(broken.length > 0 ? 1 : 0);
}

let updated = 0;
let failed = 0;

for (const r of repairable) {
  const encrypted = await encryptWithRpc(supabase, r.plaintext, primaryKey);
  if (!encrypted) {
    console.error(`✗ 暗号化失敗: gakusei_id=${r.gakusei_id}`);
    failed += 1;
    continue;
  }

  const { error: updateError } = await supabase
    .from("students")
    .update({ name: encrypted, updated_at: new Date().toISOString() })
    .eq("id", r.id);

  if (updateError) {
    console.error(`✗ UPDATE 失敗 gakusei_id=${r.gakusei_id}:`, updateError.message);
    failed += 1;
    continue;
  }

  console.log(`✓ 修復完了: gakusei_id=${r.gakusei_id} -> "${r.plaintext}"`);
  updated += 1;
}

console.log(`\n完了: ${updated} 件更新, ${failed} 件失敗, ${broken.length} 件は手動対応が必要\n`);
process.exit(failed > 0 || broken.length > 0 ? 1 : 0);
