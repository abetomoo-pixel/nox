// ★裁定346（便 N1013b・2026-10-13）: get_cast_sales（按分後の日次売上・本指名／場内／同伴の件数）を cast 別に合算する純関数。
//   給与の collect（lib/nox/payroll/collect.ts）・/mine のノルマ進捗（app/api/mine/norm-progress）・分析のランキング（analytics-board）が
//   同じ関数を呼ぶ＝「売上」はどの画面でも給与と同じ按分後の額（別計算を作らない）。
export type CastSalesRow = { cast_id: string; biz_date?: string; sales: number; hon: number; jonai: number; dohan: number };
export type CastSalesTotal = { sales: number; hon: number; jonai: number; dohan: number };

/** cast_id → 期間合計（行順に依存しない・空は空 Map） */
export function sumCastSales(rows: readonly CastSalesRow[]): Map<string, CastSalesTotal> {
  const m = new Map<string, CastSalesTotal>();
  for (const r of rows) {
    const cur = m.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 };
    cur.sales += r.sales; cur.hon += r.hon; cur.jonai += r.jonai; cur.dohan += r.dohan;
    m.set(r.cast_id, cur);
  }
  return m;
}

export type CastSalesRank = CastSalesTotal & { rank: number; castId: string; name: string };

/** 売上軸のランキング＝按分売上 降順（同額は名前昇順→id 昇順で決定的）。rank は 1 起点の連番（同額でも分けない＝表示順） */
export function castSalesRankingOf(rows: readonly CastSalesRow[], nameOf: (castId: string) => string): CastSalesRank[] {
  return [...sumCastSales(rows).entries()]
    .map(([castId, a]) => ({ castId, name: nameOf(castId), ...a }))
    .sort((x, y) => y.sales - x.sales || x.name.localeCompare(y.name, "ja") || (x.castId < y.castId ? -1 : 1))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** ランキングの軸（管理側の切替）＝指名数（get_cast_ranking）／売上（castSalesRankingOf） */
export type RankAxis = "nom" | "sales";
export const RANK_AXIS_LABEL: Record<RankAxis, string> = { nom: "指名数", sales: "売上" };

/** ★裁定346: キャスト側のランキング表示＝off／self／top の 3 値。既存キー ranking（on/off）と ranking_show_others（on/off）から写す。
 *    off＝ranking OFF（カード・ナビ・ページを出さない）／self＝自分の順位のみ（他人は名前も出さない・既定）／top＝上位の名前も出す（金額は出さない） */
export type CastRankingMode = "off" | "self" | "top";
export function castRankingModeOf(ms: { ranking: boolean; ranking_show_others: boolean }): CastRankingMode {
  if (!ms.ranking) return "off";
  return ms.ranking_show_others ? "top" : "self";
}
export const CAST_RANKING_MODE_LABEL: Record<CastRankingMode, string> = { off: "表示しない", self: "自分の順位のみ", top: "上位の名前も出す" };
