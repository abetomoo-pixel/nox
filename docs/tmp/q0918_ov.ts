import { backArgsOf, templateOf, type BizType } from "../../lib/nox/setup/template-plan";
for (const biz of ["cabaret", "girlsbar", "snack", "lounge"] as BizType[]) {
  const t = templateOf(biz)!;
  const active = t.products.filter((p) => !p.status || p.status === "active");
  const ov = active.filter((p) => !backArgsOf(p.back, t).isDefault).length;
  const byClass: Record<string, number> = {};
  for (const p of active) byClass[p.accounting_class] = (byClass[p.accounting_class] ?? 0) + 1;
  const foodOv = active.filter((p) => (p.accounting_class === "food" || p.accounting_class === "other") && !backArgsOf(p.back, t).isDefault).length;
  console.log(biz, "active", active.length, "overrides(all)", ov, "food/other overrides", foodOv, JSON.stringify(byClass));
}
