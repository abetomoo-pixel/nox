"use client";
// ★M-136（2026-11-10）: 折りたたみの共通部品（details／summary）。題名と 1 行の要約を出し、中身は押したときだけ。
//   レジの会計タブの「カスタム明細」「割引・無料」など、毎回は使わない欄に使う。開閉は画面の中だけ（保存しない）。
import type React from "react";

export default function Fold({ title, summary, defaultOpen = false, name, children }: {
  title: React.ReactNode;
  /** 閉じているときも見える 1 行（件数・金額など） */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** data-fold の目印（verify と撮影） */
  name: string;
  children: React.ReactNode;
}) {
  return (
    <details className="nox-fold" data-fold={name} open={defaultOpen || undefined}>
      <summary><span className="t">{title}</span>{summary != null && summary !== "" && <span className="s">{summary}</span>}<span className="ch" aria-hidden="true">▾</span></summary>
      <div className="b">{children}</div>
    </details>
  );
}
