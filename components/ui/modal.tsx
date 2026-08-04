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

// ── レーン④b-1（2026-08-04）: 右ドロワー variant を追加 ───────────────────────
//   ★オプトイン。variant を渡さない呼び出しは既定 "center" ＝ 従来の中央オーバーレイのまま。
//   ★既存7箇所（casts×3 / kiosk / printer / staff）は引数を1つも足していないので、
//     出力される className 文字列も "center" 経路のコードパスも移行前と一字一致＝挙動は不変。
//   ★drawer の指定は overlay 側にクラスを1つ足すだけにしてある（card の className は
//     どちらの variant でも "nox-modal-card nox-cardtop" のまま）。見た目の差は
//     globals.css の `.nox-modal-drawer .nox-modal-card`（@media min-width:901px）が担う。
//   ★≤900px はドロワー指定でも従来のボトムシートに落ちる。drawer の CSS を
//     min-width:901px の中だけに置き、≤900 の既存 @media(max-width:900px) 節へ
//     素通しする形で「既存分岐の再利用」を実現している（シート用の記述は新規に書いていない）。
export default function Modal({
  onClose, maxWidth = 430, variant = "center", children,
}: {
  /** overlay クリック時に呼ばれる。閉じない条件（busy 等）は呼び出し側で判定する。 */
  onClose: () => void;
  /** カード幅。既定 430（printer-panel のみ 520 を渡す＝置換前と同値。>900 で有効・≤900 はシートが全幅化）。 */
  maxWidth?: number;
  /** "center"（既定）=中央オーバーレイ／"drawer"=右端から全高スライドイン（>900px のみ・≤900 はシート）。 */
  variant?: "center" | "drawer";
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
    <div className={variant === "drawer" ? "nox-modal-overlay nox-modal-drawer" : "nox-modal-overlay"} onClick={onClose}>
      <div className="nox-modal-card nox-cardtop" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="nox-modal-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
