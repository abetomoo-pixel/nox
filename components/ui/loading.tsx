// ★M-135（2026-11-10）: 読み込み中の表示の共通部品（画面ごとにばらばらだった「読み込み中…」の p をそろえる）。
//   小さな回転の印＋文言・role=status（読み上げ）・data-loading（verify と撮影の目印）。
import type React from "react";

export default function Loading({ label = "読み込み中…", style }: { label?: string; style?: React.CSSProperties }) {
  return (
    <p className="nox-loading" role="status" aria-live="polite" data-loading="1" style={style}>
      <span className="sp" aria-hidden="true" />{label}
    </p>
  );
}
