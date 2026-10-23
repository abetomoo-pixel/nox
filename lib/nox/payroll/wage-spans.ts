// ★便 PR-1 R-2（裁定416・2026-10-23）: 時給の日付解決＝営業日ごとの時給（pay.ts wageDetail の wdays＝max(保証, 段, 基本)）を
//   「同じ時給が続く区間」にまとめ、明細の支給を区間ごとに 1 行で出す（「時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）」）。
//   純関数・DB を知らない。合計 h＝wdays の hours の和（＝SH-UI-c C-1 と同じ dayWorkedHours の系列）。
//   区間の切れ目＝時給か区分（保証／売上段／pt 段／基本）が変わった日・splitAtD（半月判定の 16 日など）の直前。
//   区間の金額は roundYen(Σ hourly×hours) を各区間で取り、最後の区間で timePay との差（丸めの端数）を吸収＝Σ行＝timePay。
import { roundPt1, roundYen } from "@/lib/nox/money";

export type WageDayLike = { d: number; hours: number; hourly: number; basis: string; gua?: boolean };
export type WageSpan = { fromD: number; toD: number; hourly: number; hours: number; pay: number; kind: "保証" | "売上段" | "pt 段" | "基本" };

/** 1 日の区分＝保証（保証行が効いた日）／売上段／pt 段／基本（段も保証も無い日） */
export function wageDayKindOf(w: Pick<WageDayLike, "basis" | "gua">): WageSpan["kind"] {
  if (w.gua) return "保証";
  if (w.basis === "売上") return "売上段";
  if (w.basis === "ポイント") return "pt 段";
  return "基本";
}

/**
 * wdays（d 昇順でなくてもよい）→ 区間。timePay を渡すと最後の区間に丸めの端数を寄せる（Σ pay＝timePay）。
 * splitAtD＝この日番号の直前で必ず切る（半月判定＝[16]・判定日を境に 2 区間＝裁定416）。hours 0 の日は区間に含めない（0h の日で時給が変わっても行を増やさない）。
 */
export function wageSpansOf(wdays: WageDayLike[], opts: { timePay?: number; splitAtD?: number[] } = {}): WageSpan[] {
  const days = [...wdays].filter((w) => w.hours > 0).sort((a, b) => a.d - b.d);
  const splits = new Set(opts.splitAtD ?? []);
  const spans: WageSpan[] = [];
  for (const w of days) {
    const kind = wageDayKindOf(w);
    const last = spans[spans.length - 1];
    if (last && last.hourly === w.hourly && last.kind === kind && !splits.has(w.d) && !(last.toD < w.d && [...splits].some((s) => last.toD < s && s <= w.d))) {
      last.toD = w.d; last.hours += w.hours; last.pay += w.hourly * w.hours;
    } else {
      spans.push({ fromD: w.d, toD: w.d, hourly: w.hourly, hours: w.hours, pay: w.hourly * w.hours, kind });
    }
  }
  for (const s of spans) { s.hours = roundPt1(s.hours); s.pay = roundYen(s.pay); }
  if (typeof opts.timePay === "number" && spans.length > 0) {
    const sum = spans.reduce((a, s) => a + s.pay, 0);
    spans[spans.length - 1].pay += opts.timePay - sum;
  }
  return spans;
}

/** 区間の行ラベル。period 'YYYY-MM' があれば「10/1〜10/24」（1 日だけなら「10/22」＝B2-0b）・無ければ日付なし。1 区間だけなら従来と同じ「時給 ¥n/h × h」 */
export function wageSpanLabelOf(s: WageSpan, period: string | null | undefined, single: boolean): string {
  const yen = `¥${s.hourly.toLocaleString("en-US")}`;
  if (single) return `時給 ${yen}/h × ${s.hours}h`;
  const m = period ? Number(period.slice(5, 7)) : null;
  const range = m ? (s.fromD === s.toD ? `${m}/${s.fromD}・` : `${m}/${s.fromD}〜${m}/${s.toD}・`) : "";   // ★便 SH-UI-b2 B2-0b: 1 日だけの区間は単日表記（10/22）
  return `時給 ${yen}/h × ${s.hours}h（${range}${s.kind}）`;
}
