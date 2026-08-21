"use client";

// 在庫（棚卸し＋履歴）＝④d-2（裁定N・案X）。旧「在庫の入出庫」フォーム（自由 delta＋自由理由）は撤去し、
// 入荷は商品一覧の行「入荷」モーダルに一本化済み（④c 裁定L）。このページは
//   1) 棚卸し … 実数を入力すると UI が「実数 − 現在庫」の差分を計算し product_stock_add(delta, '棚卸し')。
//      差分 0 は RPC を呼ばない（RPC は null/0 を 'bad delta' で拒否）。負 delta 可＝
//      合計が負になるのも構造上あり（棚卸しで 0 に落とす→商品一覧の赤バッジは仕様）。
//   2) 履歴 … stock_logs を at 降順で一覧（日時／商品／増減／理由／記録者）。
// ★ソースは stock_logs（by_user_id に actor 実データ）。audit_logs は使わない
//   （owner 限定 RLS で manager が読めず、トリガ経由の sale 系が載らない）。
// ★記録者名の解決は /audit（audit-board.tsx）と同型＝users.name ?? id.slice(0, 8)（fail-closed）。
//   manager の users RLS は自店メンバー＋本人のみ＝見えない actor は id 断片表示に落ちるだけ。
// ★ページングも /audit と同型＝PAGE=50・range で1件余分に取り次ページ有無を判定。
// ★商品絞り込みは eq(product_id)＋order(at desc)＝stock_logs_product_at_idx (product_id, at) が効く形。
// ★現在庫は fetchStockTotals（④d-1 で product_stock_totals RPC 化済み）＝独自集計を書かない。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";
import { fetchProducts, fetchStockTotals, type MasterProduct as Product } from "@/lib/nox/master/queries";
import { STOCK_REASON_STOCKTAKE, stockReasonLabel } from "@/lib/nox/stock/reasons";

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };

const PAGE = 50;

