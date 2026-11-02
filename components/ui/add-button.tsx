"use client";

// ★便 M5b M-55（2026-11-02）: 一覧の追加ボタンの共通部品＝一覧の上・中央・主ボタン（大）。/casts「＋ キャスト登録」・/staff「スタッフ追加」ほか一覧画面で同じ部品。
import type { ReactNode } from "react";
import * as t from "@/lib/nox/ui/theme";

export default function AddButton({ children, onClick, disabled, testId, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string; title?: string }) {
  return (
    <div className="nox-addbar" data-add-bar={testId ?? "1"}>
      <button type="button" style={{ ...t.btnGold, minHeight: 44, padding: "10px 28px", fontSize: 15, fontWeight: 800 }} disabled={disabled} title={title} onClick={onClick}>{children}</button>
    </div>
  );
}
