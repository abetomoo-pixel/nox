// ★裁定319／319 追補1（0158・便 AB-4／AB-5）: 退勤時の「送り あり」を本人（/mine）・打刻端末（/kiosk）から発行するときの判定（純関数・DB を知らない）。
//   金額は店設定の送りの基本額（okuri_base_amount）をサーバが決める＝画面は表示だけ（変更不可）。
//   okuri_mode='flat'（一律）の店は口を出さない。基本額が未設定（null／0）の店は発行せず、打刻の「送り あり」だけ残す（店が締めで確定）。
// ★裁定414（S-4・便 S）: 方式は 4 つ（actual／flat／store／none）＝'none' 以外で聞く。文言は方式の 1 文（okuri-mode.ts）。「発行」は使わない（「記録」）。
import { okuriAsks, okuriModeOf, okuriRecordedTextOf, okuriTiersInEffectOf, type OkuriMode } from "./okuri-mode"; // ★0236 追補（11/27）: okuriTiersInEffectOf＝記録する額の区分
export const OKURI_PENDING_NOTE = "送りは店が締めで確定します";
/** ★0236（Agoora の決め 11/26 22:50）: 送り区分の額が 0 円のキャスト＝送りの行を作らない（本人・端末・締めの前の窓が同じ） */
export const OKURI_ZERO_NOTE = "送りは区分の額が 0 円のため記録しません";

export type OkuriState = { okuri_mode?: unknown; okuri_base_amount?: unknown } | null | undefined;
export type OkuriSelfPlan = {
  /** 退勤の前に「送り あり／なし」を聞くか（actual の店だけ） */
  ask: boolean;
  /** 「あり」のとき送り実費を発行するか（基本額が正の整数のときだけ） */
  issue: boolean;
  /** 表示する金額（記録しないときは null） */
  amount: number | null;
  /** ★裁定414: 店の方式（文言の出し分け） */
  mode: OkuriMode;
};

export function okuriSelfPlanOf(state: OkuriState): OkuriSelfPlan {
  const mode = okuriModeOf((state ?? null) as Record<string, unknown> | null);
  if (!state || !okuriAsks(mode)) return { ask: false, issue: false, amount: null, mode }; // ★裁定414: 'none' だけ聞かない（従来は actual だけ）
  const b = state.okuri_base_amount;
  const amount = typeof b === "number" && Number.isInteger(b) && b > 0 ? b : null;
  return { ask: true, issue: amount !== null, amount, mode };
}

/** ★0236 追補（11/27・相談役 11:15）: 本人の退勤・店の端末で「記録する額」（純関数・DB を知らない）＝0236 の transport_issue_self／kiosk_transport_issue と同じ引き方。
 *  送りベース額が正の整数でなければ null（記録しない＝サーバは 'no base amount'・okuriSelfPlanOf の issue false と同じ）。
 *  キャストの送り区分（okuri_flat_tiers の code 一致・額 0 も含む＝0 は「記録しない」）→ 無ければベース額。
 *  ★決め d 版: 区分の額は送りの方式が定額（flat）の店だけ（実費・店負担の店はベース額）。 */
export function okuriRecordAmountOf(settings: Record<string, unknown> | null | undefined, castTier: string | null | undefined): number | null {
  const b = settings?.okuri_base_amount;
  const base = typeof b === "number" && Number.isInteger(b) && b > 0 ? b : null;
  if (base === null) return null;
  const t = castTier ? okuriTiersInEffectOf(settings).find((x) => x.code === castTier) : undefined;
  return t ? t.amount : base;
}

/** 退勤後の文言。issued＝送り実費の発行が通った／pending＝発行しない・できなかった（店が締めで確定） */
export function okuriResultTextOf(okuri: boolean, outcome: "issued" | "pending" | "none" | "zero", amount: number | null, mode: OkuriMode = "actual"): string {
  if (!okuri || outcome === "none") return "退勤を打刻しました";
  if (outcome === "zero") return `退勤を打刻しました（${OKURI_ZERO_NOTE}）`;   // ★0236
  if (outcome === "issued" && amount !== null) return `退勤を打刻しました（${okuriRecordedTextOf(mode, amount)}）`; // ★裁定414: 方式の 1 文
  return `退勤を打刻しました（${OKURI_PENDING_NOTE}）`;
}
