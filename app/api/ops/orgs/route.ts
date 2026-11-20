// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナントを追加（POST）＝招待 → ops_org_create（7 種の行を 1 つの取引で）。
//   requireOperatorApi（getUser → aal2 → ops_operators）→ 欄の検査 → 店のユーザーに同じメールがあれば止める → 招待（inviteUserByEmail）→ ops_org_create。
//   招待の後・作成の前に落ちて auth のユーザーだけが残ったとき（相談役 18:05 ⑤）：Supabase の招待は未受諾の同じメールにもう一度送って同じ id を返す
//   ＝その id で作れる（関数は同じ id なら通る）。受諾済みで users に無い（孤児）＝招待がエラー＝'orphan auth' で止める。
//   作成が失敗したら、今回の招待で新しくできた auth のユーザーだけを消す（前からあった人は消さない）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { newOrgFormErrOf, opsErrJa, type NewOrgForm } from "@/lib/nox/ops/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const body = (await req.json().catch(() => ({}))) as Partial<NewOrgForm>;
  const f: NewOrgForm = {
    orgName: String(body.orgName ?? ""), storeName: String(body.storeName ?? ""), bizType: String(body.bizType ?? ""),
    ownerEmail: String(body.ownerEmail ?? "").trim().toLowerCase(), agencyCode: String(body.agencyCode ?? ""), tester: body.tester === true,
  };
  if (typeof body.tester !== "boolean") return NextResponse.json({ error: "テスターの印を選んでください" }, { status: 400 });   // 原則 7＝boolean は常に明示
  const fe = newOrgFormErrOf(f);
  if (fe) return NextResponse.json({ error: fe }, { status: 400 });
  const admin = createAdminClient();
  const { data: dupU } = await admin.from("users").select("id").ilike("email", f.ownerEmail).limit(1);
  if (dupU && dupU.length) return NextResponse.json({ error: opsErrJa("dup email") }, { status: 409 });
  const { data: dupO } = await admin.from("orgs").select("id").eq("name", f.orgName.trim()).limit(1);
  if (dupO && dupO.length) return NextResponse.json({ error: opsErrJa("dup org") }, { status: 409 });

  const t0 = Date.now();
  const origin = new URL(req.url).origin;
  const inv = await admin.auth.admin.inviteUserByEmail(f.ownerEmail, { redirectTo: `${origin}/auth/set-password`, data: { role: "owner", store: f.storeName.trim() } });
  if (inv.error || !inv.data.user) {
    const already = /already|exists|registered/i.test(inv.error?.message ?? "");
    return NextResponse.json({ error: opsErrJa(already ? "orphan auth" : "invite failed") }, { status: already ? 409 : 502 });
  }
  const authUser = inv.data.user;
  const fresh = Date.parse(authUser.created_at) >= t0 - 5_000;   // 今回の招待で新しくできた auth のユーザー
  const { data, error } = await admin.rpc("ops_org_create", {
    p_ops: g.op.authUserId, p_org_name: f.orgName.trim(), p_store_name: f.storeName.trim(), p_biz_type: f.bizType,
    p_owner_email: f.ownerEmail, p_owner_auth_user_id: authUser.id, p_agency_code: f.agencyCode === "" ? null : f.agencyCode, p_tester: f.tester,
  });
  if (error) {
    if (fresh) await admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);   // 会社を作れなかった＝今回できた auth だけ消す（孤児を残さない）
    return NextResponse.json({ error: opsErrJa(error.message) }, { status: 409 });
  }
  const j = data as { org_id: string };
  return NextResponse.json({ ok: true, orgId: j.org_id, email: f.ownerEmail });
}
