// ★便 ON-3（2026-10-26・0176 ★2＝I-1 登録→招待の 2 段）: スタッフの「登録」＝staff_invite_create（Auth を作らない・staff_invites 1 行・平文トークンは 1 回だけ）→ 招待リンク <origin>/i/<token> を返す。
//   柵＝①セッション 401 ②入力 400 ③owner＝org 全店 staff／manager・manager＝自店 staff だけ（RPC でも二重） ④デモ org 403（裁定273-6＝staff/create と同じ）。
//   真の防御は RPC（email 未使用・未受諾の招待なし・billing gate・audit）。レスポンスにトークンは URL の中だけ（ログに出さない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { inviteUrlOf } from "@/lib/nox/people/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const role = body.role === "manager" ? "manager" : "staff";
  const contract = body.contract && typeof body.contract === "object" && !Array.isArray(body.contract) ? (body.contract as Record<string, unknown>) : {};
  if (!name || name.length > 50) return NextResponse.json({ error: "bad name" }, { status: 400 });
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return NextResponse.json({ error: "bad email" }, { status: 400 });
  if (!storeId) return NextResponse.json({ error: "bad store" }, { status: 400 });

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_store_id"), supabase.rpc("auth_org_id")]);
  if (authRole !== "owner" && authRole !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (authRole === "manager" && (storeId !== authStoreId || role !== "staff")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status }); // ★裁定273-6: デモ org は招待不可
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("org_id").eq("id", storeId).maybeSingle();
  if (!store || store.org_id !== orgId) return NextResponse.json({ error: "forbidden store" }, { status: 403 });

  const { data, error } = await supabase.rpc("staff_invite_create", { p_store_id: storeId, p_email: email, p_name: name, p_role: role, p_contract: contract });
  if (error) return NextResponse.json({ error: error.message }, { status: /forbidden/.test(error.message) ? 403 : /email in use|invite exists/.test(error.message) ? 409 : 400 });
  const r = (data ?? {}) as { id?: string; token?: string; expires_at?: string };
  if (!r.id || !r.token) return NextResponse.json({ error: "invite failed" }, { status: 500 });
  return NextResponse.json({ id: r.id, url: inviteUrlOf(new URL(req.url).origin, r.token), expires_at: r.expires_at ?? null, email, name, role });
}
