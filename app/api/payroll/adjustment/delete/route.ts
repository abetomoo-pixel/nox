// 裁定264-8／264-9: 調整控除の削除（owner／manager 自店・draft のみ・理由必須＝mig0146 ★3）。
//   認可＝guardPayroll（add と同一）。RPC payroll_adjustment_delete はユーザー文脈（二重防御＝owner/manager・自店・draft・audit に理由）。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { parseAdjustDeleteBody, adjustRpcStatus } from "@/lib/nox/payroll/adjust-route";

export async function POST(req: Request) {
  const g = await guardPayroll(req.clone());
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = parseAdjustDeleteBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const v = parsed.value;
  if (v.storeId !== g.storeId || v.period !== g.period) return NextResponse.json({ error: "store/period mismatch" }, { status: 400 });

  const { error } = await g.supabase.rpc("payroll_adjustment_delete", { p_id: v.id, p_reason: v.reason });
  if (error) return NextResponse.json({ error: error.message }, { status: adjustRpcStatus(error.message) });
  return NextResponse.json({ ok: true, id: v.id });
}
