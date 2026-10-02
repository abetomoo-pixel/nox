"use client";

import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { hubCountOf, hubStatusOf, type HubLoadState } from "@/lib/nox/ui/hub-count"; // ★Z152: 取得前は「—」・失敗は「取得できませんでした」
import { MASTER_NAV, masterSearchHit, type MasterNavPage } from "@/lib/nox/master/nav";
import {
  fetchProducts, fetchProductCategories,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

// ★裁定330（マスタ整理・正本モック docs/handoff/mock/20261001/nox-master-consolidated.html・便 MC1・2026-10-01）:
//   トップ＝4 パネル（商品・料金／キャスト・報酬／店舗・運用／スタッフ・システム）× 9 入口。入口カードの中にタブ（既存 page／?tab=／#hash）を並べる。
//   定義は lib/nox/master/nav.ts の 1 本（パンくず・入口内タブと同じ配列）。URL は 1 本も変えない。
//   在庫（/master/stock）はトップから外し営業メニューの「在庫」へ＝発注推奨の警告・KPI も在庫画面（stock-board）へ移した。
//   件数（商品／カテゴリ／席）は既存の読取に相乗り（Z152: 取得前は「—」）。紹介料の未払件数は主取得と独立（便 U-2）。
//   ★設定値／計算／権限／履歴は不変（カードと検索＝表示のみ・オーナー限定の表示は維持）。
type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };

