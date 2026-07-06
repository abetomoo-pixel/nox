// 給与プレビュー: payOf を回すだけ（DB 書き込みなし・run_create もしない＝純参照・裁定D/論点4）。
// 参考値（確定時点で再計算が正）。未登録税区分は既定 '委託' で試算しつつ blockers に警告返し。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { computePayrollDraft } from "@/lib/nox/payroll/core";

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  try {
    const draft = await computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: true });
    return NextResponse.json({
      period: g.period,
      storeId: g.storeId,
      rows: draft.rows.map((r) => ({
        castId: r.castId,
        castName: r.castName,
        net: r.net,
        taxMode: r.taxMode,
        anomalyCount: r.anomalyCount,
        breakdown: { pay: r.pay, extras: r.extras },
        arDeductTotal: r.arDeductTotal, // F2e-1 天引き明細
        arCarriedTotal: r.arCarriedTotal,
      })),
      blockers: draft.blockers,
      incentives: draft.incentives, // #32 可視化: 総配分額・受給者数・warnEmptyPool
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
