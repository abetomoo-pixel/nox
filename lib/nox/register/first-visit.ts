// ★0210（起票140＝ホストの初回料金・相談役 2026-11-25 の決め）: 初回料金の画面の純関数（DB を知らない・表示だけ＝権威はサーバ）。
//   言葉：台帳の「初回セット行」（298-4・280）とぶつかるので「初回料金」と呼ぶ。伝票の行の名前は「初回料金(60分) 税・サ込」（check_open／check_time_charge_apply と同じ）。
//   時間の知らせは画面だけ（音は付けない）・10 分前に黄色・0 分で赤。時間無制限は「終わらない」＝数えない。

export type PriceMode = "base" | "all_in";
export type TimeEnd = "extend" | "end" | "unlimited";
export const PRICE_MODES: readonly PriceMode[] = ["base", "all_in"];
export const TIME_ENDS: readonly TimeEnd[] = ["extend", "end", "unlimited"];
export const PRICE_MODE_LABEL: Record<PriceMode, string> = { base: "サービス料と税を足す（今と同じ）", all_in: "税・サ込みのきっかりの額" };
export const TIME_END_LABEL: Record<TimeEnd, string> = { extend: "延長に移る（今と同じ）", end: "時間で終わり（延長しない）", unlimited: "時間無制限" };
export const priceModeOf = (v: unknown): PriceMode => (v === "all_in" ? "all_in" : "base");
export const timeEndOf = (v: unknown): TimeEnd => (v === "end" ? "end" : v === "unlimited" ? "unlimited" : "extend");

/** 黄色にする残りの分（相談役 11/25：10 分前） */
export const FIRST_VISIT_WARN_MIN = 10;

/** セットの行の名前（DB の check_open／check_time_charge_apply と同じ） */
export function setLineNameOf(setMin: number, priceMode: PriceMode | string | null | undefined): string {
  return priceMode === "all_in" ? `初回料金(${setMin}分) 税・サ込` : `セット料金(${setMin}分)`;
}

export type FirstVisitTone = "info" | "warn" | "bad";
export type FirstVisitBadge = { label: string; tone: FirstVisitTone; remainMin: number | null };
/** 初回の卓の札（席のタイルと伝票の中）。初回でない卓・延長に移る卓の延長に入った後は null（今の赤い表示のまま） */
export function firstVisitBadgeOf(i: { firstVisit: boolean | null | undefined; timeEnd: TimeEnd | string | null | undefined; startedAtMs: number; nowMs: number; setMin: number }): FirstVisitBadge | null {
  if (!i.firstVisit) return null;
  const te = timeEndOf(i.timeEnd);
  if (te === "unlimited") return { label: "初回 時間無制限", tone: "info", remainMin: null };
  const elapsed = Math.max(0, Math.floor((i.nowMs - i.startedAtMs) / 60000));
  const remain = i.setMin - elapsed;
  if (te === "end") {
    if (remain > 0) return { label: `初回 あと ${remain} 分で終了`, tone: remain <= FIRST_VISIT_WARN_MIN ? "warn" : "info", remainMin: remain };
    return { label: remain === 0 ? "初回 時間です" : `初回 時間です（${-remain} 分過ぎ）`, tone: "bad", remainMin: remain };
  }
  if (remain >= 0) return { label: `初回 あと ${remain} 分で延長`, tone: remain <= FIRST_VISIT_WARN_MIN ? "warn" : "info", remainMin: remain };
  return null;
}

/** 手で延長できるか（'end'／'unlimited' は no extension＝DB の check_extension_add と同じ柵） */
export const canExtendOf = (timeEnd: TimeEnd | string | null | undefined): boolean => timeEndOf(timeEnd) === "extend";
/** 「ふつうの料金で延長に切り替える」を出すか（店長以上・時間で終わりの卓だけ＝check_set_time_end） */
export const canSwitchToExtendOf = (timeEnd: TimeEnd | string | null | undefined, isManagerUp: boolean): boolean => isManagerUp && timeEndOf(timeEnd) === "end";

/** レジの上の「時間の卓 N」＝時間で終わりの初回の卓のうち赤（時間を過ぎた）の卓 */
export function overdueTablesOf<T extends { firstVisit?: boolean | null; timeEnd?: string | null; startedAtMs: number; setMin: number }>(checks: readonly T[], nowMs: number): T[] {
  return checks.filter((c) => firstVisitBadgeOf({ firstVisit: c.firstVisit, timeEnd: c.timeEnd, startedAtMs: c.startedAtMs, nowMs, setMin: c.setMin })?.tone === "bad");
}

export type OpenCategory = { id: string; name: string; sort?: number | null; first_visit?: boolean | null };
/** 開卓の区分の既定＝初回でない区分の一番上（sort 順・無ければ「区分なし」＝""）。0210 より前は sort が一番小さい区分（first_visit を持たない＝今と同じ） */
export function defaultOpenCategoryOf(cats: readonly OpenCategory[]): string {
  const normal = cats.find((c) => !c.first_visit);
  return normal ? normal.id : "";
}
/** 来店の記録がある客で初回の区分を選んだときの注意（止めない） */
export function visitNoteOf(i: { categoryFirstVisit: boolean; lastVisitAt: string | null | undefined }): string | null {
  return i.categoryFirstVisit && i.lastVisitAt ? "この方は来店の記録があります（初回料金でよいか確かめてください）" : null;
}

/** RPC の英語の例外 → 日本語 */
export function firstVisitErrJa(msg: string): string | null {
  if (/no extension/.test(msg)) return "初回料金（時間で終わり・時間無制限）の卓は延長できません。時間で終わりの卓は、店長以上が「延長に切り替える」を押すと延長できます";
  if (/not end/.test(msg)) return "時間で終わりの卓ではありません（切り替え済みか、時間無制限です）";
  if (/first visit exists/.test(msg)) return "初回料金の区分は 1 店に 1 つまでです（ほかの区分の印を外してから付けてください）";
  if (/not first visit/.test(msg)) return "初回料金の区分のセットの行だけに設定できます";
  if (/not set rule/.test(msg)) return "セット料金の行だけに設定できます";
  if (/bad price_mode|bad time_end|bad first_visit/.test(msg)) return "値が正しくありません";
  return null;
}
