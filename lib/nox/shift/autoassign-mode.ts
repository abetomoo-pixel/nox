// ★裁定326-7／追補1-3（便 M4-2・2026-10-01）: 自動配置の候補を店設定 shift_request_mode で切り替えるアダプタ（純関数・DB を知らない）。
//   計算本体 autoAssign（lib/nox/shift-autoassign.ts）は触らない＝候補 wishes の作り方だけを分岐する。
//   'shift'（既定）＝従来どおり pending の 'work' wish が候補（'off' は候補にしない＝RPC shift_auto_apply と同じ）。
//   'off_only'＝候補を反転: 期間の各日 × 各 cast について、その日に生きている（pending／accepted）'off' wish が無ければ候補（既定の帯時間で仮想 wish を作る）・off の日は除外。
//   ★仮想 wish の id は "virtual:<castId>:<date>"＝shift_auto_apply（wish id を受ける）には渡せない。'off_only' の結果を確定案にするときは shift_bulk_set（cast×日付×時間）で置く（呼び出し側の責務・仮決め）。
import type { AutoWish } from "../shift-autoassign";
import type { WishMode } from "../mine/wish-mode";

export type WishRowForAuto = { id: string; castId: string; date: string; startHm: string | null; endHm: string | null; status: string; kind: string | null };

export const VIRTUAL_PREFIX = "virtual:";
export const isVirtualWishId = (id: string): boolean => id.startsWith(VIRTUAL_PREFIX);

/** 暦日の列挙（両端含む・UTC 純粋） */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = Date.parse(`${start}T00:00:00Z`), e = Date.parse(`${end}T00:00:00Z`);
  for (let t = s; t <= e; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** autoAssign に渡す候補 wishes */
export function candidateWishesOf(input: { mode: WishMode; wishes: readonly WishRowForAuto[]; castIds: readonly string[]; startDate: string; endDate: string; defaultStart: string; defaultEnd: string }): AutoWish[] {
  if (input.mode !== "off_only") {
    return input.wishes
      .filter((w) => w.status === "pending" && w.kind !== "off" && !!w.startHm && !!w.endHm)
      .map((w) => ({ id: w.id, castId: w.castId, date: w.date, startHm: w.startHm as string, endHm: w.endHm as string }));
  }
  const off = new Set(input.wishes.filter((w) => w.kind === "off" && (w.status === "pending" || w.status === "accepted")).map((w) => `${w.castId}|${w.date}`));
  const out: AutoWish[] = [];
  for (const date of datesBetween(input.startDate, input.endDate)) {
    for (const castId of input.castIds) {
      if (off.has(`${castId}|${date}`)) continue;
      out.push({ id: `${VIRTUAL_PREFIX}${castId}:${date}`, castId, date, startHm: input.defaultStart, endHm: input.defaultEnd });
    }
  }
  return out;
}

/** 'off_only' の結果（仮想 id）→ shift_bulk_set 向けの (castId, date) 組。'shift' の結果には仮想 id は無い */
export function placementsOfVirtual(assignWishIds: readonly string[]): { castId: string; date: string }[] {
  return assignWishIds.filter(isVirtualWishId).map((id) => { const [castId, date] = id.slice(VIRTUAL_PREFIX.length).split(":"); return { castId, date }; });
}
