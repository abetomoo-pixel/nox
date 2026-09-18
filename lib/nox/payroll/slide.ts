// ★夜間便 N3b（裁定288・2026-09-18）: スライドの基準と適用月＝純関数（DB を知らない）。
//   slide_apply='next'（翌月反映）: 段の判定に使う実績＝「その営業日が属する暦月の前月」の売上合計／ポイント合計（閾値は月間合計）。
//   'current' または欠損・不正値: 現行どおり（営業日ごとの売上・ポイント＝閾値は 1 日あたり）。既存店と golden は不変。
export type SlideApply = "next" | "current";

/** stores.settings_json.slide_apply → 'next' のときだけ 'next'。欠損・不正値は 'current'（288-4） */
export function slideApplyOf(settings: unknown): SlideApply {
  const v = settings && typeof settings === "object" ? (settings as Record<string, unknown>).slide_apply : undefined;
  return v === "next" ? "next" : "current";
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const monthOf = (ymd: string): string => ymd.slice(0, 7);

/** 'YYYY-MM' の前月 */
export function prevMonthOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM' の末日 'YYYY-MM-DD'（暦月） */
export function lastDayOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${ym}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 期（start〜end・'YYYY-MM-DD'）に含まれる暦月の一覧（昇順・重複なし）＝期が月をまたげば 2 つ以上 */
export function monthsInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = monthOf(start);
  const last = monthOf(end);
  while (cur <= last) { out.push(cur); cur = nextMonthOf(cur); if (out.length > 24) break; }
  return out;
}
export function nextMonthOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
