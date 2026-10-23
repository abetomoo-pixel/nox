import type { Metadata } from "next";
import BrandLogo from "@/components/ui/brand-logo"; // ★便 SH-UI-a A-2: ロゴ（Concept 2 改）
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import * as t from "@/lib/nox/ui/theme";
import { DEMO_TERMS } from "@/lib/nox/demo/terms"; // ★正本（"use client" の demo-terms.tsx から値は読めない）
import { DEMO_RESET_TIME_JA, DEMO_STORES, DEMO_STORE_LABEL } from "@/lib/nox/demo/seed";

// ★裁定344（便 N1013b・2026-10-13）: LP＝/lp（Next.js 内の static route・/demo と同じ土台）。
//   構成＝ヒーロー（主 CTA「触れるデモ」＝/demo）→ 6 店カード（動画 public/lp/<store>.mp4・無い間はポスター枠）＋「この店で試す」＝/demo?store=&role=owner の初期選択
//   → 帯（DEMO_RESET_TIME_JA と DEMO_TERMS の逐語＝文言の出所は /demo と同じ 1 本）→ 料金＝問い合わせ導線（mailto）→ フッター。
//   /terms は L6（利用規約の文言）待ちで非公開＝リンクを出さない。公開（index）はローンチ前ゲートの後＝それまで noindex。スマホは 1 列（auto-fill の grid）。
export const metadata: Metadata = {
  title: "NOX｜会計・シフト・報酬を 1 つに",
  description: "ナイトワークの店舗向け 会計・シフト・報酬管理。ログイン不要の「触れるデモ」で 6 業態の画面をそのまま試せます。",
  robots: { index: false, follow: false }, // ★公開ゲート（#75〜#81・L6・起票97／98）の後に index へ
};
export const dynamic = "force-static";

/** 料金・お問い合わせの導線（器なし＝mailto・仮決め＝Agoora 記入で差替え）。★page.tsx から export しない（Next の Page export 検査＝build 失敗） */
const LP_CONTACT_MAILTO = "mailto:info@agoora.co.jp?subject=NOX%20%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B";

/** 動画＝public/lp/<store>.mp4（1 本 ≤4MB・H.264・音なし・字幕焼き込み）。ビルド時に有無を見る（static）＝無い店はポスター枠 */
function videoSrcOf(store: string): string | null {
  const p = path.join(process.cwd(), "public", "lp", `${store}.mp4`);
  return fs.existsSync(p) ? `/lp/${store}.mp4` : null;
}

const STORES = DEMO_STORES.map((s) => ({ key: s, ...DEMO_STORE_LABEL[s], video: videoSrcOf(s) }));

export default function LpPage() {
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={{ ...t.wrap, maxWidth: 960, margin: "0 auto", padding: "28px 16px 40px" }}>
        {/* ヒーロー */}
        <header style={{ marginBottom: 26 }}>
          <Link href="/lp" aria-label="ホームへ" className="nox-brandlink" data-brand-home="/lp"><BrandLogo height={40} /></Link>{/* ★便 SH-UI-a A-2: ロゴ・★便 SH-UI-b2 B2-2: /lp の先頭へ */}
          <h1 style={{ ...t.pheadH1, marginTop: 10, fontSize: 26, lineHeight: 1.35 }}>会計・シフト・報酬を 1 つに。<br />夜の店の運営を、数字で。</h1>
          <p style={{ ...t.pheadP, maxWidth: 640 }}>
            レジ・日報・シフト・給与（報酬）・顧客・分析を 1 つの画面で。店ごとの報酬制度（時給・バック・ポイント・スライド・ノルマ）を設定のとおりに計算します。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <Link href="/demo" style={{ ...t.btnGold, padding: "10px 18px", textDecoration: "none" }}>触れるデモ（ログイン不要）</Link>
            <a href={LP_CONTACT_MAILTO} style={{ ...t.btnGhost, padding: "10px 18px", textDecoration: "none" }}>お問い合わせ</a>
          </div>
        </header>

        {/* 6 店カード */}
        <section aria-labelledby="lp-stores-h" style={{ marginBottom: 26 }}>
          <h2 id="lp-stores-h" style={{ ...t.cardTitle, fontSize: 16, margin: "0 0 10px" }}>6 つの業態で、そのまま試せます</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {STORES.map((s) => (
              <article key={s.key} className="nox-cardtop" style={{ ...t.card, margin: 0, display: "flex", flexDirection: "column", gap: 8 }} data-store={s.key}>
                {s.video ? (
                  <video src={s.video} controls muted playsInline preload="none" style={{ width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 8 }} />
                ) : (
                  <div aria-label={`${s.name} の紹介動画（準備中）`} data-poster="1"
                    style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--goldface2)", color: "var(--sub)", fontSize: 12 }}>
                    {s.name}（{s.biz}）
                  </div>
                )}
                <h3 style={{ ...t.cardTitle, margin: 0 }}>{s.name}<span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--sub)", marginLeft: 8 }}>{s.biz}</span></h3>
                <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, flex: 1 }}>{s.desc}</p>
                <Link href={`/demo?store=${s.key}&role=owner`} style={{ ...t.btnGold, ...t.btnSm, padding: "8px 14px", textDecoration: "none", alignSelf: "flex-start" }}>この店で試す</Link>
              </article>
            ))}
          </div>
        </section>

        {/* 帯＝/demo と同じ文言（DEMO_RESET_TIME_JA・DEMO_TERMS の逐語） */}
        <section aria-labelledby="lp-band-h" className="nox-cardtop" style={{ ...t.card, marginBottom: 26 }}>
          <h2 id="lp-band-h" style={{ ...t.cardTitle, margin: "0 0 6px" }}>デモは{DEMO_RESET_TIME_JA}に初期化されます</h2>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>店と役割を選ぶだけで、ログインした状態の画面が開きます（パスワードやメールの入力はありません）。入場前に次の規約へ同意していただきます。</p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink)" }}>
            {DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>

        {/* 料金＝器なし（価格表なし）＝問い合わせ導線 */}
        <section aria-labelledby="lp-price-h" className="nox-cardtop" style={{ ...t.card, marginBottom: 26 }}>
          <h2 id="lp-price-h" style={{ ...t.cardTitle, margin: "0 0 6px" }}>料金・導入</h2>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>料金はお問い合わせください。導入の流れ＝お問い合わせ → 初期設定（店の制度・料金・席をウィザードで登録）→ ご利用開始。</p>
          <a href={LP_CONTACT_MAILTO} style={{ ...t.btnGhost, ...t.btnSm, padding: "8px 14px", textDecoration: "none" }}>メールで問い合わせる</a>
        </section>

        <footer style={{ fontSize: 11, color: "var(--v2-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>© Agoora</span>
          <Link href="/demo" className="nox-link">デモ</Link>
          {/* /terms は L6（利用規約の文言）が来るまで非公開＝リンクを出さない（裁定344） */}
        </footer>
      </div>
    </div>
  );
}
