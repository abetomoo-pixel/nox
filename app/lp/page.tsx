import type { Metadata } from "next";
import { Fragment, type CSSProperties } from "react";
import BrandLogo from "@/components/ui/brand-logo"; // ★便 SH-UI-a A-2: ロゴ（Concept 2 改）
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import * as t from "@/lib/nox/ui/theme";
import { DEMO_TERMS } from "@/lib/nox/demo/terms"; // ★正本（"use client" の demo-terms.tsx から値は読めない）
import { DEMO_RESET_TIME_JA, DEMO_STORES, DEMO_STORE_LABEL, type DemoStore } from "@/lib/nox/demo/seed";

// ★裁定344（便 N1013b・2026-10-13）: LP＝/lp（Next.js 内の static route・/demo と同じ土台）。
// ★便 M5 M-41（2026-10-30）: 正本＝LP モック v3（docs/handoff/mock/nox_lp_mock_v3.html・文言は逐語）。
//   構成＝ヒーロー（h1「伝票の1杯から、月末の給与まで。」・主 CTA「デモ店舗を選ぶ」＝/demo・「メールで問い合わせる」＝mailto・店長／キャストの画面の静的な絵）
//   → 6 店カード（モックの順＝ACE・LUNA・NOIR・MUSE・NEST・LILY・上段＝public/lp/<store>.mp4 → <store>.jpg → ポスター枠・仕様の行・「オーナーで試す」「店長で試す」＝/demo?store=&role=）
//   → 帯（DEMO_RESET_TIME_JA と DEMO_TERMS の逐語＝文言の出所は /demo と同じ 1 本）→ 4 つの立場 → できること（営業中／締め／振り返り）→ これから加わる機能
//   → 雇用・委託 → よくある質問（details）→ 導入と料金のご相談（mailto）→ フッター。
//   /terms は L6（利用規約の文言）待ちで非公開＝リンクを出さない。公開（index）はローンチ前ゲートの後＝それまで noindex。スマホは 1 列（auto-fill／auto-fit の grid）。
//   絞り込みのチップは見た目だけ（client component を置かない＝static のまま）。
export const metadata: Metadata = {
  title: "NOX｜ナイトワーク店舗の管理システム",
  description: "キャバクラ・ラウンジ・スナック・ガールズバーなど、ナイトワーク店舗のための管理システム。出退勤とシフト、レジと顧客台帳、指名・同伴、ドリンクバック、時給スライド、日払いまでを1つにまとめ、キャストごとの給与をプレビューで確かめられます。ログイン不要のデモ店舗が6つ。",
  robots: { index: false, follow: false }, // ★公開ゲート（#75〜#81・L6・起票97／98）の後に index へ
  openGraph: { images: ["/lp/og.jpg"] }, // ★便 M5: OG 画像＝public/lp/og.jpg（Agoora が後日置く・meta だけ先に）
};
export const dynamic = "force-static";

/** 料金・お問い合わせの導線（器なし＝mailto・仮決め＝Agoora 記入で差替え）。★page.tsx から export しない（Next の Page export 検査＝build 失敗） */
const LP_CONTACT_MAILTO = "mailto:info@agoora.co.jp?subject=NOX%20%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B";
const LP_CONTACT_MAIL = "info@agoora.co.jp";

/** 動画＝public/lp/<store>.mp4（1 本 ≤4MB・H.264・音なし・字幕焼き込み）。ビルド時に有無を見る（static）＝無い店は静止画→ポスター枠 */
function videoSrcOf(store: string): string | null {
  const p = path.join(process.cwd(), "public", "lp", `${store}.mp4`);
  return fs.existsSync(p) ? `/lp/${store}.mp4` : null;
}
/** 静止画＝public/lp/<store>.jpg（見せ場の画面・1280×800）。ビルド時に有無を見る（static）＝無い店はポスター枠。動画がある店は poster に使う */
function imageSrcOf(store: string): string | null {
  const p = path.join(process.cwd(), "public", "lp", `${store}.jpg`);
  return fs.existsSync(p) ? `/lp/${store}.jpg` : null;
}

