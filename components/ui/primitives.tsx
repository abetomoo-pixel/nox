// NOX 共通プリミティブ（薄いラッパー）。正本＝docs/NOX_デザインシステム.md。
// hooks を持たない純表示コンポーネント＝server/client どちらのツリーでも使える。
// .nox-dark 配下でのみ色が解決する（opt-in ダークの契約）。
import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from "react";
import * as t from "@/lib/nox/ui/theme";

// カード（上端 gold 細線は className="nox-cardtop" で付与）。title を渡すと見出し付き。
export function Card({
  title,
  children,
  style,
  cardTop = true,
}: {
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  cardTop?: boolean;
}) {
  return (
    <section className={cardTop ? "nox-cardtop" : undefined} style={{ ...t.card, ...style }}>
      {title != null && <h2 style={t.cardTitle}>{title}</h2>}
      {children}
    </section>
  );
}

// ボタン（gold＝主要／ghost＝副次・sm で小サイズ）。onClick 等は ...rest で透過。
export function Button({
  variant = "ghost",
  sm = false,
  block = false,
  style,
  children,
  ...rest
}: {
  variant?: "gold" | "ghost";
  sm?: boolean;
  block?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = variant === "gold" ? t.btnGold : t.btnGhost;
  return (
    <button
      style={{ ...base, ...(sm ? t.btnSm : null), ...(block ? { width: "100%" } : null), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ロールピル（gold グラデ＋黒文字）。
export function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ ...t.rolePill, ...style }}>{children}</span>;
}
