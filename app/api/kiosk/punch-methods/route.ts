// ★便 X13-G W-23（2026-10-21）: 打刻端末の店の「出退勤の打刻」設定（stores.punch_methods・0164）を返す（読むだけ）。
//   端末アカウントは stores を RLS で読めない＝auth_kiosk_store_id()（端末の店）で店を決めて admin で 1 列だけ読む。端末でなければ 403。
//   返すのは kiosk（打刻端末でキャストが打刻するか）と castPunchOff（本人のスマホと打刻端末の両方が OFF＝店が勤怠を記録）だけ。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { castPunchOffOf, opsProfileOf } from "@/lib/nox/store/ops-profile";

export async function GET() {
  const supabase = await createClient();
  const { data: storeId } = await supabase.rpc("auth_kiosk_store_id");
  if (typeof storeId !== "string") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await createAdminClient().from("stores").select("punch_methods").eq("id", storeId).maybeSingle();
  const pm = opsProfileOf((data ?? null) as Record<string, unknown> | null).punch_methods;
  return NextResponse.json({ kiosk: pm.kiosk, castPunchOff: castPunchOffOf(pm) });
}