/** モック v3 の 6 店カードの文言（逐語）。spec は表示順のまま。primary＝先に出すボタンの役割（MUSE／NEST／LILY は店長が先） */
const LP_STORE_COPY: Record<DemoStore, { title: string; kind: string; point: string; spec: readonly (readonly [string, string])[]; alt: string; caption: string; primary: "owner" | "manager" }> = {
  ace: {
    title: "CLUB ACE", kind: "高単価のキャバクラ", point: "月の売上に応じて、時給が3段階で上がる店。",
    spec: [["時給スライド", "売上・3段"], ["判定", "月ごと"], ["バック", "本指名・場内・同伴、商品ごと"], ["ノルマ", "売上・指名"], ["送り", "実費（退勤時に発行）"]],
    alt: "CLUB ACE の給与明細。月の売上から時給の段が決まる", caption: "給与明細（オーナーの画面）", primary: "owner",
  },
  luna: {
    title: "LUNA", kind: "キャバクラ", point: "月の前半と後半で、同じキャストの時給が変わる店。",
    spec: [["時給スライド", "売上"], ["判定", "半月ごと"], ["バック", "ドリンク（本指名・場内・フリーで率が違う）"], ["ノルマ", "出勤日数・同伴"], ["送り", "定額"]],
    alt: "LUNA の給与明細。前半・後半で時給が変わる", caption: "給与明細（オーナーの画面）", primary: "owner",
  },
  noir: {
    title: "NOIR", kind: "ランク制のラウンジ", point: "本指名の件数で時給が上がる店。対象はS・Aランクのキャストだけ。",
    spec: [["時給スライド", "ポイント"], ["判定", "月ごと・本指名の件数"], ["バック", "商品ポイント、指名バック"], ["ノルマ", "指名"], ["送り", "なし"]],
    alt: "NOIR の給与一覧。本指名の件数で時給が上がり、ランク外はスライド対象外", caption: "給与一覧（オーナーの画面）", primary: "owner",
  },
  muse: {
    title: "MUSE", kind: "キャバクラ", point: "場内から本指名に切り替えたとき、出ていたドリンクの扱いまで選べる店。",
    spec: [["時給スライド", "売上とポイントの併用"], ["判定", "月ごと"], ["バック", "売上歩合"], ["ノルマ", "出勤日数・同伴・売上・指名"], ["送り", "実費"]],
    alt: "MUSE のレジ。場内から本指名への切り替え", caption: "レジ（店長の画面）", primary: "manager",
  },
  nest: {
    title: "NEST", kind: "スナック", point: "キャストは休み希望だけ出し、店長がシフトをまとめて組む店。",
    spec: [["時給スライド", "なし"], ["時給", "固定時給、期限付きの保証時給"], ["ノルマ", "なし"], ["送り", "定額"]],
    alt: "NEST のマイページ。休み希望の提出", caption: "マイページ（キャストのスマホ）", primary: "manager",
  },
  lily: {
    title: "LILY", kind: "ガールズバー", point: "雇用のキャストで、確定したシフトを基準に時給と日払いを見る店。",
    spec: [["時給スライド", "なし"], ["時給", "確定シフト基準、日払いあり"], ["バック", "達成ボーナス"], ["ノルマ", "出勤日数"], ["送り", "店負担"]],
    alt: "LILY の給与明細。確定シフト基準の時給と日払い", caption: "給与明細（店長の画面）", primary: "manager",
  },
};
/** カードの並び＝モック v3 の順（DEMO_STORES の並び＝/demo の 5 択の順とは別・6 店は同じ集合） */
const LP_ORDER: readonly DemoStore[] = ["ace", "luna", "noir", "muse", "nest", "lily"];
const STORES = LP_ORDER.map((s) => ({ key: s, label: DEMO_STORE_LABEL[s], ...LP_STORE_COPY[s], video: videoSrcOf(s), image: imageSrcOf(s) }));

