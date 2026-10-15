"use client";

// ★裁定382（GV-B W-1・2026-10-15）: スマホ幅の共通ルール＝共通部品 4 つ。
//   ResponsiveTable＝600px 未満で列 3 つ以上の表を 1 行 1 カード（縦書きヘッダ全廃・見出しは data-label で各セルの左に出す）。
//   FieldStack＝ラベル上・入力下（ステッパーと金額は 1 行）。SegmentTabs＝48px・幅 100%・選択中 金塗り・収まらなければ横スクロール 1 段。
//   InfoNote＝2 行超の説明は最初の 1 文＋ⓘ（details）。
//   いずれも表示だけ＝機能・RPC・state には触れない。CSS は globals.css の「GV-B 382」節。
import { useEffect, useRef, type ReactNode } from "react";

/** 表の見出し（thead の th）を各 td の data-label に写す（<600 のカード化で使う）。既に data-label がある td は触らない */
export function applyDataLabels(table: HTMLTableElement): number {
  const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
  let n = 0;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const tds = [...tr.querySelectorAll(":scope > td")];
    if (tds.length < 2) continue; // colSpan の見出し行・空行は対象外
    tds.forEach((td, i) => { if (!td.hasAttribute("data-label") && heads[i]) { td.setAttribute("data-label", heads[i]); n++; } });
  }
  return n;
}

/** 列 3 つ以上の表を包む。600px 未満は 1 行 1 カード（CSS .nox-rwrap）。中の <table> に data-label を自動付与 */
export function ResponsiveTable({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const run = () => { for (const tb of el.querySelectorAll("table")) applyDataLabels(tb as HTMLTableElement); };
    run();
    const mo = new MutationObserver(run);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return <div ref={ref} className={`nox-tablewrap nox-rwrap${className ? ` ${className}` : ""}`} data-rtable="1" style={style}>{children}</div>;
}

/** ラベル上・入力下。children が 2 つ以上（ステッパーと金額など）なら 1 行に並ぶ */
export function FieldStack({ label, children, note, htmlFor }: { label: ReactNode; children: ReactNode; note?: ReactNode; htmlFor?: string }) {
  return (
    <div className="nox-fieldstack" data-fieldstack="1">
      <label className="l" htmlFor={htmlFor}>{label}</label>
      <div className="f">{children}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

/** 48px・幅 100%・選択中は金塗り。収まらなければ横スクロール 1 段（CSS .nox-segtabs） */
export function SegmentTabs<K extends string>({ value, onChange, options, ariaLabel, disabled }: {
  value: K; onChange: (k: K) => void; options: ReadonlyArray<readonly [K, string]>; ariaLabel?: string; disabled?: boolean;
}) {
  return (
    <div className="nox-segtabs" role="tablist" aria-label={ariaLabel} data-segtabs="1">
      {options.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} disabled={disabled} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

/** 2 行超の説明＝最初の 1 文だけ見せ、残りは ⓘ で開く。1 文しか無ければそのまま */
export function InfoNote({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts = text.split(/(?<=[。．.！!？?])\s*/).filter((s) => s.trim() !== "");
  const first = parts[0] ?? text;
  const rest = parts.slice(1).join("");
  if (!rest) return <p className="nox-infonote" style={style}>{first}</p>;
  return (
    <details className="nox-infonote" data-infonote="1" style={style}>
      <summary>{first}<span className="i" aria-label="続きを見る">ⓘ</span></summary>
      <div className="r">{rest}</div>
    </details>
  );
}

/** ★裁定381（GV-B W-10）: 電話番号は全画面で tel: リンク（数字・+・ハイフンだけ残して href に） */
export function telHrefOf(tel: string | null | undefined): string | null {
  const t = (tel ?? "").replace(/[^0-9+]/g, "");
  return t.length >= 6 ? `tel:${t}` : null;
}
export function TelLink({ tel, style }: { tel: string | null | undefined; style?: React.CSSProperties }) {
  const href = telHrefOf(tel);
  if (!tel) return <>—</>;
  if (!href) return <>{tel}</>;
  return <a href={href} data-tel-link="1" style={{ color: "var(--champ)", textDecoration: "underline", textUnderlineOffset: 2, ...style }}>{tel}</a>;
}
