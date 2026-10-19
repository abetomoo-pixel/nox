// ★便 P173 T-2（起票110・0174 ★2）: 達成ボーナスの多段＝comp_plan_components（kind 'achievement_bonus'）の params.thresholds。
//   形は {pct, amount} に一本化（0174 の移行 SQL と同形）。旧形 {pct}／{pct, add} は読込時に amount＝コンポーネントの amount を補う（既存の本番データ用）。
//   計算＝目標（売上ノルマ）× pct/100 以上に届いた段から、★裁定404＝max（最上段のみ・既定）／sum（全段の合計）。DB を知らない純関数（pay.ts・UI・試算で共用）。

export type BonusTier = { pct: number; amount: number };

/** 段数の上限（売上スライドの 1〜10 段＝裁定390 と同じ） */
export const BONUS_TIER_MAX = 10;

const intOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);

/** params.thresholds → 段（pct 昇順）。thresholds が無い／空＝100% の 1 段（amount＝コンポーネントの amount）。 */
export function bonusTiersOf(params: Record<string, unknown> | null | undefined, componentAmount: number | null | undefined): BonusTier[] {
  const fallback = Math.max(0, intOf(componentAmount) ?? 0);
  const raw = params?.thresholds;
  const list = Array.isArray(raw) ? raw : [];
  const tiers = list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e))
    .map((e) => ({ pct: intOf(e.pct) ?? 100, amount: Math.max(0, intOf(e.amount) ?? fallback) }));
  if (tiers.length === 0) return [{ pct: 100, amount: fallback }];
  return tiers.sort((a, b) => a.pct - b.pct);
}

/** 保存前の検査（RPC は params を object としてしか見ない＝ここが唯一の形の検査）。null＝OK */
export function bonusTiersErrOf(tiers: BonusTier[]): string | null {
  if (tiers.length === 0) return "段を 1 つ以上入れてください";
  if (tiers.length > BONUS_TIER_MAX) return `段は ${BONUS_TIER_MAX} 段までです`;
  for (const t of tiers) {
    if (!Number.isInteger(t.pct) || t.pct < 1 || t.pct > 1000) return "達成率は 1〜1000% の整数で入れてください";
    if (!Number.isInteger(t.amount) || t.amount < 0) return "加算額は 0 円以上の整数で入れてください";
  }
  for (let i = 1; i < tiers.length; i++) if (tiers[i].pct <= tiers[i - 1].pct) return "達成率は上の段より大きくしてください（昇順・重複なし）";
  return null;
}

/** 保存する params（{thresholds:[{pct, amount}]}）とコンポーネントの amount（＝1 段目の額・一覧や旧表示の互換） */
export function bonusParamsOf(tiers: BonusTier[]): { params: { thresholds: BonusTier[] }; amount: number } {
  const t = tiers.map((x) => ({ pct: x.pct, amount: x.amount }));
  return { params: { thresholds: t }, amount: t[0]?.amount ?? 0 };
}

/** ★裁定404（2026-10-19）: 多段の計算方式＝店ごとに選択（max＝到達した最上段のみ／sum＝到達した全段の合計）・既定 max。
 *  器＝0175 の店設定 bonus_tier_mode（欠損＝max）・client＝P175。それまで呼び出し側は max 固定（sum は純関数の分岐だけ＝UI から選べない） */
export type BonusTierMode = "max" | "sum";
export const BONUS_TIER_MODE_DEFAULT: BonusTierMode = "max";

/** 達成判定＝売上 ≥ 目標×pct/100 の段（hit）。max＝その最上段の amount／sum＝hit の合計。目標 0／未設定＝不適用（0） */
export function bonusOf(tiers: BonusTier[], sales: number, target: number, mode: BonusTierMode = BONUS_TIER_MODE_DEFAULT): { total: number; hit: BonusTier[] } {
  if (!(target > 0)) return { total: 0, hit: [] };
  const reached = tiers.filter((t) => sales >= (target * t.pct) / 100).sort((a, b) => a.pct - b.pct);
  if (mode === "sum") return { total: reached.reduce((s, t) => s + t.amount, 0), hit: reached };
  const top = reached[reached.length - 1];
  return top ? { total: top.amount, hit: [top] } : { total: 0, hit: [] };
}

/** 表示（「100% 10,000円／120% 20,000円」） */
export function bonusTiersLabel(tiers: BonusTier[]): string {
  return tiers.map((t) => `${t.pct}% ${t.amount.toLocaleString()}円`).join("／");
}
