import * as t from "@/lib/nox/ui/theme";

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
  const nominBack = (pay.honBack ?? 0) + (pay.jonaiBack ?? 0) + (pay.dohanBack ?? 0);
  const prodBack = (pay.drinkBack ?? 0) + (pay.champBack ?? 0) + (pay.bottleBack ?? 0) + (pay.salesBack ?? 0) + (pay.customTotal ?? 0);
  const hasDed = (pay.fixedDed ?? 0) > 0 || (pay.fine ?? 0) > 0 || (pay.withholding ?? 0) > 0 || (pay.normPenalty ?? 0) > 0 || ar > 0 || adv > 0 || okuri > 0;
  // 支給行（＞0 のみ）／控除行（＞0 のみ・bad 減算）。gross = 支給の和・net = gross − 控除 ＋ extras（＝slip.net）。
  const earn = (label: string, v: number) => (
    <div style={t.slipRow}><span>{label}</span><span style={t.num}>{yen(v)}</span></div>
  );
  const ded = (label: string, v: number) =>
    v > 0 ? <div style={t.slipRow}><span>{label}</span><span style={{ ...t.num, color: "var(--bad)" }}>−{yen(v)}</span></div> : null;
  return (
    <div className="nox-payslip" style={{ marginBottom: 14 }}>
      <div className="ps-hd" style={t.slipHd}>{castName ? `${castName}　${slip.period}` : slip.period}</div>

      <div style={t.slipSec}>支給</div>
      {(pay.timePay ?? 0) > 0 && earn(`時給 ${yen(pay.wage ?? 0)}/h × ${pay.wHours ?? 0}h`, pay.timePay ?? 0)}
      {nominBack > 0 && earn("指名バック（本/場内/同伴）", nominBack)}
      {prodBack > 0 && earn("商品・売上・自由バック", prodBack)}
      {(pay.gross ?? 0) > 0 && (
        <div style={t.slipRowB}><span>総支給（gross）</span><span style={t.num}>{yen(pay.gross ?? 0)}</span></div>
      )}

      {hasDed && <div style={t.slipSec}>控除</div>}
      {ded("固定控除", pay.fixedDed ?? 0)}
      {ded("罰金", pay.fine ?? 0)}
      {ded("源泉", pay.withholding ?? 0)}
      {ded("ノルマ未達", pay.normPenalty ?? 0)}
      {ded("売掛", ar)}
      {ded("前借り", adv)}
      {ded("送り", okuri)}

      {extras.length > 0 && <div style={t.slipSec}>加算</div>}
      {extras.map((e, j) => (
        <div key={j} style={t.slipRow}>
          <span>{e.label ?? (e.kind === "attendance_bonus" ? "出勤ボーナス" : e.kind)}</span>
          <span style={t.num}>{yen(e.amount)}</span>
        </div>
      ))}

      <div className="ps-foot" style={t.slipFoot}><span>手取り</span><b style={t.slipFootVal}>{yen(slip.net)}</b></div>
    </div>
  );
}
