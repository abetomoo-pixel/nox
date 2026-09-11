// B6-4 人件費式の純関数（DB 非依存・裁定 B6-4・2026-09-11）。
//   analytics-board の現行式（旧 :214〜232／:405／:491／:993）を正として固定し、month-report（旧 :105〜118／:128）も
//   同じ関数へ付け替える＝二重定義の解消。dashboard は人件費を出さない（対象外＝2 画面）。
//   ★list.ts の ListKpi.gross（pay.gross＋Σextras＝CSV 定義）とは別物＝ここは breakdown_json.pay.gross のみ。
//   ★丸め・ゼロ除算・null・Number() の挙動は現行を保存: gross は Number(bj?.pay?.gross ?? 0) の総和（NaN も現行どおり伝播）・
//     率は「final かつ sales > 0」のときだけ Math.round(x * 1000) / 10（小数 1 桁 %）・それ以外 null（画面は「—」）。
//     月報の率は旧 Math.round(x * 100)（整数 %）→ 本関数で小数 1 桁へ揃える（Agoora 判断 2026-09-11・桁数引数は持たせない）。

export type LaborRun = { id: string; status: string };
/** payslips 1 行の写し（breakdown_json は jsonb そのまま＝pay.gross を読むだけ）。 */
export type LaborSlip = { cast_id: string; breakdown_json: unknown };
export type LaborState = "none" | "draft" | "final";
export type LaborCost = { state: LaborState; gross: number; byCast: Map<string, number> };

/** 確定 run＝runs のうち最初の finalized／paid（paid も final 扱い＝現行 find と同順）。無ければ null。 */
export function finalRunOf<T extends LaborRun>(runs: readonly T[]): T | null {
  return runs.find((r) => r.status === "finalized" || r.status === "paid") ?? null;
}

/** 1 行の gross＝Number(breakdown_json?.pay?.gross ?? 0)（現行の式を逐語）。 */
export function slipGross(slip: LaborSlip): number {
  const bj = slip.breakdown_json as { pay?: { gross?: number } } | null | undefined;
  return Number(bj?.pay?.gross ?? 0);
}

/**
 * 人件費＝確定 run の payslips.breakdown_json.pay.gross 合計（凍結値を足すだけ・再計算なし）。
 *   runs に final が無い: state＝runs があれば draft／無ければ none・gross 0・byCast 空（現行の else 分岐）。
 *   slips は「確定 run の payslips」を呼び出し側が渡す（final でないときは無視して空扱い）。
 */
export function laborCostOf(runs: readonly LaborRun[], slips: readonly LaborSlip[]): LaborCost {
  const fin = finalRunOf(runs);
  if (!fin) return { state: runs.length ? "draft" : "none", gross: 0, byCast: new Map() };
  let g = 0;
  const byCast = new Map<string, number>();
  for (const x of slips) {
    const v = slipGross(x);
    g += v;
    byCast.set(x.cast_id, (byCast.get(x.cast_id) ?? 0) + v);
  }
  return { state: "final", gross: g, byCast };
}

/** 率（%・小数 1 桁）＝final かつ sales > 0 のときだけ Math.round((gross / sales) * 1000) / 10。それ以外 null。 */
export function laborRatePct(state: LaborState, gross: number, sales: number): number | null {
  return state === "final" && sales > 0 ? Math.round((gross / sales) * 1000) / 10 : null;
}

/** cast 別 報酬率（%・小数 1 桁）＝final かつ byCast にその cast があり sales > 0 のときだけ。それ以外 null（旧 :993／:491 と同条件）。 */
export function castLaborRatePct(state: LaborState, byCast: ReadonlyMap<string, number>, castId: string, sales: number): number | null {
  const g = byCast.get(castId);
  return state === "final" && g !== undefined && sales > 0 ? Math.round((g / sales) * 1000) / 10 : null;
}
