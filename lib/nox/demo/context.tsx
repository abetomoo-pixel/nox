"use client";

// ★夜間便 N7-2（裁定273-6・2026-09-18）: デモ org の判定（orgs.is_demo）を layout から client 部品へ渡す文脈。
//   layout（server）が 1 回読み、DemoProvider で配る。部品は useIsDemo() で「導線を隠す」だけ＝真の防御は route の柵（N7-1）と storage policy（0149 ★10）。
import { createContext, useContext, type ReactNode } from "react";

const DemoContext = createContext<boolean>(false);

export function DemoProvider({ isDemo, children }: { isDemo: boolean; children: ReactNode }) {
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>;
}

/** デモ org のセッションなら true（Provider の外＝false） */
export const useIsDemo = (): boolean => useContext(DemoContext);
