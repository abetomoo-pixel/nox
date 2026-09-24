"use client";

// ★夜間便 N5（2026-09-24・裁定293-7）: 公開デモの入場前の規約＝5 項＋「同意する」チェック。未同意は入場ボタンを押せない（disabled）。
//   client のみ（DB 非依存・route /api/demo/enter は不変・noindex は page の metadata が維持）。資格情報・リンクは置かない。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";

/** 規約 5 項（裁定293-7＝実在人物の個人情報を入力しない／本番利用禁止／データはリセットされる／計算結果を給与等へ利用しない／不正利用禁止） */
export const DEMO_TERMS: readonly string[] = [
  "実在の人物の個人情報（氏名・連絡先・写真など）を入力しません。",
  "本番の店舗運営には利用しません（デモは体験用です）。",
  "入力したデータは他の閲覧者にも見え、毎朝 5 時に初期化されます。",
  "デモの計算結果を実際の給与・報酬・税務に利用しません。",
  "不正利用（大量の入力・自動化・他者になりすます操作など）を行いません。",
];

export type DemoBiz = { key: string; label: string; desc: string };
export type DemoRole = { key: string; label: string; desc: string };

export default function DemoEntry({ biz, roles }: { biz: readonly DemoBiz[]; roles: readonly DemoRole[] }) {
  const [agreed, setAgreed] = useState(false);
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
      {biz.map((b) => (
        <section key={b.key} className="nox-cardtop" style={{ ...t.card, marginBottom: 12 }}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 2px" }}>{b.label}</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>{b.desc}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {roles.map((r) => (
              <form key={r.key} method="post" action="/api/demo/enter" style={{ margin: 0 }} onSubmit={(e) => { if (!agreed) e.preventDefault(); }}>
                <input type="hidden" name="biz" value={b.key} />
                <input type="hidden" name="role" value={r.key} />
                <button type="submit" disabled={!agreed} aria-disabled={!agreed}
                  style={{ ...t.btnGold, ...t.btnSm, padding: "8px 14px", opacity: agreed ? 1 : 0.5, cursor: agreed ? "pointer" : "not-allowed" }}
                  title={agreed ? r.desc : "先に規約へ同意してください"}>{r.label}で入る</button>
              </form>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
