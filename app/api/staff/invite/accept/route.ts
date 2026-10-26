// ★便 ON-3（2026-10-26・0176 ★2＝I-1）: 招待の受諾＝公開面 /i/[token] から POST {token, password}。セッション無し（トークンが信頼の境目・sha256 で staff_invites を引く）。
//   順序: ①形式（64 桁 16 進・パスワード 8〜72 字）②招待が有効（未受諾・期限内）③admin.createUser（email_confirm・本人が決めたパスワード）④staff_invite_accept（service_role＝users／memberships／staff_contracts・招待を使用済みに）
//   ⑤失敗したら deleteUser で巻き戻す（補償の失敗は console に残す）⑥同じ route で signInWithPassword＝cookie を載せて {ok, dest} を返す。
//   トークン・パスワード・token_hash はレスポンスにもログにも出さない。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVITE_TOKEN_RE, inviteStateOf, invitePasswordErrorOf } from "@/lib/nox/people/invite";
import { tokenHashOf } from "@/lib/nox/people/invite-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!INVITE_TOKEN_RE.test(token)) return NextResponse.json({ error: "bad token" }, { status: 400 });
  const pwErr = invitePasswordErrorOf(password, password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const admin = createAdminClient();
  const hash = tokenHashOf(token);
  const { data: inv } = await admin.from("staff_invites").select("id, email, name, accepted_at, expires_at").eq("token_hash", hash).maybeSingle();
  if (!inv) return NextResponse.json({ error: "bad token" }, { status: 404 });
  const st = inviteStateOf({ accepted_at: inv.accepted_at as string | null, expires_at: inv.expires_at as string }, Date.now());
  if (st !== "ok") return NextResponse.json({ error: st === "accepted" ? "already accepted" : "expired" }, { status: 410 });

  const email = inv.email as string;
  const { data: created, error: eCreate } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (eCreate || !created?.user) {
    const dup = /already|exists|registered/i.test(eCreate?.message ?? "");
    return NextResponse.json({ error: dup ? "email already registered" : "create failed" }, { status: dup ? 409 : 500 });
  }
  const authUserId = created.user.id;
  const { error: eAccept } = await admin.rpc("staff_invite_accept", { p_token_hash: hash, p_auth_user_id: authUserId });
  if (eAccept) {
    const { error: eDel } = await admin.auth.admin.deleteUser(authUserId);
    if (eDel) console.error(`staff invite accept: compensation failed (auth user remains) ${eDel.message}`);
    return NextResponse.json({ error: eAccept.message }, { status: /bad token/.test(eAccept.message) ? 410 : 500 });
  }
  const supabase = await createClient(); // Route Handler＝cookie を書ける
  const { error: eIn } = await supabase.auth.signInWithPassword({ email, password });
  if (eIn) return NextResponse.json({ ok: true, dest: "/login", signedIn: false }); // 作成は済んでいる＝ログイン画面から
  return NextResponse.json({ ok: true, dest: "/dashboard", signedIn: true });
}
