"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CompMaster from "./comp-master";

type Product = {
  id: string; type: string; category: string | null; name: string; price: number; cost: number | null;
  back_mode: string; back_value: number | null; unit4_json: Record<string, number> | null; hon_pt: number; is_active: boolean;
};
type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };
type StockLog = { product_id: string; delta: number; reason: string | null; at: string };

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

const EMPTY_UNIT4 = { hon: 0, jonai: 0, dohan: 0, free: 0 };

export default function MasterBoard({ storeId, isManagerUp, isOwner }: { storeId: string; isManagerUp: boolean; isOwner: boolean }) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
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
    const { data: ss } = await supabase.from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
    const { data: logs } = await supabase.from("stock_logs").select("product_id, delta, reason, at");
    const st: Record<string, number> = {};
    for (const l of (logs ?? []) as StockLog[]) st[l.product_id] = (st[l.product_id] ?? 0) + l.delta;
    setProducts((ps ?? []) as Product[]);
    setSeats((ss ?? []) as Seat[]);
    setStock(st);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  function editProduct(p: Product) {
    setPId(p.id); setPType(p.type); setPCategory(p.category ?? ""); setPName(p.name);
    setPPrice(p.price); setPCost(p.cost == null ? "" : String(p.cost));
    setPBackMode(p.back_mode); setPBackValue(p.back_value ?? 0);
    setPUnit4(p.unit4_json ?? { ...EMPTY_UNIT4 }); setPHonPt(p.hon_pt); setPActive(p.is_active);
  }

  async function saveProduct() {
    setMsg(null);
    const { error } = await supabase.rpc("set_product", {
      p_id: pId, p_store_id: storeId, p_type: pType, p_category: pCategory || null,
      p_name: pName, p_price: pPrice, p_cost: pCost === "" ? null : Number(pCost),
      p_back_mode: pBackMode,
      p_back_value: pBackMode === "rate" ? pBackValue : null,
      p_unit4: pBackMode === "unit4" ? pUnit4 : null,
      p_hon_pt: pHonPt, p_is_active: pActive, // 明示 boolean（原則7）
    });
    setMsg(error ? error.message : pId ? "商品を更新しました" : "商品を登録しました");
    setPId(null); setPName(""); setPPrice(0);
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

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={t.pheadH1}>マスタ管理</h1>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>商品（クリックで編集）</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
              {["種別", "名称", "価格", "バック", "本指名pt", "在庫", "状態"].map((h) => <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} onClick={() => isManagerUp && editProduct(p)} style={{ borderBottom: "1px solid var(--line)", cursor: isManagerUp ? "pointer" : "default" }}>
                <td style={{ padding: 6 }}>{p.type}</td>
                <td style={{ padding: 6 }}>{p.name}</td>
                <td style={{ padding: 6, ...t.num }}>{yen(p.price)}</td>
                <td style={{ padding: 6 }}>
                  {p.back_mode === "rate" ? `${p.back_value}%` : `単価表（本${p.unit4_json?.hon ?? 0}…）`}
                </td>
                <td style={{ padding: 6, ...t.num }}>{p.hon_pt}</td>
                <td style={{ padding: 6, ...t.num }}>{stock[p.id] ?? 0}</td>
                <td style={{ padding: 6, color: p.is_active ? "var(--ok)" : "var(--sub)" }}>{p.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* 操作 UI は manager 以上のみ（RPC 側も拒否＝二重） */}
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{pId ? "編集中" : "新規"}</span>
            <select value={pType} onChange={(e) => setPType(e.target.value)} style={input}>
              <option value="drink">drink</option><option value="champ">champ</option><option value="bottle">bottle</option>
            </select>
            <input placeholder="名称" value={pName} onChange={(e) => setPName(e.target.value)} style={{ ...input, width: 160 }} />
            <label style={{ fontSize: 12 }}>価格 <input type="number" min={0} value={pPrice} onChange={(e) => setPPrice(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ fontSize: 12 }}>原価 <input type="number" min={0} value={pCost} onChange={(e) => setPCost(e.target.value)} placeholder="任意" style={{ ...input, width: 80 }} /></label>
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
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={pActive} onChange={(e) => setPActive(e.target.checked)} /> 有効</label>
            <button style={btnDark} onClick={saveProduct}>{pId ? "更新" : "登録"}</button>
            {pId && <button style={btnLight} onClick={() => { setPId(null); setPName(""); }}>新規に戻す</button>}
          </div>
        )}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>席（クリックで編集）</h2>
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
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={sActive} onChange={(e) => setSActive(e.target.checked)} /> 有効</label>
            <button style={btnDark} onClick={saveSeat}>{sId ? "更新" : "登録"}</button>
          </div>
        )}
      </section>

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

      <CompMaster storeId={storeId} isManagerUp={isManagerUp} isOwner={isOwner} />
    </div>
  );
}
