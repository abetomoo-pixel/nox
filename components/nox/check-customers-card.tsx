"use client";

// ★裁定305（mig0153・2026-09-25・D1）: レジ「指名・席」タブの「顧客」カード＝伝票の顧客一覧（check_customer_names＝can_register の cast にも出る）・
//   追加（customers の直 SELECT＝RLS・client filter＝305-8）・外す（check_customer_remove）・注文行の「誰の注文」（check_line_set_customer・null＝解除）・
//   キープ出し（顧客の active なキープから 1 タップ＝bottle_keep_out・冪等キーは押下ごと・印字名「キープ出し …」は RPC が付ける）。
//   RPC の二重防御が正（権限・org／店・open・'not on check'・'keep not active'）。fetch＝1 回（names／customers／bottle_keeps の 3 クエリ並列）。メッセージは裁定281 の型。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// ★裁定321（2026-09-29・便 X-11-2）: 「新規登録して追加」＝名前必須・ふりがな・電話任意 → customer_register → check_customer_add。詳細は /customers で後編集。
//   customer_register の権限は owner／manager／顧客権限のある staff（RPC 追加 0 の便＝cast とレジ権限のみの staff は 'forbidden' の文言を出す）。
// ★便 X-11-2b: 候補表示＝検索欄が空なら一覧は出さず「最近来店 5 人」「担当キャストの顧客（5 人まで）」。1 文字以上で名前／ふりがな／電話の部分一致・
//   最終来店日の降順・10 件＋「さらに表示」。0 件のときは「新規登録して追加」を主ボタンに。材料＝customers の直読（tel を含む）＋ customer_list_summary の戻り。
// ★便 X-11-3: 候補の行から直接「追加」（選択→追加の 2 段をやめる）・メッセージは追加欄の直下に出す（カードの最下部だと見えない）。
import { Message } from "@/components/ui/toast";
import CustomerPickModal from "@/components/nox/customer-pick-modal"; // ★裁定377（GV-B W-7）: 伝票の顧客追加も共通モーダル
import * as t from "@/lib/nox/ui/theme";

type Named = { customer_id: string; pos: number; name: string; bottle_names: string[] };
type Cust = { id: string; name: string; furigana: string | null; tel?: string | null };
type Keep = { id: string; customer_id: string | null; bottle_name: string | null; product_id: string; remaining_pct: number | null; shelf_no: string | null; last_used_at: string | null };
export type CustomerLine = { id: string; name_snapshot: string; kind: string; line_total: number; customer_id?: string | null; time_auto?: boolean };

/** RPC のエラー語→和文（裁定281・握り潰さない） */
export function checkCustomerErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("exists")) return "その顧客はすでにこの伝票に付いています";
  if (m.includes("bad name")) return "名前は 1〜80 文字で入力してください";
  if (m.includes("invalid customer")) return "顧客が不正です（同じ店の顧客を選択してください）";
  if (m.includes("not on check")) return "この伝票に付いていない顧客です（先に顧客を追加してください）";
  if (m.includes("keep not active")) return "このキープは出せません（保管中ではありません）";
  if (m.includes("not open")) return "会計済みの伝票には操作できません";
  if (m.includes("billing locked")) return "ご契約の状態により操作できません";
  if (m.includes("forbidden")) return "権限がありません";
  return `処理できませんでした（コード: ${m || "unknown"}）`;
}

export default function CheckCustomersCard({ checkId, storeId, isOpen, lines: _lines, products, onChanged, castIds = [] }: {
  checkId: string; storeId: string; isOpen: boolean;
  /** ★X-11-2b: 伝票の指名キャスト（担当キャストの顧客の候補に使う） */
  castIds?: string[];
  /** 伝票の明細（370 で未使用＝互換のため残す） */
  lines: CustomerLine[];
  products: { id: string; name: string }[];
  /** RPC 後に親の伝票を読み直す */
  onChanged: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [named, setNamed] = useState<Named[] | null>(null);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [keeps, setKeeps] = useState<Keep[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false); // ★裁定377
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [n, c] = await Promise.all([
      supabase.rpc("check_customer_names", { p_check_id: checkId }),
      supabase.from("customers").select("id, name, furigana, tel").eq("store_id", storeId).eq("is_active", true).order("name"),
    ]); // ★裁定377: 候補（customer_list_summary）は共通モーダル側で読む
    const rows = ((n.data ?? []) as Named[]);
    setNamed(n.error ? [] : rows);
    setCusts(((c.data ?? []) as Cust[]));
    const ids = rows.map((r) => r.customer_id);
    if (ids.length === 0) { setKeeps([]); return; }
    const { data: ks } = await supabase.from("bottle_keeps").select("id, customer_id, bottle_name, product_id, remaining_pct, shelf_no, last_used_at").in("customer_id", ids).eq("status", "active").order("opened_at");
    setKeeps((ks ?? []) as Keep[]);
  }, [supabase, checkId, storeId]);
  useEffect(() => { void load(); }, [load]);

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

  return (
    <div className="nox-cardtop" style={{ ...t.card, scrollMarginTop: 140 }} id="check-customers" data-check-customers="1">{/* ★便 X13-G W-3: 伝票上部のお客様名から飛ぶ先 */}
      <h3 style={t.cardTitle}>顧客</h3>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>この伝票のお客様。最初の 1 人が来店のお客様（併存）になります。注文ごとのお客様は明細の「お客様」チップから付けます。</p>
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
      {isOpen && (/* ★裁定377（GV-B W-7）: 伝票の顧客追加＝共通モーダル（①この伝票のお客様②候補③全員④新規登録）。旧インライン候補は撤去 */
        <div style={{ marginBottom: 12 }}>
          <button type="button" style={{ ...t.btnSecondary48, width: "100%" }} disabled={busy} data-cust-add="1" onClick={() => setPickOpen(true)}>＋ お客様を追加</button>
          {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message></div>}
        </div>
      )}
      {pickOpen && (
        <CustomerPickModal storeId={storeId} checkId={checkId} mode="add" castIds={castIds} onClose={() => setPickOpen(false)}
          onPicked={async (name) => { setPickOpen(false); setMsg({ kind: "success", text: `${name ?? "お客様"} を追加しました` }); await load(); await onChanged(); }} />
      )}
      {/* ★裁定370（GV-21・便 GV-A）: 「誰の注文を付ける」セクションは廃止＝明細の各商品行の「お客様」チップ（register-board）から同じモーダルで付ける。用語は「お客様」で統一 */}
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
      {!isOpen && msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </div>
  );
}
