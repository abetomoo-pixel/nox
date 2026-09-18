// ★夜間便 N7-1（裁定273-6／277・0149 ★1 orgs.is_demo・2026-09-18）: 公開デモ org の柵（サーバ専用）。
//   デモ org（orgs.is_demo=true）からは「デモ内で完結しない操作」（課金・Stripe・招待・スタッフ作成・メール変更・マイナンバー・
//   キオスク発行・印刷ジョブ）を 403 で拒否する。差し込み点＝各 route（または route が使う共通ガード）の org 解決直後の 1 行。
//   分類表（拒否／許可）は scripts/verify-nox-demo-guard.ts（許可列挙型・裁定260）に明記＝分類の無い route があれば赤。
//   真の防御の一部（cast-photos の storage policy）は 0149 ★10。ここは route 層。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEMO_FORBIDDEN_MESSAGE = "デモ環境ではこの操作はできません";

/** org がデモか（admin で orgs.is_demo を 1 行読む・読めなければ false＝本番 org を誤って止めない） */
export async function isDemoOrg(orgId: string): Promise<boolean> {
  if (!orgId) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("orgs").select("is_demo").eq("id", orgId).maybeSingle();
    if (error) { console.error(`demo guard: orgs 読取失敗 ${error.message}`); return false; }
    return data?.is_demo === true;
  } catch (e) {
    console.error(`demo guard: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** デモ org なら 403（JSON {error}）を返す。そうでなければ null＝呼び出し側はそのまま続行 */
export async function assertNotDemo(orgId: string): Promise<NextResponse | null> {
  if (await isDemoOrg(orgId)) return NextResponse.json({ error: DEMO_FORBIDDEN_MESSAGE }, { status: 403 });
  return null;
}

/** 共通ガード（GuardErr 形）向け: デモ org なら { status: 403, body } を返す */
export async function demoGuardErr(orgId: string): Promise<{ ok: false; status: number; body: Record<string, unknown> } | null> {
  if (await isDemoOrg(orgId)) return { ok: false, status: 403, body: { error: DEMO_FORBIDDEN_MESSAGE } };
  return null;
}
