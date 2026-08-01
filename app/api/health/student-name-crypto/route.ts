import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import {
  decryptStudentName,
  looksLikeEncryptedStudentName,
} from "@/lib/studentNameCrypto.server";
import { TEACHER_SESSION_COOKIE } from "@/lib/teacherSession";

export const runtime = "nodejs";

function fingerprint(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 12);
}

export async function GET() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(TEACHER_SESSION_COOKIE)?.value?.trim();
  if (!teacherId) {
    return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  }

  const encryptionKey = process.env.STUDENT_NAME_ENCRYPTION_KEY?.trim();
  const supabase = createServiceRoleClient();

  const result: Record<string, unknown> = {
    encryptionKeyConfigured: Boolean(encryptionKey),
    encryptionKeyFingerprint: fingerprint(encryptionKey),
    serviceRoleConfigured: Boolean(supabase),
    decryptRpcAvailable: false,
    sampleStudentDecryptOk: false,
    sampleStoredLooksEncrypted: false,
  };

  if (!supabase) {
    return NextResponse.json(result);
  }

  const { data: encryptedProbe, error: encryptError } = await supabase.rpc(
    "encrypt_student_name",
    {
      plain_name: "診断テスト",
      secret_key: encryptionKey ?? "",
    },
  );

  result.decryptRpcAvailable = !encryptError && typeof encryptedProbe === "string";

  const { data: sample } = await supabase
    .from("students")
    .select("gakusei_id, name")
    .not("name", "is", null)
    .limit(1)
    .maybeSingle();

  if (sample?.name) {
    result.sampleStoredLooksEncrypted = looksLikeEncryptedStudentName(sample.name);
    const decrypted = await decryptStudentName(sample.name);
    result.sampleStudentDecryptOk = Boolean(
      decrypted &&
        decrypted !== sample.name &&
        !looksLikeEncryptedStudentName(decrypted),
    );
    result.sampleGakuseiId = sample.gakusei_id;
  }

  if (!encryptionKey) {
    result.hint =
      "Vercel（Orenda-School プロジェクト）の Production に STUDENT_NAME_ENCRYPTION_KEY を設定し、再デプロイしてください。amt ポータルと同じ値に揃えます。";
  } else if (!result.sampleStudentDecryptOk && result.sampleStoredLooksEncrypted) {
    result.hint =
      "キーは設定されていますが復号に失敗しています。amt ポータルと同じ STUDENT_NAME_ENCRYPTION_KEY か確認し、再デプロイしてください。";
  }

  return NextResponse.json(result);
}
