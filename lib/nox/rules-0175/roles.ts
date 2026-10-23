// ★追補 3 R-8 役割「管理者」（裁定425 候補・0175 v2 ★28・2026-10-23）: 純関数（DB を知らない）。
//   序列＝owner → admin → manager → staff → cast。管理者＝オーナーと同じ権限で、次の 4 つだけオーナー限定＝
//   ①店舗の解約／削除 ②オーナーの変更（移譲） ③NOX の契約と請求（Stripe・プラン・規約の同意） ④管理者の任命と解除。
//   DB 側＝auth_role() が admin→'owner' を返す（RLS 70 本・RPC 210 本の owner 判定を書き換えずに広げる）・本来の役割は auth_role_raw()。
//   client＝getSessionRole() の roleRaw（フラグ true のとき auth_role_raw）。RULES_0175_APPLIED=false の間は従来の role だけ。

export const ROLE_ORDER = ["owner", "admin", "manager", "staff", "cast"] as const;
export type Role0175 = (typeof ROLE_ORDER)[number];

export const ROLE_LABEL_0175: Record<string, string> = { owner: "オーナー", admin: "管理者", manager: "店長", staff: "スタッフ", cast: "キャスト" };
/** 表示名（admin＝「管理者」・他は従来と同じ語） */
export const roleLabelOf = (role: string | null | undefined): string => (role ? ROLE_LABEL_0175[role] ?? role : "");

/** 序列（小さいほど上位・未知は末尾） */
export const roleRankOf = (role: string): number => { const i = (ROLE_ORDER as readonly string[]).indexOf(role); return i < 0 ? ROLE_ORDER.length : i; };

/** DB の auth_role() と同じ式＝権限判定に使う役割（admin は owner） */
export const effectiveRoleOf = (raw: string | null | undefined): string | null => (raw == null ? null : raw === "admin" ? "owner" : raw);

/** オーナー本人か（owner 限定 4 つの表示に使う＝admin は false） */
export const isOwnerRawOf = (raw: string | null | undefined): boolean => raw === "owner";

/** オーナー限定 4 つ（表示の注記と suite の列挙） */
export const OWNER_ONLY = [
  { key: "cancel", label: "店舗の解約・削除", where: "Stripe ポータル（ご契約）＝RPC なし" },
  { key: "transfer", label: "オーナーの変更（移譲）", where: "owner_transfer" },
  { key: "billing", label: "NOX の契約と請求", where: "/billing・api/billing・org_billing RLS・terms_accept" },
  { key: "admin", label: "管理者の任命と解除", where: "set_membership_role" },
] as const;

/** 管理者が見るオーナー限定の注記（オーナー本人には出さない） */
export const ownerOnlyNoteOf = (raw: string | null | undefined): string | null => (raw === "admin" ? "オーナーのみ" : null);

/** スタッフ画面の一覧に出す役割（フラグ true で admin を含む） */
export const staffListRolesOf = (on: boolean): string[] => (on ? ["staff", "manager", "admin"] : ["staff", "manager"]);

/** 役割変更の候補＝呼び手（本来の役割）× 相手の今の役割。owner＝staff／manager に admin を足せる・admin を解除できる。admin＝staff↔manager だけ */
export function roleChangeTargetsOf(callerRaw: string | null | undefined, targetRole: string): string[] {
  if (callerRaw !== "owner" && callerRaw !== "admin") return [];
  if (targetRole === "admin") return callerRaw === "owner" ? ["manager", "staff"] : [];
  const base = targetRole === "staff" ? ["manager"] : targetRole === "manager" ? ["staff"] : [];
  return callerRaw === "owner" && base.length ? [...base, "admin"] : base;
}

/** ボタンの文言＝「店長に昇格」「スタッフに降格」「管理者に昇格」 */
export const roleChangeTextOf = (from: string, to: string): string => `${roleLabelOf(to)}に${roleRankOf(to) < roleRankOf(from) ? "昇格" : "降格"}`;

/** 役割ピルの色＝admin はオーナーの隣（濃い地）・manager は金・他は無地 */
export const rolePillKindOf = (role: string): "admin" | "manager" | "plain" => (role === "admin" ? "admin" : role === "manager" ? "manager" : "plain");

/** RPC の例外→日本語（set_membership_role／owner_transfer） */
export function roleRpcErrJaOf(msg: string): string {
  if (/\bself\b/.test(msg)) return "自分の役割は変えられません";
  if (/bad target/.test(msg)) return "この方の役割は変えられません（オーナーの変更は「移譲」・キャストはキャスト管理）";
  if (/bad role/.test(msg)) return "役割の指定が正しくありません";
  if (/no change/.test(msg)) return "すでにその役割です";
  if (/forbidden/.test(msg)) return "管理者の任命・解除とオーナーの変更はオーナーのみ行えます";
  if (/billing locked/.test(msg)) return "ご契約の手続きが必要です";
  return msg;
}
