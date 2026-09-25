"use client";

import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { hubCountOf, hubStatusOf, type HubLoadState } from "@/lib/nox/ui/hub-count"; // ★Z152: 取得前は「—」・失敗は「取得できませんでした」
import {
  fetchProducts, fetchProductCategories, fetchStockTotals,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

// ★レーン②: 商品ハブ／商品リスト／商品フォームは /master/products へ移設した。
// ★DP1 P1（2026-08-21・裁定 DP1-②）: 残っていた3ビュー（seat / hours / system）も実ルート化した
//   （/master/seats ・ /master/business-hours ・ /master/system）。
//   これにより **本ファイルはハブ（マスタ概要）専任**になり、以下を撤去した:
//     - `MasterView` 型・`view` state・`VIEW_TITLE`・`← マスタ概要` の backlink（.nox-secbar）
//     - 席区画（KPI4・検索/種別フィルタ・一覧表・編集フォーム・saveSeat＝set_seat）→ seats/seats-board.tsx へ
//     - `{view === "hours"} / {view === "system"}` と `panels` prop → 各実ルートの page.tsx へ
//     - それに伴い不要になった props（storeId / isManagerUp / isOwner / panels）と
//       席フォームの state 7本・`msg`（ハブに書込操作が無くなったため Toast ごと撤去）
//   ★ハブが読むデータ（商品・カテゴリ・在庫・席の件数）は従来どおりここで取得する＝KPI と
//     カードの件数表示が使うため。seats も件数のみ使う（編集は /master/seats）。
type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };

