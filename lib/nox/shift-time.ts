/* 日跨ぎ時刻の単一ソース（BANZEN lib/shift-time.ts の翻訳・方式B 継承）。
 *
 * NOX の時刻規約（mig0008 決定3・データモデル設計 §2.5 F1d 追記5）:
 *  - start_hm は 00:00〜23:59。end_hm は 00:00〜47:59（24h 超表記可＝営業日 D の 26:00 = D+1 02:00）。
 *  - 意味論の正本は本ファイル。**end<=start は+24h 解釈（crossesMidnight）**・"26:00" 表記と
 *    "02:00"（跨ぎ）表記は spanMinutes/nominalSegment で同一結果に正規化される。
 *  - DB は正規表現の形式 CHECK のみで時刻計算をしない（勤怠集計・シフト表示・F2 の wHours は
 *    すべて本ファイルを通る＝規約は単一定義＝構造的にドリフト不能。BANZEN T4 教訓）。
 *
 * 境界：end < start → 翌日。end == start → 同日0分（退化・UI は選べない）。end >= 24:00 → 翌日表記。 */

export const hm2min = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const pad = (n: number): string => String(n).padStart(2, "0");

export const min2hm = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// 名目時刻が日をまたぐ（終了が翌暦日）か。end < start ＝翌日。end >= 24:00 も翌日（24h 超表記）。
export function crossesMidnight(start: string, end: string): boolean {
  const e = hm2min(end);
  return e < hm2min(start) || e >= 1440;
}

// 名目スパン（分）。end < start は +1440。"26:00" と "02:00"（跨ぎ）は同一結果。end==start → 0。
export function spanMinutes(start: string, end: string): number {
  let raw = hm2min(end) - hm2min(start);
  if (raw < 0) raw += 1440;
  return raw;
}

// 実働（分）＝スパン − 休憩（下限0）。
export function netMinutes(start: string, end: string, breakMin: number): number {
  return Math.max(0, spanMinutes(start, end) - (breakMin || 0));
}

// 時間帯表示。日跨ぎは「翌」を付ける（24h 超表記は 00:00-23:59 に正規化して表示）。
export function fmtWin(from: string | null, to: string | null): string {
  if (!from && !to) return "";
  if (from && to) {
    return crossesMidnight(from, to) ? `${from}–翌${min2hm(hm2min(to) % 1440)}` : `${from}–${to}`;
  }
  return from ? `${from}–` : `–${to}`;
}

// 暦日 'YYYY-MM-DD' に1日足す（UTC 基準の純粋な日加算＝TZ 非依存）。
function addDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const t = Date.UTC(y, m - 1, dd) + 86400000;
  const nd = new Date(t);
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
}

// 名目時刻（date＋開始/終了 HH:MM）を JST ISO 区間へ。日跨ぎ（24h 超表記含む）は終了を翌日に正規化。
// F2 の深夜分算出・勤怠集計に使う。
export function nominalSegment(date: string, start: string, end: string): { start: string; end: string } {
  const crossing = crossesMidnight(start, end);
  const endDate = crossing ? addDay(date) : date;
  const endHm = min2hm(hm2min(end) % 1440);
  return {
    start: `${date}T${start.slice(0, 5)}:00+09:00`,
    end: `${endDate}T${endHm}:00+09:00`,
  };
}

// ★表示専用（保存/計算に触れない）。30時間制表記（"23:00–26:00"）で描く（深夜帯の可読性）。
//   24h 超表記の入力はそのまま・跨ぎ表記（end<start）は +24h して描く。
export function fmtBand30(start: string, end: string): string {
  if (!crossesMidnight(start, end)) return `${start}–${end}`;
  const e = hm2min(end);
  const abs = e >= 1440 ? e : e + 1440;
  return `${start}–${min2hm(abs)}`;
}
