// ★便 SH-UI-a A-2（2026-10-22）: ロゴ（Concept 2 改＝public/brand・README のとおり）。
//   横組み nox_logo_horizontal_dark（暗地）／_light（白地＝領収書・明細の印刷）。印刷で白地に反転する面は print 属性で
//   2 枚を重ねず「画面＝dark・印刷＝light」を CSS（globals.css .nox-logo-screen／.nox-logo-print）で切り替える。
//   高さだけを指定し幅は auto（比 1383:560）＝1,280px／390px で欠けない（max-width 100%）。alt は「NOX」。
/* eslint-disable @next/next/no-img-element -- 静的 SVG（最適化不要・外部ドメインなし） */
import type { CSSProperties } from "react";

export const BRAND_LOGO = {
  dark: "/brand/nox_logo_horizontal_dark.svg",
  light: "/brand/nox_logo_horizontal_light.svg",
  mark: "/brand/nox_mark_gold.svg",
  symbol: "/brand/nox_symbol_gold.svg",
} as const;

export default function BrandLogo({ height = 32, variant = "dark", print = false, style, className }: {
  /** 表示の高さ（px）。幅は比で決まる */
  height?: number;
  /** dark＝暗地（既定）／light＝白地 */
  variant?: "dark" | "light";
  /** true＝画面は dark・印刷（@media print）は light を出す（領収書・報酬明細） */
  print?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const base: CSSProperties = { height, width: "auto", maxWidth: "100%", display: "block", ...style };
  if (print) {
    return (
      <span className={className} style={{ display: "inline-block", lineHeight: 0 }} data-brand-logo="print">
        <img src={BRAND_LOGO.dark} alt="NOX" className="nox-logo-screen" style={base} />
        <img src={BRAND_LOGO.light} alt="" aria-hidden="true" className="nox-logo-print" style={base} />
      </span>
    );
  }
  return <img src={BRAND_LOGO[variant]} alt="NOX" className={className} data-brand-logo={variant} style={base} />;
}