/** 絞り込みのチップ（モック v3）＝見た目だけ（static・先頭「すべて」が選択状態） */
const LP_CHIPS: readonly string[] = ["すべて", "売上で時給が上がる", "指名で時給が上がる", "半月で判定する", "時給は固定", "日払いがある", "休み希望だけ集める"];

const LP_ROLES: readonly { name: string; dev: string; body: string }[] = [
  { name: "オーナー", dev: "PC・iPad", body: "待遇プランや店の設定を決め、給与、分析、月報まで店全体を見ます。" },
  { name: "店長", dev: "PC・iPad", body: "シフトを組み、その日の出退勤とレジの伝票を回します。" },
  { name: "スタッフ（ホール・店長）", dev: "iPad・PC", body: "レジ、キャストの打刻の代行、当日のシフト配置を受け持ちます。給与や待遇の設定には触れません。" },
  { name: "キャスト", dev: "スマホ", body: "マイページで打刻、シフト希望、給与明細、ノルマの進み具合、自分の順位を見ます。" },
];

const LP_FLOW: readonly { title: string; when: string; items: readonly (readonly [string, string])[] }[] = [
  { title: "営業中", when: "店を開けてから閉めるまで", items: [
    ["出退勤・シフト", "希望の提出から、店長の配置、キャストの確認まで。"],
    ["レジ（伝票）", "伝票に指名と同伴を付けて記録します。"],
    ["指名・同伴・ドリンクバック", "本指名・場内・フリーで率を分けられます。"],
    ["顧客台帳", "伝票にお客様を紐づけると、来店履歴・指名の区分・利用額がたまります。"],
    ["在庫・ボトルキープ", "ボトルとドリンクの在庫、お客様ごとのキープを伝票と一緒に動かします。"],
    ["店に置いたiPad（キオスク）", "出退勤・レジ・シフト・在庫・日報をスタッフとキャストが共用します。解除は人を選んでPIN。"],
  ] },
  { title: "締め", when: "日払いの日と、月末", items: [
    ["待遇プラン・時給スライド", "売上やポイントを基準に、段ごとの時給を決めます。"],
    ["給与・報酬のプレビュー", "キャストごとの明細を、締める前に確かめられます。"],
    ["日払い・前借り", "支払った分を記録し、明細で確かめられます。"],
    ["売掛・領収書", "伝票ごとの売掛を記録できます。領収書は画面で発行し、そのまま印刷やPDF保存ができます。"],
    ["日報・レジ締め", "その日の売上・現金・カード・売掛を締め、釣銭準備金まで記録します。"],
    ["スタッフの勤怠・報酬", "スタッフ・店長の時給や月給も、打刻から見込みの報酬まで同じ画面で。"],
  ] },
  { title: "振り返り", when: "週ごと、月ごと", items: [
    ["ノルマ", "出勤日数・同伴・売上・指名から、店で使う軸を選べます。"],
    ["ランキング", "キャストの画面には自分の順位だけを出せます。"],
    ["分析・月報", "月ごとの数字をまとめて見られます。"],
    ["監査ログ", "誰がいつ何を変えたかが残ります。伝票の修正や設定の変更も追えます。"],
  ] },
];

const LP_ROADMAP: readonly { title: string; items: readonly string[] }[] = [
  { title: "営業中", items: ["卓のまとめ・分割", "キャストからの新規顧客の登録", "持ち込みボトルのキープ", "レシートプリンターへの出力"] },
  { title: "締め", items: ["スタッフの勤怠の修正・確定", "帯ごとの歩合率、達成ボーナスの多段設定", "粗利を基準にしたスライド", "内税・外税の変換"] },
  { title: "連絡・その他", items: ["LINE への通知（シフト確定・お知らせ）", "店負担の売掛の日報集計", "給与計算の自動確定"] },
];

const LP_CONTRACT_NOTES: readonly string[] = [
  "NOX は契約区分を記録するもので、労働者性や所得区分を判定するものではありません。",
  "業務委託として登録しても、法令上の労働者性や税務上の所得区分が確定するものではありません。",
  "源泉徴収の扱いは、税理士などの専門家にご確認ください。",
];

