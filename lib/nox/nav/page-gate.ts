// ★教訓142（2026-11-11 確定・相談役）＋夜便レーン 1: レイアウトに置いた柵は画面の移動（Link）では効かない（App Router はレイアウトを描き直さない）
//   ＝店側エリア（(manage)）の 3 つの柵を各ページの先頭で呼ぶ共通の関数に。中身は (manage)/layout.tsx と同じ判定（同じ純関数・同じ読取）。
//   ① キャストの入場＝キオスクの本人セッションは /register だけ・自分のスマホは /register と /report だけ（castRegisterEntryOf を通らなければ理由つきで /mine）
//   ② 規約の同意＝本番 org で現行版の同意が無ければ /terms/accept（termsGateRedirectOf）
//   ③ 初期設定の未完＝setup_done=false の店がある org は /setup（setupGateRedirectOf）
//   レイアウトの柵は直開き（全体の読み込み）で効くので残す（二重でよい・真の防御はサーバ側＝RLS・RPC）。
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { TERMS_VERSION, termsGateRedirectOf } from "@/lib/nox/terms";
import { castRegisterEntryOf } from "@/lib/nox/register/cast-entry-server";
import { setupGateRedirectOf } from "@/lib/nox/setup/gate";
import { KIOSK_PERSON_COOKIE, parseKioskPersonCookie } from "@/lib/nox/kiosk/person-session";
import { mig0196On, mig0199On } from "@/lib/nox/rules-0175/flag";

const onPath = (p: string, base: string): boolean => p === base || p.startsWith(`${base}/`);

/** 店側エリアのページの先頭で呼ぶ（await managePageGate()）。通すときは何も返さない・止めるときは redirect（例外で抜ける） */
export async function managePageGate(): Promise<void> {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  const supabase = await createClient();
  const pathname = (await headers()).get("x-pathname") ?? "";
  // ① キャストの入場
  if (role === "cast") {
    const kioskPersonCast = mig0196On() && mig0199On() ? parseKioskPersonCookie((await cookies()).get(KIOSK_PERSON_COOKIE)?.value) : null;
    if (kioskPersonCast) {
      if (!onPath(pathname, "/register")) redirect("/register");
    } else {
      if (!(onPath(pathname, "/register") || onPath(pathname, "/report"))) redirect("/mine");
      const e = await castRegisterEntryOf(supabase);
      if (!e.allowed) redirect(`/mine?denied=register&why=${e.reason ?? "not_allowed"}`);
    }
  }
  // ② 規約の同意・③ 初期設定の未完（デモ org は対象外＝レイアウトと同じ）
  const [{ data: orgRow }, { data: storeRows }] = await Promise.all([
    supabase.from("orgs").select("is_demo").limit(1).maybeSingle(),
    supabase.from("stores").select("settings_json"),
  ]);
  const isDemo = orgRow?.is_demo === true;
  if (!isDemo) {
    const { data: termsOk } = await supabase.rpc("terms_accepted_version_ok", { p_version: TERMS_VERSION });
    const to = termsGateRedirectOf(isDemo, termsOk === true, pathname);
    if (to) redirect(to);
  }
  const needsSetup = (storeRows ?? []).some((r) => ((r.settings_json as Record<string, unknown> | null)?.setup_done) !== true);
  const toSetup = setupGateRedirectOf({ role, isDemo, needsSetup, pathname });
  if (toSetup) redirect(toSetup);
}
