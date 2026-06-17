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

/** Supabase 表示などで base64 暗号文に改行が混ざることがある */
function normalizeStudentName(value: string) {
  return value.trim().replace(/\s+/g, "");
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

  try {
    return Buffer.from(value, "base64").length >= 8;
  } catch {
    return false;
  }
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
  encryptionKey: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("decrypt_student_name", {
    encrypted_name: encrypted,
    secret_key: encryptionKey,
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
  if (encryptionKeys.length === 0) {
    console.warn(
      "[studentNameCrypto] STUDENT_NAME_ENCRYPTION_KEY is not set. Encrypted student names cannot be decrypted.",
    );
    return trimmed;
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
      break;
    }

    candidate = normalizeStudentName(decrypted);
  }

  if (!looksLikeEncryptedStudentName(candidate)) {
    return candidate;
  }

  console.error(
    "[studentNameCrypto] Failed to decrypt student name. Check STUDENT_NAME_ENCRYPTION_KEY and decrypt_student_name RPC.",
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
