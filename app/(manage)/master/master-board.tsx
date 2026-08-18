"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import {
  fetchProducts, fetchProductCategories, fetchStockTotals,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

// ★レーン②: 商品ハブ／商品リスト／商品フォームは /master/products へ移設した。
//   ここに残るのは 商品カテゴリ・在庫の入出庫・席（レーン③まで）と、ハブのカード群。
//   products / categories / stock はカード件数・KPI・カテゴリ別件数・在庫の商品選択が
//   まだ使うため取得を残す。原価（product_costs）は商品リストとフォーム専用だったので落とした。
type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

// 段0R その4: ハブ⇄セクションの「その場で切り替え」。
//   ★パネル本体は page.tsx（server）が従来どおり props を組んで生成し、ここは ReactNode を
//     受け取って描き分けるだけ＝コンポーネントも機能も RPC も送る引数も1文字も変えていない。
// ★レーン③: "products" は実ページ3本（/master/products・/master/categories・/master/stock）へ
//   完全移設したため view から削除した（残る view は5つ）。
export type MasterView = "seat" | "hours" | "system";
export default function MasterBoard({ storeId, isManagerUp, isOwner, panels }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean;
  /** server で生成済みのパネル群（表示単位ごと）。未指定の単位はカードを出さない。 */
  panels?: Partial<Record<Exclude<MasterView, "seat">, React.ReactNode>>;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  // 段0R その2: ハブカードの絞り込み（aaa .search）＝表示フィルタのみ・取得は不変
  const [hubSearch, setHubSearch] = useState("");
  // 段0R その4: null=ハブ／それ以外=そのセクションだけを表示（ハブは隠す）
  const [view, setView] = useState<MasterView | null>(null);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // 席フォーム
  const [sId, setSId] = useState<string | null>(null);
  const [sName, setSName] = useState("");
  const [sKind, setSKind] = useState("卓");
  const [sSort, setSSort] = useState(0);
  const [sActive, setSActive] = useState(true);
  // E8-5 席#5（T2）: 席一覧の検索・種別フィルタ（client のみ・取得と編集経路は不変）
  const [seatQ, setSeatQ] = useState("");
  const [seatKind, setSeatKind] = useState("");

  // ★レーン③: このページはハブ（概要）＋席のみになった。
  //   products / product_categories / stock_logs は「概要＝ダッシュボード」の
  //   KPI 4枚・低在庫アラート・カード件数がまだ読む＝設計どおり残す（実体は各実ページ側）。
  //   seats は席 view が使う。product_costs はレーン②で落とした（原価表示がここに無い）。
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

  async function saveSeat() {
    setMsg(null);
    const { error } = await supabase.rpc("set_seat", {
      p_id: sId, p_store_id: storeId, p_name: sName, p_kind: sKind, p_sort_order: sSort,
      p_is_active: sActive, // 明示 boolean（原則7）
    });
    setMsg(error ? error.message : sId ? "席を更新しました" : "席を登録しました");
    setSId(null); setSName("");
    await load();
  }

  // ── 段0R その2: aaa 基準シェルのハブ層（presentation-only）──
  //   ★カードは既存パネルへのページ内アンカーで、パネルの中身・機能・RPC は一切変えていない。
  //   ★aaa にあって実在しない項目（税率・Wi-Fi/GPS・権限ロール・変更履歴）は作らず、
  //     実在するパネル（商品／カテゴリ／在庫／席／待遇プラン／スタッフ）へ対応づけた。
  const activeProds = products.filter((p) => p.is_active).length;
  const lowStock = products.filter((p) => p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)).length;
  const activeSeats = seats.filter((x) => x.is_active).length;
  const hubQ = hubSearch.trim().toLowerCase();
  // ★レーン②/③: href を持つカードは実 URL へ遷移し、持たないカードは従来どおり view 切替。
  //   href を付けたのは商品・カテゴリ・在庫の3枚（＝実ページ化済み）。残り11枚は setView のまま。
  const HUBS: Array<{ sec: string; secDesc: string; cards: Array<{ view?: MasterView; href?: string; id: string; icon: string; count: string; title: string; desc: string; status: string; tone: string }> }> = [
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
        { view: "seat" as MasterView, id: "m-seat", icon: "▦", count: `${seats.length}卓`, title: "席・卓マスター",
          desc: "卓／カウンター／VIP の登録と並び順、稼働の有効切替。",
          status: `● 稼働可能 ${activeSeats}卓`, tone: "" },
        { view: "hours" as MasterView, id: "m-hours", icon: "☾", count: "曜日別", title: "営業時間・定休日",
          desc: "曜日ごとの営業時間と定休日。シフト登録の警告・ブロックに使われます。", status: "● 設定可", tone: "" },
      ],
    },
    {
      sec: "スタッフ・システム", secDesc: "端末と機微情報の管理",
      cards: [
        { view: "system" as MasterView, id: "m-kiosk", icon: "▣", count: "端末", title: "キオスク端末",
          desc: "打刻端末・レジ端末の発行と失効（オーナー限定）。", status: "● オーナー限定", tone: "mute" },
        { view: "system" as MasterView, id: "m-printer", icon: "⎙", count: "レシート", title: "レシート・プリンタ",
          desc: "レシートの店舗情報（住所・電話・登録番号・フッタ）と印刷設定。", status: "● オーナー限定", tone: "mute" },
        { view: "system" as MasterView, id: "m-tax", icon: "🔒", count: "機密", title: "機密・税務情報",
          desc: "本名・生年月日・マイナンバー等。閲覧はログに記録されます。", status: "● 閲覧ログあり", tone: "warn" },
      ],
    },
  ];
  const hubHit = (c: { title: string; desc: string }) =>
    hubQ === "" || c.title.toLowerCase().includes(hubQ) || c.desc.toLowerCase().includes(hubQ);

  const VIEW_TITLE: Record<MasterView, string> = {
    seat: "席・卓", hours: "営業時間・定休日", system: "スタッフ・システム",
  };

  return (
    <div>
      {/* 段0R その4: セクション表示中は上部に戻り導線＋見出しを出す（ハブは隠す）。 */}
      {view && (
        <div className="nox-secbar">
          <button type="button" className="nox-backlink" onClick={() => setView(null)}>← マスタ概要</button>
          <h1 className="nox-sectitle">{VIEW_TITLE[view]}</h1>
        </div>
      )}

      {/* aaa .hero＝ページ名＋説明＋検索（ハブのみ） */}
      {view === null && (
      <>
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>マスタ管理</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>店舗運営に必要な設定を、用途ごとにまとめて管理します。</p>
        </div>
        <input className="nox-search" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)}
          placeholder="設定名を検索（例：商品、カテゴリ、卓）" aria-label="設定名を検索" />
      </div>
      <Toast msg={msg} />

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

      {/* aaa .section + .grid + .card＝機能カードのハブ。クリックで下の実パネルへスクロール。 */}
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
                // ★レーン②: 実ページを持つカードだけ Link（見た目は .nox-fcard のまま）。
                return c.href
                  ? <Link key={c.id} href={c.href} className="nox-fcard">{inner}</Link>
                  : <button key={c.id} type="button" className="nox-fcard" onClick={() => c.view && setView(c.view)}>{inner}</button>;
              })}
            </div>
          </section>
        );
      })}
      </>
      )}

      {/* ── 表示単位「席・卓」＝席パネル（カード1枚に対応）── */}
      {view === "seat" && (
      <section className="nox-cardtop" style={card}>
        <h2 id="m-seat" style={secTitle}>席（クリックで編集）</h2>
        {/* E8-5 席#2（T1）: 席 KPI 4枚＝seats state の再形のみ（ハブ統計は席ビューで消えるため再掲） */}
        <div className="nox-repsum">
          <div className="nox-rs"><div className="l">総席数</div><div className="v num">{seats.length}</div></div>
          <div className="nox-rs"><div className="l">稼働可能</div><div className="v num">{seats.filter((s) => s.is_active).length}</div></div>
          <div className="nox-rs"><div className="l">無効</div><div className="v num">{seats.filter((s) => !s.is_active).length}</div></div>
          <div className="nox-rs"><div className="l">VIP</div><div className="v num">{seats.filter((s) => s.kind === "VIP").length}</div></div>
        </div>
        {/* E8-5 席#5（T2）: 検索＋種別フィルタ（表示のみ）。並べ替えは現行の表示順数値のまま
            （↑↓は set_seat 2連続呼びの非原子になるため見送り＝skipped.md） */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <input value={seatQ} onChange={(e) => setSeatQ(e.target.value)} placeholder="席名で検索"
            aria-label="席名で検索" style={{ ...input, width: 160 }} />
          <div className="nox-seg">
            {([["", "すべて"], ["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const).map(([v, label]) => (
              <button key={v || "all"} className={seatKind === v ? "on" : ""} onClick={() => setSeatKind(v)}>{label}</button>
            ))}
          </div>
        </div>
        <table className="nox-table" style={{ marginBottom: 10 }}>
          <tbody>
            {seats.filter((s) =>
              (!seatQ.trim() || s.name.toLowerCase().includes(seatQ.trim().toLowerCase())) &&
              (seatKind === "" || s.kind === seatKind),
            ).map((s) => (
              <tr key={s.id} onClick={() => isManagerUp && (setSId(s.id), setSName(s.name), setSKind(s.kind ?? "卓"), setSSort(s.sort_order), setSActive(s.is_active))}
                style={{ cursor: isManagerUp ? "pointer" : "default" }}>
                <td>{s.name}</td>
                <td>{s.kind}</td>
                <td style={{ color: s.is_active ? "var(--ok)" : "var(--sub)" }}>{s.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{sId ? "編集中" : "新規"}</span>
            <input placeholder="席名" value={sName} onChange={(e) => setSName(e.target.value)} style={{ ...input, width: 140 }} />
            <select value={sKind} onChange={(e) => setSKind(e.target.value)} style={input}>
              <option value="卓">卓</option><option value="カウンター">カウンター</option><option value="VIP">VIP</option>
            </select>
            <label style={{ fontSize: 12 }}>表示順 <input type="number" min={0} value={sSort} onChange={(e) => setSSort(Number(e.target.value))} style={{ ...input, width: 56 }} /></label>
            {/* 段G: 既存 boolean(is_active) のトグルを canonical スイッチ表示へ（状態・挙動は不変） */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <button type="button" className={`nox-switch ${sActive ? "on" : ""}`} onClick={() => setSActive(!sActive)} aria-pressed={sActive} aria-label="有効"><i /></button>
              有効
            </span>
            <button style={btnDark} onClick={saveSeat}>{sId ? "更新" : "登録"}</button>
          </div>
        )}
      </section>
      )}

      {/* ── 外部パネル（page.tsx が server で組んだ ReactNode をそのまま描く）──
          ★コンポーネントも props も page.tsx 側のまま＝ここは表示単位で出し分けるだけ。 */}
      {view === "hours" && panels?.hours}
      {view === "system" && panels?.system}

    </div>
  );
}
