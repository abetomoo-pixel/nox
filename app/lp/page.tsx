import type { Metadata } from "next";
import { PRIVACY_PATH, privacyPublishedOf } from "@/lib/nox/legal/privacy"; // ★2026-11-13（相談役【3】d）: 公開までリンクを出さない
import BrandLogo from "@/components/ui/brand-logo"; // ★便 SH-UI-a A-2: ロゴ（Concept 2 改）
import Link from "next/link";
import { COMPANY_NAME, SUPPORT_EMAIL, TOKUSHOHO_HREF, TOKUSHOHO_TITLE } from "@/lib/nox/legal/tokushoho"; // ★2026-11-10: 事業者＝株式会社レクソル・特定商取引法の表示
import { DEMO_TERMS } from "@/lib/nox/demo/terms"; // ★正本（"use client" の demo-terms.tsx から値は読めない）
import { DEMO_RESET_TIME_JA, DEMO_STORES, DEMO_STORE_LABEL, type DemoStore } from "@/lib/nox/demo/seed";
import { InquiryForm, ScreenZoom } from "@/components/nox/lp-v4-client";
import "./lp-v4.css";

// ★裁定344（便 N1013b・2026-10-13）: LP＝/lp（Next.js 内の static route・/demo と同じ土台）。
// ★便 M5 M-41（2026-10-30）: モック v3 → ★LP v4（2026-11-04 夜の自走便 4）: 正本＝docs/handoff/lp/NOX-LP.html（Agoora・11/02）を逐語で移植。
//   構成＝ヒーロー → 01 つながる店舗管理（3 列＋details 2）→ 02 画面で見る（操作画面 4 枚＝public/lp/v4）→ 03 立場（管理者／店長／スタッフ／キャスト＝旧の役割名は「管理者」に）＋FAQ
//   → 料金（月額 29,800 円／店舗・税込＝HTML どおり）→ 問い合わせ（プレビュー＝送信しない）→ 6 店（店長／キャストでログイン＝/demo?store=&role=）→ フッター。
//   CSS＝app/lp/lp-v4.css（HTML の <style> を .lpv4 配下に閉じ込めた＝他画面に漏らさない）。動く部分は components/nox/lp-v4-client.tsx だけ。
//   帯の文言は DEMO_RESET_TIME_JA（seed.ts）・デモ利用の条文は DEMO_TERMS（terms.ts）から＝二重化しない。
export const metadata: Metadata = {
  title: "NOX｜夜の経営に、確かな余裕を。",
  description: "伝票の1杯から、月末の給与まで。ナイトワーク店舗の管理をNOXひとつに。6つのデモ店舗を登録不要で体験。",
  robots: { index: false, follow: false }, // 公開ゲートの後に index
  openGraph: { images: ["/lp/v4/hero.jpg"] },
};
export const dynamic = "force-static";

const LP_ORDER: readonly DemoStore[] = ["ace", "luna", "noir", "muse", "nest", "lily"];
type StoreCopy = { kind: string; catch: string; sub: string; tag: string; detail: string };
const LP_STORE_COPY: Record<DemoStore, StoreCopy> = {
  ace:  { kind: "高単価のキャバクラ", catch: "売上に合わせて、時給も上がる。", sub: "月の売上で3段階の時給スライド。", tag: "売上スライド／月ごと", detail: "本指名・場内・同伴、商品別バック。売上・指名のノルマ。送りは実費。" },
  luna: { kind: "キャバクラ", catch: "半月ごとに、頑張りを反映。", sub: "月の前半・後半で時給を判定。", tag: "売上スライド／半月ごと", detail: "本指名・場内・フリー別のドリンクバック。出勤日数・同伴のノルマ。送りは定額。" },
  noir: { kind: "ランク制のラウンジ", catch: "本指名を、時給につなげる。", sub: "S・Aランクを対象に、本指名件数で判定。", tag: "ポイント制／月ごと", detail: "商品ポイント・指名バック。指名のノルマ。送りなし。" },
  muse: { kind: "キャバクラ", catch: "指名の切り替えにも、柔軟に。", sub: "場内から本指名へ。ドリンクの扱いも選択。", tag: "売上＋ポイント／月ごと", detail: "売上歩合。出勤日数・同伴・売上・指名のノルマ。送りは実費。" },
  nest: { kind: "スナック", catch: "休み希望から、シフトを組む。", sub: "キャストが希望を提出し、店長が配置。", tag: "固定時給／休み希望", detail: "期限付きの保証時給。ノルマなし。送りは定額。" },
  lily: { kind: "ガールズバー", catch: "確定シフトで、給与を確認。", sub: "雇用キャストの時給と日払いを管理。", tag: "固定時給／日払い", detail: "達成ボーナス。出勤日数のノルマ。送りは店負担。" },
};
const STORES = LP_ORDER.map((s, i) => ({ key: s, no: String(i + 1).padStart(2, "0"), label: DEMO_STORE_LABEL[s].name, ...LP_STORE_COPY[s] }));

