import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KIOSK_PERSON_COOKIE, parseKioskPersonCookie } from "@/lib/nox/kiosk/person-session";

// ログアウト: サーバ側で signOut（sb-* セッション Cookie を破棄）→ /login へ 303。
// Route Handler は Cookie を書けるため、破棄はここで完結する（Server Component では不可）。
export async function POST(request: Request) {
  const supabase = await createClient();
  // ★通しの確かめ A-2（2026-11-12 夜）: キオスクの本人のセッションが残っていれば終えて cookie を消す（残ると次の管理者のログインがキオスクへ戻される）
  const kp = parseKioskPersonCookie((await cookies()).get(KIOSK_PERSON_COOKIE)?.value);
  if (kp) await createAdminClient().rpc("kiosk_person_end", { p_session_id: kp.sessionId, p_reason: "manual" }).then(() => undefined, () => undefined);
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.set(KIOSK_PERSON_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
