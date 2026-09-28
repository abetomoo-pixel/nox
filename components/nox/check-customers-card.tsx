"use client";

// ★裁定305（mig0153・2026-09-25・D1）: レジ「指名・席」タブの「顧客」カード＝伝票の顧客一覧（check_customer_names＝can_register の cast にも出る）・
//   追加（customers の直 SELECT＝RLS・client filter＝305-8）・外す（check_customer_remove）・注文行の「誰の注文」（check_line_set_customer・null＝解除）・
//   キープ出し（顧客の active なキープから 1 タップ＝bottle_keep_out・冪等キーは押下ごと・印字名「キープ出し …」は RPC が付ける）。
//   RPC の二重防御が正（権限・org／店・open・'not on check'・'keep not active'）。fetch＝1 回（names／customers／bottle_keeps の 3 クエリ並列）。メッセージは裁定281 の型。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Picker from "@/components/nox/picker";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";

type Named = { customer_id: string; pos: number; name: string; bottle_names: string[] };
type Cust = { id: string; name: string; furigana: string | null };
type Keep = { id: string; customer_id: string | null; bottle_name: string | null; product_id: string; remaining_pct: number | null; shelf_no: string | null; last_used_at: string | null };
export type CustomerLine = { id: string; name_snapshot: string; kind: string; line_total: number; customer_id?: string | null; time_auto?: boolean };

/** RPC のエラー語→和文（裁定281・握り潰さない） */
export function checkCustomerErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("exists")) return "その顧客はすでにこの伝票に付いています";
  if (m.includes("invalid customer")) return "顧客が不正です（同じ店の顧客を選択してください）";
  if (m.includes("not on check")) return "この伝票に付いていない顧客です（先に顧客を追加してください）";
  if (m.includes("keep not active")) return "このキープは出せません（保管中ではありません）";
  if (m.includes("not open")) return "会計済みの伝票には操作できません";
  if (m.includes("billing locked")) return "ご契約の状態により操作できません";
  if (m.includes("forbidden")) return "権限がありません";
  return `処理できませんでした（コード: ${m || "unknown"}）`;
}

