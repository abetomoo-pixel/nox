// ★0200（相談役 11/10＝仮置き 8 の作り直し）: キオスクの本人セッションの heartbeat。
//   呼び手＝本人セッションの画面（(manage) の KioskPersonGuard）＝操作がある間だけ 1 分ごと。無操作で端末へ戻る／ロック（交代）は person-end（kiosk_person_end が ended_at を立てる）。
//   柵＝①本人の auth（getUser）②cookie nox_kiosk_person の session_id ③端末の束縛（body の device_fp＝kiosk_devices.device_fp と照合）を RPC kiosk_person_touch（service_role だけ＝authenticated には EXECUTE なし）に渡す＝claim と同じ型。
//   last_seen_at が店の kiosk_person_idle_minutes 以内なら kiosk_person_active_of が true＝「店端末のみ」の店でも本人セッション中はレジが通る（auth_cast_can_register／auth_register_access）。
//   MIG_0200_APPLIED が false の間は 409（関数が無い）。デモ org も可（書くのは last_seen_at だけ＝読取と同じ扱い）。
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mig0200On } from "@/lib/nox/rules-0175/flag";
import { KIOSK_PERSON_COOKIE, parseKioskPersonCookie } from "@/lib/nox/kiosk/person-session";
import { isValidDeviceFp } from "@/lib/nox/kiosk/device-fp";

export async function POST(req: Request) {
  if (!mig0200On()) return NextResponse.json({ error: "not available" }, { status: 409 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const c = parseKioskPersonCookie((await cookies()).get(KIOSK_PERSON_COOKIE)?.value);
  if (!c) return NextResponse.json({ error: "no session" }, { status: 409 });
  let fp: string | null = null;
  try { const b = (await req.json()) as { device_fp?: unknown }; fp = typeof b.device_fp === "string" && isValidDeviceFp(b.device_fp) ? b.device_fp : null; } catch { fp = null; }
  if (!fp) return NextResponse.json({ error: "bad device_fp" }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("kiosk_person_touch", { p_session_id: c.sessionId, p_auth_user: user.id, p_device_fp: fp });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: data === true }, { status: data === true ? 200 : 409 });
}
