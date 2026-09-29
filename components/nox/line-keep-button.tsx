"use client";

// ★裁定314（2026-09-29・便 X-8-10）: ボトル種商品の明細行の「キープ」。
//   伝票の顧客（check_customer_names）から選ぶ → bottle_keep_register（0153 ★16・p_check_line_id＝その行＝行の注文者も同じ顧客になる）
//   → active で登録（開栓日＝RPC の now()＝営業中の登録）。ボトル名の既定＝商品名（明細の印字名）・残量は任意（0〜100）。
//   顧客が 1 人も付いていなければ「指名・席」タブへ誘導（onNeedCustomer）。RPC の二重防御が正（権限・org／店・'bad line'・'not on check'）。
//   「キープ済み」の表示は親（register-board）が持つ＝kept が true なら印だけを出す。メッセージは裁定281 の型。RPC 追加 0。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { checkCustomerErrJa } from "@/components/nox/check-customers-card";
import * as t from "@/lib/nox/ui/theme";

type Named = { customer_id: string; pos: number; name: string };

/** bottle_keep_register の raise 語→和文（無い語は check-customers-card の写像へ） */
export function keepErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("bad line")) return "この明細にはキープを登録できません（商品が一致しません）";
  if (m.includes("bad item") || m.includes("inactive item")) return "この商品は現在使えないためキープを登録できません";
  if (m.includes("bad remaining")) return "残量は 0〜100 の範囲で入力してください";
  if (m.includes("bad bottle_name")) return "ボトル名は 60 文字以内で入力してください";
  return checkCustomerErrJa(m);
}

export default function LineKeepButton({ storeId, checkId, lineId, productId, lineName, lineCustomerId, kept, onDone, onNeedCustomer }: {
  storeId: string; checkId: string; lineId: string; productId: string | null | undefined; lineName: string;
  lineCustomerId?: string | null;
  /** すでにキープ登録済みの行（親の判定） */
  kept: boolean;
  onDone: (text: string) => void | Promise<void>;
  /** 顧客未付与のとき「指名・席」タブへ */
  onNeedCustomer: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [named, setNamed] = useState<Named[] | null>(null);
  const [cust, setCust] = useState("");
  const [name, setName] = useState(lineName);
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (kept) return <span style={{ ...t.tag, fontSize: 10, color: "var(--ok)", borderColor: "var(--line2)", whiteSpace: "nowrap" }}>キープ済み</span>;
  if (!productId) return null;

  async function openModal() {
    setOpen(true); setErr(null); setNamed(null); setName(lineName); setPct("");
    const { data, error } = await supabase.rpc("check_customer_names", { p_check_id: checkId });
    if (error) { setNamed([]); setErr(keepErrJa(error.message)); return; }
    const rows = (data ?? []) as Named[];
    setNamed(rows);
    setCust(rows.find((r) => r.customer_id === lineCustomerId)?.customer_id ?? rows[0]?.customer_id ?? "");
  }
  async function submit() {
    if (busy || !cust) return;
    const p = pct.trim() === "" ? null : Number(pct);
    if (p !== null && (!Number.isInteger(p) || p < 0 || p > 100)) { setErr("残量は 0〜100 の整数で入力してください"); return; }
    if (name.trim().length > 60) { setErr("ボトル名は 60 文字以内で入力してください"); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("bottle_keep_register", {
      p_store_id: storeId, p_customer_id: cust, p_product_id: productId, p_note: null, p_remaining_pct: p,
      p_expires_on: null, p_shelf_no: null, p_bottle_name: name.trim() === "" ? null : name.trim(), p_check_line_id: lineId,
    });
    setBusy(false);
    if (error) { setErr(keepErrJa(error.message)); return; }
    const who = named?.find((r) => r.customer_id === cust)?.name ?? "顧客";
    setOpen(false);
    await onDone(`${name.trim() || lineName} を ${who} 様のキープに登録しました`);
  }

  return (
    <>
      <button type="button" onClick={() => void openModal()} style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px", fontSize: 11.5, whiteSpace: "nowrap" }}>キープ</button>
      {open && (
        <Modal onClose={() => { if (!busy) setOpen(false); }} maxWidth={430}>
          <div className="nox-formmodal-head">
            <strong>キープに登録</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => setOpen(false)}>×</button>
          </div>
          <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>{lineName}</p>
          {named === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>読み込み中…</p>}
          {named !== null && named.length === 0 && !err && (
            <>
              <Message kind="info">この伝票にはまだ顧客が付いていません。先に「指名・席」タブで顧客を追加してください。</Message>
              <div className="nox-formmodal-foot">
                <button type="button" style={t.btnGold} onClick={() => { setOpen(false); onNeedCustomer(); }}>指名・席タブへ</button>
                <button type="button" style={t.btnGhost} onClick={() => setOpen(false)}>キャンセル</button>
              </div>
            </>
          )}
          {named !== null && named.length > 0 && (
            <>
              <label style={{ ...t.fieldLabel, display: "block", marginBottom: 8 }}>
                持ち主（この伝票の顧客）
                <select value={cust} onChange={(e) => setCust(e.target.value)} disabled={busy} style={{ ...t.input, width: "100%", marginTop: 4 }}>
                  {named.map((r) => <option key={r.customer_id} value={r.customer_id}>{r.name}</option>)}
                </select>
              </label>
              <label style={{ ...t.fieldLabel, display: "block", marginBottom: 8 }}>
                ボトル名（60 文字まで・既定は商品名）
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={busy} style={{ ...t.input, width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>
                残量（%・任意）
                <input type="number" inputMode="numeric" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="例: 80" disabled={busy} style={{ ...t.input, width: 120, marginTop: 4, display: "block" }} />
              </label>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px", lineHeight: 1.7 }}>開栓日は今日の営業日で登録されます。この明細の注文者も同じ顧客になります。</p>
              {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
              <div className="nox-formmodal-foot">
                <button type="button" style={{ ...t.btnGold, opacity: busy || !cust ? 0.5 : 1 }} disabled={busy || !cust} onClick={() => void submit()}>{busy ? "登録中…" : "キープに登録"}</button>
                <button type="button" style={t.btnGhost} disabled={busy} onClick={() => setOpen(false)}>キャンセル</button>
              </div>
            </>
          )}
          {named !== null && named.length === 0 && err && <Message kind="error">{err}</Message>}
        </Modal>
      )}
    </>
  );
}
