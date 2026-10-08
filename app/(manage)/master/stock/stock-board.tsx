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
// ★裁定323（2026-09-29・便 X-11-7）: 棚卸しは一覧型。「検索して 1 件選択」（ProductCombo）を撤去し、在庫管理ありの有効商品をカテゴリ順に全行
//   （商品名・現在庫・実数入力・差分）。検索欄は絞り込み。実数を入れた行だけ「n 件を記録」で一括＝既存 product_stock_add(delta, '棚卸し') を行ごとに順に・
//   失敗した行で停止（記録済みは残す）。記録後は実数欄を空に戻す＝差分 0。無効商品は「無効も表示」。
//   在庫管理の判定＝products に管理フラグの列は無い → 「product_stock_totals の戻りに行がある商品（stock_logs に 1 行以上）」を管理ありとする（在庫数 null＝管理なし）。
//   役割の分担: 入荷・返品（増減）＝商品ページの行「入荷」／実数で置き換え＝この在庫ページ。
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";
import { fetchProductCategories, fetchProducts, fetchStockTotals, type MasterCategory, type MasterProduct as Product } from "@/lib/nox/master/queries";
import { stocktakeRowsOf, stocktakePlanOf } from "@/lib/nox/stock/stocktake";
import { STOCK_REASON_STOCKTAKE, stockReasonLabel } from "@/lib/nox/stock/reasons";
import { stockUnitOf } from "@/lib/nox/inventory/unit";

