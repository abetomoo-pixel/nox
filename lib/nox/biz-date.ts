/* 営業日境界の単一ソース（F1e・mig0010）。
 *
 * 規約: 営業日 D の範囲 = [D <cutoff> JST, D+1 <cutoff> JST)。伝票は started_at で帰属。
 * cutoff は stores.settings_json.biz_cutoff_hm（既定 '06:00'・00:00〜23:59）。
 * daily_report_close は締め時点の cutoff を日報行へスナップショットする（範囲定義の凍結）。
 *
 * ★DB 側（daily_report_close 内の範囲計算）と同一規則。DB で時刻計算をするのは
 *   この境界計算だけ（F1d 方針からの明示的逸脱）のため、TS/DB 同値保証の対象:
 *   verify が境界直前・直後の伝票で「RPC の集計対象」と「bizDateOf の判定」の一致を assert する。 */

const pad = (n: number): string => String(n).padStart(2, "0");

/** 暦日 'YYYY-MM-DD' に n 日足す（UTC 基準の純粋な日加算＝TZ 非依存・shift-time.addDay と同型） */
export function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const t = Date.UTC(y, m - 1, dd) + n * 86400000;
  const nd = new Date(t);
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
}

/** 営業日 D の JST ISO 区間 [start, end)。DB 側の範囲計算と同一結果になること（verify 対象）。 */
export function bizDateRange(bizDate: string, cutoffHm: string): { startIso: string; endIso: string } {
  return {
    startIso: `${bizDate}T${cutoffHm}:00+09:00`,
    endIso: `${addDays(bizDate, 1)}T${cutoffHm}:00+09:00`,
  };
}

/** timestamptz ISO 文字列の時刻が属する営業日 'YYYY-MM-DD' を返す。
 *  JST に直し cutoff 分を引いた時点の暦日＝営業日（cutoff 前の深夜は前営業日）。 */
export function bizDateOf(atIso: string, cutoffHm: string): string {
  const [ch, cm] = cutoffHm.split(":").map(Number);
  const t = new Date(atIso).getTime();
  const jstShifted = t + 9 * 3600000 - ((ch || 0) * 60 + (cm || 0)) * 60000;
  const d = new Date(jstShifted);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
