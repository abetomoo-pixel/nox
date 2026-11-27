// ★0236 追補（11/27・相談役 11:15）: 店の端末の退勤で「記録する送りの額」＝キャストの送り区分の額 → 送りベース額（読むだけ・書込なし）。
//   端末アカウントは stores／casts を RLS で読めない＝auth_kiosk_store_id()（端末の店）で店を決め、admin でその店のキャスト 1 人と店の設定だけ読む（kiosk/punch-methods と同じ型）。
//   端末でなければ 403・ほかの店のキャストは 404（id の有る無しを他店に出さない）。額の決め方は okuriRecordAmountOf（0236d の kiosk_transport_issue と同じ）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { okuriRecordAmountOf } from "@/lib/nox/shift/okuri-self";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const castId = new URL(req.url).searchParams.get("cast_id") ?? "";
  if (!UUID.test(castId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { data: storeId } = await supabase.rpc("auth_kiosk_store_id");
  if (typeof storeId !== "string") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: st }, { data: c }] = await Promise.all([
    admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle(),
    admin.from("casts").select("okuri_tier").eq("id", castId).eq("store_id", storeId).eq("is_active", true).maybeSingle(),
  ]);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sj = ((st ?? null) as { settings_json?: Record<string, unknown> | null } | null)?.settings_json ?? null;
  return NextResponse.json({ amount: okuriRecordAmountOf(sj, (c as { okuri_tier?: string | null }).okuri_tier ?? null) });
}
