// ★便 E（2026-11-05・0196 用＝裁定448 B 方式）: キオスクの本人セッションの終了（無操作 N 分・「キオスクへ戻る」・ロック）。
//   呼び手＝本人のセッション（(manage) の KioskPersonGuard）。cookie nox_kiosk_person の session_id を kiosk_person_end（service_role）で ended にし、本人をサインアウト（cookie 破棄）、印の cookie を消す。
//   client はそのあと端末のセッションを localStorage から復元して /kiosk へ（M-49 の leave と同じ）。cookie が無ければ 204 相当（ok:false）＝何もしない。
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KIOSK_PERSON_COOKIE, parseKioskPersonCookie } from "@/lib/nox/kiosk/person-session";

export async function POST(req: Request) {
  let reason: "idle" | "manual" | "lock" = "manual";
  try { const b = (await req.json()) as { reason?: unknown }; if (b.reason === "idle" || b.reason === "lock" || b.reason === "manual") reason = b.reason; } catch { /* body なし＝manual */ }
  const c = parseKioskPersonCookie((await cookies()).get(KIOSK_PERSON_COOKIE)?.value);
  const supabase = await createClient();
  let ended = false;
  if (c) {
    const { data } = await createAdminClient().rpc("kiosk_person_end", { p_session_id: c.sessionId, p_reason: reason });
    ended = data === true;
  }
  await supabase.auth.signOut().catch(() => undefined); // 本人のセッションを終える（sb-* cookie の破棄は ssr が載せる）
  const res = NextResponse.json({ ok: !!c, ended });
  res.cookies.set(KIOSK_PERSON_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