/** 絵（ヒーロー右）＝店長のシフト表の縮図。文字だけの静的な表（画像なし・aria-hidden） */
const LP_HERO_SHIFT: readonly (readonly [string, readonly string[]])[] = [
  ["あやか", ["20-1", "", "20-1", "", "21-2", "21-2", ""]],
  ["みお", ["", "20-24", "20-24", "", "20-1", "", ""]],
  ["ゆい", ["21-1", "", "", "21-1", "21-2", "21-2", ""]],
  ["さくら", ["", "", "20-1", "20-1", "", "20-2", ""]],
  ["りな", ["20-24", "20-24", "", "", "21-1", "", ""]],
  ["えれな", ["", "21-1", "", "21-1", "", "21-2", ""]],
];
const LP_HERO_DOW = ["月", "火", "水", "木", "金", "土", "日"] as const;

const secH: CSSProperties = { ...t.pheadH1, fontSize: 22, lineHeight: 1.4, margin: "0 0 10px" };
const secLead: CSSProperties = { ...t.pheadP, fontSize: 13.5, lineHeight: 1.8, maxWidth: 640, margin: "0 0 18px", color: "var(--ink)" };
const muted: CSSProperties = { fontSize: 12.5, color: "var(--sub)", margin: 0 };
const section: CSSProperties = { marginBottom: 40 };
const tile: CSSProperties = { ...t.card, margin: 0 };
const btn: CSSProperties = { padding: "10px 18px", textDecoration: "none" };
const btnSmall: CSSProperties = { ...t.btnSm, padding: "8px 14px", textDecoration: "none" };

