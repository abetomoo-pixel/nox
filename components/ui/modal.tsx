"use client";

// 共通モーダル（D-2 共通部品化 2026-07-17）。
// 由来: casts-board / kiosk-panel / printer-panel / staff-board の 4 ファイルに一字一致で複製されていた
//   overlay + modalCard を 1 部品に寄せたもの。★視覚は置換前と同値（D-2 は複製解消のみ・1px も変えない）:
//   - overlay: 4 ファイルとも完全一致だったのでそのまま既定値に採用
//   - modalCard: maxWidth のみ差（casts/kiosk/staff=430・printer=520）→ prop で受ける（既定 430）
// 構造も 5 箇所すべて同型だったため踏襲: overlay クリックで閉じ、カード側は stopPropagation で貫通させない。
//   閉じてよいかの判定（busy 中・結果表示中は閉じない等）は画面側の事情なので onClose に委ねる
//   （呼び出し側が `() => !busy && setX(null)` のように渡す＝置換前の onClick 条件をそのまま移植できる）。
import type { CSSProperties, ReactNode } from "react";
import * as t from "@/lib/nox/ui/theme";

const overlay: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.62)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
};

export default function Modal({
  onClose, maxWidth = 430, children,
}: {
  /** overlay クリック時に呼ばれる。閉じない条件（busy 等）は呼び出し側で判定する。 */
  onClose: () => void;
  /** カード幅。既定 430（printer-panel のみ 520 を渡す＝置換前と同値）。 */
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <div style={overlay} onClick={onClose}>
      <div className="nox-cardtop" style={{ ...t.card, width: "100%", maxWidth, marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
