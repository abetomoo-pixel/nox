// ページヘッダ（B1・2026-08-21 Agoora 裁定）。全画面をモック同形の3段ヘッダに統一する。
//
// ★モック実測（mock/pages-2026-08 の .pagehead）:
//     .pagehead { display:flex; align-items:flex-end; justify-content:space-between;
//                 gap:20px; margin-bottom:20px }
//     .eyebrow  { font-size:10px; color:var(--gold); letter-spacing:.2em; margin-bottom:6px }
//     .pagehead h1 { font-size:26px; margin:0 0 4px; font-weight:650 }
//     .pagehead p  { margin:0; color:var(--muted); font-size:13px }
//   旧 .nox-hero は h1 28px/700・mb 8px・p 14px・margin-bottom 24px でモックとズレていた。
//   本部品は .nox-pagehead（globals.css）を使う＝.nox-hero の定義は残す（他所の流用があるため）。
//
// ★イーブロー・説明文はモック逐語。モックに対応画面が無いもの（/billing /receipts /staff /dashboard
//   /mine 配下）は、既存画面群と同型になるよう自然に補う（発明ではなく命名の踏襲）。
// ★right は日付ナビや検索など「見出しの右に置く操作」。モックの .pagehead も右側に置いている。
import type { ReactNode } from "react";

export default function PageHead({
  eyebrow, title, desc, right,
}: {
  /** 英字イーブロー（例 SHIFT MANAGEMENT）。モック逐語。 */
  eyebrow: string;
  title: string;
  /** 説明文1行。モック逐語。 */
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="nox-pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {right}
    </div>
  );
}
