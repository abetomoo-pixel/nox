"use client";

// ★夜間便 N5（2026-09-24・裁定293-7）: 公開デモの入場前の規約＝5 項＋「同意する」チェック。未同意は入場ボタンを押せない（disabled）。
//   ★裁定328 追補1（便 D1・2026-10-02）: 店 6 × 役割 4 のボタン＋店ごとの「端末（キオスク）」＝固定端末ユーザー。初期化は毎日 06:05。
//   client のみ（DB 非依存・route /api/demo/enter は form POST {store, role}・noindex は page の metadata が維持）。資格情報・リンクは置かない。
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";

/** 規約 5 項（裁定293-7）＝正本は lib/nox/demo/terms.ts（server の /lp も同じ 1 本を読む・裁定344）。ここは再 export（既存 import の互換） */
import { DEMO_TERMS } from "@/lib/nox/demo/terms";
export { DEMO_TERMS };

export type DemoBiz = { key: string; label: string; desc: string; sub?: string };
export type DemoRole = { key: string; label: string; desc: string };

/** ★裁定344（便 N1013b）: LP「この店で試す」＝/demo?store=<code>&role=<role> の初期選択。入場は従来の form POST・規約同意は必須のまま。
 *  初期選択の店は先頭に出して枠を金色に・役割ボタンは「おすすめ」印。未知の値は無視（従来どおりの並び）。純関数＝suite lp が pin。 */
export function demoInitialSelectionOf(biz: readonly DemoBiz[], roles: readonly DemoRole[], store: string | null | undefined, role: string | null | undefined): { store: string | null; role: string | null } {
  const s = store && biz.some((b) => b.key === store) ? store : null;
  const r = role && roles.some((x) => x.key === role) ? role : null;
  return { store: s, role: s ? r : null };
}
export function demoBizOrderOf(biz: readonly DemoBiz[], initialStore: string | null): DemoBiz[] {
  if (!initialStore) return [...biz];
  return [...biz.filter((b) => b.key === initialStore), ...biz.filter((b) => b.key !== initialStore)];
}

export default function DemoEntry({ biz, roles, kiosk }: { biz: readonly DemoBiz[]; roles: readonly DemoRole[]; kiosk?: DemoRole | null }) {
  const [agreed, setAgreed] = useState(false);
  const sp = useSearchParams(); // ★裁定344: ?store=&role=（page は force-static のまま＝client で読む・Suspense は page 側）
  const init = demoInitialSelectionOf(biz, roles, sp?.get("store"), sp?.get("role"));
  const ordered = demoBizOrderOf(biz, init.store);
  const btn = (store: string, r: DemoRole, ghost = false) => {
    const picked = init.store === store && init.role === r.key;
    return (
    <form key={r.key} method="post" action="/api/demo/enter" style={{ margin: 0 }} onSubmit={(e) => { if (!agreed) e.preventDefault(); }}>
      <input type="hidden" name="store" value={store} />
      <input type="hidden" name="role" value={r.key} />
      <button type="submit" disabled={!agreed} aria-disabled={!agreed} data-picked={picked ? "1" : undefined}
        style={{ ...(ghost ? t.btnGhost : t.btnGold), ...t.btnSm, padding: "8px 14px", opacity: agreed ? 1 : 0.5, cursor: agreed ? "pointer" : "not-allowed", outline: picked ? "2px solid var(--gold)" : undefined, outlineOffset: picked ? 2 : undefined }}
        title={agreed ? r.desc : "先に規約へ同意してください"}>{r.label}で入る{picked ? "（おすすめ）" : ""}</button>
    </form>
    );
  };
  return (
    <>
      <section className="nox-cardtop" style={{ ...t.card, marginBottom: 12 }} aria-labelledby="demo-terms-h">
        <h2 id="demo-terms-h" style={{ ...t.cardTitle, margin: "0 0 6px" }}>デモ利用の規約</h2>
        <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink)" }}>
          {DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="demo-terms-h" />
          上記に同意する
        </label>
        {!agreed && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>同意すると下の「…で入る」を押せるようになります。</p>}
      </section>
      {ordered.map((b) => (
        <section key={b.key} className="nox-cardtop" style={{ ...t.card, marginBottom: 12, ...(init.store === b.key ? { border: "1px solid var(--gold)" } : {}) }} data-initial={init.store === b.key ? "1" : undefined}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 2px" }}>{b.label}{b.sub && <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sub)", marginLeft: 8 }}>{b.sub}</span>}</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>{b.desc}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {roles.map((r) => btn(b.key, r))}
            {kiosk && btn(b.key, kiosk, true)}
          </div>
        </section>
      ))}
    </>
  );
}
