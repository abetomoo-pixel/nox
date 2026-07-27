"use client";

// キャストアバター（段P・UI刷新v2）。写真があれば写真、無ければ従来どおり頭文字＋名前由来の色。
// 由来: casts-board / shift-board に散っていた `<span className="nox-ava|nox-ava2">頭文字</span>` を 1 部品に寄せ、
//   写真↔頭文字の出し分けを 1 箇所に閉じ込めたもの（写真対応を各画面へ写経しない）。
//
// フォールバックは2段:
//   1. url が無い（= photo_updated_at が null、または署名 URL の発行に失敗）→ 頭文字
//   2. url はあるが読めない（署名期限切れ・実体消失・ネットワーク）→ onError で頭文字へ落とす
//   ★写真が出ないことはあっても、アバターの枠が消えたり alt テキストが露出したりはしない（レイアウト不変）。
//
// variant:
//   "gradient" = 従来の .nox-ava（name 由来の gradient・casts など既存画面）
//   "flat"     = .nox-ava2（var(--v2-ava) の neutral 地・UI刷新v2 の一覧行）
// 写真時は object-fit: cover で丸にトリミング（アップロード側はアスペクト比を保って縮小している）。
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import * as t from "@/lib/nox/ui/theme";

export default function CastAvatar({
  name,
  url,
  size,
  variant = "gradient",
}: {
  name: string;
  /** 署名 URL。null/undefined＝写真なし＝頭文字表示。 */
  url?: string | null;
  /** px。省略時は CSS 側の既定（.nox-ava=38 / .nox-ava2=26）。 */
  size?: number;
  variant?: "gradient" | "flat";
}) {
  const [broken, setBroken] = useState(false);
  // 写真を差し替えると url（v= キャッシュバスター）が変わる＝過去の失敗を引きずらないよう解除する
  useEffect(() => setBroken(false), [url]);

  const cls = variant === "flat" ? "nox-ava2" : "nox-ava";
  const box: CSSProperties = size ? { width: size, height: size, fontSize: Math.round(size * 0.46) } : {};
  const showPhoto = !!url && !broken;

  return (
    <span
      className={cls}
      aria-hidden="true"
      style={
        showPhoto
          ? { ...box, background: "var(--v2-ava)", overflow: "hidden", padding: 0 }
          : variant === "flat"
            ? box
            : { ...box, background: t.avatarBg(name) }
      }
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- 署名 URL（毎回異なる・期限つき）は next/image の最適化対象にできない
        <img
          src={url as string}
          alt=""
          width={size}
          height={size}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        t.avatarInitial(name)
      )}
    </span>
  );
}
