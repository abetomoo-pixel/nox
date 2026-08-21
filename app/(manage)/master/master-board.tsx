"use client";

import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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

  // ★DP1 P1: このページはハブ（概要）のみになった。
  //   products / product_categories / stock_logs は「概要＝ダッシュボード」の
  //   KPI 4枚・低在庫アラート・カード件数が読む＝設計どおり残す（実体は各実ページ側）。
  //   seats も KPI「卓・席」とカードの件数表示が読む（編集は /master/seats）。
  const load = useCallback(async () => {
    const [ps, cats, st] = await Promise.all([
      fetchProducts(supabase), fetchProductCategories(supabase), fetchStockTotals(supabase),
    ]);
    const { data: ss } = await supabase.from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
    setProducts(ps);
    setCategories(cats);
    setSeats((ss ?? []) as Seat[]);
    setStock(st);
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
        { href: "/master/products", id: "m-prod", icon: "◇", count: `${products.length}件`, title: "商品マスター",
          desc: "ドリンク、シャンパン、ボトル、フード、在庫数、発注基準を管理。",
          status: lowStock > 0 ? `● ${lowStock}件 要補充` : "● 在庫は基準内", tone: lowStock > 0 ? "warn" : "" },
        { href: "/master/categories", id: "m-cat", icon: "▤", count: `${categories.length}件`, title: "商品カテゴリ",
          desc: "レジのタイル見出しになる分類。並び順と有効/無効を管理。",
          status: categories.length > 0 ? "● 全件有効" : "● 未登録", tone: categories.length > 0 ? "" : "mute" },
        { href: "/master/stock", id: "m-stock", icon: "⬚", count: "追記のみ", title: "在庫",
          desc: "棚卸しの記録と入出庫の履歴（append-only）。売上による減算は会計から自動。", status: "● 記録可", tone: "" },
        { href: "/master/pricing", id: "m-pricing", icon: "¥", count: "3タブ", title: "料金設定",
          desc: "時間帯・席種・曜日の料金ルール、ランク別指名料、基本料金、会計ルールを設定。", status: "● 有効", tone: "" },
      ],
    },
    {
      sec: "キャスト・報酬", secDesc: "給与計算とキャスト運用の設定",
      cards: [
        { href: "/master/cast-comp/plan", id: "m-sim", icon: "▲", count: "試算", title: "待遇プラン・報酬シミュレーター",
          desc: "保証時給、スライド、指名バック単価を試算。プラン割当・上書き・自由バックもここで管理。", status: "● 試算可", tone: "" },
        { href: "/master/cast-comp/deduction", id: "m-deduct", icon: "▽", count: "控除", title: "控除・送りの設定",
          desc: "固定控除の種別と金額、送り実費/一律の扱いを管理。", status: "● 有効", tone: "" },
        { href: "/master/cast-comp/norma", id: "m-norm", icon: "◎", count: "ノルマ", title: "ノルマ設定",
          desc: "売上ノルマ・指名ノルマの採用可否と範囲を設定（マイページの進捗に反映）。", status: "● 設定可", tone: "" },
        { href: "/master/cast-comp/register", id: "m-castreg", icon: "◈", count: "会計権限", title: "キャスト会計の許可",
          desc: "キャスト本人がレジを使えるようにする設定（対象キャストの個別許可）。", status: "● 設定可", tone: "" },
      ],
    },
    {
      sec: "店舗・卓", secDesc: "フロアと営業時間の設定",
      cards: [
        { href: "/master/seats", id: "m-seat", icon: "▦", count: `${seats.length}卓`, title: "席・卓マスター",
          desc: "卓／カウンター／VIP の登録と並び順、稼働の有効切替。",
          status: `● 稼働可能 ${activeSeats}卓`, tone: "" },
        { href: "/master/business-hours", id: "m-hours", icon: "☾", count: "曜日別", title: "営業時間・定休日",
          desc: "曜日ごとの営業時間と定休日。シフト登録の警告・ブロックに使われます。", status: "● 設定可", tone: "" },
      ],
    },
    {
      sec: "スタッフ・システム", secDesc: "端末と機微情報の管理",
      cards: [
        { href: "/master/system", id: "m-kiosk", icon: "▣", count: "端末", title: "キオスク端末",
          desc: "打刻端末・レジ端末の発行と失効（オーナー限定）。", status: "● オーナー限定", tone: "mute" },
        { href: "/master/system", id: "m-printer", icon: "⎙", count: "レシート", title: "レシート・プリンタ",
          desc: "レシートの店舗情報（住所・電話・登録番号・フッタ）と印刷設定。", status: "● オーナー限定", tone: "mute" },
        { href: "/master/system", id: "m-tax", icon: "🔒", count: "機密", title: "機密・税務情報",
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
        desc="店舗の料金・席・営業時間・端末など、全画面が参照する設定です。"
        right={<><input className="nox-search" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)}
          placeholder="設定名を検索（例：商品、カテゴリ、卓）" aria-label="設定名を検索" /></>} />

      {/* aaa .alert＝低在庫の警告バナー（実在する reorder_point 判定・0件なら出さない） */}
      {lowStock > 0 && (
        <div className="nox-alert">
          在庫が発注基準を下回っている商品が {lowStock} 件あります。商品マスターから補充基準を確認してください。
        </div>
      )}

      {/* aaa .summary＝KPI ステートカード（すべて実在件数） */}
      <section className="nox-summary">
        <div className="nox-stat2"><small>商品マスター</small><strong>{products.length}</strong><em>公開中 {activeProds}件</em></div>
        <div className="nox-stat2"><small>商品カテゴリ</small><strong>{categories.length}</strong><em>{categories.length > 0 ? "全件有効" : "未登録"}</em></div>
        <div className="nox-stat2"><small>卓・席</small><strong>{seats.length}</strong><em>稼働可能 {activeSeats}卓</em></div>
        <div className="nox-stat2">
          <small>要補充の商品</small><strong>{lowStock}</strong>
          <em className={lowStock > 0 ? "warn" : ""}>{lowStock > 0 ? "発注基準以下" : "基準内"}</em>
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
                    <h3>{c.title}</h3>
                    <p>{c.desc}</p>
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
