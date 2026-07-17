"use client";

// ボトルキープ登録（A2・裁定8 N1-a）。書込は bottle_keep_register（mig0023）のみ＝
// can_register 準拠ゲート・顧客/商品の org/店照合・audit は RPC 側で完備（UI だけが無かった）。
// 配置は会計タブ内（NOX8 裁定「ボトル登録は checkout フロー」）。
// 顧客ピッカーは customers の SELECT（owner/manager＋staff∧can_crm）＝can_crm の無い staff は
// 候補 0件で登録ボタン無効（fail-closed・RPC 側も invalid customer で拒否＝二重）。
// 一覧は保管中（status='active'）のみ＝登録直後の確認用。ステータス変更 UI は A2 の範囲外。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast, { useToast } from "@/components/ui/toast";

type Product = { id: string; name: string; type: string; price: number };
type Customer = { id: string; name: string };
type Keep = { id: string; customer_id: string | null; product_id: string; opened_at: string; note: string | null };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

function errJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("invalid customer")) return "顧客が不正です（同じ店の顧客を選択してください）";
  if (msg.includes("inactive item")) return "この商品は無効化されています";
  if (msg.includes("bad item")) return "商品が不正です";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function BottleKeepPanel({ storeId, products }: { storeId: string; products: Product[] }) {
  const supabase = createClient();
  const { msg, setMsg } = useToast();
  const bottles = products.filter((p) => p.type === "bottle");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [keeps, setKeeps] = useState<Keep[]>([]);
  const [fCustomer, setFCustomer] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fNote, setFNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: cs } = await supabase.from("customers").select("id, name").order("name");
    const { data: ks } = await supabase.from("bottle_keeps")
      .select("id, customer_id, product_id, opened_at, note")
      .eq("status", "active").order("opened_at", { ascending: false }).limit(30);
    setCustomers((cs ?? []) as Customer[]);
    setKeeps((ks ?? []) as Keep[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function register() {
    if (!fCustomer || !fProduct) return;
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc("bottle_keep_register", {
      p_store_id: storeId, p_customer_id: fCustomer, p_product_id: fProduct,
      p_note: fNote.trim() === "" ? null : fNote.trim(),
    });
    setBusy(false);
    setMsg(error ? `登録に失敗: ${errJa(error.message)}` : "ボトルを登録しました");
    if (!error) { setFNote(""); await load(); }
  }

  const customerName = (id: string | null) => (id && customers.find((c) => c.id === id)?.name) ?? "—";
  const productName = (id: string) => bottles.find((p) => p.id === id)?.name ?? products.find((p) => p.id === id)?.name ?? "?";

  return (
    <section className="nox-cardtop" style={{ ...card, width: "100%" }}>
      <h2 style={t.cardTitle}>ボトルキープ</h2>
      <Toast msg={msg} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} style={{ ...input, maxWidth: 200 }}>
          <option value="">顧客を選択</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} style={{ ...input, maxWidth: 220 }}>
          <option value="">ボトルを選択</option>
          {bottles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input placeholder="メモ（棚番号等・任意）" value={fNote} onChange={(e) => setFNote(e.target.value)} style={{ ...input, width: 180 }} />
        <button style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !fCustomer || !fProduct} onClick={register}>登録</button>
        {customers.length === 0 && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>顧客が見えない権限では登録できません</span>}
      </div>
      {keeps.length > 0 && (
        <div>
          {keeps.map((k) => (
            <div key={k.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
              <span style={{ width: 140 }}>{customerName(k.customer_id)}</span>
              <span style={{ flex: 1 }}>{productName(k.product_id)}</span>
              <span style={{ ...t.num, color: "var(--sub)" }}>{k.opened_at.slice(0, 10)}</span>
              {k.note && <span style={{ color: "var(--sub)", fontSize: 11.5 }}>{k.note}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