const WORKFLOW = [
  { no: "01 — Operation", h: "日々の営業を、スムーズに。", p: ["シフトと出退勤、レジ、顧客台帳。", "現場で使う情報をまとめて管理。"], small: "指名・同伴 / ドリンクバック / ボトルキープ" },
  { no: "02 — Payroll", h: "店のルールを、給与に。", p: ["時給スライドも、日払いも。", "締める前に、一人ずつ明細を確認。"], small: "待遇プラン / 給与・報酬プレビュー / レジ締め" },
  { no: "03 — Insight", h: "数字から、次の一手へ。", p: ["売上も、キャストの頑張りも。", "月ごとの数字を、見えるかたちに。"], small: "ノルマ / ランキング / 分析・月報 / 監査ログ" },
] as const;
const DETAIL = [
  ["営業中", "出退勤・シフト／レジ伝票／本指名・場内・フリー別バック／来店履歴・利用額／在庫・ボトルキープ／共用iPad（PINで解除）"],
  ["締め", "売上・ポイント基準の時給スライド／給与・報酬プレビュー／日払い・前借り（貸付）／売掛／領収書の発行・印刷・PDF保存／日報・レジ締め／スタッフの勤怠・報酬見込み"],
  ["振り返り", "出勤日数・同伴・売上・指名のノルマ／自分の順位だけを表示できるランキング／分析・月報／伝票修正や設定変更の監査ログ"],
] as const;
const IN_DEV = "卓のまとめ・分割／キャストからの新規顧客登録／持ち込みボトルのキープ／レシートプリンター出力／スタッフの勤怠修正・確定／帯ごとの歩合率・達成ボーナスの多段設定／粗利基準のスライド／内税・外税の変換／LINE通知／店負担の売掛";
const EXAMPLES = [
  { no: "01 / レジ・顧客管理", h: ["一枚の伝票で、", "指名もドリンクも。"], p: ["注文に本指名・場内・同伴を紐づけて記録。", "お客様ごとの来店履歴や利用額も蓄積します。"], li: ["本指名・場内・フリーでバック率を設定", "在庫とお客様のボトルキープを管理", "売掛を記録し、領収書を発行"], src: "/lp/v4/screen-register.png", alt: "指名・ドリンク・サービス料・消費税を含む伝票明細", caption: "NOX 操作画面", crop: false },
  { no: "02 / 当日のシフト・出退勤", h: ["今日、誰が出勤するか。", "いまの状況がひと目で。"], p: ["確定したシフトと、実際の出勤記録を一覧に。", "出勤・退勤・遅刻・当欠を、その場で記録できます。"], li: ["休み希望だけを集める運用にも対応", "キャストのスマホ・共用iPadで打刻", "スタッフ・店長の勤怠も管理"], src: "/lp/v4/screen-shift.png", alt: "確定時間・出勤記録・遅刻などを確認できる今日のシフト", caption: "NOX 操作画面", crop: false },
  { no: "03 / キャスト・待遇管理", h: ["一人ひとりの待遇と、", "実績をひとつの画面に。"], p: ["今期の時給、ノルマの進み具合、次回のシフト。", "キャストごとの情報をまとめて確認できます。"], li: ["時給と判定基準・保証時給を確認", "本指名・売上のノルマ達成状況を把握", "前借りや送りの区分も同じ画面で管理"], src: "/lp/v4/screen-cast.png", alt: "キャストごとの時給・ノルマ・次回シフト・前借りを確認する管理画面", caption: "NOX 操作画面", crop: true },
  { no: "04 / 給与・報酬明細", h: ["給与の内訳も、", "支払い状況も見える。"], p: ["時給・各種バック・控除を、キャストごとに確認。", "全体の支給額と、未払いの状況も一覧で把握できます。"], li: ["支給・控除・差引支給額の内訳を表示", "雇用・委託を切り替えて確認", "支払いの記録と明細PDFに対応"], src: "/lp/v4/screen-payroll.png", alt: "給与一覧とキャスト別の支給・控除明細、未払い状況", caption: "NOX 給与・報酬画面", crop: false },
] as const;
// ★旧の役割名→「管理者」（夜の自走便 4 の指示・0175 の役割名）
const ROLES = [
  { dev: "PC / iPad", name: "管理者", body: "待遇・設定から給与、分析、月報まで。店全体を把握。" },
  { dev: "PC / iPad", name: "店長", body: "シフトの配置と出退勤、日々の伝票を管理。" },
  { dev: "iPad / PC", name: "スタッフ", body: "レジ・代理打刻・当日の配置。給与や待遇設定へのアクセスは制限。" },
  { dev: "スマートフォン", name: "キャスト", body: "打刻・シフト希望・明細・ノルマ・自分の順位を確認。" },
] as const;
const FAQ: readonly [string, readonly string[]][] = [
  ["デモの利用に登録は必要ですか？", ["不要です。店舗と立場を選び、利用規約に同意するだけで体験できます。"]],
  ["どの端末で使えますか？", ["店側はPC・iPad、キャストはスマホのブラウザで利用できます。レジはiPadでの利用を想定しています。"]],
  ["導入はどのように進めますか？", ["招待メールからパスワードを設定し、9ステップの初期設定へ。業態に応じた席・料金・メニュー・待遇の初期値を、自店に合わせて調整します。途中からの再開も可能です。"]],
  ["雇用と業務委託が混在していても使えますか？", ["キャストごとに契約区分と精算方式を記録し、源泉のプレビュー・控除日数を明細に表示します。同じ店で両方を扱えます。", "NOXは契約区分を記録するもので、労働者性や所得区分を判定するものではありません。源泉徴収の扱いは税理士などの専門家にご確認ください。"]],
  ["料金はいくらですか？", ["月額29,800円／店舗（税込）です。年払いの割引もあります。詳細はお問い合わせください。"]],
];
const LP_PRICE_MONTHLY = 29800; // 1 店舗あたりの月額（税込）＝HTML どおり

