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
  if (/first visit shadowed/.test(msg)) return FIRST_VISIT_SHADOW_JA; // ★0210 v2（【F5】）
  if (/not first visit/.test(msg)) return "初回料金の区分のセットの行だけに設定できます";
  if (/not set rule/.test(msg)) return "セット料金の行だけに設定できます";
  if (/bad price_mode|bad time_end|bad first_visit/.test(msg)) return "値が正しくありません";
  return null;
}

// ── ★0210 v2（相談役 11/25 の便 F【F5】の決め）: 初回の区分のセットの行が「当たらない並び」なら、マスタの保存で止めて理由を出す（注意だけにしない）。
//   料金の決まり（pricing_resolve_core）は変えない＝並び（priority の小さい順）→同じ並びなら区分の行が先。
//   よって、区分なし（category_id null）の有効なセットの行 G が、初回の区分のセットの行 F より並びが上（priority が小さい）で、
//   G の条件（席種・ランク・曜日・時間帯）が F の条件をすべて覆うなら、F はどの場面でも当たらない（G が当たる）。DB の set_pricing_rule_first（0210 v2）と同じ判定。
//   一部の場面だけ覆う G（例 VIP 席だけの区分なしのセット）は止めない（F は残りの場面で当たる＝VIP 席の料金を別に持つ店の作りを止めない）。
export type ShadowRule = {
  id: string; fee_kind: string; category_id: string | null; is_active: boolean; priority: number;
  seat_kind: string | null; rank_id: string | null; dow_mask: number | null; time_from_min: number | null; time_to_min: number | null;
  price_mode?: string | null; time_end?: string | null; amount?: number; name?: string | null;
};
export type ShadowHit = { ruleId: string; byRuleId: string };
/** 時間帯を営業日の中の [始め, 終わり) に（pricing_resolve_core と同じ非対称の +1440：始め < 切替 ／ 終わり ≤ 切替）。null＝終日 */
const winOf = (r: ShadowRule, cutMin: number): [number, number] => {
  if (r.time_from_min == null || r.time_to_min == null) return [cutMin, cutMin + 1440];
  const f = r.time_from_min < cutMin ? r.time_from_min + 1440 : r.time_from_min;
  const t = r.time_to_min <= cutMin ? r.time_to_min + 1440 : r.time_to_min;
  return [f, t];
};
/** g の条件が f の条件をすべて覆うか（席種・ランク・曜日・時間帯）＝f が当たる場面ではいつも g も当たる */
export function ruleCoversOf(g: ShadowRule, f: ShadowRule, cutMin: number): boolean {
  if (g.seat_kind != null && g.seat_kind !== f.seat_kind) return false;
  if (g.rank_id != null && g.rank_id !== f.rank_id) return false;
  if (g.dow_mask != null && (f.dow_mask == null || (f.dow_mask & ~g.dow_mask) !== 0)) return false;
  const [gf, gt] = winOf(g, cutMin), [ff, ft] = winOf(f, cutMin);
  return gf <= ff && ft <= gt;
}
/** 初回の区分（firstVisitCatIds）の有効なセットの行のうち、区分なしの行に負ける行（onlyChosen＝2 つの選択が base／extend でない行だけ） */
export function firstVisitShadowsOf(rules: readonly ShadowRule[], firstVisitCatIds: readonly string[], cutMin: number, onlyChosen = true): ShadowHit[] {
  const out: ShadowHit[] = [];
  const gs = rules.filter((g) => g.is_active && g.fee_kind === "set" && g.category_id === null);
  for (const f of rules) {
    if (!f.is_active || f.fee_kind !== "set" || f.category_id === null || !firstVisitCatIds.includes(f.category_id)) continue;
    if (onlyChosen && priceModeOf(f.price_mode) === "base" && timeEndOf(f.time_end) === "extend") continue;
    const g = gs.filter((x) => x.priority < f.priority && ruleCoversOf(x, f, cutMin)).sort((a, b) => a.priority - b.priority)[0];
    if (g) out.push({ ruleId: f.id, byRuleId: g.id });
  }
  return out;
}
/** 止めたときの理由（1 行） */
export const FIRST_VISIT_SHADOW_JA = "初回料金の区分のセット料金が、区分なしのセット料金より下に並んでいるため、開卓で当たりません。料金の表で初回の区分の行を上に移してから保存してください";
/** 保存の前後で比べ、保存の後に新しく当たらなくなる初回の行があれば理由を返す（保存の前から当たらない行は、ここでは止めない＝並びを直す保存を通す） */
export function firstVisitShadowBlockOf(before: readonly ShadowRule[], after: readonly ShadowRule[], firstVisitCatIds: readonly string[], cutMin: number): string | null {
  if (firstVisitCatIds.length === 0) return null;
  const was = new Set(firstVisitShadowsOf(before, firstVisitCatIds, cutMin).map((h) => h.ruleId));
  return firstVisitShadowsOf(after, firstVisitCatIds, cutMin).some((h) => !was.has(h.ruleId)) ? FIRST_VISIT_SHADOW_JA : null;
}
