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
