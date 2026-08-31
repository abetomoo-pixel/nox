// U-2（裁定101 段2-①）待遇画面の表示層 純関数。DB を知らず plan 行と components 行から
// 「採用する待遇方式」を**値の有無から自動判定**する（保存なし＝トグルは表示専用・裁定101 ①）。
// export＝verify が DB 非依存で係留する（裁定99-⑨ / allocateCategory と同じ建付け）。

export type AdoptPlanShape = {
  base: number;
  hon_back: number; jonai_back: number; dohan_back: number;
  hon_back_mode?: string | null; jonai_back_mode?: string | null;
  sales_slide?: unknown[] | null; point_slide?: unknown[] | null;
};
export type AdoptCompShape = { kind: string; is_active: boolean };

export type AdoptedMethod = { key: string; label: string; on: boolean };

// 裁定101 §2: 器なし＝準備中項目（C5・起票#42）。UI はこのリストからバッジを描く＝散在リテラルにしない。
export const PREP_ITEMS: { key: string; label: string; unlock?: string }[] = [
  { key: "daily_wage", label: "日給制" },
  { key: "guarantee_hours", label: "保証対象時間帯" },
  { key: "guarantee_period", label: "保証判定単位（半月・日）", unlock: "現行は月固定" },
  { key: "point_rules", label: "pt付与ルール・ポイント単価・使い方" },
  { key: "gross_profit_slide", label: "売上スライドの粗利基準" },
  { key: "ext_promote_back", label: "延長バック・場内→本指名昇格バック" },
  { key: "slide_ratio_col", label: "スライド帯の歩合%列" },
  { key: "rounding_axes", label: "歩合の丸め2軸", unlock: "comp_plans に列なし（C5）" },
  { key: "penalty_basis_record", label: "未達処理の根拠確認記録", unlock: "penalty_config に器なし" },
  { key: "achievement_params", label: "達成ボーナスの多段しきい値", unlock: "現行は100%・1段固定" },
  { key: "achievement_metrics", label: "達成条件の他軸（出勤/本指名/同伴）", unlock: "params 未対応＝目標は売上のみ" },
  { key: "rate_back", label: "率方式バック（同伴）", unlock: "R-2b 後（裁定86-②）" },
];
export function prepItemOf(key: string): { key: string; label: string; unlock?: string } | null {
  return PREP_ITEMS.find((p) => p.key === key) ?? null;
}

// 裁定101 ⑧: 右サマリー（派生表示・保存なし）。数値は draft/rows の再掲のみ＝再計算しない。
export type CompSummaryRow = { label: string; value: string };
export function compSummaryOf(
  p: AdoptPlanShape & { name?: string },
  comps: { kind: string; is_active: boolean; amount?: number | null }[],
  headcount: number,
): CompSummaryRow[] {
  const yen = (n: number) => `¥${n.toLocaleString()}`;
  const rows: CompSummaryRow[] = [
    { label: "適用人数", value: `${headcount}人` },
    { label: "保証時給", value: yen(p.base) },
    { label: "本指名", value: p.hon_back_mode === "rate" ? "率方式" : `${yen(p.hon_back)}/本` },
    { label: "場内", value: p.jonai_back_mode === "rate" ? "率方式" : `${yen(p.jonai_back)}/本` },
    { label: "同伴", value: `${yen(p.dohan_back)}/本` },
    { label: "スライド", value: `売上${(p.sales_slide ?? []).length}段・pt${(p.point_slide ?? []).length}段` },
  ];
  for (const c of comps) {
    if (c.is_active === false) continue;
    if (c.kind === "guarantee_min") rows.push({ label: "最低保証", value: `${yen(c.amount ?? 0)}/月` });
    if (c.kind === "achievement_bonus") rows.push({ label: "達成ボーナス", value: `${yen(c.amount ?? 0)}（達成時）` });
  }
  return rows;
}

// 判定規則（v1）: 値が入っていれば「採用」。rate 方式は円/本値の残存（裁定v）に関わらず mode で判定。
export function adoptedMethodsOf(p: AdoptPlanShape, comps: AdoptCompShape[]): AdoptedMethod[] {
  const activeComp = (kind: string) => comps.some((c) => c.kind === kind && c.is_active !== false);
  const rate = p.hon_back_mode === "rate" || p.jonai_back_mode === "rate";
  const perCountBack =
    (p.hon_back_mode !== "rate" && p.hon_back > 0) ||
    (p.jonai_back_mode !== "rate" && p.jonai_back > 0) ||
    p.dohan_back > 0;
  return [
    { key: "hourly", label: "時給保証", on: p.base > 0 },
    { key: "guarantee", label: "最低保証", on: activeComp("guarantee_min") },
    { key: "nomination", label: "指名バック", on: perCountBack || rate },
    { key: "ratio", label: "歩合（率）", on: rate },
    { key: "salesSlide", label: "売上スライド", on: (p.sales_slide ?? []).length > 0 },
    { key: "pointSlide", label: "ポイントスライド", on: (p.point_slide ?? []).length > 0 },
    { key: "achievement", label: "達成ボーナス", on: activeComp("achievement_bonus") },
  ];
}
