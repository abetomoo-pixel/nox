// ★便 P174 T-5（GV-55／56・ex_plan R-11 (d)）: 給与の期首行（裁定97）が保証行（overrides.guarantee＝true）のとき、その base は保証額＝期の全日に効いてしまう（戻し後の日も）。
//   保証は guaranteesByCast（pay.ts guaranteeByDay）で営業日ごとに効かせるので、期首行の override からは base／guarantee を外し、
//   base は非保証行（期首行より後で最初の行＝戻し行、無ければ前の最後の非保証行）の override.base を使う。保証行でなければ従来どおり（そのまま）。DB を知らない純関数。
import type { PlanOverride } from "../pay";

export type PlanRowForOverride = { override: PlanOverride; validFrom: string };

export function baseOverrideOf(pick: PlanRowForOverride, rows: readonly PlanRowForOverride[]): PlanOverride {
  const ov = pick.override as Record<string, unknown>;
  if (ov.guarantee !== true) return pick.override;
  const rest: Record<string, unknown> = { ...ov }; delete rest.base; delete rest.guarantee;
  const isNg = (r: PlanRowForOverride) => (r.override as Record<string, unknown>).guarantee !== true;
  const after = rows.filter((r) => isNg(r) && r.validFrom > pick.validFrom).sort((x, y) => (x.validFrom < y.validFrom ? -1 : 1))[0];
  const before = rows.filter((r) => isNg(r) && r.validFrom < pick.validFrom).sort((x, y) => (x.validFrom < y.validFrom ? 1 : -1))[0];
  const src = (after ?? before)?.override as Record<string, unknown> | undefined;
  return (typeof src?.base === "number" ? { ...rest, base: src.base } : rest) as PlanOverride;
}
