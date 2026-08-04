"use client";

// 在庫の入出庫（マスタIA再編 レーン③）。master-board.tsx の view === "products" にあった
// 「在庫の入出庫（append-only）」セクションをそのまま移設したもの。
// ★JSX・state・product_stock_add の3引数は1文字も変えていない。
// ★元のセクションは丸ごと isManagerUp ガードだったため、ページ側で isManagerUp を要求している
//   （page.tsx）。ここでも従来どおりガードを残す＝二重。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { fetchProducts, fetchStockTotals, type MasterProduct as Product } from "@/lib/nox/master/queries";

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

export type StockInitial = { products: Product[]; stock: Record<string, number> };

export default function StockBoard({ isManagerUp, initial }: {
  isManagerUp: boolean; initial: StockInitial;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [stock, setStock] = useState<Record<string, number>>(initial.stock);
  const [msg, setMsg] = useState<string | null>(null);

  // 在庫フォーム
  const [stProd, setStProd] = useState("");
  const [stDelta, setStDelta] = useState(0);
  const [stReason, setStReason] = useState("");

  async function reload() {
    const [ps, st] = await Promise.all([fetchProducts(supabase), fetchStockTotals(supabase)]);
    setProducts(ps);
    setStock(st);
  }

  async function addStock() {
    if (!stProd || !stDelta) return;
    setMsg(null);
    const { error } = await supabase.rpc("product_stock_add", {
      p_product_id: stProd, p_delta: stDelta, p_reason: stReason || null,
    });
    setMsg(error ? error.message : "在庫を記録しました");
    setStDelta(0); setStReason("");
    await reload();
  }

  return (
    <div>
      <Toast msg={msg} />

      {isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>在庫の入出庫（append-only）</h2>
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
    </div>
  );
}
