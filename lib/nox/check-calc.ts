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

// ── C3/C4 読み経路段（mig0111・裁定90・C34設計書 §6-2）────────────────────────
// 店舗税設定4値＋card_surcharge の読み出しを1点に集約する（stores の新6列のうち
// invoice_status/invoice_reg_no はレシートのヘッダ側＝receipt.ts の ReceiptStore.reg_no が既存経路）。
// ★本段は「読み出しを通す」まで＝**既定値では現行と1バイト同値**が受け入れ条件。
//   非既定値の挙動（exempt の税額区分なし・外税・card_surcharge 行）は挙動段（§6-4/§6-6）で
//   三面鏡（check_close 系 RPC / 本ファイル / receipt.ts）を同時に変える。ここでは結線しない。
// ★tax_category は check_lines スナップショット列（同名の withholding_payments.tax_category は
//   源泉納付の別概念＝裁定90 注記・教訓40。ここでは扱わない）。
export type StoreTaxSettings = {
  business_tax_status: string; // 'taxable' | 'exempt'（既定 taxable）
  price_display: string;       // 'tax_included' | 'tax_excluded'（既定 tax_included）
  tax_rounding: string;        // 'floor' | 'round' | 'ceil'（既定 floor）
  card_surcharge_rate: number | null; // null=無効（既定）。結線は §6-6（裁定87 第2層の警告とセット）
};

export const DEFAULT_TAX_SETTINGS: StoreTaxSettings = {
  business_tax_status: "taxable",
  price_display: "tax_included",
  tax_rounding: "floor",
  card_surcharge_rate: null,
};

/** stores 行（部分・null 可）→ 既定値補完済み設定。未指定・null は mig0111 の default と同値。 */
export function taxSettingsOf(row?: Partial<StoreTaxSettings> | null): StoreTaxSettings {
  return {
    business_tax_status: row?.business_tax_status ?? DEFAULT_TAX_SETTINGS.business_tax_status,
    price_display: row?.price_display ?? DEFAULT_TAX_SETTINGS.price_display,
    tax_rounding: row?.tax_rounding ?? DEFAULT_TAX_SETTINGS.tax_rounding,
    card_surcharge_rate: row?.card_surcharge_rate ?? null,
  };
}

/** 税額の端数処理（stores.tax_rounding）。金額側の roundAmount（round_unit/round_mode）とは別系統。
 *  ★mig0113 で DB 鏡像 `check_tax_round(numeric,text)` が立った＝式を変えるときは必ず同時改修。 */
export function taxRound(n: number, mode: string): number {
  return mode === "ceil" ? Math.ceil(n) : mode === "round" ? Math.round(n) : Math.floor(n);
}

// ── C3/C4 挙動段（mig0113・裁定90）: check_group_due の完全鏡像 ────────────────
// DB の check_group_due（mig0113）と**同一規則**の表示用鏡像。★権威はサーバ（groupDue と同じ立場）。
// 規則（設計書 v1 §3 細則＝mig0113 ヘッダ）:
//   - net = max(0, Σ非discount − Σdiscount)・net=0 は 0
//   - 外税（price_display='tax_excluded' ∧ business_tax_status='taxable'）のときのみ
//     税率別に taxRound を1回ずつ（伝票×税率×1回＝T5）。
//     discount は taxable_10 基底へ適用（greatest 0 clamp・8% への按分は F5）。
//     サ料は taxable_10 基底に算入（T6）。exempt/out_of_scope 行は税 0。
//     due = 店設定丸め(net + サ料 + 税)
//   - 内税/exempt は従来式＝groupDue(net, s) と1バイト同値
// ★三面鏡: check_group_due（DB）・本関数・receipt.ts の税表示を必ず同時改修（F5 の3点セットと同じ規律）。
export type DueLine = { line_total: number; kind: string; tax_category?: string | null };
export type CheckDueSettings = CheckRoundSettings & {
  business_tax_status?: string | null; // checks の凍結値（省略/null=taxable）
  price_display?: string | null;       // 同（省略/null=tax_included）
  tax_rounding?: string | null;        // 同（省略/null=floor）
};

export function groupDueFull(lines: DueLine[], s: CheckDueSettings): number {
  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
  const disc = lines.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
  const net = Math.max(0, bx - disc);
  if (net === 0) return 0;
  const excluded = (s.price_display ?? "tax_included") === "tax_excluded"
    && (s.business_tax_status ?? "taxable") === "taxable";
  if (excluded) {
    const catOf = (l: DueLine) => l.tax_category ?? "taxable_10";
    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0);
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const sv = roundYen((net * s.service_rate) / 100); // v_sv = round(v_net * v_rate / 100.0) と同式
    const trnd = s.tax_rounding ?? "floor";
    const base10 = Math.max(0, bx10 - disc) + sv;
    const tax = taxRound((base10 * 10) / 100, trnd) + taxRound((bx8 * 8) / 100, trnd);
    return roundAmount(net + sv + tax, s.round_unit, s.round_mode);
  }
  return groupDue(net, s); // 内税/exempt＝従来式（1バイト同値）
}
