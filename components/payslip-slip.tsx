import * as t from "@/lib/nox/ui/theme";
import { readFrozenAdjustments } from "@/lib/nox/payroll/adjust"; // 裁定264-2: 調整控除の並び（before＝源泉の直前・after＝直後・同群は入力順）
import { breakdownLinesOf, type BreakdownPayLike } from "@/lib/nox/payroll/breakdown-lines"; // ★裁定303: 支給／控除の行は給与右パネルと同じ単一関数

// D2 報酬明細：確定スリップ1件の描画（/mine と manage 給与で共用・presentation-only）。
// ★数値ロジックは一切持たない＝表示の移設のみ。データ源は既存 payslips.breakdown_json
//   （= { pay: PayResult, extras: Extra[] } ＋ finalize が足す ar/adv/okuri）。
//   合算は D3 CSV（lib/nox/payroll/csv.ts）と同一 breakdown_json 源＝CSV の「合算列」と
//   ここの「行内訳」は同じ数値（back の生値は出さず指名/商品でグループ表示＝現行踏襲）。
// クラス（nox-payslip / ps-hd / ps-foot）は globals.css の @media print が白地反転・改ページに使う。

const yen = (n: number) => "¥" + n.toLocaleString();

type DeductEntry = { action?: string; amount?: number };
type SlipPay = {
  wage?: number; wHours?: number; timePay?: number;
  honBack?: number; jonaiBack?: number; dohanBack?: number;
  drinkBack?: number; champBack?: number; bottleBack?: number; salesBack?: number; customTotal?: number;
  gross?: number; fixedDed?: number; fine?: number; withholding?: number; normPenalty?: number;
  // ★U-1（裁定99-⑤）: 凍結済みの追加キー（旧 payslip には無い＝optional・無ければ従来表示と一字一致）
  guaranteeAdd?: number; achievementBonus?: number;
  taxMode?: string; // 裁定28 で凍結（'委託'|'雇用'）
  sanction?: { original?: number; applied?: number } | null; // 裁定98（行が無い期は null/欠落）
};
type SlipExtra = { kind: string; amount: number; label?: string };

export type PayslipRow = { period: string; net: number; breakdown_json: unknown };

const payOf = (bj: unknown): SlipPay => (bj as { pay?: SlipPay } | null)?.pay ?? {};
const extrasOf = (bj: unknown): SlipExtra[] => (bj as { extras?: SlipExtra[] } | null)?.extras ?? [];
// ar/adv/okuri（各要素 {action:'deducted'|'carried', amount}）から今期天引き合計（deducted 分）。
const deductTotal = (bj: unknown, key: "ar" | "adv" | "okuri"): number => {
  const arr = (bj as Record<string, DeductEntry[]> | null)?.[key] ?? [];
  return arr.reduce((s, e) => s + (e.action === "deducted" ? e.amount ?? 0 : 0), 0);
};

// castName を渡すと見出しに併記（manage 全員分で誰の明細か明示）。/mine は period のみ（従来と一字一致）。
export default function PayslipSlip({ slip, castName }: { slip: PayslipRow; castName?: string }) {
  const pay = payOf(slip.breakdown_json);
  const extras = extrasOf(slip.breakdown_json);
  const ar = deductTotal(slip.breakdown_json, "ar");
  const adv = deductTotal(slip.breakdown_json, "adv");
  const okuri = deductTotal(slip.breakdown_json, "okuri");
  // ★裁定303-1: 行は breakdownLinesOf（給与右パネルと同じ関数）。旧 payslip は pay に arDeduct 等が無いので breakdown の ar／adv／okuri（deducted）を渡す
  const adj = readFrozenAdjustments(slip.breakdown_json);
  const bd = breakdownLinesOf({ pay: pay as BreakdownPayLike, extras, adjustments: { before: adj.before, after: adj.after }, deducted: { ar, adv, okuri } });
  const taxMode = pay.taxMode === "委託" || pay.taxMode === "雇用" ? pay.taxMode : null;
  const hasDed = bd.ded.length > 0;
  const earn = (label: string, v: number, key: string, muted = false) => (
    <div key={key} style={{ ...t.slipRow, opacity: muted ? 0.75 : 1 }}><span>{label}</span><span style={t.num}>{yen(v)}</span></div>
  );
  const ded = (label: string, v: number, key: string) =>
    <div key={key} style={t.slipRow}><span>{label}</span><span style={{ ...t.num, color: "var(--bad)" }}>−{yen(v)}</span></div>;
  return (
    <div className="nox-payslip" style={{ marginBottom: 14 }}>
      <div className="ps-hd" style={t.slipHd}>
        {castName ? `${castName}　${slip.period}` : slip.period}
        {/* ★U-1（裁定99-⑤）: 税区分バッジ（凍結 taxMode・旧データは非表示） */}
        {taxMode && (
          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
            border: "1px solid var(--line2)", color: "var(--champ)" }}>{taxMode}</span>
        )}
      </div>

      <div style={t.slipSec}>支給</div>
      {bd.earn.map((ln) => earn(ln.label, ln.amount, ln.key, !!(ln.sub || ln.info)))}{/* ★303-1／303-2: 右パネルと同じ行・同じ順・時間行は 0 でも出る */}
      {(pay.gross ?? 0) > 0 && (
        <div style={t.slipRowB}><span>総支給（賞与等含む）</span><span style={t.num}>{yen(pay.gross ?? 0)}</span></div>
      )}

      {hasDed && <div style={t.slipSec}>控除</div>}
      {bd.ded.map((ln) => ded(ln.label, ln.amount, ln.key))}{/* 264-2: 理由行は before＝源泉の直前・after＝直後（関数が並べる）・非表示分は「明細非表示」行＝控除計と一致 */}

      <div className="ps-foot" style={t.slipFoot}><span>手取り</span><b style={t.slipFootVal}>{yen(slip.net)}</b></div>
    </div>
  );
}
