// ★便 X13-G W-23（2026-10-21）: 打刻端末の店の「出退勤の打刻」設定（stores.punch_methods・0164）を返す（読むだけ）。
//   端末アカウントは stores を RLS で読めない＝auth_kiosk_store_id()（端末の店）で店を決めて admin で 1 列だけ読む。端末でなければ 403。
//   返すのは kiosk（打刻端末でキャストが打刻するか）と castPunchOff（本人のスマホと打刻端末の両方が OFF＝店が勤怠を記録）だけ。
import { NextResponse } from "next/server";
import { punchModeOf } from "@/lib/nox/shift/punch-mode"; // ★便 E（0197 用）
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { castPunchOffOf, opsProfileOf } from "@/lib/nox/store/ops-profile";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 2 同乗 R-7
import { kioskHomeTilesOf, kioskIdleSecOf, kioskTilesOf } from "@/lib/nox/rules-0175/kiosk"; // ★追補 2 同乗 R-7（裁定423 候補）★裁定468（M-127）: kioskHomeTilesOf

export async function GET() {
  const supabase = await createClient();
  const { data: storeId } = await supabase.rpc("auth_kiosk_store_id");
  if (typeof storeId !== "string") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await createAdminClient().from("stores").select(rules0175On() ? "punch_methods, settings_json" : "punch_methods").eq("id", storeId).maybeSingle();
  const pm = opsProfileOf((data ?? null) as Record<string, unknown> | null).punch_methods;
  // ★追補 2 同乗 R-7（裁定423 候補）: キオスクで使える機能（kiosk_features）と無操作秒数（kiosk_idle_sec）＝フラグ true のときだけ返す
  const sj = rules0175On() ? (((data ?? null) as unknown as { settings_json?: Record<string, unknown> | null } | null)?.settings_json ?? null) : null;
  const punchMode = punchModeOf(sj); // ★便 E（0197 用＝裁定455）: 'store'＝打刻しない店（キャストもスタッフも）＝端末は打刻の名前を出さない
  return NextResponse.json({ kiosk: pm.kiosk, castPunchOff: castPunchOffOf(pm) || punchMode === "store", punchMode, ...(sj ? { tiles: kioskHomeTilesOf(sj, pm, punchMode === "store") /* ★裁定468（M-127）: 出退勤は punch_methods.kiosk ∧ 打刻する店だけ */, tilesAll: kioskTilesOf(sj), idleSec: kioskIdleSecOf(sj) } : {}) });
}
