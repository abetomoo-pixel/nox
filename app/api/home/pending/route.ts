// ★便 SH-UI-c2 C2-13（2026-10-23）: HOME の「要承認」とベル。GET ?store=<id>&full=1 → 未処理の一覧（利用者の client＝RLS・DB 書込なし）。
//   店長・オーナー＝割引・無料の申請（approvals pending＋卓名・申請者）・シフト希望の未処理（期間ごと）・退勤記録なし（直近 7 日の punches）・full=1 のときだけノルマ未達の提案（給与 preview と同じ draft）。
//   スタッフ＝自分の申請の状態だけ（mine）。cast は 403。total＝ベルの数＝カードの見出し（提案は数えない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bizDateOf } from "@/lib/nox/biz-date";
import { computePayrollDraft } from "@/lib/nox/payroll/core";
import { missingOutOf, pendingTotalOf, wishGroupsOf, type PendingApproval, type PendingProposal, type PendingSummary } from "@/lib/nox/home/pending";

type Rec = Record<string, unknown>;
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const [{ data: role }, { data: myStore }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_store_id")]);
  if (role === "cast" || !role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const storeId = (url.searchParams.get("store") || (myStore as string | null) || "") as string;
  if (!storeId) return NextResponse.json({ error: "store required" }, { status: 400 });
  try {
    const { data: me } = await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle();
    const myId = (me?.id as string | undefined) ?? null;
    if (role === "staff") {
      const { data: mine } = myId ? await supabase.from("approvals").select("id, check_id, pay_group, type, amount, status, reason, created_at").eq("store_id", storeId).eq("requested_by", myId).order("created_at", { ascending: false }).limit(5) : { data: [] as Rec[] };
      const rows: PendingApproval[] = ((mine ?? []) as Rec[]).map((a) => ({ id: a.id as string, checkId: a.check_id as string, seatName: null, payGroup: String(a.pay_group), type: String(a.type), amount: Number(a.amount), reason: (a.reason as string | null) ?? null, requestedBy: null, createdAt: String(a.created_at), status: String(a.status) }));
      const out: PendingSummary = { approvals: [], wishes: [], proposals: [], missingOut: [], mine: rows, total: rows.filter((r) => r.status === "pending").length };
      return NextResponse.json(out);
    }
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
    const cutoffHm = (((st?.settings_json as Rec | null)?.biz_cutoff_hm as string | undefined) ?? "06:00");
    const todayBiz = bizDateOf(new Date().toISOString(), cutoffHm);
    const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const [apR, wishR, perR, punchR, castR] = await Promise.all([
      supabase.from("approvals").select("id, check_id, pay_group, type, amount, reason, requested_by, created_at, checks(seat_id)").eq("store_id", storeId).eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("shift_wishes").select("id, date").eq("store_id", storeId).eq("status", "pending"),
      supabase.from("shift_periods").select("id, start_date, end_date").eq("store_id", storeId),
      supabase.from("punches").select("cast_id, type, punched_at").eq("store_id", storeId).gte("punched_at", since),
      supabase.from("casts").select("id, name").eq("store_id", storeId),
    ]);
    for (const r of [apR, wishR, perR, punchR, castR]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    const casts = (castR.data ?? []) as { id: string; name: string }[];
    const nameOf = (id: string) => casts.find((c) => c.id === id)?.name ?? "—";
    const aps = (apR.data ?? []) as Rec[];
    const seatIds = [...new Set(aps.map((a) => one(a.checks as Rec | Rec[] | null)?.seat_id as string | undefined).filter((x): x is string => !!x))];
    const userIds = [...new Set(aps.map((a) => a.requested_by as string | null).filter((x): x is string => !!x))];
    const [seatR, userR] = await Promise.all([
      seatIds.length ? supabase.from("seats").select("id, name").in("id", seatIds) : Promise.resolve({ data: [] as Rec[] }),
      userIds.length ? supabase.from("users").select("id, name").in("id", userIds) : Promise.resolve({ data: [] as Rec[] }),
    ]);
    const seatName = new Map(((seatR.data ?? []) as Rec[]).map((s) => [s.id as string, s.name as string]));
    const userName = new Map(((userR.data ?? []) as Rec[]).map((u) => [u.id as string, u.name as string]));
    const approvals: PendingApproval[] = aps.map((a) => ({ id: a.id as string, checkId: a.check_id as string, seatName: seatName.get(one(a.checks as Rec | Rec[] | null)?.seat_id as string) ?? null, payGroup: String(a.pay_group), type: String(a.type), amount: Number(a.amount), reason: (a.reason as string | null) ?? null, requestedBy: a.requested_by ? userName.get(a.requested_by as string) ?? null : null, createdAt: String(a.created_at) }));
    const wishes = wishGroupsOf((wishR.data ?? []) as { date: string }[], (perR.data ?? []) as { id: string; start_date: string; end_date: string }[], storeId);
    const missingOut = missingOutOf((punchR.data ?? []) as { cast_id: string; type: string; punched_at: string }[], cutoffHm, todayBiz, nameOf);
    let proposals: PendingProposal[] = [];
    if (full) {
      try {
        const draft = await computePayrollDraft(createAdminClient(), supabase, storeId, todayBiz.slice(0, 7), { previewDefaults: true });
        proposals = draft.rows.filter((r) => r.normProposal && r.normProposal.proposed > 0 && !r.normProposal.applied).map((r) => ({ castId: r.castId, castName: r.castName, amount: r.normProposal!.proposed, text: r.normProposal!.items.map((i) => i.text).join("・") }));
      } catch { proposals = []; }
    }
    const out: PendingSummary = { approvals, wishes, proposals, missingOut, total: pendingTotalOf({ approvals, wishes, missingOut }) };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
