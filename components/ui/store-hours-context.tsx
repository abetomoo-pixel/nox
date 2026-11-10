"use client";

// ★M-145（2026-11-10 夜便）: 時刻の選択（TimeInput）を全画面で同じ動きにする＝店の営業開始・営業終了（今日の曜日）と営業日の切替時刻をシェルから渡す。
//   部品は props で渡されていない値（startAt・closeAt・dayStart）をここから補う＝53 か所の呼び出しを書き換えない。値はシェル（(manage)／mine の layout）が読む。
import { createContext, useContext, type ReactNode } from "react";

export type StoreHours = { open: string | null; close: string | null; cutoff: string };
const Ctx = createContext<StoreHours>({ open: null, close: null, cutoff: "06:00" });

export function StoreHoursProvider({ value, children }: { value: StoreHours; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStoreHours = (): StoreHours => useContext(Ctx);
