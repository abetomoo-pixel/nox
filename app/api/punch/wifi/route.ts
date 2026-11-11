// ★0201（裁定474・2026-11-11 フラグ便）: 店の Wi-Fi（IP）の登録＝「いまつないでいる Wi-Fi を登録」。IP はサーバーで取る（x-forwarded-for の先頭）＝画面の申告にしない。
//   GET＝いまの IP を返す（表示だけ）・POST {store_id}＝その IP を store_wifi_add（本人の auth＝owner／自店 manager だけ・RPC が判定）。
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { mig0201On } from "@/lib/nox/rules-0175/flag";
import { clientIpOf } from "@/lib/nox/punch/geofence";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ ip: clientIpOf((await headers()).get("x-forwarded-for")) });
}

export async function POST(req: Request) {
  if (!mig0201On()) return NextResponse.json({ error: "not available" }, { status: 409 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let storeId: string | null = null;
  try { const b = (await req.json()) as { store_id?: unknown }; storeId = typeof b.store_id === "string" ? b.store_id : null; } catch { storeId = null; }
  const ip = clientIpOf((await headers()).get("x-forwarded-for"));
  if (!storeId || !ip) return NextResponse.json({ error: !ip ? "no ip" : "bad args" }, { status: 400 });
  const { error } = await supabase.rpc("store_wifi_add", { p_store_id: storeId, p_ip: ip });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, ip });
}