// ★DP1 P1: 本部品は**ハブ（マスタ概要）専任**。表示単位への切替は URL 遷移だけになった
//   （全カードが href を持つ＝setView は無い）。
export default function MasterBoard() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  // 段0R その2: ハブカードの絞り込み（aaa .search）＝表示フィルタのみ・取得は不変
  const [hubSearch, setHubSearch] = useState("");
  const [stock, setStock] = useState<Record<string, number>>({});
  // ★便 U-2（2026-09-25・0152）: 紹介料の未払件数（referral_payouts.status='unpaid'・RLS owner／manager 自店＝cast 0 行）。count のみ（head）＝fetch +1
  const [unpaidRef, setUnpaidRef] = useState<number | null>(null);
  // ★Z152: 件数の取得状態＝取得完了前は数値を描かない（0 は実 0 だけ）。主取得（商品／カテゴリ／在庫／席）と紹介者の count は別々に持つ（片方の失敗で他を消さない）
  const [hubState, setHubState] = useState<HubLoadState>("loading");
  const [refState, setRefState] = useState<HubLoadState>("loading");

  // ★DP1 P1: このページはハブ（概要）のみになった。
  //   products / product_categories / stock_logs は「概要＝ダッシュボード」の
  //   KPI 4枚・低在庫アラート・カード件数が読む＝設計どおり残す（実体は各実ページ側）。
  //   seats も KPI「卓・席」とカードの件数表示が読む（編集は /master/seats）。
  const load = useCallback(async () => {
    try {
      const [ps, cats, st] = await Promise.all([
        fetchProducts(supabase), fetchProductCategories(supabase), fetchStockTotals(supabase),
      ]);
      const { data: ss, error: se } = await supabase.from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
      if (se) throw se;
      setProducts(ps);
      setCategories(cats);
      setSeats((ss ?? []) as Seat[]);
      setStock(st);
      setHubState("ok");
    } catch {
      setHubState("error"); // ★Z152: 失敗は「—」＋「取得できませんでした」（0 を描かない）
    }
    // ★U-2／Z152: 紹介者の未払件数は主取得と独立（失敗しても他の件数は出る）
    const { count: ur, error: re } = await supabase.from("referral_payouts").select("id", { count: "exact", head: true }).eq("status", "unpaid");
    if (re) { setRefState("error"); } else { setUnpaidRef(ur ?? 0); setRefState("ok"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── 段0R その2: aaa 基準シェルのハブ層（presentation-only）──
  //   ★カードは既存パネルへのページ内アンカーで、パネルの中身・機能・RPC は一切変えていない。
  //   ★aaa にあって実在しない項目（税率・Wi-Fi/GPS・権限ロール・変更履歴）は作らず、
  //     実在するパネル（商品／カテゴリ／在庫／席／待遇プラン／スタッフ）へ対応づけた。
  const activeProds = products.filter((p) => p.is_active).length;
  const lowStock = products.filter((p) => p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)).length;
  const activeSeats = seats.filter((x) => x.is_active).length;
  const hubQ = hubSearch.trim().toLowerCase();
  // ★DP1 P1: **全カードが href を持つ**（席・営業時間・スタッフ/システムの3枚を実ページ化＝
  //   view 切替のカードはゼロになった）。カード種別の分岐そのものを型から落とす。
  const HUBS: Array<{ sec: string; secDesc: string; cards: Array<{ href: string; id: string; icon: string; count: string; title: string; desc: string; status: string; tone: string }> }> = [
    {
      sec: "商品・料金", secDesc: "レジ・会計で利用する項目",
      cards: [
        { href: "/master/products", id: "m-prod", icon: "◇", count: hubCountOf(hubState, products.length, "件").text, title: "商品マスター",
          desc: "ドリンク、シャンパン、ボトル、フード、在庫数、発注基準を管理。",
          status: hubStatusOf(hubState, lowStock > 0 ? `● ${lowStock}件 要補充` : "● 在庫は基準内"), tone: hubState === "ok" && lowStock > 0 ? "ng" : hubState === "error" ? "mute" : "" },
        { href: "/master/categories", id: "m-cat", icon: "▤", count: hubCountOf(hubState, categories.length, "件").text, title: "商品カテゴリ",
          desc: "レジのタイル見出しになる分類。並び順と有効/無効を管理。",
          status: hubStatusOf(hubState, categories.length > 0 ? "● 全件有効" : "● 未登録"), tone: hubState !== "ok" || categories.length === 0 ? "mute" : "" },
        // ★N3（マスタ v3・S 系「既存」のみ）: カード文言・群名・アイコンを v3 モック逐語へ。
        //   v3 の「利用機能」カード（S4）は N3 時点では器なしで作らなかった → C層①（mig0135）で器ができたため
        //   「店舗・運用」群に「機能の公開」として追加した。裁定120 の Danger 帯・要補充カードは不変。
        { href: "/master/stock", id: "m-stock", icon: "▣", count: "追記のみ", title: "在庫",
          desc: "締め時点の記録と入出庫の履歴。売上による減算は会計から自動。", status: "● 記録可", tone: "" },
        { href: "/master/pricing", id: "m-pricing", icon: "¥", count: "3タブ", title: "料金設定",
          desc: "時間帯・席種・曜日の料金ルール、指名料金、基本料金、会計ルールを設定。", status: "● 有効", tone: "" },
      ],
    },
    {
      sec: "キャスト・報酬", secDesc: "給与計算とキャスト運用の設定",
      cards: [
        { href: "/master/cast-comp/plan", id: "m-sim", icon: "▲", count: "試算", title: "待遇プラン・報酬シミュレーター",
          desc: "基本時給、スライド、指名バック、報酬をプラン単位で管理。", status: "● 試算可", tone: "" },
        { href: "/master/cast-comp/deduction", id: "m-deduct", icon: "▽", count: "控除", title: "控除・送りの設定",
          desc: "固定控除の種別と金額、送り実費/一律の扱いを管理。", status: "● 有効", tone: "" },
        { href: "/master/cast-comp/norma", id: "m-norm", icon: "◎", count: "ノルマ", title: "ノルマ設定",
          desc: "売上ノルマ、指名ノルマの採用可否と範囲を設定。", status: "● 設定可", tone: "" },
        { href: "/master/cast-comp/register", id: "m-castreg", icon: "◇", count: "会計権限", title: "キャスト会計の許可",
          desc: "キャスト本人がレジを使えるようにする設定。", status: "● 設定可", tone: "" },
        // ★便 U-2（2026-09-25）: 概要カードに無かった 2 枚を「キャスト・報酬」節へ（文言は既存タブ／ページ見出しから）
        { href: "/master/cast-comp/systems", id: "m-systems", icon: "◈", count: "9制度", title: "報酬制度",
          desc: "この店で使う制度を選びます。OFF にした制度は待遇プラン・控除・商品・マイページの該当する節が表示されなくなります。", status: "● 設定可", tone: "" },
        { href: "/master/referrers", id: "m-referrers", icon: "◇", count: "支払", title: "紹介者・紹介料",
          desc: "外部キャッチ／スタッフの紹介者と紹介料の支払を管理。",
          status: hubStatusOf(refState, (unpaidRef ?? 0) > 0 ? `● 未払 ${unpaidRef} 件` : "● 未払なし"), tone: refState === "ok" && (unpaidRef ?? 0) > 0 ? "warn" : refState === "error" ? "mute" : "" },
      ],
    },
    {
      sec: "店舗・運用", secDesc: "フロア・営業時間の設定",
      cards: [
        { href: "/master/seats", id: "m-seat", icon: "▦", count: hubCountOf(hubState, seats.length, "卓").text, title: "席・卓マスター",
          desc: "卓／カウンター／VIP の登録と並び順、稼働の有効切替。",
          status: hubStatusOf(hubState, `● 稼働可能 ${activeSeats}卓`), tone: hubState === "error" ? "mute" : "" },
        { href: "/master/business-hours", id: "m-hours", icon: "◔", count: "曜日別", title: "営業時間・定休日",
          desc: "曜日ごとの営業時間と定休日、シフト登録の警告・ブロックに使われます。店舗名・略称などの店舗情報とシフト運用の設定もここで行います。", status: "● 設定可", tone: "" },
        // ★C層①（mig0135・裁定182）: v3 の「利用機能」カード S4 の器＝/master/system の「機能」タブへ着地
        //   （タブ自体は owner のみ描画＝manager はカードから飛んでも既定タブに落ちる。他の「オーナー限定」カードと同型）。
        { href: "/master/system#features", id: "m-features", icon: "◈", count: "2機能", title: "機能の公開",
          desc: "スタッフシフト・締め解除フローの公開を、会社の既定と店舗ごとの上書きで切り替えます。", status: "● オーナー限定", tone: "mute" },
      ],
    },
    {
      sec: "スタッフ・システム", secDesc: "端末と機微情報の管理",
      cards: [
        // ★A3: 遷移先の重複解消＝hash で /master/system の該当タブへ直接着地する
        //   （hash は SystemBoard のタブ key と一致＝devices / receipts / secrets）。
        { href: "/master/system#devices", id: "m-kiosk", icon: "▣", count: "端末", title: "キオスク端末",
          desc: "打刻端末・レジ端末の発行と失効（オーナー限定）。", status: "● オーナー限定", tone: "mute" },
        { href: "/master/system#receipts", id: "m-printer", icon: "♨", count: "レシート", title: "レシート・プリンタ",
          desc: "レシートの店舗情報と印刷設定。", status: "● オーナー限定", tone: "mute" },
        { href: "/master/system#secrets", id: "m-tax", icon: "🔒", count: "機密", title: "機密・税務情報",
          desc: "本名・生年月日・マイナンバー等。閲覧はログに記録されます。", status: "● 閲覧ログあり", tone: "warn" },
      ],
    },
  ];
  const hubHit = (c: { title: string; desc: string }) =>
    hubQ === "" || c.title.toLowerCase().includes(hubQ) || c.desc.toLowerCase().includes(hubQ);

  return (
    <div className="nox-mv1">
      {/* aaa .hero＝ページ名＋説明＋検索 */}
      <PageHead eyebrow="MASTER SETTINGS" title="マスタ"
        desc="店舗の料金・席・営業・報酬・端末など、全画面が参照する設定です。"
        right={<><input className="nox-search" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)}
          placeholder="設定名を検索（例：商品、カテゴリ、卓）" aria-label="設定名を検索" /></>} />

      {/* aaa .alert＝低在庫の警告バナー（実在する reorder_point 判定・0件なら出さない） */}
      {hubState === "ok" && lowStock > 0 && (
        <div className="nox-alert danger">
          在庫が発注基準を下回っている商品が {lowStock} 件あります。商品マスターから補充基準を確認してください。
        </div>
      )}

      {/* aaa .summary＝KPI ステートカード（すべて実在件数） */}
      <section className="nox-summary">
        {/* ★Z152: 取得完了前は「—」（数値を描かない）・失敗は「取得できませんでした」 */}
        <div className="nox-stat2"><small>商品マスター</small><strong>{hubCountOf(hubState, products.length).text}</strong><em>{hubState === "ok" ? `公開中 ${activeProds}件` : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2"><small>商品カテゴリ</small><strong>{hubCountOf(hubState, categories.length).text}</strong><em>{hubState === "ok" ? (categories.length > 0 ? "全件有効" : "未登録") : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2"><small>卓・席</small><strong>{hubCountOf(hubState, seats.length).text}</strong><em>{hubState === "ok" ? `稼働可能 ${activeSeats}卓` : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2">
          <small>発注推奨の商品</small><strong>{hubCountOf(hubState, lowStock).text}</strong>
          <em className={hubState === "ok" && lowStock > 0 ? "ng" : ""}>{hubState === "ok" ? (lowStock > 0 ? "発注基準以下" : "基準内") : hubCountOf(hubState, 0).note ?? "—"}</em>
        </div>
      </section>

      {/* aaa .section + .grid + .card＝機能カードのハブ。クリックで各実ページへ遷移する。 */}
      {HUBS.map((h) => {
        const cards = h.cards.filter(hubHit);
        if (cards.length === 0) return null;
        return (
          <section key={h.sec} className="nox-sec">
            <div className="nox-sechead">
              <h2>{h.sec}</h2>
              <p>{h.secDesc}</p>
            </div>
            <div className="nox-grid3">
              {cards.map((c) => {
                const inner = (
                  <>
                    <div className="top">
                      <div className="icon" aria-hidden="true">{c.icon}</div>
                      <div className="count">{c.count}</div>
                    </div>
                    <h3><span className="nox-cardtitle">{c.title}</span><span className="nox-cardchev" aria-hidden="true" style={{ color: "var(--primary)" }}>›</span></h3>{/* ★306-15: 「タイトル ›」1 行（nowrap・inline） */}{/* ★裁定238-e: カード型 Link は下線化せず末尾「›」を --primary に */}
                    <p className="nox-carddesc">{c.desc}</p>{/* ★306-15: 説明 1 行 */}
                    <div className="foot">
                      <span className={`status ${c.tone}`}>{c.status}</span>
                      <span className="link">管理する →</span>
                    </div>
                  </>
                );
                // ★DP1 P1: 全カードが実ページを持つ＝分岐なしの Link（見た目は .nox-fcard のまま）。
                return <Link key={c.id} href={c.href} className="nox-fcard">{inner}</Link>;
              })}
            </div>
          </section>
        );
      })}

    </div>
  );
}
