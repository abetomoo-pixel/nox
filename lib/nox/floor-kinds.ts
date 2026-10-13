// ★0164（裁定334・便 W5-2a・2026-10-13）: フロアの種別表示切替＝stores.use_vip／use_counter（boolean・既定 true）で席種 'VIP'／'カウンター' の UI を出し分ける純関数。
//   席モデル（seats 1 行＝タイル・check_seats の相席）・RPC・計算は不変。false の種別は「レジの卓席タイル」と「席マスタの選択肢」から消すだけで、登録済みの席の行は残す（恒久注意5）。
//   「卓で束ねる」（seats.parent_seat_id）は第 2 期（便 W5-2-R）。
export type FloorFlags = { use_vip: boolean; use_counter: boolean };
export const KIND_VIP = "VIP";
export const KIND_COUNTER = "カウンター";

/** 出さない席種（表示の選択肢から外す・既存行は残す） */
export function hiddenKindsOf(f: FloorFlags): string[] {
  const out: string[] = [];
  if (!f.use_vip) out.push(KIND_VIP);
  if (!f.use_counter) out.push(KIND_COUNTER);
  return out;
}

/** 席タイルに出す席（店ごとのフラグで種別を絞る・フラグ行が無い店は全部出す） */
export function seatsVisibleOf<T extends { kind: string | null; store_id: string }>(seats: readonly T[], stores: readonly ({ id: string } & FloorFlags)[]): T[] {
  const hidden = new Map(stores.map((s) => [s.id, new Set(hiddenKindsOf(s))]));
  return seats.filter((s) => !(s.kind && hidden.get(s.store_id)?.has(s.kind)));
}
