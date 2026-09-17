// スタッフのメール（ログイン ID）変更（裁定267-2・mig 0）。写経元 3 本の合成＝新しい判定式を書かない。
//   ① guardOwner（kiosk/provision 逐語・owner のみ＝manager には開かない・org はサーバ導出＝クライアント申告を使わない）
//   ② 入力 userId・email（parseUpdateEmailBody＝lower 正規化・空/形式不正は 400）
//   ③ 対象の memberships を引き、同 org で role が staff／manager でなければ 403（owner 自身を含む）
//   ④ public.users で org 内 unique を先引き（staff/create 逐語）。既存なら 409
//   ⑤ 現在の auth.users.email を退避 → updateUserById(email, email_confirm: true) → public.users.email 更新。
//      後者が失敗したら updateUserById で退避値に戻してから 500（補償）
//   ⑥ audit_logs は書かない（既存 admin route＝staff/create・cast/invite・kiosk/provision も書いていない＝audit_log_write は内部専用で route から呼べない）
// ③〜⑤ は lib/nox/staff/update-email.ts の performUpdateEmail（verify が admin 直叩きと失敗注入で固定）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideOwnerAccess, parseUpdateEmailBody, performUpdateEmail } from "@/lib/nox/staff/update-email";

// owner セッション検証（401/403）＋ org サーバ導出（kiosk/provision の guardOwner と同文・判定式は decideOwnerAccess に置いた同式）。
async function guardOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, body: { error: "unauthenticated" } };
  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  const d = decideOwnerAccess(role, orgId);
  if (!d.ok) return { ok: false as const, status: d.status, body: { error: d.error } };
  return { ok: true as const, supabase, orgId: orgId as string, authUserId: user.id };
}

export async function POST(req: Request) {
  const g = await guardOwner();
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = parseUpdateEmailBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  try {
    const admin = createAdminClient();
    const r = await performUpdateEmail(admin, { orgId: g.orgId, userId: parsed.value.userId, email: parsed.value.email });
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
