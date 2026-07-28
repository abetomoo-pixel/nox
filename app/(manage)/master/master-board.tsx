"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { groupProducts } from "@/lib/nox/ui/product-groups";
import Toast from "@/components/ui/toast";
import CompMaster from "./comp-master";

type Product = {
  id: string; type: string; category: string | null; name: string; price: number;
  back_mode: string; back_value: number | null; unit4_json: Record<string, number> | null; hon_pt: number; is_active: boolean;
  // 純増①（mig0061/0062）: 発注点しきい（null=しきい無し）。load の select("*") で取得。
  reorder_point: number | null;
  // 純増⑦（mig0063）: カテゴリ FK（null=未分類）。旧 category text は deprecated（現値往復のみ）。
  category_id: string | null;
};
// 純増⑦（mig0063）: 商品カテゴリマスタ（store スコープ・sort_order 順・is_active で有効/無効）
type Category = { id: string; name: string; sort_order: number; is_active: boolean };
// 原価は products に無い（台帳#40＝product_costs へ分離）。RLS は owner∨manager自店 のみ返す＝cast/staff は空。
type ProductCost = { product_id: string; cost: number };
type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };
type StockLog = { product_id: string; delta: number; reason: string | null; at: string };

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

const EMPTY_UNIT4 = { hon: 0, jonai: 0, dohan: 0, free: 0 };
const PAGE = 40; // 逐次表示の1ページ分（「もっと見る」で +PAGE）
const TYPE_LABEL_JA: Record<string, string> = { drink: "ドリンク", champ: "シャンパン", bottle: "ボトル" };

// 純増①（mig0061）在庫セル: 数値＋残量バー。バーは reorder_point 比（満位＝発注点×2）で、
//   reorder_point null＝しきい無しゆえバーを出さず数値のみ。低在庫（≤発注点）と負在庫を色で示す。
//   ★表示のみ＝計算/取得は既存（Σdelta と products.reorder_point）。
function stockCell(qty: number, reorderPoint: number | null) {
  const neg = qty < 0;
  const low = reorderPoint !== null && qty <= reorderPoint;
  const color = neg ? "var(--bad)" : low ? "var(--gold2)" : "var(--ink)";
  const full = reorderPoint !== null && reorderPoint > 0 ? reorderPoint * 2 : null;
  const pct = full ? Math.max(0, Math.min(100, (qty / full) * 100)) : 0;
  return (
    <span style={{ display: "inline-block", minWidth: 76 }}>
      <span style={{ ...t.num, color, fontWeight: neg || low ? 700 : 400 }}>{qty}</span>
      {reorderPoint !== null && (
        <>
          <span style={{ fontSize: 10, color: "var(--sub)", marginLeft: 5 }}>/ 発注点 {reorderPoint}</span>
          <span className={`nox-stockbar${neg ? " neg" : low ? " low" : ""}`} aria-hidden="true">
            <i style={{ width: `${neg ? 100 : pct}%` }} />
          </span>
        </>
      )}
    </span>
  );
}

