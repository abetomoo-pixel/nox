// 給与確定の権限判定（純関数・DB を知らない＝verify で直接叩ける）。
// owner=org 全店許可／manager=自店のみ／staff・cast=不可。
// 真の防御は payroll_finalize の service_role 限定＋RLS（DB 物理保証）。ここは route の 403 早期返し用。
// owner の「org 内 store か」は route 側で store.org_id === auth_org_id() を照合（本関数は role/store 次元のみ）。
export function decidePayrollAccess(
  role: string | null,
  authStoreId: string | null,
  reqStoreId: string,
): "ok" | "forbidden" {
  if (!reqStoreId) return "forbidden";
  if (role === "owner") return "ok";
  if (role === "manager" && authStoreId != null && authStoreId === reqStoreId) return "ok";
  return "forbidden";
}

// 支払調書CSV（F2d）は owner 限定＝manager も forbidden（法定調書・個人情報 mynumber 平文経路のため最狭）。
// decidePayrollAccess と同型の純関数。owner の他 org 遮断は route 側で store.org_id 照合。
export function decideTaxReportAccess(role: string | null, reqStoreId: string): "ok" | "forbidden" {
  if (!reqStoreId) return "forbidden";
  return role === "owner" ? "ok" : "forbidden";
}
