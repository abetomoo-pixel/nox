"use client";

// ★夜間便 N5（2026-09-24・裁定293-7）: 公開デモの入場前の規約＝5 項＋「同意する」チェック。未同意は入場ボタンを押せない（disabled）。
//   ★裁定328 追補1（便 D1・2026-10-02）: 店 6 × 役割 4 のボタン＋店ごとの「端末（キオスク）」＝固定端末ユーザー。初期化は毎日 06:05。
//   client のみ（DB 非依存・route /api/demo/enter は form POST {store, role}・noindex は page の metadata が維持）。資格情報・リンクは置かない。
import { useEffect, useState } from "react";
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
/** ★M-152（2026-11-10 夜便・外部レビュー 2 回目）: デモの規約同意は同じ端末のデモのセッション中（24 時間）は保持＝役割を切り替えても再同意を求めない。
 *  規約の版（本文の要約値）が変わったら再同意。端末の保存（localStorage）は読めない／書けない環境では使わない（同意は毎回）。純関数＝verify:nox-night1110 の単体対象。 */
export const DEMO_TERMS_ACK_KEY = "nox_demo_terms_ack";
export const DEMO_TERMS_ACK_TTL_MS = 24 * 3600_000;
export function demoTermsVersionOf(terms: readonly string[]): string { let h = 0; for (const ch of terms.join("\n")) h = (h * 31 + ch.charCodeAt(0)) | 0; return String(h >>> 0); }
export function demoTermsAckValidOf(raw: string | null, version: string, now: number): boolean {
  if (!raw) return false;
  try { const v = JSON.parse(raw) as { v?: string; at?: number }; return v.v === version && typeof v.at === "number" && now - v.at < DEMO_TERMS_ACK_TTL_MS && now >= v.at; } catch { return false; }
}
export function demoBizOrderOf(biz: readonly DemoBiz[], initialStore: string | null): DemoBiz[] {
  if (!initialStore) return [...biz];
  return [...biz.filter((b) => b.key === initialStore), ...biz.filter((b) => b.key !== initialStore)];
}

export default function DemoEntry({ biz, roles, kiosk }: { biz: readonly DemoBiz[]; roles: readonly DemoRole[]; kiosk?: DemoRole | null }) {
  const [agreed, setAgreedState] = useState(false);
  const termsVer = demoTermsVersionOf(DEMO_TERMS);
  // ★M-152: 同じ端末で同じ版の同意が 24 時間以内なら最初から同意済み
  useEffect(() => { try { if (demoTermsAckValidOf(window.localStorage.getItem(DEMO_TERMS_ACK_KEY), termsVer, Date.now())) setAgreedState(true); } catch { /* 端末の保存が使えない＝毎回同意 */ } }, [termsVer]);
  const setAgreed = (v: boolean) => { setAgreedState(v); try { if (v) window.localStorage.setItem(DEMO_TERMS_ACK_KEY, JSON.stringify({ v: termsVer, at: Date.now() })); else window.localStorage.removeItem(DEMO_TERMS_ACK_KEY); } catch { /* 保存できなくても同意は画面の中で有効 */ } };
  // ★裁定344: ?store=&role=（LP「この店で試す」）。page は force-static＝useSearchParams は空を返すため、mount 後に window.location.search を読む（SSR は初期選択なし＝従来の並び）
  const [q, setQ] = useState<{ store: string | null; role: string | null }>({ store: null, role: null });
  useEffect(() => { const u = new URLSearchParams(window.location.search); setQ({ store: u.get("store"), role: u.get("role") }); }, []);
  const init = demoInitialSelectionOf(biz, roles, q.store, q.role);
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
      {/* ★M-140（2026-11-10 夜便・外部レビュー）: 3 段の案内＋主ボタン（同意したら 1 回で入れる）。店と役割を選ぶ下のボタンは今のまま */}
      <ol className="nox-demo-steps" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, listStyle: "none", padding: 0, margin: "0 0 12px" }} data-demo-steps="3">
        {[["1", "規約に同意", "下の 5 項を読んで「上記に同意する」"], ["2", "店を選ぶ", "業態の違う 6 店から"], ["3", "役割で入る", "オーナー・店長・スタッフ・キャスト・端末"]].map(([n, h, d]) => (
          <li key={n} style={{ ...t.card, padding: "10px 12px", margin: 0 }}><b style={{ color: "var(--champ)", marginRight: 6 }}>{n}</b><b>{h}</b><span style={{ display: "block", fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>{d}</span></li>
        ))}
      </ol>
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
        {(() => { const ps = init.store ?? (biz.some((b) => b.key === "ace") ? "ace" : biz[0]?.key); const pr = init.role ?? (roles.some((r) => r.key === "owner") ? "owner" : roles[0]?.key); const pb = biz.find((b) => b.key === ps); const prl = roles.find((r) => r.key === pr); if (!ps || !pr || !pb || !prl) return null; return (
          <form method="post" action="/api/demo/enter" style={{ margin: "12px 0 0" }} onSubmit={(e) => { if (!agreed) e.preventDefault(); }} data-demo-primary="1">
            <input type="hidden" name="store" value={ps} /><input type="hidden" name="role" value={pr} />
            <button type="submit" disabled={!agreed} aria-disabled={!agreed} style={{ ...t.btnGold, width: "100%", minHeight: 48, fontSize: 16, fontWeight: 800, opacity: agreed ? 1 : 0.5, cursor: agreed ? "pointer" : "not-allowed" }}>{pb.label} を{prl.label}で試す（おすすめ）</button>
          </form>
        ); })()}
      </section>
      {ordered.map((b) => (
        <section key={b.key} className="nox-cardtop" style={{ ...t.card, marginBottom: 12, ...(init.store === b.key ? { border: "1px solid var(--gold)" } : {}) }} data-initial={init.store === b.key ? "1" : undefined}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 2px" }}>{b.label}{b.sub && <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sub)", marginLeft: 8 }}>{b.sub}</span>}</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>{b.desc}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {roles.map((r) => btn(b.key, r))}
            {kiosk && btn(b.key, kiosk, true)}
            {kiosk && <span style={{ fontSize: 11.5, color: "var(--sub)" }} data-demo-pin="per-person">PIN は端末の画面で名前の下に出ます（人ごとに違います）</span>}{/* ★夜便レーン 1（2026-11-11）: 全員 1234 をやめた（lib/nox/demo/pin.ts）＝入口の案内も直す */}{/* ★裁定354（便 N1014 B-5）: デモ org だけ（この入口はデモ専用）。本番 org には表示なし */}
          </div>
        </section>
      ))}
    </>
  );
}
