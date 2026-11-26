import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/ui/brand-logo";
import { PRIVACY_PATH, privacyPublishedOf } from "@/lib/nox/legal/privacy";
import { COMPANY_NAME, SUPPORT_EMAIL, TOKUSHOHO_HREF, TOKUSHOHO_TITLE } from "@/lib/nox/legal/tokushoho";
import { DEMO_TERMS } from "@/lib/nox/demo/terms";
import { DEMO_RESET_TIME_JA } from "@/lib/nox/demo/seed";
import { InquiryForm } from "@/components/nox/lp-v4-client";
import { LPN_PILLARS, LPN_PRICE_MONTHLY, LPN_PRICE_FAQ, LPN_HERO } from "@/lib/nox/lp/next-copy";
import "../lp/lp-v4.css"; // 問い合わせのフォーム（InquiryForm）の見た目＝.lpv4 の中だけに効く・/lp のファイルは変えない
import "./lp-next.css";

// ★相談役 11/26 の便 L3（便 J＝LP の 1 回目）: 新しい道 /lp-next（noindex・robots も allow に入れない）。今の /lp は 1 バイトも変えない（Google の審査がホームページとして見ている）。
//   中身＝今の本番にある機能だけ（柱 5 つ）・写しは公開デモ（架空のデータ）から切り抜いた public/lp/next/*.jpg（1 機能 1 枚）。
//   残す物＝事業者の表記・特商法とプライバシーポリシーへのリンク・料金の文（今の /lp の文のまま＝lib/nox/lp/next-copy.ts に写した）・デモ利用の条文（DEMO_TERMS）。
//   入れない物＝導入実績・お客様の声・順位・根拠の無い数字。スマホ（390px）を先に作る・主のボタンは中央・1 画面 1 つの言いたいこと。
export const metadata: Metadata = {
  title: "NOX｜伝票から給与明細まで、ひとつの流れで。",
  description: "ナイトワーク店舗の伝票・シフト・打刻・給与をひとつに。公開デモで画面を確かめられます。",
  robots: { index: false, follow: false },
};
export const dynamic = "force-static";

export default function LpNextPage() {
  return (
    <div className="lpnx">
      <a className="lpnx-skip" href="#main">本文へ</a>
      <header className="lpnx-header">
        <Link href="/lp-next" aria-label="NOX" className="lpnx-brand"><BrandLogo height={28} /></Link>
        <a className="lpnx-header-link" href="#contact">導入の相談</a>
      </header>
      <main id="main">
        <section className="lpnx-hero" data-lpnx-section="hero">
          <p className="lpnx-eyebrow">ナイトワーク店舗の管理システム</p>
          <h1>{LPN_HERO.h1.map((x, i) => <span key={x}>{i > 0 && <br />}{x}</span>)}</h1>
          <p className="lpnx-lead">{LPN_HERO.lead}</p>
          <div className="lpnx-cta"><Link className="lpnx-btn" href="/demo" data-lpnx-primary="hero">{LPN_HERO.cta}</Link></div>
          <p className="lpnx-sub-cta"><a href="#contact">導入・料金の相談はこちら</a></p>
        </section>

        {LPN_PILLARS.map((p, i) => (
          <section className="lpnx-pillar" key={p.id} id={p.id} data-lpnx-section={p.id}>
            <p className="lpnx-num">{String(i + 1).padStart(2, "0")}</p>
            <h2>{p.h2}</h2>
            <p className="lpnx-lead">{p.lead}</p>
            {p.points.length > 0 && <ul className="lpnx-points">{p.points.map((x) => <li key={x}>{x}</li>)}</ul>}
            {p.shots.map((s) => (
              <figure className={`lpnx-shot${s.phone ? " lpnx-shot-phone" : ""}`} key={s.src}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 静的な写し（public/lp/next） */}
                <img src={s.src} alt={s.alt} width={s.w} height={s.h} loading="lazy" decoding="async" />
                <figcaption>{s.caption}</figcaption>
              </figure>
            ))}
          </section>
        ))}

        <section className="lpnx-demo" id="demo" data-lpnx-section="demo">
          <p className="lpnx-num">{String(LPN_PILLARS.length + 1).padStart(2, "0")}</p>
          <h2>登録なしで、画面を触れます。</h2>
          <p className="lpnx-lead">業態の違う公開デモの店に、管理者・店長・スタッフ・キャストの立場で入れます。データはすべて架空です。</p>
          <div className="lpnx-cta"><Link className="lpnx-btn" href="/demo" data-lpnx-primary="demo">公開デモを開く</Link></div>
          <p className="lpnx-note">デモは{DEMO_RESET_TIME_JA}に初期化。入力内容は他の閲覧者にも見えます。個人情報は入力しないでください。</p>
          <details className="lpnx-details"><summary>デモ利用について</summary><ul>{DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}</ul></details>
        </section>

        <section className="lpnx-contact" id="contact" data-lpnx-section="contact">
          <h2>導入・料金の相談</h2>
          <div className="lpnx-price">
            <span>1店舗あたりの月額料金</span>
            <p><strong>{LPN_PRICE_MONTHLY.toLocaleString("en-US")}</strong><b>円／月（税込）</b></p>
            <small>年払いの割引もあります</small>
          </div>
          <p className="lpnx-lead">{LPN_PRICE_FAQ}</p>
          <div className="lpv4 lpnx-form"><InquiryForm /></div>
          <p className="lpnx-mail">{SUPPORT_EMAIL}</p>
        </section>
      </main>
      <footer className="lpnx-footer">
        <BrandLogo height={22} />
        <p>運営 {COMPANY_NAME}</p>
        <nav aria-label="法令とポリシー">
          <Link href={TOKUSHOHO_HREF}>{TOKUSHOHO_TITLE}</Link>
          {privacyPublishedOf() && <Link href={PRIVACY_PATH} data-privacy-link="lp-next">プライバシーポリシー</Link>}
          <Link href="/demo">デモ店舗一覧</Link>
        </nav>
        <small>© 2026 {COMPANY_NAME}</small>
      </footer>
    </div>
  );
}
