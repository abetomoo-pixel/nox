// 給与確定: run_create（ユーザー文脈＝audit actor が auth.uid() 由来）→ 確定時点で再計算 →
//   確定前ガード（税区分/プラン未設定なら 422）→ payslips 構築 → service キーで payroll_finalize。
// org はサーバ導出（g.orgId=auth_org_id）を p_org_id に渡す＝クライアント申告を使わない（裁定D）。
import { mig0183On } from "@/lib/nox/rules-0175/flag"; // ★便 M-7（0183）
import { normReasonOf } from "@/lib/nox/payroll/norm-proposal";
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { computePayrollDraft } from "@/lib/nox/payroll/core";
import { payslipsOfDraft } from "@/lib/nox/payroll/finalize-payslips"; // ★X-13-13: 凍結の形（裁定264-10／0156／0154 D6 の規則をそのまま移動）
import { resolvePayrollWindow } from "@/lib/nox/payroll/window";
import { bizDateOf } from "@/lib/nox/biz-date";
import { finalizeGuardOf, notEndedMessageOf, PERIOD_NOT_ENDED } from "@/lib/nox/payroll/finalize-guard"; // ★裁定316（便 X-8-13）

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  if (!g.idemKey) return NextResponse.json({ error: "idemKey required (uuid)" }, { status: 400 });
  try {
    // ★裁定316（便 X-8-13）: 確定は期間終了の翌営業日から＝period_end < 今日の営業日（店の biz_cutoff_hm）。未終了は run を作る前に 400。
    //   DB 側（payroll_finalize）のガードは mig 0158。プレビュー（/api/payroll/preview）は期間の途中でも可＝ここだけ止める。
    const win = await resolvePayrollWindow(g.admin, g.storeId, g.period);
    const guard = finalizeGuardOf(win.periodEnd, bizDateOf(new Date().toISOString(), win.cutoffHm));
    if (!guard.ok) return NextResponse.json({ error: guard.code, message: guard.message, periodEnd: win.periodEnd }, { status: 400 });
    // run_create はユーザー文脈クライアント（manager+ 検証は payroll_run_create 内でも二重防御・audit actor は auth.uid()）
    const { data: rc, error: eRc } = await g.supabase.rpc("payroll_run_create", { p_store_id: g.storeId, p_period: g.period });
    if (eRc) return NextResponse.json({ error: eRc.message }, { status: 500 });
    const run = ((rc ?? []) as { id: string; status: string }[])[0];
    if (!run) return NextResponse.json({ error: "run_create failed" }, { status: 500 });
    if (run.status === "paid") return NextResponse.json({ error: "already paid", runId: run.id }, { status: 409 });

    // 確定時点で再読み・再計算（プレビュー値は使わない＝A）。strict＝税区分/プラン未設定は行を作らない。
    let draft = await computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: false });
    // ★便 M-7（Agoora 確定 10/26 ⑥・0183）: ノルマ未達の「適用」の意思＝確定時に最新の提案額で精算調整の行を書き、計算し直す（適用後に額が変わっても再適用は要らない）
    if (mig0183On() && draft.blockers.length === 0) {
      const { data: its } = await g.admin.from("norm_shortfall_intents").select("cast_id, action").eq("run_id", run.id).eq("action", "apply");
      let added = 0;
      for (const it of (its ?? []) as { cast_id: string }[]) {
        const row = draft.rows.find((r) => r.castId === it.cast_id);
        const np = row?.normProposal;
        if (!row || !np || np.applied || !(np.proposed > 0) || np.status !== "ok") continue;
        const isEmp = np.employment === "雇用";
        const { error: eAdj } = await g.supabase.rpc("payroll_adjustment_add", {
          p_run_id: run.id, p_cast_id: it.cast_id, p_mode: "fixed", p_amount: np.proposed, p_rate_bp: null, p_before_withholding: true, p_show_detail: true,
          p_reason: normReasonOf(g.period, np.items), p_source: isEmp ? "sanction" : "settlement",
          p_basis: isEmp ? "就業規則の減給の定め（ノルマ未達）・労基法 91 条の上限内" : "店のノルマ設定（ノルマ未達の減額）", p_target_shift_id: null,
        });
        if (eAdj) return NextResponse.json({ error: `ノルマ未達の減額を精算調整に入れられませんでした（${row.castName}）: ${eAdj.message}` }, { status: 500 });
        added += 1;
      }
      if (added > 0) draft = await computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: false });
    }
    if (draft.blockers.length > 0) {
      // 税区分未登録（no_tax）／プラン未設定（no_plan）が1人でもいたら確定拒否（論点2・net 恒等と同格の確定前ガード）
      return NextResponse.json(
        { error: "incomplete", blockers: draft.blockers.map((b) => ({ castName: b.castName, reason: b.reason })) },
        { status: 422 },
      );
    }
    if (draft.rows.length === 0) return NextResponse.json({ error: "no active casts in period" }, { status: 422 });

    const { data: actor, error: eA } = await g.admin.from("users").select("id").eq("auth_user_id", g.authUserId).single();
    if (eA || !actor) return NextResponse.json({ error: "actor resolve failed" }, { status: 500 });

    const payslips = payslipsOfDraft(draft.rows); // ★X-13-13（便 X-13b）: 凍結の形は lib/nox/payroll/finalize-payslips.ts（demo の afterResetHooks と同じ 1 関数）
    const { data: count, error: eFin } = await g.admin.rpc("payroll_finalize", {
      p_org_id: g.orgId, // サーバ導出（auth_org_id）
      p_actor: actor.id, // p_actor = users.id
      p_run_id: run.id,
      p_idem_key: g.idemKey,
      p_payslips: payslips,
    });
    // ★裁定316（0158・便 AB-9）: DB のガード（run の凍結 period_end が今日の営業日以降）に当たったときも、API の先行ガードと同じ形で返す
    if (eFin && eFin.message.includes(PERIOD_NOT_ENDED)) return NextResponse.json({ error: PERIOD_NOT_ENDED, message: notEndedMessageOf(win.periodEnd), periodEnd: win.periodEnd }, { status: 400 });
    if (eFin) return NextResponse.json({ error: eFin.message }, { status: 500 });
    return NextResponse.json({ runId: run.id, castCount: count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