export default function MasterBoard({ storeId, isManagerUp, isOwner }: { storeId: string; isManagerUp: boolean; isOwner: boolean }) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  // 0行（＝原価なし・RLS で返らない）と 取得失敗 を区別する。失敗のときだけ保存を止める＝
  // 原価欄が空のまま p_cost=null を送って cost 行を消す事故を構造的に作らない。
  const [costsError, setCostsError] = useState(false);
  const [seats, setSeats] = useState<Seat[]>([]);
  // 段0R その2: ハブカードの絞り込み（aaa .search）＝表示フィルタのみ・取得は不変
  const [hubSearch, setHubSearch] = useState("");
  const [stock, setStock] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // 商品フォーム（p_is_active は常に明示 boolean を送る＝CLAUDE.md 原則7）
  const [pId, setPId] = useState<string | null>(null);
  const [pType, setPType] = useState("drink");
  const [pCategory, setPCategory] = useState("");
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState(0);
  const [pCost, setPCost] = useState("");
  const [pBackMode, setPBackMode] = useState("rate");
  const [pBackValue, setPBackValue] = useState(50);
  const [pUnit4, setPUnit4] = useState<Record<string, number>>({ ...EMPTY_UNIT4 });
  const [pHonPt, setPHonPt] = useState(0);
  const [pActive, setPActive] = useState(true);
  // 純増①（mig0062）: 発注点。空欄＝しきい無し（null 送信）＝原則7どおり常に明示値を送る。
  const [pReorder, setPReorder] = useState("");
  // 純増⑦（mig0063）: カテゴリ。""＝未分類（null 送信）＝原則7 同列で常に明示値。
  const [pCatId, setPCatId] = useState("");

  // ── マスタ刷新（情報設計）: ハブ選択・一覧フィルタ・逐次表示・フォーム段組み ──
  //   すべて presentation（絞り込みと表示件数の話）＝送る引数・権限・数値は不変。
  const [selCat, setSelCat] = useState<string>("__all"); // "__all" | "__uncat" | category_id | type key
  const [showInactive, setShowInactive] = useState(false); // 既定＝有効のみ
  const [visible, setVisible] = useState(PAGE); // 逐次表示（verify org 297件でも破綻しない）
  const [detailOpen, setDetailOpen] = useState(false); // 商品フォームの「詳細」節（既定 閉）

  // カテゴリ管理フォーム（set_product_category）
  const [cId, setCId] = useState<string | null>(null);
  const [cCatName, setCCatName] = useState("");
  const [cSort, setCSort] = useState(0);
  const [cActive, setCActive] = useState(true);

  // 席フォーム
  const [sId, setSId] = useState<string | null>(null);
  const [sName, setSName] = useState("");
  const [sKind, setSKind] = useState("卓");
  const [sSort, setSSort] = useState(0);
  const [sActive, setSActive] = useState(true);

  // 在庫フォーム
  const [stProd, setStProd] = useState("");
  const [stDelta, setStDelta] = useState(0);
  const [stReason, setStReason] = useState("");

  const load = useCallback(async () => {
    const { data: ps } = await supabase.from("products").select("*").order("type").order("name");
    const { data: cs, error: eCs } = await supabase.from("product_costs").select("product_id, cost");
    // 純増⑦（mig0063）: カテゴリ一覧（RLS で自店/自 org のみ・無効も含めて管理表に出す）
    const { data: cats } = await supabase.from("product_categories")
      .select("id, name, sort_order, is_active").order("sort_order").order("name");
    const { data: ss } = await supabase.from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
    const { data: logs } = await supabase.from("stock_logs").select("product_id, delta, reason, at");
    const st: Record<string, number> = {};
    for (const l of (logs ?? []) as StockLog[]) st[l.product_id] = (st[l.product_id] ?? 0) + l.delta;
    const cm: Record<string, number> = {};
    for (const c of (cs ?? []) as ProductCost[]) cm[c.product_id] = c.cost;
    setProducts((ps ?? []) as Product[]);
    setCategories((cats ?? []) as Category[]);
    setCosts(cm);
    setCostsError(!!eCs);
    setSeats((ss ?? []) as Seat[]);
    setStock(st);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  function editProduct(p: Product) {
    setPId(p.id); setPType(p.type); setPCategory(p.category ?? ""); setPName(p.name);
    setPPrice(p.price); setPCost(costs[p.id] == null ? "" : String(costs[p.id]));
    setPBackMode(p.back_mode); setPBackValue(p.back_value ?? 0);
    setPUnit4(p.unit4_json ?? { ...EMPTY_UNIT4 }); setPHonPt(p.hon_pt); setPActive(p.is_active);
    setPReorder(p.reorder_point == null ? "" : String(p.reorder_point));
    setPCatId(p.category_id ?? "");
    // 「詳細」は既定 閉。ただし編集時に値が入っている（＝運用で使っている）なら自動で開く。
    const hasDetail = costs[p.id] != null || p.reorder_point != null || p.hon_pt > 0
      || p.back_mode === "unit4" || (p.back_value ?? 0) !== 0;
    setDetailOpen(hasDetail);
  }

  // 純増⑦（mig0063）: カテゴリ upsert（set_product_category・owner/manager 自店＝RPC 側も二重で拒否）
  async function saveCategory() {
    if (!cCatName.trim()) return;
    setMsg(null);
    const { error } = await supabase.rpc("set_product_category", {
      p_id: cId, p_store_id: storeId, p_name: cCatName.trim(), p_sort_order: cSort,
      p_is_active: cActive, // 明示 boolean（原則7）
    });
    setMsg(error
      ? (error.message.includes("duplicate name") ? "同じ名前のカテゴリが既にあります"
        : error.message.includes("bad name") ? "カテゴリ名は40字以内で入力してください"
        : error.message.includes("forbidden") ? "権限がありません"
        : error.message)
      : cId ? "カテゴリを更新しました" : "カテゴリを登録しました");
    if (!error) { setCId(null); setCCatName(""); setCSort(0); setCActive(true); }
    await load();
  }

  async function saveProduct() {
    setMsg(null);
    // 原価が読めていない状態の保存は p_cost の値が不明＝送れば cost 行を消しうる。ボタン無効化と二重で止める。
    if (costsError) { setMsg("原価を読み込めませんでした。再読込してください"); return; }
    const { error } = await supabase.rpc("set_product", {
      p_id: pId, p_store_id: storeId, p_type: pType, p_category: pCategory || null,
      p_name: pName, p_price: pPrice, p_cost: pCost === "" ? null : Number(pCost),
      p_back_mode: pBackMode,
      p_back_value: pBackMode === "rate" ? pBackValue : null,
      p_unit4: pBackMode === "unit4" ? pUnit4 : null,
      p_hon_pt: pHonPt, p_is_active: pActive, // 明示 boolean（原則7）
      // mig0062: 発注点も常に明示値（空欄＝null＝しきい無し）。省略に頼らない＝原則7 同列。
      p_reorder_point: pReorder.trim() === "" ? null : Number(pReorder),
      // mig0063: カテゴリも常に明示値（""＝未分類＝null）。旧 p_category（text）は現値往復のみ＝deprecated。
      p_category_id: pCatId === "" ? null : pCatId,
    });
    setMsg(error
      ? (error.message.includes("bad category") ? "カテゴリの指定が不正です（他店のカテゴリは選べません）" : error.message)
      : pId ? "商品を更新しました" : "商品を登録しました");
    setPId(null); setPName(""); setPPrice(0); setPReorder(""); setPCatId("");
    await load();
  }

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

  async function addStock() {
    if (!stProd || !stDelta) return;
    setMsg(null);
    const { error } = await supabase.rpc("product_stock_add", {
      p_product_id: stProd, p_delta: stDelta, p_reason: stReason || null,
    });
    setMsg(error ? error.message : "在庫を記録しました");
    setStDelta(0); setStReason("");
    await load();
  }

  // ── ハブの並び（⑥）: アクティブなカテゴリが1件以上ならカテゴリ別、0件なら type 別へ
  //   （★判定は register/kiosk のタイル分類 lib/nox/ui/product-groups と同一ルール＝画面間で分類がぶれない）。
  const activeCats = categories.filter((c) => c.is_active).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
  const catMode = activeCats.length > 0;
  const knownCatIds = new Set(activeCats.map((c) => c.id));
  // 一覧の母集合（有効/無効フィルタ＝既定は有効のみ）
  const pool = products.filter((p) => showInactive || p.is_active);
  const inHub = (p: Product, key: string) =>
    key === "__all" ? true
      : key === "__uncat" ? (!p.category_id || !knownCatIds.has(p.category_id))
        : catMode ? p.category_id === key : p.type === key;
  // ハブカード（カテゴリは0件でも出す＝マスタ管理では空カテゴリも見えている方が正しい）
  const hubCards = catMode
    ? [
        ...activeCats.map((c) => ({ key: c.id, label: c.name, n: pool.filter((p) => p.category_id === c.id).length })),
        { key: "__uncat", label: "未分類", n: pool.filter((p) => !p.category_id || !knownCatIds.has(p.category_id)).length },
      ]
    : groupProducts(pool, []).map((g) => ({ key: g.key, label: g.label, n: g.items.length }));
  const filtered = pool.filter((p) => inHub(p, selCat));
  const shown = filtered.slice(0, visible);
  const selectHub = (key: string) => { setSelCat(key); setVisible(PAGE); };

  // ── 段0R その2: aaa 基準シェルのハブ層（presentation-only）──
  //   ★カードは既存パネルへのページ内アンカーで、パネルの中身・機能・RPC は一切変えていない。
  //   ★aaa にあって実在しない項目（税率・Wi-Fi/GPS・権限ロール・変更履歴）は作らず、
  //     実在するパネル（商品／カテゴリ／在庫／席／待遇プラン／スタッフ）へ対応づけた。
  const activeProds = products.filter((p) => p.is_active).length;
  const lowStock = products.filter((p) => p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)).length;
  const activeSeats = seats.filter((x) => x.is_active).length;
  const hubQ = hubSearch.trim().toLowerCase();
  const HUBS: Array<{ sec: string; secDesc: string; cards: Array<{ id: string; icon: string; count: string; title: string; desc: string; status: string; tone: string }> }> = [
    {
      sec: "商品・料金", secDesc: "レジ・会計で利用する項目",
      cards: [
        { id: "m-prod", icon: "◇", count: `${products.length}件`, title: "商品マスター",
          desc: "ドリンク、シャンパン、ボトル、フード、在庫数、発注基準を管理。",
          status: lowStock > 0 ? `● ${lowStock}件 要補充` : "● 在庫は基準内", tone: lowStock > 0 ? "warn" : "" },
        { id: "m-cat", icon: "▤", count: `${categories.length}件`, title: "商品カテゴリ",
          desc: "レジのタイル見出しになる分類。並び順と有効/無効を管理。",
          status: categories.length > 0 ? "● 全件有効" : "● 未登録", tone: categories.length > 0 ? "" : "mute" },
        { id: "m-stock", icon: "⬚", count: "追記のみ", title: "在庫の入出庫",
          desc: "入荷・棚卸の記録（append-only）。売上による減算は会計から自動。", status: "● 記録可", tone: "" },
        { id: "m-pricing", icon: "¥", count: "7設定", title: "料金・会計設定",
          desc: "指名料、サービス料、カード手数料、丸め単位・丸め方を設定。", status: "● 有効", tone: "" },
        { id: "m-timeprice", icon: "◷", count: "6設定", title: "時間料金（セット・延長）",
          desc: "セット時間と料金、延長単位と料金、自動/手動、卓単位/人数倍を設定。", status: "● 有効", tone: "" },
      ],
    },
    {
      sec: "キャスト・報酬", secDesc: "給与計算とキャスト運用の設定",
      cards: [
        { id: "m-sim", icon: "▲", count: "試算", title: "待遇プラン・報酬シミュレーター",
          desc: "保証時給、スライド、指名バック単価を試算。プラン割当は給与側で管理。", status: "● 試算可", tone: "" },
        { id: "m-deduct", icon: "▽", count: "控除", title: "控除・送りの設定",
          desc: "固定控除の種別と金額、送り実費/一律の扱いを管理。", status: "● 有効", tone: "" },
        { id: "m-norm", icon: "◎", count: "ノルマ", title: "ノルマ設定",
          desc: "売上ノルマ・指名ノルマの採用可否と範囲を設定（マイページの進捗に反映）。", status: "● 設定可", tone: "" },
        { id: "m-castreg", icon: "◈", count: "会計権限", title: "キャスト会計の許可",
          desc: "キャスト本人がレジを使えるようにする設定（対象キャストの個別許可）。", status: "● 設定可", tone: "" },
      ],
    },
    {
      sec: "店舗・卓", secDesc: "フロアと営業時間の設定",
      cards: [
        { id: "m-seat", icon: "▦", count: `${seats.length}卓`, title: "席・卓マスター",
          desc: "卓／カウンター／VIP の登録と並び順、稼働の有効切替。",
          status: `● 稼働可能 ${activeSeats}卓`, tone: "" },
        { id: "m-hours", icon: "☾", count: "曜日別", title: "営業時間・定休日",
          desc: "曜日ごとの営業時間と定休日。シフト登録の警告・ブロックに使われます。", status: "● 設定可", tone: "" },
      ],
    },
    {
      sec: "スタッフ・システム", secDesc: "端末と機微情報の管理",
      cards: [
        { id: "m-kiosk", icon: "▣", count: "端末", title: "キオスク端末",
          desc: "打刻端末・レジ端末の発行と失効（オーナー限定）。", status: "● オーナー限定", tone: "mute" },
        { id: "m-printer", icon: "⎙", count: "レシート", title: "レシート・プリンタ",
          desc: "レシートの店舗情報（住所・電話・登録番号・フッタ）と印刷設定。", status: "● オーナー限定", tone: "mute" },
        { id: "m-tax", icon: "🔒", count: "機密", title: "機密・税務情報",
          desc: "本名・生年月日・マイナンバー等。閲覧はログに記録されます。", status: "● 閲覧ログあり", tone: "warn" },
      ],
    },
  ];
  const hubHit = (c: { title: string; desc: string }) =>
    hubQ === "" || c.title.toLowerCase().includes(hubQ) || c.desc.toLowerCase().includes(hubQ);

  return (
    <div>
      {/* aaa .hero＝ページ名＋説明＋検索 */}
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
              {cards.map((c) => (
                <a key={c.id} className="nox-fcard" href={`#${c.id}`}>
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
                </a>
              ))}
            </div>
          </section>
        );
      })}

      {/* ④ 系統分離: ここから「商品」（カテゴリ／商品／在庫）── 各パネルの機能は不変・配置の整理のみ */}
      <h2 id="m-prod" style={{ ...t.cardTitle, fontSize: 12, letterSpacing: 1, color: "var(--sub)", margin: "28px 0 8px" }}>商品</h2>

      {/* ⑥ ハブ: カテゴリカード → クリックでその分類に絞る（すべて／未分類つき）。
          カテゴリ0件の店は type 別カードへフォールバック（register のタイル分類と同じ判定）。 */}
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>商品</h2>
        <div className="nox-hubgrid">
          <button type="button" className={`nox-hubcard${selCat === "__all" ? " on" : ""}`} onClick={() => selectHub("__all")}>
            <span className="nox-hubcard-name">すべて</span>
            <span className="nox-hubcard-n">{pool.length}<span className="nox-hubcard-unit"> 件</span></span>
          </button>
          {hubCards.map((h) => (
            <button key={h.key} type="button" className={`nox-hubcard${selCat === h.key ? " on" : ""}`} onClick={() => selectHub(h.key)}>
              <span className="nox-hubcard-name">{h.label}</span>
              <span className="nox-hubcard-n">{h.n}<span className="nox-hubcard-unit"> 件</span></span>
            </button>
          ))}
        </div>

        {/* ③ 一覧: 運用で見る情報だけの行（名称・価格・原価と利益率・在庫・状態）。詳細は編集フォームへ寄せた。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>
            {filtered.length} 件{filtered.length > shown.length ? `（${shown.length} 件表示中）` : ""}
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
            <button type="button" role="switch" aria-checked={showInactive} aria-label="無効も表示"
              className={showInactive ? "nox-switch on" : "nox-switch"}
              onClick={() => { setShowInactive((v) => !v); setVisible(PAGE); }}><i /></button>
            無効も表示
          </label>
        </div>
        {filtered.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>該当する商品がありません。</p>}
        {shown.map((p) => {
          const cost = costs[p.id];
          const margin = cost != null && p.price > 0 ? Math.round(((p.price - cost) / p.price) * 100) : null;
          return (
            <button key={p.id} type="button" className="nox-prodrow"
              onClick={() => isManagerUp && editProduct(p)} style={{ cursor: isManagerUp ? "pointer" : "default" }}>
              <span className="nox-prodrow-main">
                <span className="nox-prodrow-name">
                  {p.name}
                  {!p.is_active && <span style={{ ...t.tag, marginLeft: 7, color: "var(--sub)", background: "#23232B", borderColor: "var(--line2)" }}>無効</span>}
                </span>
                <span className="nox-prodrow-sub">
                  {TYPE_LABEL_JA[p.type] ?? p.type}
                  {cost != null && <> ・原価 <span style={t.num}>{yen(cost)}</span>{margin != null && <>（利益率 <span style={t.num}>{margin}</span>%）</>}</>}
                </span>
              </span>
              <span style={{ ...t.num, fontSize: 13.5, fontWeight: 700, color: "var(--champ)", whiteSpace: "nowrap" }}>{yen(p.price)}</span>
              {/* 純増①（mig0061）: 残量バー＝Σdelta と reorder_point のみ（新規取得なし・表示のみ）。 */}
              <span style={{ minWidth: 86, textAlign: "right" }}>{stockCell(stock[p.id] ?? 0, p.reorder_point)}</span>
            </button>
          );
        })}
        {filtered.length > shown.length && (
          <button style={{ ...btnLight, marginTop: 10 }} onClick={() => setVisible((v) => v + PAGE)}>
            もっと見る（残り {filtered.length - shown.length} 件）
          </button>
        )}
        {/* ⑤ 編集フォーム: 基本＝常時表示／詳細＝折り畳み（既定 閉・編集時は値が入っていれば自動で開く）。
            ★送る引数・原則7（明示値）は完全に不変＝並べ方だけを変えている。 */}
        {isManagerUp && (
          <div style={{ borderTop: "1px solid var(--line2)", marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{pId ? "編集中" : "新規"}</span>
            <select value={pType} onChange={(e) => setPType(e.target.value)} style={input}>
              <option value="drink">drink</option><option value="champ">champ</option><option value="bottle">bottle</option>
            </select>
            {/* 純増⑦（mig0063）: カテゴリ（未分類＝null）。無効カテゴリは現在値のときだけ選択肢に残す。 */}
            <select value={pCatId} onChange={(e) => setPCatId(e.target.value)} style={input} title="レジのタイル見出しに使われます">
              <option value="">未分類</option>
              {categories.filter((c) => c.is_active || c.id === pCatId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : "（無効）"}</option>
              ))}
            </select>
            <input placeholder="名称" value={pName} onChange={(e) => setPName(e.target.value)} style={{ ...input, width: 160 }} />
            <label style={{ fontSize: 12 }}>価格 <input type="number" min={0} value={pPrice} onChange={(e) => setPPrice(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
          </div>

          {/* 詳細（原価/発注点/バック設定/unit4/本指名pt）＝日常運用では触らない項目をここへ寄せた */}
          <button type="button" onClick={() => setDetailOpen((v) => !v)}
            style={{ ...btnLight, marginTop: 10, fontSize: 12 }}>
            {detailOpen ? "▾ 詳細（原価・発注点・バック）" : "▸ 詳細（原価・発注点・バック）"}
          </button>
          {detailOpen && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, padding: "10px 11px", background: "var(--bg2)", borderRadius: 11, border: "1px solid var(--line2)" }}>
              <label style={{ fontSize: 12 }}>原価 <input type="number" min={0} value={pCost} onChange={(e) => setPCost(e.target.value)} placeholder="任意" disabled={costsError} style={{ ...input, width: 80 }} /></label>
              {/* 純増①（mig0062）: 発注点。空欄＝しきい無し（在庫バー非表示）＝null 送信 */}
              <label style={{ fontSize: 12 }} title="空欄＝しきい無し">
                発注点 <input type="number" min={0} value={pReorder} onChange={(e) => setPReorder(e.target.value)} placeholder="任意" style={{ ...input, width: 70 }} />
              </label>
              <select value={pBackMode} onChange={(e) => setPBackMode(e.target.value)} style={input}>
                <option value="rate">率%</option><option value="unit4">指名別単価</option>
              </select>
              {pBackMode === "rate" ? (
                <label style={{ fontSize: 12 }}>率% <input type="number" min={0} value={pBackValue} onChange={(e) => setPBackValue(Number(e.target.value))} style={{ ...input, width: 60 }} /></label>
              ) : (
                (["hon", "jonai", "dohan", "free"] as const).map((k) => (
                  <label key={k} style={{ fontSize: 12 }}>
                    {k} <input type="number" min={0} value={pUnit4[k] ?? 0}
                      onChange={(e) => setPUnit4((u) => ({ ...u, [k]: Number(e.target.value) }))}
                      style={{ ...input, width: 70 }} />
                  </label>
                ))
              )}
              <label style={{ fontSize: 12 }}>本指名pt <input type="number" min={0} value={pHonPt} onChange={(e) => setPHonPt(Number(e.target.value))} style={{ ...input, width: 56 }} /></label>
            </div>
          )}

          {/* 有効スイッチと保存は常時（段G: canonical スイッチ・状態と挙動は不変） */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <button type="button" className={`nox-switch ${pActive ? "on" : ""}`} onClick={() => setPActive(!pActive)} aria-pressed={pActive} aria-label="有効"><i /></button>
              有効
            </span>
            <button style={btnDark} disabled={costsError} onClick={saveProduct}>{pId ? "更新" : "登録"}</button>
            {pId && <button style={btnLight} onClick={() => { setPId(null); setPName(""); setPReorder(""); setPCatId(""); setDetailOpen(false); }}>新規に戻す</button>}
            {costsError && <span style={{ fontSize: 12, color: "var(--bad)" }}>原価を読み込めませんでした。再読込してください</span>}
          </div>
          </div>
        )}
      </section>

      {/* 純増⑦（mig0063）: カテゴリ管理（レジ/キオスクのタイル見出し・sort_order 順）。書込は set_product_category のみ。 */}
      <section className="nox-cardtop" style={card}>
        <h2 id="m-cat" style={secTitle}>商品カテゴリ（クリックで編集）</h2>
        {categories.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
            カテゴリ未登録です。登録するとレジの商品タイルがカテゴリ別に並びます（未登録なら種別 drink/champ/bottle で並びます）。
          </p>
        )}
        {categories.length > 0 && (
          <table style={{ borderCollapse: "collapse", fontSize: 12, marginBottom: 10 }}>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}
                  onClick={() => isManagerUp && (setCId(c.id), setCCatName(c.name), setCSort(c.sort_order), setCActive(c.is_active))}
                  style={{ borderBottom: "1px solid var(--line)", cursor: isManagerUp ? "pointer" : "default" }}>
                  <td style={{ padding: 6, fontWeight: 700 }}>{c.name}</td>
                  <td style={{ padding: 6, ...t.num, color: "var(--sub)" }}>並び {c.sort_order}</td>
                  <td style={{ padding: 6, ...t.num, color: "var(--sub)" }}>
                    商品 {products.filter((p) => p.category_id === c.id).length}
                  </td>
                  <td style={{ padding: 6, color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{cId ? "編集中" : "新規"}</span>
            <input placeholder="カテゴリ名（例 焼酎）" value={cCatName} onChange={(e) => setCCatName(e.target.value)} maxLength={40} style={{ ...input, width: 170 }} />
            <label style={{ fontSize: 12 }}>並び順 <input type="number" value={cSort} onChange={(e) => setCSort(Number(e.target.value))} style={{ ...input, width: 60 }} /></label>
            {/* 有効トグル＝段G の canonical スイッチ（既存 boolean のみ・見た目のみ） */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
              <button type="button" role="switch" aria-checked={cActive} aria-label="有効"
                className={cActive ? "nox-switch on" : "nox-switch"} onClick={() => setCActive((v) => !v)}><i /></button>
              有効
            </label>
            <button style={btnDark} disabled={!cCatName.trim()} onClick={saveCategory}>{cId ? "更新" : "登録"}</button>
            {cId && <button style={btnLight} onClick={() => { setCId(null); setCCatName(""); setCSort(0); setCActive(true); }}>新規に戻す</button>}
          </div>
        )}
      </section>

      {isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 id="m-stock" style={secTitle}>在庫の入出庫（append-only）</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={stProd} onChange={(e) => setStProd(e.target.value)} style={{ ...input, maxWidth: 220 }}>
              <option value="">商品を選択</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}（現在 {stock[p.id] ?? 0}）</option>)}
            </select>
            <label style={{ fontSize: 12 }}>増減 <input type="number" value={stDelta} onChange={(e) => setStDelta(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
            <input placeholder="理由（入荷・棚卸等）" value={stReason} onChange={(e) => setStReason(e.target.value)} style={{ ...input, width: 160 }} />
            <button style={btnDark} onClick={addStock}>記録</button>
          </div>
        </section>
      )}

      {/* ④ 系統分離: ここから「店舗設定」（席・待遇プラン・以降の各種パネル）── 機能は不変・配置の整理のみ */}
      <h2 style={{ ...t.cardTitle, fontSize: 12, letterSpacing: 1, color: "var(--sub)", margin: "22px 0 8px" }}>店舗設定</h2>

      <section className="nox-cardtop" style={card}>
        <h2 id="m-seat" style={secTitle}>席（クリックで編集）</h2>
        <table style={{ borderCollapse: "collapse", fontSize: 12, marginBottom: 10 }}>
          <tbody>
            {seats.map((s) => (
              <tr key={s.id} onClick={() => isManagerUp && (setSId(s.id), setSName(s.name), setSKind(s.kind ?? "卓"), setSSort(s.sort_order), setSActive(s.is_active))}
                style={{ borderBottom: "1px solid var(--line)", cursor: isManagerUp ? "pointer" : "default" }}>
                <td style={{ padding: 6 }}>{s.name}</td>
                <td style={{ padding: 6 }}>{s.kind}</td>
                <td style={{ padding: 6, color: s.is_active ? "var(--ok)" : "var(--sub)" }}>{s.is_active ? "有効" : "無効"}</td>
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


      <CompMaster storeId={storeId} isManagerUp={isManagerUp} isOwner={isOwner} />
    </div>
  );
}
