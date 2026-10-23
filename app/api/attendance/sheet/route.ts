// ★便 SH-UI-c C-2（2026-10-22）: 勤怠一覧（店長・オーナー）。POST { storeId, period } → 人ごとの合計表と 1 人 1 か月の行。
//   実働 h・日数・遅刻／当欠・退勤記録なしは **給与と同じ計算**＝computePayrollDraft（preview と同じ）の pay.wHours／wdays／lateN／absentN／missingOutDates を
//   そのまま合計表に使う（別計算を書かない）。行＝lib/nox/payroll/attendance-sheet（同じ関数の列）。
// ★便 SH-UI-c2 C2-2／C2-3／C2-6（2026-10-23）: 組み立ては lib/nox/payroll/kintai-sheet（/mine と共用）＝日別の算定給与・月のまとめ・確定済み（凍結値）・punch id。
//   読取は service（admin）＝権限は guardPayroll（owner 全店／manager 自店）・get_cast_sales だけ利用者の client（按分の DB 権威＝D7a）。DB 書込なし。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";
import { buildKintaiSheet } from "@/lib/nox/payroll/kintai-sheet";

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  try {
    const sheet = await buildKintaiSheet(g.admin, g.supabase, g.storeId, g.period);
    return NextResponse.json(sheet);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
