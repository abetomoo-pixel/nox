// ★0211（相談役 11/25 の便 D1・起票157 の続き）: 招待のリンクを出し直す（link）・メールで送り直す（mail）。POST { inviteId, mode }。
//   柵＝①セッション 401 ②入力 400 ③owner／manager だけ 403 ④デモ org 403（demoGuardErr）。真の防御は RPC staff_invite_reissue
//   （トークンを替えて前のリンクを無効・期限は今から 14 日・link と mail を合わせて 1 つの招待につき 1 日 5 回まで＝暦の JST・audit）。
//   mail のときは RPC の後にメール（鍵が無ければ skipped）と結果の監査。どちらでも url を返す（送れなくても画面のリンクとコピーで動く）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { inviteUrlOf } from "@/lib/nox/people/invite";
import { siteOriginOf } from "@/lib/nox/line/liff-endpoint";
import { sendInviteMail } from "@/lib/nox/people/invite-mail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";
  const mode = body.mode === "mail" ? "mail" : body.mode === "link" ? "link" : "";
  if (!UUID_RE.test(inviteId) || !mode) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const [{ data: authRole }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_org_id")]);
  if ((authRole !== "owner" && authRole !== "manager") || !orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });

  const { data, error } = await supabase.rpc("staff_invite_reissue", { p_invite_id: inviteId, p_mode: mode });
  if (error) return NextResponse.json({ error: error.message }, { status: /too many/.test(error.message) ? 429 : /revoked|already accepted|invite exists|email in use/.test(error.message) ? 409 : /not found/.test(error.message) ? 404 : /forbidden/.test(error.message) ? 403 : 400 });
  const r = (data ?? {}) as { id?: string; token?: string; expires_at?: string; email?: string; name?: string; left_today?: number };
  if (!r.id || !r.token) return NextResponse.json({ error: "reissue failed" }, { status: 500 });
  const url = inviteUrlOf(siteOriginOf(new URL(req.url).origin), r.token);
  let mail = null;
  if (mode === "mail") {
    const admin = createAdminClient();
    const { data: inv } = await admin.from("staff_invites").select("store_id, stores(name)").eq("id", r.id).maybeSingle();
    const st = inv?.stores as { name?: string } | { name?: string }[] | null | undefined;
    const storeName = Array.isArray(st) ? st[0]?.name ?? null : st?.name ?? null;
    mail = await sendInviteMail(admin, supabase, { inviteId: r.id, kind: "reissue", orgId: orgId as string, email: r.email ?? "", name: r.name ?? "", storeName, url, expiresAt: r.expires_at ?? null, idemKey: `staff-invite/${r.id}/reissue/${r.left_today ?? "x"}` });
  }
  return NextResponse.json({ id: r.id, url, expires_at: r.expires_at ?? null, email: r.email ?? null, name: r.name ?? null, left_today: r.left_today ?? null, mail });
}
