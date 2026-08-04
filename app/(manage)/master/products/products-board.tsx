"use client";

// 商品マスタ（マスタIA再編 レーン②）。master-board.tsx の view === "products" のうち
// 「商品ハブ／商品リスト／商品フォーム」をそのまま移設したもの。
// ★JSX・state・送る RPC 引数・原則7（明示 boolean）は1文字も変えていない＝場所を移しただけ。
//   カテゴリ管理と在庫の入出庫はレーン③まで master-board.tsx に残る（ここには無い）。
// ★初期値は page.tsx（server）が取得して props で渡す。保存後の再取得だけ client から
//   同じ queries.ts の関数を呼ぶ＝取得内容は移設前の load() と同一。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { groupProducts } from "@/lib/nox/ui/product-groups";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import MasterPageHead from "../master-page-head";
import {
  fetchProducts, fetchProductCategories, fetchProductCosts, fetchStockTotals,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

const EMPTY_UNIT4 = { hon: 0, jonai: 0, dohan: 0, free: 0 };
const PAGE = 40; // 逐次表示の1ページ分（「もっと見る」で +PAGE）
const TYPE_LABEL_JA: Record<string, string> = { drink: "ドリンク", champ: "シャンパン", bottle: "ボトル" };

// ★④a-3: 商品名セルの下段に出すバック設定。DB 現物（mig0005 の products DDL）は次のとおり:
//   back_mode  text not null default 'rate' check (back_mode in ('rate','unit4'))   ← ★2値のみ
//   back_value int  … rate モードの率(%)。CHECK products_rate_value_chk で rate なら非 null
//   unit4_json jsonb … unit4 モードの {hon,jonai,dohan,free} 単価。CHECK products_unit4_json_chk で非 null
// ★「固定額」モードは DB に存在しない（back_mode は rate/unit4 の2値・UI の select も2択）。
//   よって実際に出るのは「率%」「4段階」の2パターンで、「未設定」は CHECK 違反の行が
//   混入した場合の防御表示（構造上は起きない）。unit4 の4つ組はここでは展開しない（混むため）。
// ★本指名pt はここに出さない（別軸の値）。
function backLabel(p: Product): string {
  if (p.back_mode === "rate") return p.back_value == null ? "バック 未設定" : `バック ${p.back_value}%`;
  if (p.back_mode === "unit4") return p.unit4_json == null ? "バック 未設定" : "バック 4段階";
  return "バック 未設定";
}

// 純増①（mig0061）在庫セル: バッジ（数値）＋残量バー。バーは reorder_point 比（満位＝発注点×2）で、
//   reorder_point null＝しきい無しゆえバーを出さず数値のみ。
//   ★レーン④a: 「0以下」と「発注点以下」を赤系バッジで自己主張させる（旧: 低在庫は金 --gold2）。
//     0以下＝塗り、発注点以下＝枠線の2段階で区別する。数値・発注点・バーの情報量は落としていない。
function stockCell(qty: number, reorderPoint: number | null) {
  const neg = qty <= 0;
  const low = !neg && reorderPoint !== null && qty <= reorderPoint;
  const full = reorderPoint !== null && reorderPoint > 0 ? reorderPoint * 2 : null;
  const pct = full ? Math.max(0, Math.min(100, (qty / full) * 100)) : 0;
  return (
    <span style={{ display: "inline-block" }}>
      <span className={`nox-stkbadge${neg ? " neg" : low ? " low" : ""}`} style={t.num}>{qty}</span>
      {/* ★④a-3: 「/ 発注点 n」を在庫セルへ戻した（④a-2 で商品名下段へ移していた分。
          下段はバック設定に使う）。発注点 null なら従来どおり何も出さない。 */}
      {reorderPoint !== null && (
        <>
          <span style={{ fontSize: 10, color: "var(--sub)", marginLeft: 5 }}>/ 発注点 {reorderPoint}</span>
          <span className={`nox-stockbar${neg ? " neg" : low ? " low" : ""}`} aria-hidden="true">
            <i style={{ width: `${qty < 0 ? 100 : pct}%` }} />
          </span>
        </>
      )}
    </span>
  );
}

// ソート対象は数値4列のみ（原価・利益率・販売価格・在庫）。null=未ソート＝取得順（type→name）。
type SortKey = "cost" | "margin" | "price" | "stock";

// ★④b-2: フォームの入力値ひとまとめ。個々の state はそのまま（分割していない）で、
//   「開いた時の値」と「今の値」を同じ形で作れるようにするための型＝未保存判定に使う。
type FormValues = {
  type: string; category: string; name: string; price: number; cost: string;
  backMode: string; backValue: number; unit4: Record<string, number>; honPt: number;
  exempt: boolean; active: boolean; reorder: string; catId: string;
};
const EMPTY_FORM: FormValues = {
  type: "drink", category: "", name: "", price: 0, cost: "",
  backMode: "rate", backValue: 50, unit4: { ...EMPTY_UNIT4 }, honPt: 0,
  exempt: false, active: true, reorder: "", catId: "",
};

export type ProductsInitial = {
  products: Product[];
  categories: Category[];
  costs: Record<string, number>;
  costsError: boolean;
  stock: Record<string, number>;
};

export default function ProductsBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: ProductsInitial;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [costs, setCosts] = useState<Record<string, number>>(initial.costs);
  // 0行（＝原価なし・RLS で返らない）と 取得失敗 を区別する。失敗のときだけ保存を止める＝
  // 原価欄が空のまま p_cost=null を送って cost 行を消す事故を構造的に作らない。
  const [costsError, setCostsError] = useState(initial.costsError);
  const [stock, setStock] = useState<Record<string, number>>(initial.stock);
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
  // キャストドリンク（mig0069）: 按分除外フラグ。常に明示送信（原則7）。
  const [pExempt, setPExempt] = useState(false);
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
  // ★レーン④a: 数値4列のソート。null=未ソート＝取得順のまま＝既定の並びは従来と同一。
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // ★レーン④b-2: フォームは右ドロワーへ移設した（下部固定フォームは撤去）。
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 未保存判定の基準＝ドロワーを開いた時点の値の署名。現在値と違えば「変更あり」。
  const [baseSig, setBaseSig] = useState("");

  // 保存後の再取得。取得内容は移設前の load() と同一（server の初期取得と同じ関数を使う）。
  async function reload() {
    const [ps, cats, cs, st] = await Promise.all([
      fetchProducts(supabase), fetchProductCategories(supabase),
      fetchProductCosts(supabase), fetchStockTotals(supabase),
    ]);
    setProducts(ps); setCategories(cats);
    setCosts(cs.costs); setCostsError(cs.failed);
    setStock(st);
  }

  // ★④b-2: フォーム値をまとめて適用する。同じ値から署名（baseSig）も作るので、
  //   「開いた直後は必ず未変更」が構造的に保証される（setter を個別に呼ぶ書き方だと取りこぼす）。
  function applyForm(v: FormValues) {
    setPType(v.type); setPCategory(v.category); setPName(v.name); setPPrice(v.price);
    setPCost(v.cost); setPBackMode(v.backMode); setPBackValue(v.backValue);
    setPUnit4(v.unit4); setPHonPt(v.honPt); setPExempt(v.exempt); setPActive(v.active);
    setPReorder(v.reorder); setPCatId(v.catId);
    setBaseSig(JSON.stringify(v));
  }
  // 現在のフォーム値の署名。baseSig と違えば未保存の変更あり。
  const currentSig = () => JSON.stringify({
    type: pType, category: pCategory, name: pName, price: pPrice, cost: pCost,
    backMode: pBackMode, backValue: pBackValue, unit4: pUnit4, honPt: pHonPt,
    exempt: pExempt, active: pActive, reorder: pReorder, catId: pCatId,
  } satisfies FormValues);

  // ★④b-2「＋ 商品を追加」: 新規状態でドロワーを開く（旧: 下部フォームへスクロール）。
  function newProduct() {
    setPId(null);
    applyForm(EMPTY_FORM);
    setDetailOpen(false); // 新規は「詳細」閉じ＝編集時の hasDetail 自動展開と同じ規則
    setDrawerOpen(true);
  }

  function editProduct(p: Product) {
    const v: FormValues = {
      type: p.type, category: p.category ?? "", name: p.name, price: p.price,
      cost: costs[p.id] == null ? "" : String(costs[p.id]),
      backMode: p.back_mode, backValue: p.back_value ?? 0,
      unit4: p.unit4_json ?? { ...EMPTY_UNIT4 }, honPt: p.hon_pt,
      exempt: p.back_exempt_from_split, active: p.is_active,
      reorder: p.reorder_point == null ? "" : String(p.reorder_point),
      catId: p.category_id ?? "",
    };
    setPId(p.id);
    applyForm(v);
    // 「詳細」は既定 閉。ただし編集時に値が入っている（＝運用で使っている）なら自動で開く。
    const hasDetail = costs[p.id] != null || p.reorder_point != null || p.hon_pt > 0
      || p.back_mode === "unit4" || (p.back_value ?? 0) !== 0 || p.back_exempt_from_split;
    setDetailOpen(hasDetail);
    setDrawerOpen(true);
  }

  // ★④b-2: 閉じる。未保存の変更があるときだけ確認する（overlay クリック・閉じるボタン共通）。
  function closeDrawer() {
    if (currentSig() !== baseSig && !window.confirm("入力内容が保存されていません。閉じてよろしいですか？")) return;
    setDrawerOpen(false);
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
      p_hon_pt: pExempt ? 0 : pHonPt, p_is_active: pActive, // 明示 boolean（原則7）
      // mig0069: キャストドリンク指定も常に明示値（原則7）。★ON のとき hon_pt は 0 を送る＝
      //   CHECK products_exempt_hon_pt_chk（exempt なら hon_pt=0）に UI 側で先に合わせ、
      //   'exempt requires hon_pt 0' を発生させない（入力欄も disabled で 0 表示にしてある）。
      p_back_exempt_from_split: pExempt,
      // mig0062: 発注点も常に明示値（空欄＝null＝しきい無し）。省略に頼らない＝原則7 同列。
      p_reorder_point: pReorder.trim() === "" ? null : Number(pReorder),
      // mig0063: カテゴリも常に明示値（""＝未分類＝null）。旧 p_category（text）は現値往復のみ＝deprecated。
      p_category_id: pCatId === "" ? null : pCatId,
    });
    setMsg(error
      ? (error.message.includes("bad category") ? "カテゴリの指定が不正です（他店のカテゴリは選べません）" : error.message)
      : pId ? "商品を更新しました" : "商品を登録しました");
    // ★④b-2: 成功時のみリセットして閉じる。移設前は error でもフォームを消していたが、
    //   ドロワーでは「閉じずに中身だけ空になる」＝直す手がかりが消えるので、失敗時は入力を残す。
    if (!error) {
      setPId(null); setPName(""); setPPrice(0); setPReorder(""); setPCatId(""); setPExempt(false);
      setDrawerOpen(false);
    }
    await reload();
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
  const selectHub = (key: string) => { setSelCat(key); setVisible(PAGE); };

  // ── ★レーン④a: 列ソート（client 完結・取得も引数も不変）──
  //   利益率は原価がある行だけ計算できる＝原価/利益率は null を持ち得る。null は方向によらず末尾へ寄せる
  //  （昇順で先頭に空欄が並ぶと「安い順」を見に来た目的が達成できないため）。
  const marginOf = (p: Product) => {
    const c = costs[p.id];
    return c != null && p.price > 0 ? Math.round(((p.price - c) / p.price) * 100) : null;
  };
  const sortValue = (p: Product, key: SortKey): number | null =>
    key === "cost" ? (costs[p.id] ?? null)
      : key === "margin" ? marginOf(p)
        : key === "price" ? p.price
          : (stock[p.id] ?? 0);
  const sorted = sortKey === null ? filtered : filtered.slice().sort((a, b) => {
    const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;   // null は常に末尾
    if (vb === null) return -1;
    return sortDir === "asc" ? va - vb : vb - va;
  });
  const shown = sorted.slice(0, visible);
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // 表示カテゴリ名の解決（category_id → name。null／他店・削除済みを指す迷子は「未分類」）。
  //   ★会計区分（products.type）とは別列。混ぜない（裁定F）。
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div>
      <Toast msg={msg} />

      {/* ⑥ ハブ: カテゴリカード → クリックでその分類に絞る（すべて／未分類つき）。
          カテゴリ0件の店は type 別カードへフォールバック（register のタイル分類と同じ判定）。 */}
      <section className="nox-cardtop" style={card}>
        {/* ★レーン④a-3 ヘッダ: 3ページ共通部品（MasterPageHead）へ寄せてスケールを揃える。 */}
        <MasterPageHead
          title="商品"
          count={filtered.length}
          desc="販売価格・原価・在庫・有効状態を一覧で確認できます。"
          action={isManagerUp
            ? <button type="button" style={t.btnGold} className="nox-pthead-act" onClick={newProduct}>＋ 商品を追加</button>
            : undefined}
        />

        {/* ⑥ ハブ（④a-2 でピル化）: クリックでその分類に絞る（すべて／未分類つき）。
            カテゴリ0件の店は type 別へフォールバック（register のタイル分類と同じ判定）。
            ★分類の判定・件数・選択の挙動は④a から一切変えていない＝形だけをピルにした。 */}
        <div className="nox-pillbar">
          <button type="button" className={`nox-pill${selCat === "__all" ? " on" : ""}`} onClick={() => selectHub("__all")}>
            すべて<span className="n">{pool.length}</span>
          </button>
          {hubCards.map((h) => (
            <button key={h.key} type="button" className={`nox-pill${selCat === h.key ? " on" : ""}`} onClick={() => selectHub(h.key)}>
              {h.label}<span className="n">{h.n}</span>
            </button>
          ))}
        </div>

        {/* ③ 一覧: 運用で見る情報だけの列（名称・区分・カテゴリ・原価・利益率・価格・在庫・状態）。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>
            {filtered.length > shown.length ? `${shown.length} / ${filtered.length} 件表示中` : `${filtered.length} 件`}
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
            <button type="button" role="switch" aria-checked={showInactive} aria-label="無効も表示"
              className={showInactive ? "nox-switch on" : "nox-switch"}
              onClick={() => { setShowInactive((v) => !v); setVisible(PAGE); }}><i /></button>
            無効も表示
          </label>
        </div>
        {filtered.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>該当する商品がありません。</p>}
        {/* ★レーン④a: 1本のテキスト行 → 列テーブル。40件を上から舐めて異常行（利益率など）を
            見つけられる形にする。会計区分（products.type）と表示カテゴリ（product_categories）は
            必ず別列＝裁定F。利益率は原価の隣（原価との関係を示す値なので）。 */}
        {filtered.length > 0 && (
        <div className="nox-ptwrap">
        <table className="nox-ptable">
          <thead>
            <tr>
              <th className="col-name">商品名</th>
              <th className="col-kind">会計区分</th>
              <th className="col-cat">表示カテゴリ</th>
              {/* ソート可能な4列。th は既定でフォーカスを受けないので tabIndex＋Enter/Space を足す
                  （マウス以外でも並べ替えられるようにする）。 */}
              {([["cost", "原価"], ["margin", "利益率"], ["price", "販売価格"], ["stock", "在庫"]] as [SortKey, string][]).map(([k, label]) => (
                <th key={k} className={`col-${k} sortable`} aria-sort={ariaSort(k)} tabIndex={0}
                  onClick={() => toggleSort(k)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(k); } }}>
                  {label}
                  {/* ★④a-2: 矢印を常時表示（薄）し、アクティブな向きだけ金にする＝押せることが判る。 */}
                  <span className="arrow" aria-hidden="true">
                    <i className={sortKey === k && sortDir === "asc" ? "on" : ""}>▲</i>
                    <i className={sortKey === k && sortDir === "desc" ? "on" : ""}>▼</i>
                  </span>
                </th>
              ))}
              <th className="col-state">状態</th>
              <th className="col-act">操作</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const cost = costs[p.id];
              const margin = marginOf(p);
              return (
                <tr key={p.id} onClick={() => isManagerUp && editProduct(p)}
                  style={{ cursor: isManagerUp ? "pointer" : "default" }}>
                  <td className="col-name" data-label="商品名">
                    {/* ★④a-3: アイコン枠は撤去（会計区分は隣の列にあり、頭文字は同じ情報の二重表示だった）。
                        名前セルは2段のまま＝上に商品名、下にバック設定。
                        下段は「未設定」でも必ず文字を出す＝行高が行によって変わらない。 */}
                    <span className="nox-ptnamecell">
                      <span className="nox-pt-name">{p.name}</span>
                      {/* 状態列を畳む幅（901〜1180）だけ、無効を名前の隣にバッジで戻す＝情報を消さない */}
                      {!p.is_active && <span className="nox-statebadge nox-pt-inlinestate"><i />無効</span>}
                      <span className="nox-pt-sub">{backLabel(p)}</span>
                    </span>
                  </td>
                  <td className="col-kind" data-label="会計区分">{TYPE_LABEL_JA[p.type] ?? p.type}</td>
                  <td className="col-cat" data-label="表示カテゴリ">
                    <span className="nox-catbadge">
                      {p.category_id && catNameById.has(p.category_id) ? catNameById.get(p.category_id) : "未分類"}
                    </span>
                  </td>
                  <td className="col-cost" data-label="原価">
                    {cost != null ? <span style={{ ...t.num, color: "var(--sub)" }}>{yen(cost)}</span> : <span style={{ color: "var(--sub)" }}>—</span>}
                  </td>
                  <td className="col-margin" data-label="利益率">
                    {margin != null ? <span style={t.num}>{margin}%</span> : <span style={{ color: "var(--sub)" }}>—</span>}
                  </td>
                  <td className="col-price" data-label="販売価格">
                    <span style={{ ...t.num, fontSize: 13.5, fontWeight: 700, color: "var(--champ)", whiteSpace: "nowrap" }}>{yen(p.price)}</span>
                  </td>
                  {/* 純増①（mig0061）: 残量バー＝Σdelta と reorder_point のみ（新規取得なし・表示のみ）。 */}
                  <td className="col-stock" data-label="在庫">{stockCell(stock[p.id] ?? 0, p.reorder_point)}</td>
                  <td className="col-state" data-label="状態">
                    {/* ★④a-2: ●ドット付きバッジ（有効=--ok / 無効=--sub） */}
                    <span className={`nox-statebadge${p.is_active ? " on" : ""}`}><i />{p.is_active ? "有効" : "無効"}</span>
                  </td>
                  <td className="col-act" data-label="操作">
                    {isManagerUp && (
                      // ★今回はボタンを置くだけ＝押下時の挙動は現行のまま（下部フォームに値が入る）。
                      //   行クリックでも編集に入れる現行挙動は維持＝stopPropagation で二重発火だけ止める。
                      <button type="button" style={btnLight}
                        onClick={(e) => { e.stopPropagation(); editProduct(p); }}>編集</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        )}
        {filtered.length > shown.length && (
          <button style={{ ...btnLight, marginTop: 10 }} onClick={() => setVisible((v) => v + PAGE)}>
            もっと見る（残り {filtered.length - shown.length} 件）
          </button>
        )}
      </section>

      {/* ★④b-2: 商品フォームは右ドロワーへ移設（下部固定フォームは撤去）。
          40件スクロールした先ではなく、行の「編集」を押したその場で開く＝
          「押しても画面外で何も起きていないように見える」を構造的に解消する。
          ★フォーム本体は移設前と同一（新規/編集は pId 1つで切替・単一実装・分割しない）。
          ★>900px は右から幅460pxで出るので左の一覧が見えたまま。≤900px はボトムシート（④b-1）。 */}
      {isManagerUp && drawerOpen && (
        <Modal variant="drawer" onClose={closeDrawer}>
          <div className="nox-drawerhead">
            <strong>{pId ? "商品を編集" : "商品を追加"}</strong>
            <button type="button" className="nox-drawerx" onClick={closeDrawer} aria-label="閉じる">×</button>
          </div>
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
              <label style={{ fontSize: 12, opacity: pExempt ? 0.45 : 1 }}>
                本指名pt <input type="number" min={0} value={pExempt ? 0 : pHonPt} disabled={pExempt}
                  onChange={(e) => setPHonPt(Number(e.target.value))} style={{ ...input, width: 56 }} />
              </label>
              {/* キャストドリンク（mig0066/0069/0070）＝按分除外。ON の行は check_close の指名按分を通らず、
                  バックは drink_claims 経路（レジの「キャストに付ける」）だけで帰属する＝経路が排他。
                  ★hon_pt は 0 に強制する（CHECK products_exempt_hon_pt_chk）＝按分ループを通らない商品は
                    本指名ptの分配経路も持たないため、値を持ったまま除外指定すると pt が黙って消える。 */}
              <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <input type="checkbox" checked={pExempt}
                  onChange={(e) => { setPExempt(e.target.checked); if (e.target.checked) setPHonPt(0); }} />
                キャストドリンク（按分除外）
              </label>
              {pExempt && (
                <span style={{ fontSize: 11, color: "var(--sub)", flexBasis: "100%" }}>
                  キャストドリンクは本指名ptを持てません（0 で保存されます）。バックはレジで「キャストに付ける」と確定します。
                </span>
              )}
            </div>
          )}

          {/* 有効スイッチと保存は常時（段G: canonical スイッチ・状態と挙動は不変）。
              ★④b-2: ドロワーの下端に貼り付ける（position:sticky）＝「詳細」を開いて中身が伸びても
                 保存ボタンが常に見える。ドロワーのカード自身がスクロール容器（④b-1 の overflow-y:auto）。 */}
          <div className="nox-drawerfoot">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <button type="button" className={`nox-switch ${pActive ? "on" : ""}`} onClick={() => setPActive(!pActive)} aria-pressed={pActive} aria-label="有効"><i /></button>
              有効
            </span>
            <button style={btnDark} disabled={costsError} onClick={saveProduct}>{pId ? "更新" : "登録"}</button>
            {pId && <button style={btnLight} onClick={() => { setPId(null); setPName(""); setPReorder(""); setPCatId(""); setDetailOpen(false); }}>新規に戻す</button>}
            {costsError && <span style={{ fontSize: 12, color: "var(--bad)" }}>原価を読み込めませんでした。再読込してください</span>}
          </div>
        </Modal>
      )}
    </div>
  );
}