// E7a: 商品が増えても選べる検索つきコンボボックス（select の置換・表示専用の最小実装）。
//   共通部品の CastPicker は写真グリッド専用のため流用せず、ここに閉じた素の入力＋候補リストで作る。
//   ★選択の意味づけ（何に使うか）は呼び出し側・本部品は「絞って選ぶ」だけ。
function ProductCombo({ products, stock, value, onChange }: {
  products: Product[]; stock: Record<string, number>;
  value: string; onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = products.find((p) => p.id === value) ?? null;

  // 外側クリックで閉じる（候補クリックは onMouseDown で先に確定させる）
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle === ""
      ? products
      : products.filter((p) => p.name.toLowerCase().includes(needle));
    return list.slice(0, 50); // 候補は 50 件まで（絞り込めば必ず届く＝件数超過は下の注記で明示）
  }, [products, q]);

  const pick = (p: Product) => { onChange(p.id); setQ(""); setOpen(false); };

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: 240 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={open ? q : (selected?.name ?? "")}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(""); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (e.key === "Enter" && open && hits.length > 0) { e.preventDefault(); pick(hits[0]); }
          }}
          placeholder={selected ? selected.name : "商品を検索して選択"}
          aria-label="棚卸しする商品"
          role="combobox"
          aria-expanded={open}
          aria-controls="stock-product-combo-list"
          aria-autocomplete="list"
          style={{ ...input, width: "100%", maxWidth: 240 }}
        />
        {selected && (
          <button
            style={{ ...t.btnGhost, ...t.btnSm, padding: "4px 8px" }} aria-label="商品の選択を解除"
            onClick={() => { onChange(""); setQ(""); setOpen(false); }}
          >×</button>
        )}
      </div>
      {selected && !open && (
        <span style={{ fontSize: 11, color: "var(--sub)" }}>現在庫 {stock[selected.id] ?? 0}</span>
      )}
      {open && (
        <div id="stock-product-combo-list" role="listbox" aria-label="商品の候補" style={{
          position: "absolute", zIndex: 30, top: "100%", left: 0, marginTop: 4, width: 240,
          maxHeight: 240, overflowY: "auto", background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        }}>
          {hits.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, padding: "10px 12px" }}>該当する商品がありません</p>
          )}
          {hits.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              style={{
                display: "flex", width: "100%", gap: 8, alignItems: "center", justifyContent: "space-between",
                padding: "7px 12px", background: p.id === value ? "var(--card2)" : "transparent",
                border: 0, borderBottom: "1px solid var(--line2)", color: "var(--ink)",
                fontFamily: "inherit", fontSize: 12.5, textAlign: "left", cursor: "pointer",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ ...t.num, color: "var(--sub)", flexShrink: 0 }}>現在 {stock[p.id] ?? 0}</span>
            </button>
          ))}
          {q.trim() === "" && products.length > hits.length && (
            <p style={{ fontSize: 11, color: "var(--sub)", margin: 0, padding: "8px 12px" }}>
              ほか {products.length - hits.length} 件（商品名を入力すると絞り込めます）
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type StockLog = {
  id: string; product_id: string; delta: number; reason: string | null; by_user_id: string | null; at: string;
};

const fmtAt = (iso: string) => iso.replace("T", " ").slice(0, 19);

export type StockInitial = { products: Product[]; stock: Record<string, number> };

export default function StockBoard({ isManagerUp, initial, users }: {
  isManagerUp: boolean; initial: StockInitial; users: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [stock, setStock] = useState<Record<string, number>>(initial.stock);
  const [msg, setMsg] = useState<string | null>(null);

  // 棚卸しフォーム（実数入力・delta は UI 計算）
  const [tProd, setTProd] = useState("");
  const [tActual, setTActual] = useState("");
  const [busy, setBusy] = useState(false);

  // 履歴（/audit 同型ページング＋商品絞り込み）
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [prodFilter, setProdFilter] = useState("");
  // E7a: 履歴は初期折りたたみ（開くまで取得もしない＝表示と同時に1回だけ読む）。展開後の体裁は現行のまま。
  const [histOpen, setHistOpen] = useState(false);

  const load = useCallback(async (p: number, productId: string) => {
    let q = supabase.from("stock_logs")
      .select("id, product_id, delta, reason, by_user_id, at")
      .order("at", { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE); // 1件余分に取って次ページ有無を判定（/audit 同型）
    if (productId) q = q.eq("product_id", productId);
    const { data } = await q;
    const rows = (data ?? []) as StockLog[];
    setHasMore(rows.length > PAGE);
    setLogs(rows.slice(0, PAGE));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (histOpen) void load(page, prodFilter); }, [histOpen, page, prodFilter, load]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const userName = (id: string | null) => (id && users.find((u) => u.id === id)?.name) ?? (id ? id.slice(0, 8) : "—");

  async function reloadStock() {
    const [ps, st] = await Promise.all([fetchProducts(supabase), fetchStockTotals(supabase)]);
    setProducts(ps);
    setStock(st);
  }

  // 差分プレビュー（実数が整数でないときは null＝記録不可）
  const current = tProd ? (stock[tProd] ?? 0) : null;
  const actualNum = tActual === "" ? null : Number(tActual);
  const delta = current != null && actualNum != null && Number.isInteger(actualNum) ? actualNum - current : null;

  async function recordStocktake() {
    if (!tProd || delta == null || busy) return;
    if (delta === 0) { setMsg("実数と現在庫が同じです（差分 0 は記録しません）"); return; }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("product_stock_add", {
      p_product_id: tProd, p_delta: delta, p_reason: STOCK_REASON_STOCKTAKE,
    });
    setBusy(false);
    setMsg(error ? error.message : `棚卸しを記録しました（${delta > 0 ? "+" : ""}${delta}）`);
    if (!error) {
      setTActual("");
      await reloadStock();
      // page が既に 0 のときは effect が発火しないため明示リロード
      setPage(0);
      await load(0, prodFilter);
    }
  }

  return (
    <div>
      <Toast msg={msg} />

      <MasterPageHead
        eyebrow="INVENTORY LEDGER"
        title="在庫（棚卸し・履歴）"
        desc="棚卸しは実数を入力すると差分を自動計算して記録します。入荷は商品ページの行から、売上による減算は会計から自動で入ります。"
      />

      {isManagerUp && (
        <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>棚卸し</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* E7a: 商品数が増えても選べるよう select → 検索つきコンボボックスへ（選択の意味・記録経路は不変） */}
            <ProductCombo products={products} stock={stock} value={tProd}
              onChange={(id) => { setTProd(id); setTActual(""); }} />
            <label style={{ fontSize: 12 }}>
              実数{" "}
              <input type="number" step={1} value={tActual} onChange={(e) => setTActual(e.target.value)}
                disabled={!tProd} placeholder="棚の実数" style={{ ...input, width: 90 }} />
            </label>
            {tProd && (
              <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                現在 <span style={{ ...t.num, color: "var(--ink)" }}>{current}</span>
                {delta != null && (
                  <>
                    {" → 差分 "}
                    <span style={{ ...t.num, fontWeight: 700, color: delta > 0 ? "var(--ok)" : delta < 0 ? "var(--bad)" : "var(--sub)" }}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </>
                )}
              </span>
            )}
            <button style={btnDark} disabled={!tProd || delta == null || delta === 0 || busy} onClick={recordStocktake}>
              棚卸しを記録
            </button>
          </div>
        </section>
      )}

      <section className="nox-cardtop" style={card}>
        {/* E7a: 見出し行は常時・中身は「履歴を表示」で展開（初期は畳む）。展開後の体裁は現行のまま。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: histOpen ? "0 0 10px" : 0 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>履歴</h3>
          <button
            style={{ ...t.btnGhost, ...t.btnSm, marginLeft: histOpen ? 0 : "auto" }}
            aria-expanded={histOpen}
            onClick={() => setHistOpen((v) => !v)}
          >{histOpen ? "履歴を隠す" : "履歴を表示"}</button>
          {histOpen && (
            <select value={prodFilter} onChange={(e) => { setPage(0); setProdFilter(e.target.value); }}
              aria-label="商品で絞り込み" style={{ ...input, padding: "6px 9px", fontSize: 12, marginLeft: "auto" }}>
              <option value="">商品で絞り込み</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        {histOpen && (
        <>
        {logs.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>履歴はありません。</p>}
        {logs.length > 0 && (
          <div className="nox-ptwrap">
            <table className="nox-ptable">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>日時</th>
                  <th>商品</th>
                  <th style={{ width: 70, textAlign: "right" }}>増減</th>
                  <th style={{ width: 130 }}>理由</th>
                  <th style={{ width: 110 }}>記録者</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td data-label="日時"><span style={t.num}>{fmtAt(l.at)}</span></td>
                    <td data-label="商品">{productName(l.product_id)}</td>
                    <td data-label="増減" style={{ textAlign: "right" }}>
                      <span style={{ ...t.num, fontWeight: 700, color: l.delta > 0 ? "var(--ok)" : "var(--bad)" }}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </span>
                    </td>
                    <td data-label="理由">{stockReasonLabel(l.reason)}</td>
                    <td data-label="記録者">{userName(l.by_user_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>← 新しい方</button>
          <span style={{ fontSize: 12, color: "var(--sub)", alignSelf: "center" }}>ページ {page + 1}</span>
          <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}>古い方 →</button>
        </div>
        </>
        )}
      </section>
    </div>
  );
}