export default function LpPage() {
  return (
    <div className="lpv4">
      <a className="skip" href="#main">本文へ</a>
      <header className="header"><div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/lp" className="brand" aria-label="NOX ホーム" data-brand-home="/lp"><BrandLogo height={34} /></Link>
        <nav className="nav" aria-label="メインナビゲーション">
          <a href="#features">できること</a><a href="#examples">画面で見る</a><a href="#contact">お問い合わせ</a>
          <a className="nav-cta" href="#inquiry">導入・料金の相談 →</a>
        </nav>
      </div></header>
      <main id="main">
        <section className="hero">
          {/* eslint-disable-next-line @next/next/no-img-element -- 静的な見せ場（public/lp/v4/hero.jpg） */}
          <img className="hero-photo" src="/lp/v4/hero.jpg" alt="" fetchPriority="high" />
          <div className="wrap hero-copy">
            <p className="eyebrow">NOX / NIGHTWORK MANAGEMENT</p>
            <h1>伝票の1杯から、<br />月末の給与まで。</h1>
            <p className="hero-description">接客に向き合う時間を、もっと。<br />シフト・売上・給与をひとつにつなぐ、<br />ナイトワーク店舗の管理システム。</p>
            <div className="actions">
              <a className="btn" href="#inquiry">導入・料金を相談する <span>→</span></a>
              <a className="btn ghost btn-white" href="#examples">できることを画面で見る <span>↓</span></a>
            </div>
            <p className="hero-note">シフト・伝票・顧客・給与を、ひとつに。</p>
          </div>
          <div className="wrap hero-bottom"><span>DESIGNED FOR THE NIGHT.</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>
        <div className="intro-strip"><div className="wrap"><strong>夜の現場に、ひとつの流れを。</strong><p>キャバクラ / ラウンジ / スナック / ガールズバー</p></div></div>

        <section className="section wrap" id="features">
          <div className="section-head"><div><p className="eyebrow">01 / ALL CONNECTED</p><h2>営業から締めまで、<br />つながる店舗管理。</h2></div><p>日々の打刻と伝票を、給与と振り返りへ。<br />同じデータで、店の一日を支えます。</p></div>
          <div className="workflow">
            {WORKFLOW.map((w) => <article key={w.no}><span className="number">{w.no}</span><h3>{w.h}</h3><p>{w.p[0]}<br />{w.p[1]}</p><small>{w.small}</small></article>)}
          </div>
          <details className="details-row"><summary>対応している機能を詳しく見る</summary>
            <div className="detail-grid">{DETAIL.map(([h, p]) => <div key={h}><h4>{h}</h4><p>{p}</p></div>)}</div>
          </details>
          <details className="details-row"><summary>開発中の機能について</summary>
            <p>以下は現在のデモでは利用できません。提供時期はお問い合わせください。</p><p>{IN_DEV}</p>
          </details>
        </section>

        <section className="section examples wrap" id="examples">
          <div className="section-head"><div><p className="eyebrow">02 / SEE WHAT YOU CAN DO</p><h2>お店の仕事を、<br />画面でイメージ。</h2></div><p>NOXの操作画面で、使い方を具体的に。<br />画像を選ぶと拡大できます。</p></div>
          {EXAMPLES.map((e) => (
            <article className="example" key={e.no}>
              <div className="example-copy"><span className="eyebrow">{e.no}</span><h3>{e.h[0]}<br />{e.h[1]}</h3><p>{e.p[0]}<br />{e.p[1]}</p><ul>{e.li.map((l) => <li key={l}>{l}</li>)}</ul></div>
              <ScreenZoom src={e.src} alt={e.alt} caption={e.caption} crop={e.crop} />
            </article>
          ))}
          <div className="feature-consult"><div><h3>あなたの店のルールでも使える？</h3><p>時給・バック・締め日の運用について、まずはご相談ください。</p></div><a className="btn" href="#inquiry">自店の運用について相談する <span>→</span></a></div>
        </section>

        <section className="section wrap">
          <div className="section-head"><div><p className="eyebrow">03 / THE RIGHT VIEW</p><h2>それぞれの立場に、必要な画面を。</h2></div></div>
          <div className="roles">{ROLES.map((r) => <article key={r.name}><small>{r.dev}</small><h3>{r.name}</h3><p>{r.body}</p></article>)}</div>
          <div className="faq">
            <div><p className="eyebrow">QUESTIONS &amp; ANSWERS</p><h2>導入の前に。</h2></div>
            <div>{FAQ.map(([q, ps]) => <details key={q}><summary>{q}</summary>{ps.map((p) => <p key={p}>{p}</p>)}</details>)}</div>
          </div>
        </section>

        <section className="contact" id="contact"><div className="wrap">
          <div>
            <p className="eyebrow">LET’S TALK ABOUT YOUR STORE</p><h2>あなたの店に合う運用を、一緒に。</h2>
            <div className="price"><span>1店舗あたりの月額料金</span><p><strong>{LP_PRICE_MONTHLY.toLocaleString("en-US")}</strong><b>円／月（税込）</b></p><small className="annual-note">年払いの割引もあります</small></div>
            <p>導入・運用のご相談は、下のフォームから。</p>
          </div>
          <div className="contact-action"><a className="btn" href="#inquiry">フォームで問い合わせる <span>↓</span></a><small>{SUPPORT_EMAIL}</small></div>
        </div></section>

        <section className="section wrap inquiry" id="inquiry">
          <div className="section-head"><div><p className="eyebrow">CONTACT</p><h2>導入について相談する。</h2></div><p>店舗の運用や気になることをお聞かせください。</p></div>
          <p className="mock-notice">プレビュー用フォームです。入力内容は送信・保存されません。</p>
          <InquiryForm />
        </section>

        <section className="section demo-section" id="stores"><div className="wrap">
          <div className="section-head"><div><p className="eyebrow">OPTIONAL / TRY NOX</p><h2>実際に操作して確かめたい方へ。</h2></div><span className="login-free">登録不要 · 6つの店舗</span></div>
          <details className="demo-picker"><summary>6つのデモ店舗から選ぶ</summary>
            <div className="store-grid">
              {STORES.map((s) => (
                <article className="store" key={s.key} data-lp-store={s.key}>
                  <div className="store-top"><span>{s.kind}</span><span className="number">{s.no}</span></div>
                  <h3>{s.label}</h3>
                  <p className="catch">{s.catch}</p><p>{s.sub}</p><span className="tag">{s.tag}</span>
                  <details><summary>設定の詳細</summary><p>{s.detail}</p></details>
                  <div className="store-actions">
                    <Link href={`/demo?store=${s.key}&role=manager`}>店長でログイン <span>↗</span></Link>
                    <Link href={`/demo?store=${s.key}&role=cast`}>キャストでログイン <span>↗</span></Link>
                  </div>
                </article>
              ))}
            </div>
          </details>
          <p className="demo-note"><strong>デモは{DEMO_RESET_TIME_JA}に初期化。</strong> 入力内容は他の閲覧者にも見えます。個人情報は入力しないでください。</p>
          <details className="demo-rules"><summary>デモ利用について</summary>
            <p>店と役割を選び、利用規約に同意すると入れます。全店舗に「体験入店」の待遇と、期限付き保証時給のキャスト1名が設定されています。</p>
            <ul>{DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}</ul>
          </details>
        </div></section>
      </main>
      <footer><div className="wrap">
        <div><BrandLogo height={26} /><small>運営 {COMPANY_NAME}</small></div>
        <small><Link href={TOKUSHOHO_HREF}>{TOKUSHOHO_TITLE}</Link>　　{privacyPublishedOf() && <><Link href={PRIVACY_PATH} data-privacy-link="lp">プライバシーポリシー</Link>　　</>}<Link href="/demo">デモ店舗一覧 ↗</Link>　　© 2026 {COMPANY_NAME}</small>
      </div></footer>
    </div>
  );
}
