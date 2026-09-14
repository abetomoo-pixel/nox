"use client";

// ボトルキープ登録（A2・裁定8 N1-a）。書込は bottle_keep_register（mig0023）のみ＝
// can_register 準拠ゲート・顧客/商品の org/店照合・audit は RPC 側で完備（UI だけが無かった）。
// 配置は会計タブ内（NOX8 裁定「ボトル登録は checkout フロー」）。
// 顧客ピッカーは customers の SELECT（owner/manager＋staff∧can_crm）＝can_crm の無い staff は
// 候補 0件で登録ボタン無効（fail-closed・RPC 側も invalid customer で拒否＝二重）。
// 一覧は保管中（status='active'）のみ＝登録直後の確認用。ステータス変更 UI は A2 の範囲外。
// ★裁定254（2026-09-14・R8）: 顧客 select／ボトル select の二段をやめ、「ボトルキープを登録」→モーダル
//   （顧客ピッカー→ボトルピッカー→メモ→登録）へ。呼ぶ RPC と引数・データ源（customers 直 SELECT・props の products）は不変。
//   閉じる＝×・背景タップ・Esc。脚＝キャンセル左・登録 右（244）。ピッカーは components/nox/picker.tsx（汎用）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast, { useToast } from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import Picker from "@/components/nox/picker";

type Product = { id: string; name: string; type: string; price: number };
type Customer = { id: string; name: string; furigana?: string | null };
type Keep = { id: string; customer_id: string | null; product_id: string; opened_at: string; note: string | null };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const yen = (n: number) => "¥" + n.toLocaleString();

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
  const [open, setOpen] = useState(false);
  const [fCustomer, setFCustomer] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fNote, setFNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: cs } = await supabase.from("customers").select("id, name, furigana").order("name");
    const { data: ks } = await supabase.from("bottle_keeps")
      .select("id, customer_id, product_id, opened_at, note")
      .eq("status", "active").order("opened_at", { ascending: false }).limit(30);
    setCustomers((cs ?? []) as Customer[]);
    setKeeps((ks ?? []) as Keep[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openModal() {
    setFCustomer(""); setFProduct(""); setFNote(""); setMsg(null); setOpen(true);
  }

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
    if (!error) { setOpen(false); setFNote(""); await load(); }
  }

  const customerName = (id: string | null) => (id && customers.find((c) => c.id === id)?.name) ?? "—";
  const productName = (id: string) => bottles.find((p) => p.id === id)?.name ?? products.find((p) => p.id === id)?.name ?? "?";
  const selCustomer = customers.find((c) => c.id === fCustomer) ?? null;
  const selBottle = bottles.find((p) => p.id === fProduct) ?? null;

  return (
    <section className="nox-cardtop" style={{ ...card, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ ...t.cardTitle, margin: 0 }}>ボトルキープ</h2>
        <button style={{ ...t.btnGold, ...t.btnSm, marginLeft: "auto" }} disabled={customers.length === 0 || bottles.length === 0} onClick={openModal}>
          ボトルキープを登録
        </button>
      </div>
      <Toast msg={msg} />
      {customers.length === 0 && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>顧客が見えない権限では登録できません</p>}
      {keeps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {keeps.map((k) => (
            <div key={k.id} className="nox-listrow" style={{ padding: "5px 0", fontSize: 12.5 }}>
              <span style={{ width: 140 }}>{customerName(k.customer_id)}</span>
              <span style={{ flex: 1 }}>{productName(k.product_id)}</span>
              <span style={{ ...t.num, color: "var(--sub)" }}>{k.opened_at.slice(0, 10)}</span>
              {k.note && <span style={{ color: "var(--sub)", fontSize: 11.5 }}>{k.note}</span>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal onClose={() => !busy && setOpen(false)} maxWidth={520} scroll>
          <div className="nox-formmodal-head">
            <strong>ボトルキープを登録</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => setOpen(false)}>×</button>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ ...t.fieldLabel, marginBottom: 6 }}>顧客{selCustomer && <span style={{ color: "var(--champ)", marginLeft: 8 }}>{selCustomer.name}</span>}</div>
              <Picker
                items={customers.map((c) => ({ id: c.id, label: c.name, sublabel: c.furigana ?? undefined, avatar: true }))}
                value={fCustomer || null} onPick={setFCustomer} placeholder="顧客を検索（名前・ふりがな）" empty="該当する顧客がいません" limit={20} dense />
            </div>
            <div>
              <div style={{ ...t.fieldLabel, marginBottom: 6 }}>ボトル{selBottle && <span style={{ color: "var(--champ)", marginLeft: 8 }}>{selBottle.name}</span>}</div>
              <Picker
                items={bottles.map((p) => ({ id: p.id, label: p.name, sublabel: yen(p.price) }))}
                value={fProduct || null} onPick={setFProduct} placeholder="ボトルを検索" empty="ボトル商品がありません" limit={20} dense />
            </div>
            <label style={{ display: "block" }}>
              <span style={{ ...t.fieldLabel, display: "block", marginBottom: 4 }}>メモ（棚番号等・任意）</span>
              <input placeholder="例: 棚 A-3" value={fNote} onChange={(e) => setFNote(e.target.value)} style={{ ...input, width: "100%" }} />
            </label>
          </div>
          <div className="nox-formmodal-foot">
            <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setOpen(false)}>キャンセル</button>
            <button style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !fCustomer || !fProduct} onClick={() => void register()}>登録</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