export default function CheckCustomersCard({ checkId, storeId, isOpen, lines, products, onChanged }: {
  checkId: string; storeId: string; isOpen: boolean;
  /** 伝票の明細（注文者の付け替え対象＝自動時間行以外） */
  lines: CustomerLine[];
  products: { id: string; name: string }[];
  /** RPC 後に親の伝票を読み直す */
  onChanged: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [named, setNamed] = useState<Named[] | null>(null);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [keeps, setKeeps] = useState<Keep[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);

  const load = useCallback(async () => {
    const [n, c] = await Promise.all([
      supabase.rpc("check_customer_names", { p_check_id: checkId }),
      supabase.from("customers").select("id, name, furigana").eq("store_id", storeId).eq("is_active", true).order("name"),
    ]);
    const rows = ((n.data ?? []) as Named[]);
    setNamed(n.error ? [] : rows);
    setCusts(((c.data ?? []) as Cust[]));
    const ids = rows.map((r) => r.customer_id);
    if (ids.length === 0) { setKeeps([]); return; }
    const { data: ks } = await supabase.from("bottle_keeps").select("id, customer_id, bottle_name, product_id, remaining_pct, shelf_no, last_used_at").in("customer_id", ids).eq("status", "active").order("opened_at");
    setKeeps((ks ?? []) as Keep[]);
  }, [supabase, checkId, storeId]);
  useEffect(() => { void load(); }, [load]);

  const onCheck = new Set((named ?? []).map((r) => r.customer_id));
  const candidates = custs.filter((c) => !onCheck.has(c.id));
  const nameOf = (id: string | null | undefined) => (named ?? []).find((r) => r.customer_id === id)?.name ?? custs.find((c) => c.id === id)?.name ?? "（顧客）";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "（商品）";

  async function call(label: string, fn: string, args: Record<string, unknown>, okText: string) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: `${label}: ${checkCustomerErrJa(error.message)}` }); return; }
    setMsg({ kind: "success", text: okText });
    await load();
    await onChanged();
  }

  const targetLines = lines.filter((l) => !l.time_auto && l.kind !== "keep_out");
  return (
    <div className="nox-cardtop" style={t.card}>
      <h3 style={t.cardTitle}>顧客</h3>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>この伝票のお客様。最初の 1 人が来店の名義（併存）になります。注文行ごとに「誰の注文」を付けられます。</p>
      {named === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>—</p>}
      {named !== null && named.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>顧客はまだ付いていません。</p>}
      {named !== null && named.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {named.map((r) => (
            <div key={r.customer_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span className="num" style={{ fontSize: 11, color: "var(--sub)", width: 18 }}>{r.pos + 1}</span>
              <span style={{ fontWeight: 700 }}>{r.name}</span>
              {r.bottle_names.length > 0 && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>キープ {r.bottle_names.join("・")}</span>}
              {isOpen && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy}
                onClick={() => void call("外す", "check_customer_remove", { p_check_id: checkId, p_customer_id: r.customer_id }, `${r.name} を外しました`)}>外す</button>}
            </div>
          ))}
        </div>
      )}
      {isOpen && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>顧客を追加</div>
          {custs.length === 0
            ? <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>顧客一覧を読める権限がありません（顧客の追加は店長・顧客権限のあるスタッフから）。</p>
            : <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px" }}>
                  <Picker dense items={candidates.map((c) => ({ id: c.id, label: c.name, sublabel: c.furigana ?? undefined }))} value={pick} onPick={setPick} onClear={() => setPick(null)} disabled={busy} placeholder="顧客名で検索" empty="（追加できる顧客がいません）" />
                </div>
                <button type="button" className="nox-btn" disabled={busy || !pick}
                  onClick={() => { const id = pick; setPick(null); void call("追加", "check_customer_add", { p_check_id: checkId, p_customer_id: id }, `${nameOf(id)} を追加しました`); }}>追加</button>
              </div>}
        </div>
      )}
      {/* 誰の注文＝注文行ごとに顧客を付ける（null＝解除） */}
      {isOpen && named !== null && named.length > 0 && targetLines.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen}>誰の注文 {whoOpen ? "を閉じる" : "を付ける"}</button>
          {whoOpen && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {targetLines.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name_snapshot} <span className="num" style={{ color: "var(--sub)" }}>¥{l.line_total.toLocaleString("en-US")}</span></span>
                  <select value={l.customer_id ?? ""} disabled={busy} aria-label={`${l.name_snapshot} の注文者`} style={{ ...t.input, width: "auto", padding: "6px 8px", fontSize: 12 }}
                    onChange={(e) => { const v = e.target.value || null; void call("注文者", "check_line_set_customer", { p_line_id: l.id, p_customer_id: v }, v ? `${l.name_snapshot} を ${nameOf(v)} の注文にしました` : `${l.name_snapshot} の注文者を解除しました`); }}>
                    <option value="">（未指定＝均等割り）</option>
                    {named.map((r) => <option key={r.customer_id} value={r.customer_id}>{r.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* キープ出し＝顧客の active なキープから 1 タップ（bottle_keep_out・冪等キーは押下ごと） */}
      {named !== null && named.length > 0 && keeps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>キープ出し（0 円の明細「キープ出し」を足します・在庫は減りません）</div>
          <div style={{ display: "grid", gap: 6 }}>
            {keeps.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span>{k.bottle_name ?? productName(k.product_id)}<span style={{ color: "var(--sub)", marginLeft: 6 }}>{nameOf(k.customer_id)}{k.remaining_pct != null ? `・残 ${k.remaining_pct}%` : ""}{k.shelf_no ? `・棚 ${k.shelf_no}` : ""}</span></span>
                {isOpen && <button type="button" className="nox-btn" style={{ marginLeft: "auto" }} disabled={busy}
                  onClick={() => void call("キープ出し", "bottle_keep_out", { p_keep_id: k.id, p_check_id: checkId, p_idem_key: crypto.randomUUID() }, `${k.bottle_name ?? productName(k.product_id)} を出しました`)}>出す</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </div>
  );
}
