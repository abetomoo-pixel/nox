import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import PageHead from "@/components/ui/page-head";
import PinSelfCard from "@/components/nox/pin-self-card";
import ContactForm from "@/app/mine/contact-form";
import { KIOSK_PERSON_COOKIE, parseKioskPersonCookie } from "@/lib/nox/kiosk/person-session";
import { mig0196On, mig0201On } from "@/lib/nox/rules-0175/flag";
import { SELF_PROFILE_KIOSK_NOTE, selfProfileStoreOnlyNoteOf } from "@/lib/nox/people/self-profile";
import Link from "next/link";
import { SelfProfileFields } from "./profile-form";
import { managePageGate } from "@/lib/nox/nav/page-gate";

export const dynamic = "force-dynamic";

// ★M-177（2026-11-11 Agoora 確定・夜便レーン 1）: スタッフ（と店長・オーナー）本人の「自分の情報を編集」。
//   本人＝連絡先（電話・連絡用メール＝set_my_contact／住所・緊急連絡先＝member_profile_self_save）・PIN。パスワードは再設定の画面へ（demo-guard dg(6-1) と食い違うため・相談役の判断待ち）。写真は右上の「自分の情報」から。
//   氏名・生年月日・口座＝店長とオーナーだけ（ここは表示しない＋案内の 1 行）。店の端末の本人セッション＝PIN の変更だけ（相談役 ★3・柵は画面だけ）。
//   読むのは本人の行だけ（users_select＝本人／member_profiles_select＝本人）。cast は /mine（同じ項目が /mine にある）。
export default async function StaffProfilePage() {
  await managePageGate(); // ★教訓142
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const kioskPerson = mig0196On() ? parseKioskPersonCookie((await cookies()).get(KIOSK_PERSON_COOKIE)?.value) : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("users").select("id, contact_email, phone").eq("auth_user_id", user.id).maybeSingle() : { data: null };
  const { data: prof } = me ? await supabase.from("member_profiles").select("address, emergency_name, emergency_relation, emergency_phone").eq("user_id", me.id).maybeSingle() : { data: null };
  const sec: React.CSSProperties = { marginBottom: 14 };
  return (
    <div className="nox-mv1 nox-mv1-m" data-self-profile-page={kioskPerson ? "kiosk" : "own"}>
      <PageHead eyebrow="MY PROFILE" title="自分の情報を編集" desc={kioskPerson ? SELF_PROFILE_KIOSK_NOTE : "連絡先・住所・緊急連絡先・PIN を変更できます。"} />
      {kioskPerson ? (
        mig0201On() ? <section className="nox-panel" style={sec}><PinSelfCard kind="staff" /></section> : <p className="nox-panel" style={sec}>この端末では変更できる項目がありません。</p>
      ) : (
        <>
          <section className="nox-panel" style={sec} data-self-contact="1"><h3>連絡先（電話・連絡用メール）</h3><ContactForm contactEmail={(me?.contact_email as string | null) ?? null} phone={(me?.phone as string | null) ?? null} /></section>
          <section className="nox-panel" style={sec}><h3>住所・緊急連絡先</h3><SelfProfileFields row={prof ?? null} /></section>
          {mig0201On() && <section className="nox-panel" style={sec}><PinSelfCard kind="staff" /></section>}
          <section className="nox-panel" style={sec} data-self-password="1"><h3>パスワード</h3><p style={{ fontSize: 12.5, margin: 0 }}>パスワードの変更は、ログアウトしてログイン画面の「パスワードを忘れた方」から行えます（登録のメールに再設定の案内が届きます）。<Link href="/auth/forgot" className="nox-link">パスワードの再設定へ ›</Link></p></section>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 14px" }} data-self-store-only="1">{selfProfileStoreOnlyNoteOf(role)}写真は右上の「自分の情報」から変更できます。</p>
        </>
      )}
    </div>
  );
}
