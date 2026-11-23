// ★0203（2 号店の段 2・相談役 21:40 の ■2-e）: オーナーの「今見ている店」。旗 MIG_0203_APPLIED の後ろ。
//   持ち方＝cookie nox_store（店の ID）。DB の権限の関数（auth_store_id など）の意味は変えない＝ここは画面が店を指定するための値。
//   旗 false・owner でない（店長・スタッフ・キャスト）＝今のまま（auth_store_id）。owner＝cookie の店（見える店の中にあれば）→ 無ければ店名順の先頭（今の「先頭の店」と同じ）。
export const CURRENT_STORE_COOKIE = "nox_store";

/** 純関数：今見ている店（DB を知らない） */
export function pickCurrentStore(a: { flag: boolean; role: string | null; cookieId: string | null | undefined; storeIds: readonly string[]; authStoreId: string | null }): string | null {
  if (!a.flag || a.role !== "owner") return a.authStoreId ?? a.storeIds[0] ?? null;
  if (a.cookieId && a.storeIds.includes(a.cookieId)) return a.cookieId;
  return a.storeIds[0] ?? a.authStoreId ?? null;
}

/** 純関数：切り替えを出すか（旗 true・owner・見える店が 2 つ以上） */
export const storeSwitchShownOf = (a: { flag: boolean; role: string | null; storeCount: number }): boolean => a.flag && a.role === "owner" && a.storeCount >= 2;

/** 純関数：初期設定の柵（★0203 ■2-d）＝旗 true は「見える店がどれも初期設定の前」のときだけ /setup。旗 false は今のまま（1 つでも前なら）。
 *  店が 1 つの会社では「1 つでも」と「どれも」が同じ＝1 字も変わらない。店長とスタッフは自店だけが見える＝今と同じ。 */
export function needsSetupOf(a: { flag: boolean; setupDone: readonly boolean[] }): boolean {
  if (!a.flag) return a.setupDone.some((d) => !d);
  return a.setupDone.length > 0 && a.setupDone.every((d) => !d);
}

/** 純関数：オーナーに出す案内（初期設定の前の店がほかにある・旗 true・2 店以上） */
export function pendingSetupStoresOf(a: { flag: boolean; role: string | null; stores: readonly { id: string; name: string; setupDone: boolean }[] }): { id: string; name: string }[] {
  if (!a.flag || a.role !== "owner" || a.stores.length < 2) return [];
  if (a.stores.every((s) => !s.setupDone)) return [];
  return a.stores.filter((s) => !s.setupDone).map((s) => ({ id: s.id, name: s.name }));
}

/** ★0203（12:00 の ■2-c）: ホームの「全店（合計）」ではランキングを出さない（店ごとの関数）＝その 1 行 */
export const ALL_STORES_NO_RANKING = "全店ではランキングを出しません";
