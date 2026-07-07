// 給与確定: run_create（ユーザー文脈＝audit actor が auth.uid() 由来）→ 確定時点で再計算 →
//   確定前ガード（税区分/プラン未設定なら 422）→ payslips 構築 → service キーで payroll_finalize。
// org はサーバ導出（g.orgId=auth_org_id）を p_org_id に渡す＝クライアント申告を使わない（裁定D）。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { computePayrollDraft } from "@/lib/nox/payroll/core";

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  if (!g.idemKey) return NextResponse.json({ error: "idemKey required (uuid)" }, { status: 400 });
  try {
    // run_create はユーザー文脈クライアント（manager+ 検証は payroll_run_create 内でも二重防御・audit actor は auth.uid()）
    const { data: rc, error: eRc } = await g.supabase.rpc("payroll_run_create", { p_store_id: g.storeId, p_period: g.period });
    if (eRc) return NextResponse.json({ error: eRc.message }, { status: 500 });
    const run = ((rc ?? []) as { id: string; status: string }[])[0];
    if (!run) return NextResponse.json({ error: "run_create failed" }, { status: 500 });
    if (run.status === "paid") return NextResponse.json({ error: "already paid", runId: run.id }, { status: 409 });

    // 確定時点で再読み・再計算（プレビュー値は使わない＝A）。strict＝税区分/プラン未設定は行を作らない。
    const draft = await computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: false });
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

    const payslips = draft.rows.map((r) => ({
      cast_id: r.castId,
      net: r.net,
      breakdown: { pay: r.pay, extras: r.extras },
      ar_deducted: r.arDeducted, // F2e-1: {receivable_id, amount}[]（finalize が deducted/部分/繰越に遷移）
      ar_carried: r.arCarried, // F2e-1: {receivable_id}[]（deduct_period→翌 period）
      adv_deducted: r.advDeducted, // F2e-2: {advance_id, amount}[]（deducted/部分/繰越）
      adv_carried: r.advCarried, // F2e-2: {advance_id}[]（deduct_period→翌 period）
      okuri_deducted: r.okuriDeducted, // F2e-2: {transport_id, amount}[]（繰越なし＝carried 無し）
    }));
    const { data: count, error: eFin } = await g.admin.rpc("payroll_finalize", {
      p_org_id: g.orgId, // サーバ導出（auth_org_id）
      p_actor: actor.id, // p_actor = users.id
      p_run_id: run.id,
      p_idem_key: g.idemKey,
      p_payslips: payslips,
    });
    if (eFin) return NextResponse.json({ error: eFin.message }, { status: 500 });
    return NextResponse.json({ runId: run.id, castCount: count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
