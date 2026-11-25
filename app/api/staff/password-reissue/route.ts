// ★0215（起草だけ・旗 MIG_0215_APPLIED の後ろ・相談役 11/25 の便 D1）: メール無しのスタッフが忘れたとき、店（オーナー・自店の店長）が初期パスワードを出し直す（POST { membershipId }）。
//   柵＝①セッション 401 ②入力 400 ③owner／manager だけ 403 ④デモ 403 ⑤DB の関数 staff_password_reissue_note（自店・スタッフ・メール無し・監査＝先に記録）が通ったときだけ
//   ⑥admin.updateUserById（新しい初期パスワード＋app_metadata.must_change_password=true＝最初のログインで変更を求める）。パスワードは 1 回だけ返す（ログに出さない）。
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { mig0215On } from "@/lib/nox/rules-0175/flag";
import { MUST_CHANGE_META } from "@/lib/nox/auth/must-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
const genPassword = (len = 16): string => Array.from({ length: len }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");

export async function POST(req: Request) {
  if (!mig0215On()) return NextResponse.json({ error: "まだ使えません" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { membershipId?: unknown };
  const membershipId = typeof body.membershipId === "string" ? body.membershipId : "";
  if (!UUID_RE.test(membershipId)) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const [{ data: authRole }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_org_id")]);
  if ((authRole !== "owner" && authRole !== "manager") || !orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await demoGuardErr(orgId as string); if (demo) return NextResponse.json(demo.body, { status: demo.status });
  const { data: authUserId, error } = await supabase.rpc("staff_password_reissue_note", { p_membership_id: membershipId });
  if (error || typeof authUserId !== "string") return NextResponse.json({ error: error?.message ?? "failed" }, { status: /forbidden/.test(error?.message ?? "") ? 403 : /not found/.test(error?.message ?? "") ? 404 : 409 });
  const password = genPassword();
  const admin = createAdminClient();
  const { error: eUpd } = await admin.auth.admin.updateUserById(authUserId, { password, app_metadata: MUST_CHANGE_META });
  if (eUpd) return NextResponse.json({ error: "出し直せませんでした（記録は残っています・時間をおいてもう一度）" }, { status: 500 });
  return NextResponse.json({ ok: true, password });
}