import { rpcErrJa as rpcErrJaCommon } from "@/lib/nox/ui/rpc-err"; // ★N2-2（2026-09-18）: 生の RPC 語の日本語化（写像に無い語は「処理できませんでした（コード: …）」）
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
// ★便 R（2026-09-18）: 棚卸し行の 4 コントロール（商品 picker・×・実数入力・実行ボタン）は同じ高さ＝theme.ts E3 の入力高さ 34px
//   （モック `.field input` height:34px・btnSm のモック `.btn.small` height:30px より入力側に揃える）。padding ではなく height で固定し
//   （行内だけの例外＝inline 上書きの衝突は無い）、box-sizing border-box・縦中央。数値入力は裁定104 の流儀（.nox-numfield＝スピナー非表示・
//   onWheel blur・右寄せ・inputMode numeric）＝ネイティブのスピナーで高さ・地色が変わらない。
const CTL_H = 34;
const ctlInput: React.CSSProperties = { ...input, height: CTL_H, boxSizing: "border-box", padding: "0 10px" };
const ctlBtn: React.CSSProperties = { height: CTL_H, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const numWheelBlur = (e: React.WheelEvent<HTMLInputElement>) => { (e.currentTarget as HTMLInputElement).blur(); };

const PAGE = 50;

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
  // ★裁定330（便 MC1）: 発注推奨＝在庫が発注基準（reorder_point）以下の商品数（旧マスタトップの KPI・警告と同じ式）
  const managedProducts = useMemo(() => products.filter((p) => p.track_stock !== false), [products]); // ★X-13-8（0166）: 在庫を管理しない商品は在庫画面の対象外
  const lowStock = managedProducts.filter((p) => p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)).length;
  const [msg, setMsg] = useState<string | null>(null);

  // ★裁定323: 棚卸し＝一覧型（商品 id → 実数の入力文字列）。delta は UI 計算
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [tq, setTq] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchProductCategories(supabase).then(setCategories); }, []);

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
  const productUnit = (id: string) => stockUnitOf(products.find((p) => p.id === id)?.type);
  const userName = (id: string | null) => (id && users.find((u) => u.id === id)?.name) ?? (id ? id.slice(0, 8) : "—");

  async function reloadStock() {
    const [ps, st] = await Promise.all([fetchProducts(supabase), fetchStockTotals(supabase)]);
    setProducts(ps);
    setStock(st);
  }

  // ★裁定323: 行（在庫管理ありだけ・カテゴリ順）と、記録する行（実数が整数で差分 ≠ 0）
  const tRows = useMemo(() => stocktakeRowsOf(managedProducts, stock, categories, { q: tq, showInactive }), [managedProducts, stock, categories, tq, showInactive]);
  const tPlan = useMemo(() => stocktakePlanOf(managedProducts, stock, actuals), [managedProducts, stock, actuals]);
  const unmanaged = products.filter((p) => p.is_active && (p.track_stock === false || stock[p.id] === undefined)).length; // ★X-13-8: track_stock=false も「管理なし」に数える

  async function recordStocktakeAll() {
    if (busy || tPlan.length === 0) return;
    setBusy(true);
    setMsg(null);
    let done = 0; let failed: string | null = null;
    const cleared: string[] = [];
    for (const r of tPlan) {
      const { error } = await supabase.rpc("product_stock_add", { p_product_id: r.id, p_delta: r.delta, p_reason: STOCK_REASON_STOCKTAKE });
      if (error) { failed = `${r.name}: ${rpcErrJaCommon(error.message)}`; break; }   // 失敗した行で停止（記録済みは残す）
      done += 1; cleared.push(r.id);
    }
    setActuals((a) => { const n = { ...a }; for (const id of cleared) delete n[id]; return n; });   // 記録した行は実数欄を空へ＝差分 0
    setBusy(false);
    setMsg(failed ? `${done} 件を記録しました。次の行の記録に失敗したため中止しました（${failed}）` : `棚卸しを ${done} 件記録しました`);
    if (done > 0) {
      await reloadStock();
      setPage(0); // page が既に 0 のときは effect が発火しないため明示リロード
      if (histOpen) await load(0, prodFilter);
    }
  }

  return (
    <div className="nox-mv1">
      <Toast msg={msg} />

      <MasterPageHead
        eyebrow="INVENTORY LEDGER"
        title="在庫（棚卸し・履歴）"
        desc="棚卸しは実数を入力すると差分を自動計算して記録します。入荷は商品ページの行から、売上による減算は会計から自動で入ります。"
      />
      {/* ★裁定330（便 MC1）: 発注推奨の警告はマスタトップから在庫画面へ（判定＝reorder_point・0 件なら出さない・文言は旧トップと同じ） */}
      {lowStock > 0 && (
        <div className="nox-alert danger">
          在庫が発注基準を下回っている商品が {lowStock} 件あります。商品マスターから補充基準を確認してください。
        </div>
      )}

      {isManagerUp && (
        <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>棚卸し</h3>
            <span style={{ fontSize: 11.5, color: "var(--sub)" }}>棚の実数を入れた行だけ記録します（差分は自動計算）</span>
          </div>
          {/* ★裁定323: 役割の分担を注記（入荷・返品＝商品ページ／実数で置き換え＝在庫ページ） */}
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
            入荷・返品（数を足す／引く）は<Link href="/master/products" className="nox-link">商品ページ</Link>の行「入荷」から。この画面は棚の実数で在庫を置き換えます。
            {unmanaged > 0 && <> 在庫を持たない商品（入荷の記録が無い商品）<span className="num">{unmanaged}</span> 件は表示していません。</>}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="商品名で絞り込み" aria-label="棚卸しの商品を絞り込み"
              style={{ ...ctlInput, width: "100%", maxWidth: 240 }} />
            <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 無効も表示
            </label>
            <span style={{ fontSize: 11.5, color: "var(--sub)" }}><span className="num">{tRows.length}</span> 件</span>
          </div>
          {tRows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>{tq.trim() ? "該当する商品がありません。" : "在庫を持つ商品がありません（商品ページの「入荷」で在庫を登録すると、ここに出ます）。"}</p>
          ) : (
            <div className="nox-ptwrap">
              <table className="nox-ptable">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th style={{ width: 90, textAlign: "right" }}>現在庫</th>
                    <th style={{ width: 130, textAlign: "right" }}>実数</th>
                    <th style={{ width: 90, textAlign: "right" }}>差分</th>
                  </tr>
                </thead>
                <tbody>
                  {tRows.map((r) => {
                    const raw = actuals[r.id] ?? "";
                    const n = raw.trim() === "" ? null : Number(raw);
                    const bad = n !== null && !Number.isInteger(n);
                    const d = n !== null && !bad ? n - r.current : null;
                    return (
                      <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.6 }}>
                        <td data-label="商品">
                          {r.head && <span style={{ display: "block", fontSize: 10.5, color: "var(--champ)", fontWeight: 800 }}>{r.categoryName}</span>}
                          {r.name}{!r.isActive && <span style={{ ...t.tag, fontSize: 10, marginLeft: 6, color: "var(--sub)", borderColor: "var(--line2)" }}>無効</span>}
                        </td>
                        <td data-label="現在庫" style={{ textAlign: "right" }}><span style={t.num}>{r.current}{r.unit}</span></td>
                        <td data-label="実数" style={{ textAlign: "right" }}>
                          <input type="number" step={1} value={raw} disabled={busy} placeholder="棚の実数" aria-label={`${r.name} の実数`}
                            onChange={(e) => setActuals((a) => ({ ...a, [r.id]: e.target.value }))}
                            className="nox-numfield" inputMode="numeric" onWheel={numWheelBlur}
                            style={{ ...ctlInput, ...t.num, textAlign: "right", width: 90, ...(bad ? { borderColor: "var(--bad)" } : {}) }} />
                          <span data-unit style={{ fontSize: 12.5, color: "var(--sub)", marginLeft: 4 }}>{r.unit}</span>
                        </td>
                        <td data-label="差分" style={{ textAlign: "right" }}>
                          <span style={{ ...t.num, fontWeight: 700, color: d == null || d === 0 ? "var(--sub)" : d > 0 ? "var(--ok)" : "var(--bad)" }}>
                            {d == null ? "—" : d > 0 ? `+${d}` : d}{d == null ? "" : r.unit}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="nox-actions end" style={{ marginTop: 10 }}>
            {Object.values(actuals).some((v) => v.trim() !== "") && (
              <button style={{ ...t.btnGhost, ...t.btnSm, ...ctlBtn, padding: "0 12px" }} disabled={busy} onClick={() => setActuals({})}>入力を消す</button>
            )}
            <button style={{ ...btnDark, ...ctlBtn, padding: "0 12px", opacity: tPlan.length === 0 || busy ? 0.5 : 1 }} disabled={tPlan.length === 0 || busy} onClick={() => void recordStocktakeAll()}>
              {busy ? "記録中…" : `${tPlan.length} 件を記録`}
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
                        {l.delta > 0 ? `+${l.delta}` : l.delta}{productUnit(l.product_id)}
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
