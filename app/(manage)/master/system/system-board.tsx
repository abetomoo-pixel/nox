"use client";

// スタッフ・システム（DP1 P1・裁定 DP1-②/⑦）。master-board.tsx の view === "system" を移設し、
// **モック準拠の4タブへ再編**した実ページの表示層。
//
// ★モック nox-staff-system-settings の構造（実測）:
//     nav.tabs = ▣ キオスク端末 / ● 操作担当PIN / ▤ レシート・プリンタ / ▰ 機密・税務情報
//     各タブに section.panel（計 card 12枚）
//   旧実装は「KioskPanel（端末＋PIN 同居）／PrinterPanel／SensitiveTaxPanel」の**3パネル縦積み**だった。
//   E8 staff#1 が「1ページ4タブ vs 2画面3パネル」を M級 IA としてスキップしていた分の履行。
//
// ★再編は**表示のみ**＝タブは client state で「どれを描くか」を選ぶだけ。
//   パネル本体（fetch・RPC・引数・権限分岐）は1文字も変えていない。
//   タブの中身は page.tsx（server）が組んだ ReactNode をそのまま受け取る＝
//   旧 MasterBoard の `panels` prop と同じ流儀（server で props を組む構造を保つ）。
// ★タブは既存 `.nox-seg`（master-subnav・casts・report と同じセグメント）を使う＝新クラスを作らない。
// ★権限で空になったタブは server 側で配列から落ちる（owner 限定パネルの出し分けは page.tsx が持つ）。
import { useEffect, useRef, useState } from "react";

export type SystemTab = { key: string; label: string; node: React.ReactNode };

export default function SystemBoard({ tabs }: { tabs: SystemTab[] }) {
  const [cur, setCur] = useState(tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === cur) ?? tabs[0];
  const panelRef = useRef<HTMLDivElement>(null);

  // ★A3（概要カードの遷移先重複の解消）: /master/system#<tab key> で該当タブへ直接着地する。
  //   この画面は「縦積みのパネル」ではなく**タブ**なので、hash はスクロール先ではなく
  //   **どのタブを開くか**を決める。ブラウザ既定の hash スクロールはタブが未選択のうちは
  //   対象が DOM に無く効かないため、選択してから自前で scrollIntoView する。
  //   hashchange も拾う＝同じページに居るまま別カードのリンクを踏んでも切り替わる。
  useEffect(() => {
    const keys = new Set(tabs.map((t) => t.key));
    const apply = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!keys.has(h)) return;
      setCur(h);
      // タブ描画後にスクロール（同フレームでは対象がまだ差し替わっていない）
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start" }));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tabs.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--sub)" }}>表示できる設定がありません（権限をご確認ください）。</p>;
  }

  return (
    <div>
      {/* タブ行はタブが2つ以上のときだけ出す（1件のタブ行は情報量ゼロ＝master-subnav と同じ退化契約） */}
      {tabs.length > 1 && (
        <div className="nox-ctoolbar" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          <div className="nox-seg" style={{ flex: "0 0 auto" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={t.key === active.key ? "on" : ""}
                aria-current={t.key === active.key ? "page" : undefined}
                onClick={() => setCur(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* ★A3: id＝タブ key（master-board の href の hash と一致）。
          scroll-margin-top は sticky なページヘッダ分の逃げ＝着地時に見出しが隠れない。 */}
      <div id={active.key} ref={panelRef} style={{ scrollMarginTop: 96 }}>{active.node}</div>
    </div>
  );
}
