// ★便 GV-C C-14（GV-60・裁定403）: シフト希望カレンダーの「日の状態」7 種（/mine 希望と /shift 月表示で同じ色規則）。
//   確定＝時刻＋緑塗り／確認待ち＝時刻＋緑枠／審査中＝「希望」＋黄枠／休み希望＝グレー塗り／見送り＝灰字／募集中＝点線枠／定休・期間外＝減光。
//   語は 345 の 4 段（wish-state）に合わせる。シフト（shifts.status）があればシフトが優先＝希望側は独自の状態を持たない（裁定345）。
//   休み希望のみ方式（off_only）＝募集期間中の無印の日は「出られる日」（凡例の語だけ変わる・色は募集中と同じ）。
import { WISH_STATE_LABEL } from "@/lib/nox/shift/wish-state";
import { fmtWin } from "@/lib/nox/shift-time";
import type { WishMode } from "@/lib/nox/mine/wish-mode";

export type DayStateKey = "fixed" | "wait" | "pending" | "off" | "rejected" | "open" | "dim";

export const DAY_STATE_ORDER: DayStateKey[] = ["fixed", "wait", "pending", "off", "rejected", "open", "dim"];

export function dayStateLabelOf(k: DayStateKey, mode: WishMode = "shift"): string {
  switch (k) {
    case "fixed": return WISH_STATE_LABEL.accepted_fixed; // 採用・確定
    case "wait": return WISH_STATE_LABEL.accepted_wait; // 採用・確認待ち
    case "pending": return WISH_STATE_LABEL.pending; // 審査中
    case "off": return "休み希望";
    case "rejected": return WISH_STATE_LABEL.rejected; // 見送り
    case "open": return mode === "off_only" ? "出られる日（募集中・無印）" : "募集中";
    case "dim": return "定休・期間外";
  }
}

export type DayWish = { status: string; kind?: string | null; start_hm?: string | null; end_hm?: string | null } | null | undefined;
export type DayShift = { status: string; start_hm: string; end_hm: string } | null | undefined;

/** 1 日の状態と、セルに出す短い文字（時刻／「希望」／「休み」等）。 */
export function dayStateOf(a: { wish: DayWish; shift: DayShift; open: boolean; closed?: boolean }): { key: DayStateKey; mark: string | null } {
  const { wish, shift } = a;
  if (shift) {
    const tm = fmtWin(shift.start_hm, shift.end_hm);
    return shift.status === "confirmed" ? { key: "fixed", mark: tm } : { key: "wait", mark: tm };
  }
  if (wish && wish.status !== "withdrawn") {
    if (wish.status === "rejected") return { key: "rejected", mark: WISH_STATE_LABEL.rejected };
    if (wish.kind === "off") return { key: "off", mark: "休み" };
    if (wish.status === "pending") return { key: "pending", mark: "希望" };
    // accepted だがシフトが無い（削除等）＝確認待ち（wishStateOf と同じ扱い）
    return { key: "wait", mark: wish.start_hm && wish.end_hm ? fmtWin(wish.start_hm, wish.end_hm) : null };
  }
  if (a.open && !a.closed) return { key: "open", mark: null };
  return { key: "dim", mark: null };
}
