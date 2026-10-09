// ★裁定326-7／追補1-3／追補2-1・2-4（0160 shift_wishes.kind・shift_wish_submit 4 引数・便 M4-1・2026-10-01）: シフト希望の方式（店設定 shift_request_mode）の純関数（DB を知らない）。
//   'shift'（既定・現行）＝出たい日と時間を提出（kind 'work'）／'off_only'＝「休み希望」＝休みたい日だけ提出（kind 'off'・時刻なし）・提出のない日は出勤可として店の確定案に載る。
//   'shift' の店から off を出す経路は無い（RPC 側も shift_wish_decide／shift_auto_apply が 'off wish' で拒否＝和文は rpc-err）。
import { fmtWin } from "../shift-time";

export type WishMode = "shift" | "off_only";

export const wishNavLabelOf = (mode: WishMode): string => (mode === "off_only" ? "休み希望" : "シフト希望");

export const OFF_MODE_NOTE = "休みたい日だけ提出します。提出のない日は出勤できる日として扱われ、店の確定案に載ることがあります";
export const SHIFT_MODE_NOTE = "出たい日と時間を提出します。採用された日が確定シフトになります";

/** ページの文言（見出し・副題・提出節・説明） */
export function wishPageTextOf(mode: WishMode): { title: string; sub: string; submitHeading: string; note: string; markNote: string } {
  return mode === "off_only"
    ? { title: "休み希望", sub: "休みたい日を提出・審査状況を確認", submitHeading: "休みたい日を提出", note: OFF_MODE_NOTE, markNote: "印: 審査中／承認／却下。募集期間外・定休日・提出済みの日は選べません。時間は入力しません（休みの日だけを選びます）" }
    : { title: "シフト希望", sub: "希望を提出・審査状況を確認", submitHeading: "希望を提出", note: SHIFT_MODE_NOTE, markNote: "印: 審査中／承認／却下。募集期間外・定休日・提出済みの日は選べません。" };
}

export type WishSubmitArgs = { p_date: string; p_start_hm: string | null; p_end_hm: string | null; p_kind: "work" | "off" };

/** 1 日分の提出引数（0160 の 4 引数）。'off_only' は時刻 null＋kind 'off'・'shift' は時刻＋kind 'work' */
export function wishSubmitArgsOf(row: { date: string; start_hm: string; end_hm: string }, mode: WishMode): WishSubmitArgs {
  return mode === "off_only"
    ? { p_date: row.date, p_start_hm: null, p_end_hm: null, p_kind: "off" }
    : { p_date: row.date, p_start_hm: row.start_hm, p_end_hm: row.end_hm, p_kind: "work" };
}

/** 一覧・フォーカス行の時間表示（off＝「休み」・work＝fmtWin） */
export function wishRowLabelOf(w: { kind?: string | null; start_hm: string | null; end_hm: string | null }): string {
  if (w.kind === "off" || !w.start_hm || !w.end_hm) return "休み";
  return fmtWin(w.start_hm, w.end_hm);
}

/** 'off_only' では時刻の検証を飛ばす（時刻を送らない） */
export const wishNeedsTimes = (mode: WishMode): boolean => mode !== "off_only";

/** ★裁定337（0167・便 X-13d-2b）: キャスト個別の方式（casts.shift_request_mode・null＝店の既定に従う）→店の既定で解決。/mine と自動配置の候補はこの解決値を使う */
export function resolveWishMode(castMode: string | null | undefined, storeMode: WishMode): WishMode {
  return castMode === "off_only" || castMode === "shift" ? castMode : storeMode;
}
