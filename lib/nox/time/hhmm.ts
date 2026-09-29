// ★裁定318（2026-09-29・便 X-9-2）: 時刻入力の正規化。HHMM／HH:MM／H:MM／HH（＋ HMM）を受けて 'HH:MM' に揃える。
//   翌日（24〜47 時）も同様（30 時間制の 0-47 域）。全角の数字・コロンは半角に直してから判定する。
//   純関数＝DB を知らない。検証は正規化後（呼び出し側は null＝不正 を見る）。
// ★裁定318 追補（便 X-10-3）: 入力マスク（数字のみ・最大 4 桁・2 桁で ':' 自動挿入・5 桁目は無視・貼り付けも同形）と、範囲外（時 00〜47／分 00〜59）のその場判定。
//   送信時の normalizeHHMM は残す（二重防御）。
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
  else if ((mt = s.match(/^(\d{1,2}):?$/))) { h = Number(mt[1]); m = 0; }                     // HH／H（マスクの途中形 'HH:' も 00 分として受ける）
  else return null;
  if (h < 0 || h > maxHour || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 表示用: 正規化できればその値・できなければ入力のまま */
export const displayHHMM = (raw: string, maxHour = 47): string => normalizeHHMM(raw, maxHour) ?? raw;

/** 数字だけを最大 4 桁取り出す（全角→半角・'9:30' のように時が 1 桁で ':' が来たら 0 を補う） */
export function hmDigitsOf(raw: string | null | undefined): string {
  let s = toAscii(raw ?? "");
  if (/^\d:/.test(s)) s = "0" + s;
  return s.replace(/\D/g, "").slice(0, 4);
}

/** 数字（最大 4 桁）→ マスクの表示形: 1 桁 'H'・2 桁 'HH:'・3 桁 'HH:M'・4 桁 'HH:MM' */
export const hmFormatDigits = (digits: string): string => (digits.length < 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`);

/**
 * 入力マスク。raw＝入力欄の新しい値・prev＝直前の表示値・deleting＝削除操作（Backspace／Delete）。
 *   削除で ':' だけが消えた（数字が減っていない）ときは数字を 1 つ落とす＝'20:' → '2'。
 */
export function maskHHMM(raw: string | null | undefined, prev = "", deleting = false): string {
  let d = hmDigitsOf(raw);
  if (deleting && d.length > 0 && d === hmDigitsOf(prev) && (raw ?? "").length < prev.length) d = d.slice(0, -1);
  if (deleting && d.length === 2 && hmDigitsOf(prev).length === 3) return d;   // 'HH:M' から 1 字消した直後は 'HH'（':' を再挿入しない＝続けて消せる）
  return hmFormatDigits(d);
}

/** 範囲外のその場判定（途中形でも分かる範囲で見る）。範囲内・未入力は null */
export function hmRangeErrorOf(value: string | null | undefined, maxHour = 47): string | null {
  const d = hmDigitsOf(value);
  if (d.length >= 2 && Number(d.slice(0, 2)) > maxHour) return `時は 00〜${String(maxHour).padStart(2, "0")} で入力してください`;
  if (d.length >= 3 && Number(d[2]) > 5) return "分は 00〜59 で入力してください";
  return null;
}
