"use client";

// 共通モーダル（D-2 共通部品化 2026-07-17／段A ボトムシート化 2026-07-24）。
// 由来: casts-board / kiosk-panel / printer-panel / staff-board の 4 ファイルに一字一致で複製されていた
//   overlay + modalCard を 1 部品に寄せたもの。maxWidth のみ差（casts/kiosk/staff=430・printer=520）→ prop（既定 430）。
// 構造: overlay クリックで閉じ、カード側は stopPropagation で貫通させない。閉じてよいかの判定
//   （busy 中・結果表示中は閉じない等）は画面側の事情なので onClose に委ねる。
//
// ── 段A（デザイン移植・presentation-only 2026-07-24・正本 DESIGN_MASTER v1.2.0）────────────
//   ≤900px＝ボトムシート化（下からスライド・上部ハンドル・角丸は上のみ・env(safe-area-inset-bottom) 対応）。
//   >900px＝現行の中央オーバーレイを 1px 不変で維持（右ドロワー variant は段B・今回入れない）。
//   inline style に @media は書けないため overlay/card を globals.css の .nox-modal-* クラスへ移し、
//   ≤900 で可変する3値（幅・角丸・下 padding）は CSS 変数橋渡しで受ける（--wrap-max と同じ流儀・!important 不使用）。
//   ★>900 の描画は移行前と同値: overlay 基底値／t.card／maxWidth prop すべて据置。
import type { CSSProperties, ReactNode } from "react";
import * as t from "@/lib/nox/ui/theme";

export default function Modal({
  onClose, maxWidth = 430, children,
}: {
  /** overlay クリック時に呼ばれる。閉じない条件（busy 等）は呼び出し側で判定する。 */
  onClose: () => void;
  /** カード幅。既定 430（printer-panel のみ 520 を渡す＝置換前と同値。>900 で有効・≤900 はシートが全幅化）。 */
  maxWidth?: number;
  children: ReactNode;
}) {
  const cardStyle: CSSProperties = {
    ...t.card,
    marginBottom: 0,
    // 角丸・下 padding は ≤900 のシートで globals.css が上書きする＝CSS 変数経由で受ける
    //（>900 は fallback＝t.card の 16px / 15px と同値＝1px 不変）。
    borderRadius: "var(--nox-modal-radius, 16px)",
    paddingBottom: "var(--nox-modal-pad-b, 15px)",
    // カード幅を .nox-modal-card の max-width へ橋渡し（>900 で有効。既定 430・printer のみ 520）。
    ...({ "--nox-modal-max": `${maxWidth}px` } as CSSProperties),
  };
  return (
    <div className="nox-modal-overlay" onClick={onClose}>
      <div className="nox-modal-card nox-cardtop" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="nox-modal-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
