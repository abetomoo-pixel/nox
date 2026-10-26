// ★便 ON-3（2026-10-26・0176 ★1＝401）: 店からキャスト／スタッフ 1 人へ LINE push（紐付いているときだけ）。通知の本体は cast_notifications（RPC）＝ここは LINE に写すだけ。
//   柵＝①セッション 401 ②owner／manager／staff（cast は 403）③owner＝org 内・それ以外＝自店の相手だけ ④デモ org は送らない（204＝台帳にも書かない） ⑤未連携＝204。
//   上限の判定は無い（BANZEN と同じ＝429 は failed で台帳に残る）。宛先の userId は出さない。分類＝A（柵＝本 route・デモは 204 で送らない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { lineUserIdOf, linePushKindOfNotif, pushAndLog } from "@/lib/nox/line/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { castId?: unknown; membershipId?: unknown; text?: unknown; kind?: unknown };
  const castId = typeof body.castId === "string" ? body.castId : "";
  const membershipId = typeof body.membershipId === "string" ? body.membershipId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind : "other";
  if ((!castId && !membershipId) || !text || text.length > 1000) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const [{ data: authRole }, { data: authStoreId }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_store_id"), supabase.rpc("auth_org_id")]);
  if (!orgId || !["owner", "manager", "staff"].includes(String(authRole))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const subject = castId ? { kind: "cast" as const, id: castId } : { kind: "membership" as const, id: membershipId };
  const { data: row } = castId
    ? await admin.from("casts").select("org_id, store_id").eq("id", castId).maybeSingle()
    : await admin.from("memberships").select("store_id, stores!inner(org_id)").eq("id", membershipId).maybeSingle();
  const subOrg = castId ? (row as { org_id?: string } | null)?.org_id : ((row as { stores?: { org_id?: string } | { org_id?: string }[] } | null)?.stores as { org_id?: string } | undefined)?.org_id;
  const subStore = (row as { store_id?: string } | null)?.store_id;
  if (!row || subOrg !== orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (authRole !== "owner" && subStore !== authStoreId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return new NextResponse(null, { status: 204 }); // デモ org は送らない・台帳にも書かない（403 ではなく 204＝通知本体は止めない）

  const link = await lineUserIdOf(admin, subject.kind, subject.id);
  if (!link) return new NextResponse(null, { status: 204 }); // 未連携
  const r = await pushAndLog(admin, { storeId: link.storeId, isDemo: false, lineUserId: link.lineUserId, text, kind: linePushKindOfNotif(kind) });
  return NextResponse.json({ ok: r.ok, status: r.status, skipped: r.skipped ?? null }, { status: r.ok ? 200 : 502 });
}
