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
// ★0152（裁定298-8／298-9・2026-09-25）: 0148 の referral 除外（kind 'referral' 行）は撤去＝kind は CHECK からも消えた。
//   紹介料は check_referrals（1 伝票 1 紹介）で持ち、burden='customer' の amount だけを pay_group 'A' の小計と taxable_10 基底に加算する
//   ＝DB check_group_due の v_ref と同じ 2 箇所。第 3 引数 referralCustomer（既定 0＝従来と 1 バイト同値）で呼び出し側が渡す。
export type DueLine = { line_total: number; kind: string; tax_category?: string | null; fee_kind?: string | null /* ★0173（裁定393）: 'pay_fee'＝サ料の母数から除く */; all_in?: boolean | null /* ★0210（起票140）: 税・サ込みの行（初回料金のセット行）＝サ料・外税・店の丸めを掛けない */ };
export type CheckDueSettings = CheckRoundSettings & {
  business_tax_status?: string | null; // checks の凍結値（省略/null=taxable）
  price_display?: string | null;       // 同（省略/null=tax_included）
  tax_rounding?: string | null;        // 同（省略/null=floor）
};

// ★0210（起票140・相談役 11/25）: 税・サ込みの行（all_in）の鏡＝DB check_group_due（0210）と同じ式。
//   A＝込みの行の合計。A が 0 なら今の式（groupDueFullBase）そのまま＝1 バイト同じ。
//   A があるとき：通常分（込みでない行）は今の式（サ料・外税・店の丸め）・割引は通常分から引き、超えた分だけ A から引く・
//   「合計から」の割引（pay_discount_total）は最後に引き、もう一度丸めない（1,500 が崩れない）。
export const allInSumOf = (lines: readonly DueLine[]): number => lines.filter((l) => l.kind !== "discount" && l.all_in).reduce((a, l) => a + l.line_total, 0);
export type AllInSplit = { a: number; aEff: number; nLines: DueLine[]; post: number; nDue: number };
/** 込みの行の分け方（A・割引の後の A・通常分の行・合計からの割引・通常分の請求）。A が 0 のときは呼ばない */
export function allInSplitOf(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): AllInSplit {
  const a = allInSumOf(lines);
  const nLines = lines.filter((l) => !(l.kind !== "discount" && l.all_in));
  const bxN = nLines.filter((l) => l.kind !== "discount").reduce((x, l) => x + l.line_total, 0) + referralCustomer;
  const disc = nLines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((x, l) => x + l.line_total, 0);
  const post = nLines.filter((l) => l.kind === "discount" && l.fee_kind === "pay_discount_total").reduce((x, l) => x + l.line_total, 0);
  const aEff = Math.max(0, a - Math.max(0, disc - bxN));
  // ★0210 v2（相談役 11/25 の便 F【F5】の直し）: 通常分が手数料の行（pay_fee）だけなら、手数料に店の丸めを掛けない（例 1,000 円単位の店で 150 円の手数料→1,000 円にしない）＝DB check_group_due（0210 v2）の v_bx − v_pf ≤ 0 の分岐と同じ
  const pfN = nLines.filter((l) => l.kind !== "discount" && l.fee_kind === "pay_fee").reduce((x, l) => x + l.line_total, 0);
  const nDue = groupDueFullBase(nLines.filter((l) => !(l.kind === "discount" && l.fee_kind === "pay_discount_total")), bxN - pfN <= 0 ? { ...s, round_unit: 1 } : s, referralCustomer);
  return { a, aEff, nLines, post, nDue };
}
export function groupDueFull(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): number {
  if (allInSumOf(lines) === 0) return groupDueFullBase(lines, s, referralCustomer);
  const x = allInSplitOf(lines, s, referralCustomer);
  return Math.max(0, x.nDue + x.aEff - x.post);
}
/** 0210 より前の式（込みの行が無い伝票の請求）。★0210 の後もこの式は変えない＝込みの行が無い伝票は今と同じ */
export function groupDueFullBase(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): number {
  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0) + referralCustomer; // ★0152: 客負担の紹介料を加算（DB v_bx）
  const disc = lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187（便 CASH）: 「合計から」の割引（fee_kind 'pay_discount_total'）は小計から引かない＝最後に引く（DB v_disc と同式）
  const post = lines.filter((l) => l.kind === "discount" && l.fee_kind === "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187: 「合計から」の割引（DB v_post）
  const net = Math.max(0, bx - disc);
  if (net === 0) return 0;
  // ★0173（裁定393・便 P173）: 支払手数料の行（fee_kind 'pay_fee'）はサ料の母数から除く＝DB check_group_due の v_pf と同じ（pay_fee 無しなら 1 バイト同値）
  const payFee = lines.filter((l) => l.kind !== "discount" && l.fee_kind === "pay_fee").reduce((a, l) => a + l.line_total, 0);
  const excluded = (s.price_display ?? "tax_included") === "tax_excluded"
    && (s.business_tax_status ?? "taxable") === "taxable";
  if (excluded) {
    const catOf = (l: DueLine) => l.tax_category ?? "taxable_10";
    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0) + referralCustomer; // ★0152: 客負担の紹介料を taxable_10 基底に加算（DB v_bx10）
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const sv = roundYen(((net - payFee) * s.service_rate) / 100); // v_sv = round((v_net - v_pf) * v_rate / 100.0) と同式（★0173）
    const trnd = s.tax_rounding ?? "floor";
    const base10 = Math.max(0, bx10 - disc) + sv;
    const tax = taxRound((base10 * 10) / 100, trnd) + taxRound((bx8 * 8) / 100, trnd);
    return postOf(roundAmount(net + sv + tax, s.round_unit, s.round_mode), post, s);
  }
  if (payFee > 0) return postOf(roundAmount(net + roundYen(((net - payFee) * s.service_rate) / 100), s.round_unit, s.round_mode), post, s); // ★0173: 手数料行はサ料なし
  return postOf(groupDue(net, s), post, s); // 内税/exempt＝従来式（1バイト同値）
}
/** ★0187（便 CASH・事後承認 ② Agoora 10/27）: 「合計から」の割引＝丸めた合計から引いてから店の丸め規則でもう一度丸める（DB check_group_due の最後の式と同式・post 0 なら 1 バイト同値） */
const postOf = (pre: number, post: number, s: CheckRoundSettings): number => (post > 0 ? roundAmount(Math.max(0, pre - post), s.round_unit, s.round_mode) : pre);

