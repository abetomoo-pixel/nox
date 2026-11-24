// ★便 ON-3（2026-10-26・0176 ★2＝I-1 登録→招待の 2 段）: 招待の受諾ページ（公開面＝(manage) 外・middleware の保護パス外・noindex）。
//   招待の中身（名前・店名・メール・状態）はサーバで admin client から引く（staff_invites の RLS は店側だけ＝本人は読めないため）。トークンは sha256 で引く（平文は URL にだけ）。
//   受諾＝AcceptForm（本人がパスワードを決める）→ POST /api/staff/invite/accept → ログインして /dashboard へ。
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVITE_ACCEPT_TITLE, INVITE_ACCEPTED_NOTE, INVITE_NOT_FOUND, INVITE_TOKEN_RE, inviteExpiryTextOf, inviteStateOf } from "@/lib/nox/people/invite";
import { tokenHashOf } from "@/lib/nox/people/invite-server";
import AcceptForm from "./accept-form";
import * as t from "@/lib/nox/ui/theme"; // ★起票157（相談役 11/24 夜 N2）: 白地 → 店の画面と同じ暗いテーマ（/auth/set-password と同じ器＝nox-dark・t.loginBg・t.lcard・ロゴ）
import BrandLogo from "@/components/ui/brand-logo";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: INVITE_ACCEPT_TITLE, robots: { index: false, follow: false } };

type Info = { name: string; email: string; storeName: string; role: string; state: "ok" | "accepted" | "expired"; expiresAt: string };

export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info: Info | null = null;
  if (INVITE_TOKEN_RE.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin.from("staff_invites").select("name, email, role, accepted_at, expires_at, stores(name)").eq("token_hash", tokenHashOf(token)).maybeSingle();
    if (data) {
      const st = (data.stores as { name?: string } | { name?: string }[] | null);
      const storeName = Array.isArray(st) ? st[0]?.name ?? "" : st?.name ?? "";
      info = { name: data.name as string, email: data.email as string, storeName, role: data.role as string, state: inviteStateOf({ accepted_at: data.accepted_at as string | null, expires_at: data.expires_at as string }, Date.now()), expiresAt: data.expires_at as string };
    }
  }
  const body: React.CSSProperties = { ...t.sub, fontSize: 14, lineHeight: 1.75 };
  return (
    <main className="nox-dark" style={t.loginBg} data-invite-accept="1">
      <div className="nox-lcardtop" style={t.lcard}>
        <div style={{ display: "flex", justifyContent: "center", margin: "0 0 4px" }} aria-hidden="true"><BrandLogo height={56} /></div>
        <h1 style={{ textAlign: "center", color: "var(--sub)", fontSize: 13, fontWeight: 600, margin: "6px 0 12px" }}>{INVITE_ACCEPT_TITLE}</h1>
        {!info ? (
          <p style={body} data-invite-state="missing">{INVITE_NOT_FOUND}</p>
        ) : info.state === "accepted" ? (
          <p style={body} data-invite-state="accepted">{INVITE_ACCEPTED_NOTE} <Link href="/login" style={{ color: "var(--gold)", fontWeight: 700 }}>ログイン画面へ</Link></p>
        ) : info.state === "expired" ? (
          <p style={body} data-invite-state="expired">{INVITE_NOT_FOUND}</p>
        ) : (
          <>
            <p style={{ ...body, margin: "0 0 12px" }} data-invite-state="ok">
              <b>{info.storeName}</b> から <b>{info.name}</b> さん（{info.role === "manager" ? "店長" : "スタッフ"}）への招待です。ログイン用のパスワードを決めてください（{inviteExpiryTextOf(info.expiresAt)}）。
            </p>
            <AcceptForm token={token} email={info.email} />
          </>
        )}
      </div>
    </main>
  );
}
