// ★便 NR-1（裁定428 候補・2026-10-26）: ノルマ設定（店）＝「軸と減額」パネルの純関数。
//   採用する 4 軸（出勤日数・同伴・売上・指名）と、同じ行の未達の減額（定額／不足 1 単位ごと＋金額）を 1 つの保存で書く。
//   保存先は従来どおり＝軸 set_store_norm_axes（4 キー明示）／カウント定義 set_store_norm_config（3 値明示）／減額 set_penalty_config（17 引数明示）。DB 変更 0。
//   単位＝同伴は「不足 1 回ごと」（旧「本」は誤り・⑥）。採用していない軸は減額の欄を出さない（値は 0 のまま送る＝RPC が null を拒むため）。
import type { NormAxis, NormAxes } from "./norm-axes";
import { normPenaltyModeOf, type NormPenaltyMode } from "@/lib/nox/pay";

/** 減額の単位語（不足 1 ○ごと）。売上は「単位」＝norm_sales_unit 円ごと */
export const NORM_PENALTY_UNIT: Record<NormAxis, string> = { days: "日", dohan: "回", sales: "単位", shimei: "回" };
/** 軸→penalty_config の列（定額／不足ごと） */
export const NORM_PENALTY_KEYS: Record<NormAxis, { flat: `norm_${NormAxis}_flat`; per: `norm_${NormAxis}_per` }> = {
  days: { flat: "norm_days_flat", per: "norm_days_per" },
  dohan: { flat: "norm_dohan_flat", per: "norm_dohan_per" },
  sales: { flat: "norm_sales_flat", per: "norm_sales_per" },
  shimei: { flat: "norm_shimei_flat", per: "norm_shimei_per" },
};
export type PenaltyAmounts = Record<`norm_${NormAxis}_flat` | `norm_${NormAxis}_per`, number> & { norm_sales_unit: number };

/** 軸の方式＝両方 0 のときは画面で選んだ方式（既定 定額）・値があれば値から（裁定373＝per>0 なら不足ごと） */
export function axisModeOf(p: PenaltyAmounts, ax: NormAxis, selected: NormPenaltyMode | undefined): NormPenaltyMode {
  const flat = p[NORM_PENALTY_KEYS[ax].flat], per = p[NORM_PENALTY_KEYS[ax].per];
  return flat === 0 && per === 0 ? (selected ?? "flat") : normPenaltyModeOf(flat, per);
}
/** 軸の表示額＝方式に対応する側 */
export const axisAmountOf = (p: PenaltyAmounts, ax: NormAxis, mode: NormPenaltyMode): number => (mode === "per" ? p[NORM_PENALTY_KEYS[ax].per] : p[NORM_PENALTY_KEYS[ax].flat]);
/** 方式を切り替える＝反対側は 0・値は引き継ぐ（1 方式＝裁定373） */
export function axisSwitchModeOf<P extends PenaltyAmounts>(p: P, ax: NormAxis, mode: NormPenaltyMode): P {
  const k = NORM_PENALTY_KEYS[ax]; const cur = Math.max(p[k.flat], p[k.per], 0);
  return mode === "per" ? { ...p, [k.flat]: 0, [k.per]: cur } : { ...p, [k.per]: 0, [k.flat]: cur };
}
/** 金額を入れる＝方式の側に書き、反対側は 0 */
export function axisSetAmountOf<P extends PenaltyAmounts>(p: P, ax: NormAxis, mode: NormPenaltyMode, value: number): P {
  const k = NORM_PENALTY_KEYS[ax]; const v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return mode === "per" ? { ...p, [k.per]: v, [k.flat]: 0 } : { ...p, [k.flat]: v, [k.per]: 0 };
}
/** 不足 1 単位ごとの語＝「不足 1 回ごと」「不足 1 日ごと」「不足 10,000 円ごと」 */
export function perUnitLabelOf(ax: NormAxis, salesUnit: number): string {
  return ax === "sales" ? `不足 ${Math.max(1, salesUnit || 10000).toLocaleString()} 円ごと` : `不足 1 ${NORM_PENALTY_UNIT[ax]}ごと`;
}
/** 保存＝3 本の RPC を常にこの順で（軸→カウント定義→減額）。採用していない軸の減額は送る値をそのまま（0 のまま） */
export const NORM_PANEL_SAVE_ORDER = ["set_store_norm_axes", "set_store_norm_config", "set_penalty_config"] as const;
/** 390px＝4 軸のセグメントは 2 択を 50／50・親幅いっぱい・金額欄も同じ幅・保存は中央（CSS .nox-normax の規約＝suite が逐語で見る） */
export const NORM_PANEL_NARROW_PX = 430;
/** 採用した軸だけ（表の列・減額の行＝同じ集合） */
export const activeAxesOf = (axes: NormAxes): NormAxis[] => (["days", "dohan", "sales", "shimei"] as const).filter((k) => axes[k]);
