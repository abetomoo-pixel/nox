// ★連続便 3 追補 P-10（裁定408 系・0175 v2 ★23）: 伝票の「選択中の延長パターン」＝checks.ext_rule_id（凍結 ext_menu_snap の rule_id・null＝既定）。
//   延長ボタンの表示「延長を追加（¥7,000 / 30分・週末通常）」・明細の延長行「延長料金（週末通常 30分）」（RPC 側）。
//   RULES_0175_APPLIED=false の間は従来の表示（ext_min／ext_fee の値で cur を探す・パターン名は出さない）。
export type ExtMenuItem = { rule_id: string; duration_min: number; amount: number; label: string; is_default?: boolean; unit?: string | null };

/** 選択中のパターン＝ext_rule_id があればそれ・無ければ ext_min／ext_fee と一致する項目・それも無ければ既定の印の項目 */
export function extCurrentOf(menu: readonly ExtMenuItem[] | null | undefined, extRuleId: string | null | undefined, extMin: number, extFee: number): ExtMenuItem | null {
  const m = menu ?? [];
  if (m.length === 0) return null;
  if (extRuleId) { const hit = m.find((x) => x.rule_id === extRuleId); if (hit) return hit; }
  return m.find((x) => x.duration_min === extMin && x.amount === extFee) ?? m.find((x) => x.is_default) ?? null;
}
/** 延長ボタンの文言＝「延長を追加（¥7,000 / 30分・週末通常）」（パターンが 1 つの店や旧伝票は名前なし） */
export function extButtonTextOf(fee: number, min: number, menu: readonly ExtMenuItem[] | null | undefined, cur: ExtMenuItem | null): string {
  const base = `延長を追加（¥${fee.toLocaleString()} / ${min}分`;
  return (menu?.length ?? 0) >= 2 && cur ? `${base}・${cur.label}）` : `${base}）`;
}
/** ▾ を出すか＝凍結メニューが 2 件以上 */
export const extMenuShowOf = (menu: readonly ExtMenuItem[] | null | undefined): boolean => (menu?.length ?? 0) >= 2;
/** 延長行の名前（RPC check_set_ext_rule／check_extension_add と同じ式） */
export const extLineNameOf = (label: string | null | undefined, min: number): string => (label ? `延長料金（${label}）` : `延長料金(${min}分)`);
/** マスタ「延長パターン n/3」の表記＝実数＋上限（超過は警告） */
export function extCountTextOf(n: number, max = 3): { text: string; over: boolean; full: boolean } {
  return { text: `${n} 件（上限 ${max}${n > max ? "・超過" : ""}）`, over: n > max, full: n >= max };
}

// ★0224（裁定508（提案）・相談役 11/26 夜便 N の N3）: 延長パターンの数の上限（裁定385 の 1 店 3 本）を撤去。mig0224On() の間の表記と、多いときのレジの一覧。
/** マスタ「延長パターン」の表記（0224 の後）＝件数だけ（上限・超過・満杯の印は無い） */
export function extCountTextV2Of(n: number): { text: string; over: boolean; full: boolean } {
  return { text: `${n} 件`, over: false, full: false };
}
/** 凍結メニューの 1 行（0187 の後は band＝営業日の分の [from, to)・時間帯なし＝null・0187 前の凍結は band キーなし） */
export type ExtPickItem = ExtMenuItem & { band?: { from: number; to: number } | null };
/** 今の時間帯に合う（now）・時間帯なし（allday）・ほかの時間帯（other） */
export type ExtPickGroup = "now" | "allday" | "other";
export const EXT_PICK_GROUP_LABEL: Record<ExtPickGroup, string> = { now: "今の時間帯", allday: "時間帯なし", other: "ほかの時間帯" };
const hmOf = (biz: number): string => { const m = ((biz % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
/** 時間帯の表記「20:00〜22:00」（営業日の分＝締めの後は +1440 を戻す）・時間帯なし＝null */
export const extBandTextOf = (band: ExtPickItem["band"]): string | null => (band ? `${hmOf(band.from)}〜${hmOf(band.to)}` : null);
/** レジの延長パターンの一覧の並び＝今の時間帯に合うもの → 時間帯なし → ほかの時間帯（各群の中は凍結メニューの順＝既定→priority→作成順）。
 *  曜日と席種は凍結のときに絞られている（ext_menu_build＝その営業日の曜日・その席種の行だけ）＝ここで並べるのは時間帯だけ。
 *  heading＝群が 2 つ以上あるときだけ群の頭に見出し（旧い凍結や時間帯の無い店は見出しなし＝今と同じ並び）。 */
export function extPickerRowsOf<T extends ExtPickItem>(menu: readonly T[] | null | undefined, bm: number, curRuleId: string | null | undefined): { item: T; group: ExtPickGroup; bandText: string | null; current: boolean; heading: string | null }[] {
  const groupOf = (m: T): ExtPickGroup => (!m.band ? "allday" : m.band.from <= bm && bm < m.band.to ? "now" : "other");
  const order: ExtPickGroup[] = ["now", "allday", "other"];
  const rows = (menu ?? []).map((item, ord) => ({ item, ord, group: groupOf(item) }));
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.ord - b.ord);
  const multi = new Set(rows.map((r) => r.group)).size >= 2;
  return rows.map((r, i) => ({ item: r.item, group: r.group, bandText: extBandTextOf(r.item.band), current: !!curRuleId && r.item.rule_id === curRuleId,
    heading: multi && (i === 0 || rows[i - 1].group !== r.group) ? EXT_PICK_GROUP_LABEL[r.group] : null }));
}
/** 一覧の箱の高さ（多いときに画面からはみ出さない＝高さを抑えてスクロール） */
export const EXT_PICKER_BOX_STYLE = { maxHeight: "min(60vh, 420px)", overflowY: "auto" } as const;
