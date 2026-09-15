// 裁定264-8／264-12: 調整控除の追加（owner／manager 自店）。
//   認可＝guardPayroll（preview／finalize と同一＝decidePayrollAccess・store の org 照合・新しい判定式は書かない）。
//   入力整形＝parseAdjustAddBody（%→bp は server でも Math.round(pct×100) し 0..10000 を再 assert・reason 空は 400）。
//   run_id は保存時に payroll_run_create で得る（264-12・既存 run は status 問わず返る自然冪等＝finalize が同じ run を拾う）。
//   RPC payroll_adjustment_add はユーザー文脈（二重防御＝owner/manager・自店・draft・cast の店一致・CHECK・audit）。
//   add に冪等キー引数は無い＝連打ガードは client（264-8・B5-7 同型）。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { parseAdjustAddBody, adjustRpcStatus } from "@/lib/nox/payroll/adjust-route";

export async function POST(req: Request) {
  const g = await guardPayroll(req.clone()); // body は下でも読むため clone
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = parseAdjustAddBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const v = parsed.value;
  if (v.storeId !== g.storeId || v.period !== g.period) return NextResponse.json({ error: "store/period mismatch" }, { status: 400 });

  // run 解決（264-12）: ユーザー文脈で run_create＝既存があれば id と status を返す・無ければ draft を作る
  const { data: rc, error: eRc } = await g.supabase.rpc("payroll_run_create", { p_store_id: g.storeId, p_period: g.period });
  if (eRc) return NextResponse.json({ error: eRc.message }, { status: eRc.message.includes("forbidden") ? 403 : 500 });
  const run = ((rc ?? []) as { id: string; status: string }[])[0];
  if (!run) return NextResponse.json({ error: "run_create failed" }, { status: 500 });
  if (run.status !== "draft") return NextResponse.json({ error: "run not draft", runId: run.id }, { status: 409 });

  const { data, error } = await g.supabase.rpc("payroll_adjustment_add", {
    p_run_id: run.id,
    p_cast_id: v.castId,
    p_mode: v.kind,
    p_amount: v.amount,
    p_rate_bp: v.rateBp,
    p_before_withholding: v.beforeWithholding,
    p_show_detail: v.showDetail,
    p_reason: v.reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: adjustRpcStatus(error.message) });
  return NextResponse.json({ id: data, runId: run.id });
}
