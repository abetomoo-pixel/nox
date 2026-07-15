// F2d インボイス・支払調書セクションのデータ源（manager+）。
// cast 別に 税区分(mode)/インボイス(invoice)/登録番号(reg_no) と、当該 period の確定 payslip の
// 源泉(withholding)・マイナンバー取得有無(真偽のみ) を返す。編集は set_cast_tax_profile（client・既存 RPC）。
// 認可・org 照合・store∈org は guardPayroll（manager+）に委譲。cast_sensitive の有無判定は service で
// mynumber_enc の null 判定のみ（★平文/暗号値は一切 client に返さない）。
import { NextResponse } from "next/server";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";

type PayBreakdown = { pay?: { withholding?: number; gross?: number } };

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  try {
    const { admin, storeId, period, orgId } = g;

    // cast（在籍・自店）・税プロファイル・確定 run の payslip・mynumber 有無を並行取得（admin=service・store 明示スコープ）。
    const [castsR, taxR, runR, csR] = await Promise.all([
      admin.from("casts").select("id, name").eq("store_id", storeId).eq("is_active", true).order("name"),
      admin.from("cast_tax_profiles").select("cast_id, mode, invoice, reg_no").eq("store_id", storeId),
      admin.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle(),
      admin.from("cast_sensitive").select("cast_id").eq("store_id", storeId).not("mynumber_enc", "is", null),
    ]);
    for (const r of [castsR, taxR, runR, csR]) if (r.error) throw new Error(r.error.message);

    const taxByCast = new Map<string, { mode: string; invoice: string | null; regNo: string | null }>();
    for (const t of (taxR.data ?? []) as Record<string, unknown>[]) {
      taxByCast.set(t.cast_id as string, { mode: t.mode as string, invoice: (t.invoice as string | null) ?? null, regNo: (t.reg_no as string | null) ?? null });
    }
    const hasMy = new Set<string>(((csR.data ?? []) as { cast_id: string }[]).map((r) => r.cast_id));

    // 確定（finalized/paid）run があれば payslip の breakdown から源泉/支給を引く（draft は源泉列を出さない）。
    const whByCast = new Map<string, { withholding: number; gross: number }>();
    const run = runR.data as { id: string; status: string } | null;
    const finalized = !!run && (run.status === "finalized" || run.status === "paid");
    if (finalized) {
      const { data: ps, error } = await admin.from("payslips").select("cast_id, breakdown_json").eq("run_id", run!.id);
      if (error) throw new Error(error.message);
      for (const p of (ps ?? []) as Record<string, unknown>[]) {
        const bj = p.breakdown_json as PayBreakdown;
        whByCast.set(p.cast_id as string, { withholding: bj.pay?.withholding ?? 0, gross: bj.pay?.gross ?? 0 });
      }
    }

    const rows = ((castsR.data ?? []) as { id: string; name: string }[]).map((c) => {
      const tax = taxByCast.get(c.id);
      const wh = whByCast.get(c.id);
      return {
        castId: c.id,
        castName: c.name,
        mode: tax?.mode ?? null,          // 委託/雇用（null=未登録）
        invoice: tax?.invoice ?? null,     // 課税/免税（null=未設定）
        regNo: tax?.regNo ?? null,
        withholding: wh?.withholding ?? null, // 確定時のみ（未確定は null）
        gross: wh?.gross ?? null,
        hasMynumber: hasMy.has(c.id),
      };
    });

    return NextResponse.json({ period, storeId, orgId, finalized, rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
