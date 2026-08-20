import { roundYen } from "./money";

// 表示用の group 請求額計算（DB の check_round_amount / check_group_due と同一規則）。
// ★権威はサーバ: check_pay の残額検証・check_close の充足判定は DB 側が行う。
//   ここは UI の「残額表示」専用（ズレていれば RPC が exceeds balance / balance remaining で拒否する）。
//   F4b からレシート poll route（app/api/print/poll）も本鏡像で group_due を算出
//   （check_group_due の EXECUTE は postgres のみ＝service_role から呼べないため・closed 伝票は金額不変で決定的）。
// ★F5（軽減税率 8%）導入時の同時改修3点セット（台帳）:
//   check_group_due（DB）・本ファイル鏡像・receipt.ts（税率別内訳）を必ず同時に改修する
//   （どれか一方だけ触ると DB/表示/レシートの金額定義が乖離する）。
export type CheckRoundSettings = {
  service_rate: number;
  round_unit: number;
  round_mode: "up" | "down" | "round" | string;
};

export function roundAmount(amount: number, unit: number, mode: string): number {
  if (unit <= 1) return Math.round(amount);
  const q = amount / unit;
  return (mode === "up" ? Math.ceil(q) : mode === "down" ? Math.floor(q) : Math.round(q)) * unit;
}

/** due(group) = Tp(Bx + round(Bx × service_rate%))。Bx=0 は 0。 */
export function groupDue(bx: number, s: CheckRoundSettings): number {
  if (bx === 0) return 0;
  return roundAmount(bx + roundYen((bx * s.service_rate) / 100), s.round_unit, s.round_mode);
}

// ── レジ時間UX R2（2026-08-17）: 時間状態の表示計算 ────────────────────────────
// check_time_charge_apply（mig0052 起草・mig0097/0097b 現行）の計算式の写し。★表示専用＝権威はサーバ
//   （apply 時にサーバが now() で再計算する。ここがズレても金額は動かない）。
//   RPC 現物: v_d = floor(epoch(now() - started_at) / 60)（負は 0 に丸め）
//             v_blocks = d <= set_min ? 0 : (d - set_min + ext_min - 1) / ext_min（整数除算）
//   ★式を変えるときは RPC と本鏡像を必ず同時改修（groupDue の3点セットと同じ規律）。
//   ★mig0097（R2-b・確定ブロック凍結）: blocks の式は逐語不変＝本鏡像も無改修。変わったのは
//     「行の持ち方」（extension が block_no=1..n のブロック行・終了済みは凍結）と ext 金額の確定方法
//     （式ではなく Σline_total 実測）のみ。金額は行実測が権威のため、鏡像は従来どおり
//     「経過/blocks/次境界」の表示にだけ使う（金額換算に使わない）。
export type TimeStatus = {
  elapsedMin: number; // 経過分（完了分＝floor）
  blocks: number;     // 延長回数（0＝セット時間内）
  inSet: boolean;     // セット時間内か（経過 ≤ set_min。経過＝set_min ちょうどは「残り0分」のセット内）
  remainMin: number;  // セット残り分（inSet のときのみ意味を持つ）
  nextAtMs: number;   // 次の境界時刻（セット内＝セット終了時刻／延長N回目中＝そのブロックの終了時刻）
};

/** blocks のコア式（RPC の v_blocks と同一）。elapsedMin を直接受ける＝verify で RPC 返り値と突合できる形。 */
export function timeBlocksOf(elapsedMin: number, setMin: number, extMin: number): number {
  return elapsedMin <= setMin ? 0 : Math.floor((elapsedMin - setMin + extMin - 1) / extMin);
}

export function timeStatusOf(startedAtMs: number, nowMs: number, setMin: number, extMin: number): TimeStatus {
  const elapsedMin = Math.max(0, Math.floor((nowMs - startedAtMs) / 60000));
  const blocks = timeBlocksOf(elapsedMin, setMin, extMin);
  return {
    elapsedMin,
    blocks,
    inSet: blocks === 0,
    remainMin: Math.max(0, setMin - elapsedMin),
    nextAtMs: startedAtMs + (setMin + blocks * extMin) * 60_000,
  };
}

// ── E8-1c: 簡易領収書の分割割付（表示・印刷専用＝money-core 非接触・DB に書かない）──
// モック register-pos の allocateReceiptDrafts と同式: base=floor(total/count)・余りは先頭から+1
// ＝Σ=total を構造保証（不変量: 各枚 ≥1・合計一致。count > total のときは割れないため呼ばない）。
export function receiptSplitOf(total: number, count: number): number[] {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
