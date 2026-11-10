// ★便 W-10 #21（2026-10-26）: お知らせを LINE で送る＝掲載したお知らせ（notices）を、その店で LINE を連携している相手（line_links）へ 1 人ずつ push。
//   柵＝①セッション 401 ②owner／manager（staff・cast は 403）③お知らせはセッションの RLS で読めるものだけ（他店は 404）④デモ org は送らない（demoGuardErr＝line/push と同じ・台帳にも書かない）。
//   対象＝お知らせの audience（all＝キャストとスタッフ・cast＝キャスト・staff＝スタッフ）。宛先の userId は返さない。上限の判定は無い（push の 429 は failed で台帳）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAndLog } from "@/lib/nox/line/server";
import { demoGuardErr } from "@/lib/nox/demo/guard";
import { noticeLineTextOf, noticeLineSubjectKindsOf } from "@/lib/nox/line/notice-line";
import { noticeLineLinksOf } from "@/lib/nox/notices/targets"; // ★M-129（裁定470）
import { mig0200On } from "@/lib/nox/rules-0175/flag"; // ★0200: staff_ids の列

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { noticeId?: unknown };
  const noticeId = typeof body.noticeId === "string" ? body.noticeId : "";
  if (!noticeId) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const { data: role } = await supabase.rpc("auth_role");
  if (!["owner", "manager"].includes(String(role))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // ★M-129（裁定470・0200）: 宛先つき（cast_ids／staff_ids）は配列で絞る＝LINE も宛先だけ（0200 の前は staff_ids の列が無い＝cast_ids だけ読む）
  const { data: n } = await supabase.from("notices").select(mig0200On() ? "id, store_id, title, body, audience, cast_ids, staff_ids" : "id, store_id, title, body, audience, cast_ids").eq("id", noticeId).maybeSingle() as unknown as { data: { id: string; store_id: string; title: string; body: string; audience: string; cast_ids?: string[] | null; staff_ids?: string[] | null } | null };
  if (!n) return NextResponse.json({ error: "not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: st } = await admin.from("stores").select("org_id, name").eq("id", n.store_id as string).maybeSingle();
  const isDemo = !!(await demoGuardErr(String((st as { org_id?: string } | null)?.org_id ?? ""))); // デモ org は送らない（line/push と同じ柵＝push しない・台帳にも書かない）
  if (isDemo) { const { count } = await admin.from("line_links").select("id", { count: "exact", head: true }).eq("store_id", n.store_id as string); return NextResponse.json({ ok: true, recipients: count ?? 0, sent: 0, failed: 0, skipped: 0, demo: true }); }
  const kinds = noticeLineSubjectKindsOf(String(n.audience ?? "all"));
  const { data: links0 } = await admin.from("line_links").select("line_user_id, subject_kind, subject_id").eq("store_id", n.store_id as string).in("subject_kind", kinds).is("blocked_at", null);
  const links = noticeLineLinksOf((links0 ?? []) as { line_user_id: string; subject_kind: string; subject_id: string }[], n, kinds); // ★M-129: 宛先だけ
  const text = noticeLineTextOf({ storeName: (st as { name?: string } | null)?.name ?? "", title: String(n.title ?? ""), body: String(n.body ?? "") });
  let sent = 0, failed = 0, skipped = 0;
  for (const l of (links ?? []) as { line_user_id: string }[]) {
    const r = await pushAndLog(admin, { storeId: n.store_id as string, isDemo, lineUserId: l.line_user_id, text, kind: "notice" });
    if (r.ok) sent++; else if (r.skipped) skipped++; else failed++;
  }
  return NextResponse.json({ ok: true, recipients: (links ?? []).length, sent, failed, skipped, demo: isDemo });
}