// ── ★便 X13-G W-14／W-15（2026-10-21）: 表示用の内訳＝groupDueFull と同じ式を分解しただけ（計算は変えない・合計は必ず groupDueFull と一致） ──
//   外税＝小計（税抜）→ サービス料（税抜）→ 消費税（外税）→ 端数調整 → 合計（税込）。内税／免税＝合計（税込）と「うち消費税」（receipt の taxOf と同式＝floor(合計×10/110)）。
export type DueBreakdown = { excluded: boolean; net: number; service: number; tax: number; rounding: number; due: number; payFee: number; postDiscount: number /* ★0187: 「合計から」の割引 */; postRounding: number /* ★0187: 引いてからもう一度丸めた差 */; allIn?: number /* ★0210: 税・サ込みの額（割引を引いた後）＝込みの行がある伝票だけ */ };
export function dueBreakdownOf(lines: DueLine[], s: CheckDueSettings, referralCustomer = 0): DueBreakdown {
  if (allInSumOf(lines) > 0) {
    // ★0210（起票140）: 込みの行がある伝票＝通常分の内訳（今の式）＋「税・サ込みの料金」の段＋合計からの割引（もう一度丸めない）
    const x = allInSplitOf(lines, s, referralCustomer);
    const n = dueBreakdownOf(x.nLines.filter((l) => !(l.kind === "discount" && l.fee_kind === "pay_discount_total")), s, referralCustomer);
    const due = Math.max(0, x.nDue + x.aEff - x.post);
    return { ...n, due, allIn: x.aEff, postDiscount: x.post, postRounding: 0, tax: n.excluded ? n.tax : (s.business_tax_status ?? "taxable") === "taxable" ? Math.floor((due * 10) / 110) : 0 };
  }
  const due = groupDueFull(lines, s, referralCustomer);
  const post = lines.filter((l) => l.kind === "discount" && l.fee_kind === "pay_discount_total").reduce((a, l) => a + l.line_total, 0); // ★0187（便 CASH）: 「合計から」の割引
  const pre = post > 0 ? groupDueFull(lines.filter((l) => !(l.kind === "discount" && l.fee_kind === "pay_discount_total")), s, referralCustomer) : due; // 割引前の合計（丸め後）＝post 0 なら due
  const postRounding = post > 0 ? due - (pre - post) : 0; // ★0187（事後承認 ②）: 引いてからもう一度丸めた差
  const bx = lines.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0) + referralCustomer;
  const disc = lines.filter((l) => l.kind === "discount" && l.fee_kind !== "pay_discount_total").reduce((a, l) => a + l.line_total, 0);
  const net = Math.max(0, bx - disc);
  const payFee = lines.filter((l) => l.kind !== "discount" && l.fee_kind === "pay_fee").reduce((a, l) => a + l.line_total, 0);
  const excluded = (s.price_display ?? "tax_included") === "tax_excluded" && (s.business_tax_status ?? "taxable") === "taxable";
  if (net === 0) return { excluded, net: 0, service: 0, tax: 0, rounding: 0, due: 0, payFee, postDiscount: 0, postRounding: 0 };
  const service = roundYen(((net - payFee) * s.service_rate) / 100);
  if (excluded) {
    const catOf = (l: DueLine) => l.tax_category ?? "taxable_10";
    const bx10 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_10").reduce((a, l) => a + l.line_total, 0) + referralCustomer;
    const bx8 = lines.filter((l) => l.kind !== "discount" && catOf(l) === "taxable_8").reduce((a, l) => a + l.line_total, 0);
    const trnd = s.tax_rounding ?? "floor";
    const tax = taxRound(((Math.max(0, bx10 - disc) + service) * 10) / 100, trnd) + taxRound((bx8 * 8) / 100, trnd);
    return { excluded, net, service, tax, rounding: pre - (net + service + tax), due, payFee, postDiscount: post, postRounding };
  }
  const taxIn = (s.business_tax_status ?? "taxable") === "taxable" ? Math.floor((due * 10) / 110) : 0;
  return { excluded, net, service, tax: taxIn, rounding: pre - (net + service), due, payFee, postDiscount: post, postRounding };
}
