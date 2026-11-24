// ★0208（相談役 11/24 夜 N6・時間別の時給 B＝出勤の時刻の段）: ランクの既定の出勤の時刻（cast_ranks.shift_start_min／shift_end_min）の入力の判定。
//   DB の CHECK と set_cast_rank_shift_time の 'bad time' と同じ線（開始 0〜1439＝24 時以降に始まる段は許さない・終了は開始より後で 2879 まで・両方空＝ランクの時刻なし）。
//   終了が開始以前の 'HH:MM'（24 時より前）は翌日とみなす（20:00〜02:00 → 1200〜1560）。DB を知らない純関数。
const hmToMin = (hm: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim()); if (!m) return null; const mm = Number(m[2]); return mm < 60 ? Number(m[1]) * 60 + mm : null; };

export type RankShiftTimeInput = { start: string; end: string };
export type RankShiftTimeOut = { ok: true; start: number | null; end: number | null } | { ok: false; err: string };

/** 画面の 2 つの欄 → RPC に渡す分（または日本語の理由） */
export function rankShiftTimeOf(v: RankShiftTimeInput): RankShiftTimeOut {
  const s = v.start.trim(), e = v.end.trim();
  if (s === "" && e === "") return { ok: true, start: null, end: null };
  if (s === "" || e === "") return { ok: false, err: "開始と終了を両方入れるか、両方空にしてください" };
  const sm = hmToMin(s), em0 = hmToMin(e);
  if (sm === null || em0 === null) return { ok: false, err: "時刻は 20:00 の形で入れてください" };
  if (sm > 1439) return { ok: false, err: "24 時以降に始まる時刻は入れられません" };
  const em = em0 <= sm && em0 < 1440 ? em0 + 1440 : em0; // 終了が開始以前＝翌日
  if (em <= sm) return { ok: false, err: "終了は開始より後にしてください" };
  if (em > 2879) return { ok: false, err: "終了は翌 23:59 までです" };
  return { ok: true, start: sm, end: em };
}

/** DB の分 → 欄の値（終了の 24 時以降は 26:00 の形＝TimeInput と同じ 0〜47 時） */
export const rankShiftHmOf = (min: number | null | undefined): string => (min === null || min === undefined ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

/** RPC の英語の理由 → 日本語 */
export function rankShiftTimeErrJa(msg: string): string {
  if (/bad time/.test(msg)) return "時刻が正しくありません（24 時以降の開始・終了が開始以前は入れられません）";
  if (/billing locked/.test(msg)) return "お支払いの確認が取れないため保存できません";
  if (/not found/.test(msg)) return "ランクが見つかりません（再読込してください）";
  if (/forbidden/.test(msg)) return "この操作の権限がありません";
  return "保存できませんでした";
}
