import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

/** 移行期間中に使われていたプレースホルダーキー（旧暗号化データの復号用） */
const LEGACY_PLACEHOLDER_KEY = "ここに暗号化キーを設定";

function getEncryptionKeys(): string[] {
  const keys: string[] = [];
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) {
      keys.push(trimmed);
    }
  };

  add(process.env.STUDENT_NAME_ENCRYPTION_KEY);
  add(process.env.STUDENT_NAME_ENCRYPTION_KEY_LEGACY);
  if (!keys.includes(LEGACY_PLACEHOLDER_KEY)) {
    add(LEGACY_PLACEHOLDER_KEY);
  }

  return keys;
}

function getPrimaryEncryptionKey(): string | undefined {
  return process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim() || undefined;
}

/** URL/form 経由で base64 の「+」がスペースに化けるケースを補正 */
function normalizeStudentName(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length >= 16) {
    return trimmed.replace(/ /g, "+").replace(/[\r\n\t]/g, "");
  }

  return trimmed.replace(/\s+/g, "");
}

function base64DecodedLength(value: string) {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").length;
    }

    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    return binary.length;
  } catch {
    return 0;
  }
}

/** ひらがな・カタカナ・漢字を含む → DB 上の平文氏名 */
function containsJapanese(value: string) {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(value);
}

/** pgp_sym_encrypt + base64 の暗号文形式か */
function isBase64Ciphertext(value: string) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
    return false;
  }

  return base64DecodedLength(value) >= 8;
}

/** 復号 RPC を呼ぶべきか（平文の日本語氏名は除外） */
export function looksLikeEncryptedStudentName(value: string) {
  const normalized = normalizeStudentName(value);
  if (!normalized) {
    return false;
  }
  if (containsJapanese(normalized)) {
    return false;
  }
  return isBase64Ciphertext(normalized);
}

async function decryptWithPostgresRpc(
  encrypted: string,
  encryptionKey?: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("decrypt_student_name", {
    encrypted_name: encrypted,
    secret_key: encryptionKey?.trim() || "",
  });

  if (error) {
    if (
      error.message.includes("decrypt_student_name") ||
      error.code === "PGRST202"
    ) {
      console.warn(
        "[studentNameCrypto] decrypt_student_name RPC is missing. Run docs/sql/create-decrypt-student-name-function.sql in Supabase.",
      );
    } else {
      console.error("[studentNameCrypto] rpc decrypt failed:", error.message);
    }
    return null;
  }

  if (typeof data !== "string") {
    return null;
  }

  const decrypted = data.trim();
  if (!decrypted) {
    return null;
  }

  if (
    decrypted === encrypted ||
    normalizeStudentName(decrypted) === encrypted
  ) {
    return null;
  }

  return decrypted;
}

async function encryptWithPostgresRpc(
  plainName: string,
  encryptionKey: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("encrypt_student_name", {
    plain_name: plainName,
    secret_key: encryptionKey,
  });

  if (error) {
    if (
      error.message.includes("encrypt_student_name") ||
      error.code === "PGRST202"
    ) {
      console.warn(
        "[studentNameCrypto] encrypt_student_name RPC is missing. Run docs/sql/create-encrypt-student-name-function.sql in Supabase.",
      );
    } else {
      console.error("[studentNameCrypto] rpc encrypt failed:", error.message);
    }
    return null;
  }

  if (typeof data !== "string") {
    return null;
  }

  const encrypted = normalizeStudentName(data);
  if (!encrypted || !looksLikeEncryptedStudentName(encrypted)) {
    return null;
  }

  return encrypted;
}

/** 平文氏名を DB 保存用に暗号化（既に暗号化済みならそのまま返す） */
export async function encryptStudentNameForStorage(
  value: string | null | undefined,
): Promise<string | null> {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = normalizeStudentName(trimmed);
  if (looksLikeEncryptedStudentName(normalized)) {
    return normalized;
  }

  const encryptionKey = getPrimaryEncryptionKey();
  if (!encryptionKey) {
    console.error(
      "[studentNameCrypto] STUDENT_NAME_ENCRYPTION_KEY is not set. Cannot encrypt student name for storage.",
    );
    return null;
  }

  return encryptWithPostgresRpc(trimmed, encryptionKey);
}

/**
 * 登録・更新用: 入力値を一度平文化してから暗号化する。
 * 編集フォームに暗号文が残っていても二重暗号化しない。
 */
export async function prepareStudentNameForStorage(
  value: string | null | undefined,
): Promise<string | null> {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const plaintext = (await decryptStudentName(trimmed)) ?? trimmed;
  const normalizedPlain = normalizeStudentName(plaintext);

  if (looksLikeEncryptedStudentName(normalizedPlain)) {
    console.error(
      "[studentNameCrypto] Could not normalize student name to plaintext before encryption.",
    );
    return null;
  }

  return encryptStudentNameForStorage(plaintext);
}

export async function decryptStudentName(
  value: string | null | undefined,
): Promise<string | null> {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = normalizeStudentName(trimmed);

  if (!looksLikeEncryptedStudentName(normalized)) {
    return trimmed;
  }

  const encryptionKeys = getEncryptionKeys();
  if (
    encryptionKeys.length === 0 &&
    !process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim()
  ) {
    console.warn(
      "[studentNameCrypto] STUDENT_NAME_ENCRYPTION_KEY is not set. Trying Supabase DB key settings via decrypt_student_name RPC.",
    );
  }

  let candidate = normalized;
  for (let depth = 0; depth < 5; depth++) {
    if (!looksLikeEncryptedStudentName(candidate)) {
      return candidate;
    }

    let decrypted: string | null = null;
    for (const encryptionKey of encryptionKeys) {
      decrypted = await decryptWithPostgresRpc(candidate, encryptionKey);
      if (decrypted) {
        break;
      }
    }

    if (!decrypted) {
      decrypted = await decryptWithPostgresRpc(candidate);
    }

    if (!decrypted) {
      break;
    }

    candidate = normalizeStudentName(decrypted);
  }

  if (!looksLikeEncryptedStudentName(candidate)) {
    return candidate;
  }

  console.error(
    "[studentNameCrypto] Failed to decrypt student name. Set STUDENT_NAME_ENCRYPTION_KEY on Vercel and/or run docs/sql/set-student-name-encryption-key.sql in Supabase.",
  );
  return trimmed;
}

export async function decryptStudentRows<T extends { name: string | null }>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      name: row.name === null ? null : await decryptStudentName(row.name),
    })),
  );
}
