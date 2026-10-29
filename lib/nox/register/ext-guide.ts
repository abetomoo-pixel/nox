// ★0187 の client（便 EXT・Agoora 確定 10/27（2）＋補遺・2026-10-27 夜）: 延長のご案内（お客様向け全画面）の純関数＝DB を知らない。
//   0187 の凍結メニュー ext_menu_snap＝その営業日の曜日・席種の延長パターンを時間帯を問わず全行（各行に band＝営業日の分の [from, to)・時間帯なし＝null）。
//   案内＝「今の時間帯に合う延長時間を全部」＝長さ（duration_min）ごとに ext_menu_pick と同じ順（時間帯つき→選択中のパターン→既定→メニューの順）で 1 行ずつ選ぶ。
//   金額＝会計と同じ関数（groupDueFull）で、その行を足したときの合計の増分（人数・サービス料・税・丸め込み）。VIP 卓は再凍結した VIP の行がそのまま入る。
//   旧い凍結（band キーなし＝0187 前に開いた伝票）＝案内なし（[]）。権威はサーバ（check_extension_add の p_rule_id）＝ここは表示だけ。
import { groupDueFull, type CheckDueSettings, type DueLine } from "@/lib/nox/check-calc";

export type ExtSnapItem = { rule_id: string; duration_min: number; amount: number; label: string; is_default?: boolean; unit?: string; band?: { from: number; to: number } | null };

/** 新しい形の凍結（全行に band キー）か */
export const extSnapIsNewOf = (snap: readonly ExtSnapItem[] | null | undefined): boolean => Array.isArray(snap) && snap.length > 0 && snap.every((x) => "band" in x);

/** ext_menu_pick の鏡＝その時刻（営業日の分 bm）の時間帯に合う行を 1 つ（時間帯つき→選択中→既定→並び順）。長さ dur を揃える。合う行なし・旧い凍結＝null */
export function extMenuPickOf(snap: readonly ExtSnapItem[] | null | undefined, bm: number, prefer: string | null, dur: number | null): ExtSnapItem | null {
  const rows = (snap ?? []).map((m, ord) => ({ m, ord })).filter(({ m }) => "band" in m
    && (m.band === null || m.band === undefined || (m.band.from <= bm && bm < m.band.to))
    && (dur === null || m.duration_min === dur));
  rows.sort((a, b) => Number(!!b.m.band) - Number(!!a.m.band)
    || Number(b.m.rule_id === prefer) - Number(a.m.rule_id === prefer)
    || Number(b.m.is_default === true) - Number(a.m.is_default === true)
    || a.ord - b.ord);
  return rows[0]?.m ?? null;
}

/** 案内の行＝長さごとに 1 行（昇順）。旧い凍結は [] */
export function extGuideRowsOf(snap: readonly ExtSnapItem[] | null | undefined, bm: number, prefer: string | null): { item: ExtSnapItem; duration: number }[] {
  if (!extSnapIsNewOf(snap)) return [];
  const durs = [...new Set((snap ?? []).map((m) => m.duration_min))].filter((d) => d >= 1).sort((a, b) => a - b);
  return durs.flatMap((d) => { const it = extMenuPickOf(snap, bm, prefer, d); return it ? [{ item: it, duration: d }] : []; });
}

/** その延長を足したときの合計の増分（税・サービス料・丸め込み）＝groupDueFull の差。units＝人数制なら人数 */
export function extGuidePriceOf(lines: readonly DueLine[], settings: CheckDueSettings, referralCustomer: number, amount: number, units: number): number {
  const before = groupDueFull([...lines], settings, referralCustomer);
  const after = groupDueFull([...lines, { kind: "time", fee_kind: "extension", line_total: amount * Math.max(1, units), tax_category: "taxable_10" }], settings, referralCustomer);
  return Math.max(0, after - before);
}

export const extGuideLabelOf = (duration: number): string => `延長 ${duration}分`;