export default function LpPage() {
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={{ ...t.wrap, maxWidth: 960, margin: "0 auto", padding: "28px 16px 40px" }}>
        {/* ヒーロー */}
        <header style={{ marginBottom: 40 }}>
          <Link href="/lp" aria-label="ホームへ" className="nox-brandlink" data-brand-home="/lp"><BrandLogo height={40} /></Link>{/* ★便 SH-UI-a A-2: ロゴ・★便 SH-UI-b2 B2-2: /lp の先頭へ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, alignItems: "center", marginTop: 18 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ ...t.pheadH1, fontSize: 30, lineHeight: 1.3, margin: "0 0 16px" }}>伝票の1杯から、<br />月末の給与まで。</h1>
              <p style={{ ...secLead, margin: "0 0 12px" }}>
                キャバクラ・ラウンジ・スナック・ガールズバーなど、ナイトワーク店舗のための管理システムです。出退勤とシフト、レジと顧客台帳、指名・同伴、ドリンクバック、時給スライド、日払いまでを1つにまとめ、キャストごとの給与をプレビューで確かめられます。
              </p>
              <p style={{ ...secLead, margin: "0 0 18px" }}>業態を選べば、初期設定は9ステップ。席・料金・メニュー・待遇の初期値が入った状態から直せるので、その日から使い始められます。</p>
              <div className="nox-actions" style={{ justifyContent: "flex-start", gap: 10, marginBottom: 14 }}>
                <Link href="/demo" style={{ ...t.btnGold, ...btn }}>デモ店舗を選ぶ</Link>
                <a href={LP_CONTACT_MAILTO} style={{ ...t.btnGhost, ...btn }}>メールで問い合わせる</a>
              </div>
              <p style={{ ...muted, borderLeft: "3px solid var(--ink)", paddingLeft: 10, lineHeight: 1.7 }}>デモ環境・{DEMO_RESET_TIME_JA}に初期化。入力内容は他の閲覧者にも見えます。個人情報を入力しないでください</p>
            </div>
            {/* 絵＝店長のシフト表とキャストのマイページ（文字だけの静的なカード・画像なし） */}
            <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }} data-lp-hero-art="1">
              <div className="nox-cardtop" style={{ ...tile, padding: 14 }}>
                <div style={{ ...muted, fontSize: 11.5, marginBottom: 8 }}>シフト　店長の画面</div>
                <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))", gap: 3, fontSize: 10 }}>
                  <span />
                  {LP_HERO_DOW.map((d) => <span key={d} style={{ textAlign: "center", color: "var(--sub)" }}>{d}</span>)}
                  {LP_HERO_SHIFT.map(([name, cells]) => (
                    <Fragment key={name}>
                      <span style={{ color: "var(--sub)", whiteSpace: "nowrap", overflow: "hidden" }}>{name}</span>
                      {cells.map((c, i) => (
                        <span key={i} style={{ height: 22, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", background: c ? "var(--goldface2)" : "rgba(255,255,255,.04)", color: c ? "var(--ink)" : "var(--sub)" }}>{c}</span>
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="nox-cardtop" style={{ ...tile, padding: 14, maxWidth: 260 }}>
                <div style={{ ...muted, fontSize: 11.5, marginBottom: 8 }}>マイページ　キャストの画面</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11.5 }}>
                  <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 10px" }}>今日のシフト<strong style={{ display: "block", fontSize: 15 }}>20:00 – 1:00</strong></div>
                  <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 10px" }}>今月の給与プレビュー<strong style={{ display: "block", fontSize: 15 }} className="num">¥186,400</strong></div>
                  <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 10px" }}>ノルマ　同伴<strong style={{ display: "block", fontSize: 15 }}>2 / 4</strong>
                    <div style={{ height: 5, background: "var(--line)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: "55%", background: "var(--ink)" }} /></div>
                  </div>
                  <span style={{ ...t.btnGold, ...t.btnSm, justifyContent: "center" }}>出勤する</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 6 店カード */}
        <section aria-labelledby="lp-stores-h" style={section} id="stores">
          <h2 id="lp-stores-h" style={secH}>給与の決め方が違う、6つのデモ店舗</h2>
          <p style={secLead}>時給スライドの基準も、判定の区切りも、バックやノルマの決め方も、店ごとに変えてあります。自分の店に近いところに入って、実際の画面を触ってください。ログインは要りません。</p>
          {/* 絞り込みのチップ＝見た目だけ（client component を置かない） */}
          <ul aria-label="仕組みの種類" style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: "0 0 14px", padding: 0 }} data-lp-chips="1">
            {LP_CHIPS.map((c, i) => (
              <li key={c} style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line2)", background: i === 0 ? "var(--primary)" : "transparent", color: i === 0 ? "#fff" : "var(--ink)", fontWeight: i === 0 ? 800 : 500 }}>{c}</li>
            ))}
          </ul>

          {/* 帯＝/demo と同じ文言（DEMO_RESET_TIME_JA・DEMO_TERMS の逐語） */}
          <div aria-labelledby="lp-band-h" className="nox-cardtop" style={{ ...t.card, marginBottom: 12 }} role="region">
            <h3 id="lp-band-h" style={{ ...t.cardTitle, margin: "0 0 6px" }}>デモは{DEMO_RESET_TIME_JA}に初期化されます</h3>
            <p style={{ ...muted, margin: "0 0 8px" }}>店と役割を選ぶだけで、ログインした状態の画面が開きます（パスワードやメールの入力はありません）。入場前に次の規約へ同意していただきます。</p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink)" }}>
              {DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
          <p style={{ ...muted, margin: "0 0 18px" }}>どの店にも「体験入店」の待遇があり、1名が期限付きの保証時給で入っています。</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {STORES.map((s) => (
              <article key={s.key} className="nox-cardtop" style={{ ...tile, display: "flex", flexDirection: "column", gap: 8 }} data-store={s.key}>
                {s.video ? (
                  <video src={s.video} poster={s.image ?? undefined} controls muted playsInline preload="none" style={{ width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 8 }} />
                ) : s.image ? (
                  <figure style={{ margin: 0, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 静的な見せ場の画面（public/lp・外部ドメインなし・static export） */}
                    <img src={s.image} alt={s.alt} loading="lazy" width={1280} height={800} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "16 / 9", objectFit: "cover", objectPosition: "top left", borderRadius: 8, background: "#000" }} />
                    <figcaption style={{ position: "absolute", bottom: 8, left: 10, fontSize: 11, color: "var(--sub)", background: "rgba(0,0,0,.55)", padding: "2px 8px", borderRadius: 6 }}>{s.caption}</figcaption>
                  </figure>
                ) : (
                  <div aria-label={`${s.label.name} の紹介画像`} data-poster="1"
                    style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--goldface2)", color: "var(--sub)", fontSize: 12 }}>
                    {s.label.name}（{s.label.biz}）
                  </div>
                )}
                <h3 style={{ ...t.cardTitle, fontSize: 18, letterSpacing: 1, margin: 0 }}>{s.title}</h3>
                <p style={muted}>{s.kind}</p>
                <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6, margin: 0 }}>{s.point}</p>
                <dl style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "3px 12px", fontSize: 12, margin: "4px 0", color: "var(--ink)", flex: 1 }}>
                  {s.spec.map(([k, v]) => (
                    <Fragment key={k}>
                      <dt style={{ color: "var(--sub)" }}>{k}</dt>
                      <dd style={{ margin: 0 }}>{v}</dd>
                    </Fragment>
                  ))}
                </dl>
                <div className="nox-actions" style={{ marginTop: "auto", paddingTop: 4 }}>
                  {s.primary === "owner" ? (
                    <>
                      <Link href={`/demo?store=${s.key}&role=owner`} style={{ ...t.btnGold, ...btnSmall }}>オーナーで試す</Link>
                      <Link href={`/demo?store=${s.key}&role=manager`} style={{ ...t.btnGhost, ...btnSmall }}>店長で試す</Link>
                    </>
                  ) : (
                    <>
                      <Link href={`/demo?store=${s.key}&role=manager`} style={{ ...t.btnGold, ...btnSmall }}>店長で試す</Link>
                      <Link href={`/demo?store=${s.key}&role=owner`} style={{ ...t.btnGhost, ...btnSmall }}>オーナーで試す</Link>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 4 つの立場 */}
        <section aria-labelledby="lp-roles-h" style={section}>
          <h2 id="lp-roles-h" style={secH}>立場ごとに、見える画面が変わります</h2>
          <p style={secLead}>オーナー、店長、スタッフ、キャストの4つの立場があり、それぞれに必要な画面だけが出ます。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {LP_ROLES.map((r) => (
              <div key={r.name} className="nox-cardtop" style={tile}>
                <h3 style={{ ...t.cardTitle, fontSize: 15, margin: "0 0 2px" }}>{r.name}</h3>
                <p style={{ ...muted, fontSize: 11.5, marginBottom: 8 }}>{r.dev}</p>
                <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0, color: "var(--ink)" }}>{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* できること */}
        <section aria-labelledby="lp-features-h" style={section} id="features">
          <h2 id="lp-features-h" style={secH}>営業中の入力が、そのまま締めにつながる</h2>
          <p style={secLead}>その日の打刻や伝票が、月末の給与と振り返りまで同じデータで流れていきます。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
            {LP_FLOW.map((col) => (
              <div key={col.title} style={{ minWidth: 0 }}>
                <h3 style={{ ...t.cardTitle, fontSize: 16, margin: "0 0 2px", paddingTop: 12, borderTop: "1px solid var(--line2)" }}>{col.title}</h3>
                <p style={{ ...muted, fontSize: 12, marginBottom: 8 }}>{col.when}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {col.items.map(([k, v]) => (
                    <li key={k} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5, fontWeight: 650 }}>
                      {k}<small style={{ display: "block", color: "var(--sub)", fontSize: 12, fontWeight: 400, lineHeight: 1.6 }}>{v}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* これから加わる機能 */}
        <section aria-labelledby="lp-roadmap-h" style={section} id="roadmap">
          <h2 id="lp-roadmap-h" style={secH}>これから加わる機能</h2>
          <p style={secLead}>下の項目は開発中です。提供時期はお問い合わせの際にご案内します。現在のデモ店舗では触れません。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {LP_ROADMAP.map((g) => (
              <div key={g.title} className="nox-cardtop" style={tile}>
                <h3 style={{ ...t.cardTitle, fontSize: 14, margin: "0 0 6px" }}>{g.title}</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: "var(--sub)" }}>
                  {g.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 雇用・委託 */}
        <section aria-labelledby="lp-contract-h" style={section}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>
              <h2 id="lp-contract-h" style={secH}>雇用のキャストも、<br />業務委託のキャストも</h2>
              <p style={{ ...secLead, margin: 0 }}>キャストごとに契約区分と精算方式を記録し、それに応じた源泉のプレビューと控除日数を明細に表示します。同じ店に両方のキャストがいても、同じ画面で扱えます。</p>
            </div>
            <div className="nox-cardtop" style={{ ...tile, fontSize: 12, lineHeight: 1.7, color: "var(--sub)" }}>
              {LP_CONTRACT_NOTES.map((n) => <p key={n} style={{ margin: "0 0 8px" }}>{n}</p>)}
            </div>
          </div>
        </section>

        {/* よくある質問 */}
        <section aria-labelledby="lp-faq-h" style={section}>
          <h2 id="lp-faq-h" style={secH}>よくある質問</h2>
          <div style={{ maxWidth: 760 }}>
            {([
              ["デモを触るのに登録は要りますか", "要りません。店と立場を選び、利用規約への同意にチェックすると入れます。"],
              ["デモに入力した内容はどうなりますか", `デモ環境・${DEMO_RESET_TIME_JA}に初期化。入力内容は他の閲覧者にも見えます。個人情報を入力しないでください`],
              ["どの端末で使えますか", "キャストはスマホのブラウザからマイページを使います。店側はPCやiPadのブラウザから使います。レジはiPadでの利用を想定しています。店に置いたiPadからは、出退勤・レジ・シフト・在庫・日報を使えます。"],
              ["導入にどれくらいかかりますか", "オーナーの方に招待メールをお送りし、パスワードを決めると初期設定（9ステップ）が始まります。業態を選ぶと席・料金・メニュー・待遇の初期値が入るので、自店に合わせて直すだけです。途中で閉じても続きから再開できます。"],
              ["料金はいくらですか", "料金はお問い合わせください。店の運用をうかがってご案内します。"],
            ] as const).map(([q, a]) => (
              <details key={q} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>{q}</summary>
                <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.8, color: "var(--ink)" }}>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 導入と料金のご相談＝器なし（価格表なし）＝問い合わせ導線（金額確定後の料金行はモックのコメントのまま出さない） */}
        <section aria-labelledby="lp-price-h" className="nox-cardtop" style={{ ...t.card, marginBottom: 26 }} id="contact">
          <h2 id="lp-price-h" style={{ ...secH, fontSize: 18 }}>導入と料金のご相談</h2>
          <p style={{ ...muted, margin: "0 0 6px" }}>料金はお問い合わせください。店の運用をうかがってご案内します。</p>
          <p style={{ ...muted, fontSize: 13.5, margin: "0 0 12px", color: "var(--ink)" }} className="num">{LP_CONTACT_MAIL}</p>
          <div className="nox-actions" style={{ justifyContent: "flex-start" }}>
            <a href={LP_CONTACT_MAILTO} style={{ ...t.btnGold, ...btn }}>メールで問い合わせる</a>
          </div>
        </section>

        <footer style={{ fontSize: 11, color: "var(--v2-muted)", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <span>NOX　運営　株式会社Agoora</span>
          <span style={{ display: "flex", gap: 12 }}>
            <Link href="/demo" className="nox-link">デモ</Link>
            <span>© 2026 Agoora</span>
          </span>
          {/* /terms は L6（利用規約の文言）が来るまで非公開＝リンクを出さない（裁定344） */}
        </footer>
      </div>
    </div>
  );
}
