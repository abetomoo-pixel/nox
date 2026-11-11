// ★0201（裁定474・2026-11-11 フラグ便）: 本人のスマホ打刻の入口。/mine の打刻ボタン → ここ → punch_self_impl（service_role だけ）。
//   柵＝①本人の auth（getUser）②位置は端末の申告（lat／lng／accuracy）・IP はサーバーで取る（x-forwarded-for の先頭＝端末の申告にしない）
//   ③判定は lib/nox/punch/geofence.ts（evaluateGeofence／decidePunch）＝RPC が店の値で同じ決まりを再計算する（route の申告に頼らない）
//   ④within_schedule は必ず渡す（出勤＝今日の営業日に確定シフトがあるか）＝予定外 block の店で渡し忘れると RPC が 'no shift'（相談役 11/11 ④）。
//   返り＝200 {ok, punch_id, within_geofence, override}／409 {error: 'geofence_blocked'|'geofence_unavailable'|'terminal_only'|'no shift'|…}＝画面が和文にする。
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mig0201On } from "@/lib/nox/rules-0175/flag";
import { clientIpOf, evaluateGeofence, type RestrictMode } from "@/lib/nox/punch/geofence";
import { bizDateOf } from "@/lib/nox/biz-date";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: Request) {
  if (!mig0201On()) return NextResponse.json({ error: "not available" }, { status: 409 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let b: Record<string, unknown> = {};
  try { b = (await req.json()) as Record<string, unknown>; } catch { b = {}; }
  const type = b.type === "in" || b.type === "out" ? b.type : null;
  if (!type) return NextResponse.json({ error: "bad type" }, { status: 400 });
  const okuri = typeof b.okuri === "boolean" ? b.okuri : null;
  const reason = typeof b.override_reason === "string" ? b.override_reason.trim().slice(0, 200) : "";
  const admin = createAdminClient();
  const { data: me } = await admin.from("users").select("id, casts!inner(id, store_id, is_active)").eq("auth_user_id", user.id).eq("is_active", true).eq("casts.is_active", true).maybeSingle();
  const cast = ((me as { casts?: { id: string; store_id: string }[] } | null)?.casts ?? [])[0];
  if (!cast) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: st } = await admin.from("stores")
    .select("punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_allow_ip, settings_json").eq("id", cast.store_id).maybeSingle();
  if (!st) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sj = (st.settings_json ?? {}) as Record<string, unknown>;
  const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
  const mode = ((st.punch_restrict_mode as string | null) ?? "gps") as RestrictMode;
  const ip = clientIpOf((await headers()).get("x-forwarded-for"));
  const geo = evaluateGeofence(mode,
    { lat: num(st.punch_lat), lng: num(st.punch_lng), radius: num(st.punch_radius_m), allowIp: (st.punch_allow_ip as string[] | null) ?? [] },
    { lat: num(b.lat), lng: num(b.lng), ip, accuracy: num(b.accuracy) });
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const { count } = await admin.from("shifts").select("id", { count: "exact", head: true }).eq("cast_id", cast.id).eq("date", bizToday).eq("status", "confirmed");
  const p_geo = { ...geo, override_reason: reason || null, within_schedule: (count ?? 0) > 0 };
  const { data, error } = await admin.rpc("punch_self_impl", { p_actor: user.id, p_type: type, p_geo, p_okuri: okuri });
  if (error) {
    const code = /terminal_only|geofence_blocked|geofence_unavailable|no shift|self disabled|already in|already out|no open punch|forbidden/.exec(error.message)?.[0] ?? error.message;
    return NextResponse.json({ error: code, reason: geo.reason }, { status: 409 });
  }
  return NextResponse.json(data ?? { ok: true });
}
