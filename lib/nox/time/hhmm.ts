// ★裁定318（2026-09-29・便 X-9-2）: 時刻入力の正規化。HHMM／HH:MM／H:MM／HH（＋ HMM）を受けて 'HH:MM' に揃える。
//   翌日（24〜47 時）も同様（30 時間制の 0-47 域）。全角の数字・コロンは半角に直してから判定する。
//   純関数＝DB を知らない。入力欄は blur 時に正規化表示・検証は正規化後（呼び出し側は null＝不正 を見る）。
export const HM_FORMAT_ERR = "時刻の形式が不正です（例 2000・20:00）";

const toAscii = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[：]/g, ":").trim();

/**
 * 'HH:MM' に正規化。形が違う／範囲外は null。
 * @param maxHour 時の上限（既定 47＝翌日 23 時台まで）。開始時刻など当日だけの欄は 23 を渡す。
 */
export function normalizeHHMM(raw: string | null | undefined, maxHour = 47): string | null {
  const s = toAscii(raw ?? "");
  if (s === "") return null;
  let h: number, m: number;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{1,2}):(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); }        // HH:MM／H:MM
  else if ((mt = s.match(/^(\d{2})(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); }      // HHMM
  else if ((mt = s.match(/^(\d)(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); }         // HMM（900＝09:00）
  else if ((mt = s.match(/^(\d{1,2})$/))) { h = Number(mt[1]); m = 0; }                       // HH／H
  else return null;
  if (h < 0 || h > maxHour || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 表示用: 正規化できればその値・できなければ入力のまま（blur 時に欄へ戻す値） */
export const displayHHMM = (raw: string, maxHour = 47): string => normalizeHHMM(raw, maxHour) ?? raw;
