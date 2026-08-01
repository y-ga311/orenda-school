#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const key = process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim();

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

const { data, error } = await supabase
  .from("students")
  .select("id, gakusei_id, name")
  .order("gakusei_id");

if (error) {
  console.error(error);
  process.exit(1);
}

let plain = 0;
let encrypted = 0;
let decryptOk = 0;
let decryptFail = 0;
const failSamples = [];

for (const row of data ?? []) {
  const name = row.name ?? "";
  if (looksLikeEncryptedStudentName(name)) {
    encrypted += 1;
    const { data: decrypted, error: decryptError } = await supabase.rpc(
      "decrypt_student_name",
      {
        encrypted_name: normalizeEncryptedName(name),
        secret_key: key,
      },
    );
    const ok =
      !decryptError &&
      typeof decrypted === "string" &&
      decrypted.trim() &&
      decrypted.trim() !== name &&
      !looksLikeEncryptedStudentName(decrypted.trim());

    if (ok) decryptOk += 1;
    else {
      decryptFail += 1;
      if (failSamples.length < 5) {
        failSamples.push({
          gakusei_id: row.gakusei_id,
          storedPrefix: name.slice(0, 48),
          decrypted: typeof decrypted === "string" ? decrypted.slice(0, 48) : null,
          error: decryptError?.message ?? null,
        });
      }
    }
  } else {
    plain += 1;
  }
}

console.log(
  JSON.stringify(
    {
      total: data?.length ?? 0,
      plainTextInDb: plain,
      encryptedInDb: encrypted,
      decryptOkWithLocalKey: decryptOk,
      decryptFailWithLocalKey: decryptFail,
      keyFingerprint: key
        ? createHash("sha256").update(key).digest("hex").slice(0, 12)
        : "(unset)",
      failSamples,
    },
    null,
    2,
  ),
);
