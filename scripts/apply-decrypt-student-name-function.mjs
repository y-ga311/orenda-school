#!/usr/bin/env node
/**
 * Supabase SQL Editor の代わりに復号 RPC を作成するスクリプト。
 *
 * 使い方:
 *   SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@...:6543/postgres" \
 *   node scripts/apply-decrypt-student-name-function.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dbUrl = process.env.SUPABASE_DB_URL?.trim();
if (!dbUrl) {
  console.error("SUPABASE_DB_URL が未設定です。Supabase Dashboard > Database > Connection string から取得してください。");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../docs/sql/create-decrypt-student-name-function.sql");
const ddl = fs.readFileSync(sqlPath, "utf8");

const sql = postgres(dbUrl, { max: 1 });

try {
  await sql.unsafe(ddl);
  console.log("decrypt_student_name RPC を作成しました。");
} finally {
  await sql.end();
}
