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
import {
  fetchProducts, fetchProductCategories, fetchProductCosts, fetchStockTotals,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

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

  function editProduct(p: Product) {
    setPId(p.id); setPType(p.type); setPCategory(p.category ?? ""); setPName(p.name);
    setPPrice(p.price); setPCost(costs[p.id] == null ? "" : String(costs[p.id]));
    setPBackMode(p.back_mode); setPBackValue(p.back_value ?? 0);
    setPUnit4(p.unit4_json ?? { ...EMPTY_UNIT4 }); setPHonPt(p.hon_pt); setPActive(p.is_active);
    setPReorder(p.reorder_point == null ? "" : String(p.reorder_point));
    setPCatId(p.category_id ?? "");
    setPExempt(p.back_exempt_from_split);
    // 「詳細」は既定 閉。ただし編集時に値が入っている（＝運用で使っている）なら自動で開く。
    const hasDetail = costs[p.id] != null || p.reorder_point != null || p.hon_pt > 0
      || p.back_mode === "unit4" || (p.back_value ?? 0) !== 0 || p.back_exempt_from_split;
    setDetailOpen(hasDetail);
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
    setPId(null); setPName(""); setPPrice(0); setPReorder(""); setPCatId(""); setPExempt(false);
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
  const shown = filtered.slice(0, visible);
  const selectHub = (key: string) => { setSelCat(key); setVisible(PAGE); };

  return (
    <div>
      <Toast msg={msg} />

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
    </div>
  );
}
