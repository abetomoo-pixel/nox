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