export default function MasterBoard() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  // 段0R その2: ハブカードの絞り込み（aaa .search）＝表示フィルタのみ・取得は不変。★MC1: 入口のラベル・説明・タブ名に当てる（masterSearchHit）
  const [hubSearch, setHubSearch] = useState("");
  // ★便 U-2（2026-09-25・0152）: 紹介料の未払件数（referral_payouts.status='unpaid'・RLS owner／manager 自店＝cast 0 行）。count のみ（head）＝fetch +1
  const [unpaidRef, setUnpaidRef] = useState<number | null>(null);
  // ★Z152: 件数の取得状態＝取得完了前は数値を描かない（0 は実 0 だけ）。主取得（商品／カテゴリ／席）と紹介者の count は別々に持つ
  const [hubState, setHubState] = useState<HubLoadState>("loading");
  const [refState, setRefState] = useState<HubLoadState>("loading");

  const load = useCallback(async () => {
    try {
      const [ps, cats] = await Promise.all([fetchProducts(supabase), fetchProductCategories(supabase)]);
      const { data: ss, error: se } = await supabase.from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
      if (se) throw se;
      setProducts(ps);
      setCategories(cats);
      setSeats((ss ?? []) as Seat[]);
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

  const activeProds = products.filter((p) => p.is_active).length;
  const activeSeats = seats.filter((x) => x.is_active).length;

  /** 入口カードの右上バッジと状態行（入口ごと・実在する件数だけ） */
  const cardMeta = (p: MasterNavPage): { count: string; status: string; tone: string } => {
    switch (p.href) {
      case "/master/products":
        return { count: hubState === "ok" ? `${products.length}商品 / ${categories.length}カテゴリ` : hubCountOf(hubState, 0).text, status: hubStatusOf(hubState, `● 公開中 ${activeProds}件`), tone: hubState === "error" ? "mute" : "" };
      case "/master/pricing":
        return { count: "3タブ", status: "● 有効", tone: "" };
      case "/master/cast-comp/plan":
        return { count: `${p.tabs?.length ?? 0}タブ`, status: "● 設定可", tone: "" };
      case "/master/referrers":
        return { count: "支払", status: hubStatusOf(refState, (unpaidRef ?? 0) > 0 ? `● 未払 ${unpaidRef} 件` : "● 未払なし"), tone: refState === "ok" && (unpaidRef ?? 0) > 0 ? "warn" : refState === "error" ? "mute" : "" };
      case "/master/store-profile":
        return { count: "2タブ", status: "● オーナー限定の項目あり", tone: "mute" };
      case "/master/seats":
        return { count: hubState === "ok" ? `${seats.length}席・卓 / 稼働${activeSeats}` : hubCountOf(hubState, 0).text, status: hubStatusOf(hubState, `● 稼働可能 ${activeSeats}卓`), tone: hubState === "error" ? "mute" : "" };
      case "/master/business-hours":
        return { count: "曜日別", status: "● 有効", tone: "" };
      case "/master/system":
        return { count: "オーナー", status: "● オーナー限定", tone: "mute" };
      case "/master/cast-comp/register":
        return { count: "3タブ", status: "● 閲覧ログあり（機密情報）", tone: "warn" };
      default:
        return { count: "", status: "", tone: "" };
    }
  };

  return (
    <div className="nox-mv1">
      {/* aaa .hero＝ページ名＋説明＋検索（★MC1: 入口・タブ名で検索） */}
      <PageHead eyebrow="MASTER SETTINGS" title="マスタ"
        desc="店舗の料金・席・営業・報酬・端末など、全画面が参照する設定です。入出庫や在庫履歴の確認は営業メニューの「在庫」で行います。"
        right={<><input className="nox-search" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)}
          placeholder="設定を検索（商品・バック・端末など）" aria-label="設定を検索" /></>} />

      {/* aaa .summary＝KPI ステートカード（すべて実在件数。★MC1: 発注推奨は在庫画面へ） */}
      <section className="nox-summary">
        {/* ★Z152: 取得完了前は「—」（数値を描かない）・失敗は「取得できませんでした」 */}
        <div className="nox-stat2"><small>商品マスター</small><strong>{hubCountOf(hubState, products.length).text}</strong><em>{hubState === "ok" ? `公開中 ${activeProds}件` : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2"><small>商品カテゴリ</small><strong>{hubCountOf(hubState, categories.length).text}</strong><em>{hubState === "ok" ? (categories.length > 0 ? "全件有効" : "未登録") : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2"><small>卓・席</small><strong>{hubCountOf(hubState, seats.length).text}</strong><em>{hubState === "ok" ? `稼働可能 ${activeSeats}卓` : hubCountOf(hubState, 0).note ?? "—"}</em></div>
        <div className="nox-stat2"><small>入口</small><strong>{MASTER_NAV.reduce((n, g) => n + g.pages.length, 0)}</strong><em className="mute">4 つの分類パネル</em></div>
      </section>

      {/* ★MC1: 4 パネル × 9 入口（aaa .section + .grid + .card）。クリックで入口の先頭タブへ・カード内のチップで各タブへ。 */}
      {MASTER_NAV.map((g) => {
        const pages = g.pages.filter((p) => masterSearchHit(p, hubSearch));
        if (pages.length === 0) return null;
        return (
          <section key={g.key} className="nox-sec" id={`master-${g.key}`}>
            <div className="nox-sechead">
              <h2>{g.label}</h2>
              <p>{g.desc}</p>
            </div>
            <div className="nox-grid3">
              {pages.map((p) => {
                const m = cardMeta(p);
                return (
                  <Link key={p.href} href={p.href} className="nox-fcard">
                    <div className="top">
                      <div className="count">{m.count}</div>
                      {p.ownerOnly && <span className="status mute">オーナー</span>}
                    </div>
                    <h3><span className="nox-cardtitle">{p.label}</span><span className="nox-cardchev" aria-hidden="true" style={{ color: "var(--primary)" }}>›</span></h3>{/* ★306-15: 「タイトル ›」1 行（nowrap） */}
                    <p className="nox-carddesc">{p.desc}</p>{/* ★306-15: 説明 1 行 */}
                    {(p.tabs?.length ?? 0) > 1 && (
                      <p className="nox-carddesc" style={{ color: "var(--sub)" }}>{p.tabs!.map((tb) => tb.label).join(" / ")}</p>
                    )}
                    <div className="foot">
                      <span className={`status ${m.tone}`}>{m.status}</span>
                      <span className="link">管理する →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {MASTER_NAV.every((g) => g.pages.every((p) => !masterSearchHit(p, hubSearch))) && (
        <p style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 16 }}>該当する設定がありません。「商品」「ノルマ」「店舗情報」など、別の設定名で検索してください。</p>
      )}
    </div>
  );
}
