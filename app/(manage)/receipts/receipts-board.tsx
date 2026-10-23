"use client";

// 領収書 発行台帳（R2-c mig0099）。一覧＝receipt_issues 直読（RLS owner/manager 自店）・
//   void＝receipt_issue_void 結線（理由入力・既 void は無音＝RPC 側）。
//   発行は /register の会計完了モーダルから。★便 GV-C C-13（GV-59・裁定402）: 各行に「再発行」「公開ページ」「印刷」（共用の印字実体）。
//   再発行＝同じ伝票・同じ金額（固定）で新しい番号・宛名と但し書きは訂正可。有効な行は先に取消（receipt_issue_void・理由「再発行のため」）→
//   receipt_issue（既存 2 RPC の順呼び＝途中で失敗したら元の行は取消済みのまま＝取消済みの行から再発行し直せる）。
//   取消済みの行は発行だけ。★日付の訂正・対応関係（R-000001→R-000003）・操作者の記録は引数も列も無い＝0175 待ち。
//   ★token は一覧に出すが公開 URL の形でのみ（コピー用）。audit には token が載らない（mig0099）。
import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";
import ReceiptPrintSheet, { type ReceiptPrintItem } from "@/components/nox/receipt-print"; // ★便 GV-C C-13
import { receiptReissueErrJa } from "@/lib/nox/register/receipt-ledger";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 2 同乗 R-6
import { PAYMENT_METHOD_LABEL, stampNoticeOf } from "@/lib/nox/rules-0175/invoice-receipt"; // ★追補 2 同乗 R-6（裁定422 候補）

type Store = { id: string; name: string; settings_json?: Record<string, unknown> | null };
type Issue = {
  id: string; store_id: string; check_id: string; serial: number; amount: number;
  recipient: string | null; proviso: string | null; store_name_snap: string; biz_date: string;
  issued_at: string; issued_by: string | null; token: string; expires_on: string;
  voided: boolean; void_note: string | null;
  payment_method?: string | null; tax_breakdown?: unknown; issued_hash?: string | null; // ★追補 2 同乗 R-6: 0175 後に現れる列（select * なので列の有無に依らない）
};

const yen = (n: number) => "¥" + n.toLocaleString();
const PAGE = 50;
const serialNo = (n: number) => `R-${String(n).padStart(6, "0")}`;

export default function ReceiptsBoard({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [rows, setRows] = useState<Issue[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [msg, setMsg] = useState<string | null>(null);
  // void モーダル
  const [voidTarget, setVoidTarget] = useState<Issue | null>(null);
  const [voidNote, setVoidNote] = useState("");
  const [busy, setBusy] = useState(false);
  // ★便 GV-C C-13: 再発行モーダル・印刷対象（1 行）
  const [reTarget, setReTarget] = useState<Issue | null>(null);
  const [reForm, setReForm] = useState({ name: "", note: "" });
  const [printItem, setPrintItem] = useState<ReceiptPrintItem | null>(null);
  const curStore = stores.find((st) => st.id === storeId);
  const invoiceRegNo = typeof curStore?.settings_json?.invoice_reg_no === "string" ? (curStore.settings_json.invoice_reg_no as string) : "";
  useEffect(() => {
    if (!printItem) return;
    const id = window.setTimeout(() => { window.print(); setPrintItem(null); }, 50); // 印字実体の描画後に印刷
    return () => window.clearTimeout(id);
  }, [printItem]);

  const load = useCallback(async (p: number) => {
    if (!storeId) return;
    const { data } = await supabase.from("receipt_issues")
      .select("*").eq("store_id", storeId)
      .order("serial", { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE); // 1件余分＝次ページ有無（/audit 同型）
    const rs = (data ?? []) as Issue[];
    setHasMore(rs.length > PAGE);
    setRows(rs.slice(0, PAGE));
    const uids = [...new Set(rs.map((r) => r.issued_by).filter(Boolean) as string[])];
    if (uids.length) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      setUserNames(new Map(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { void load(page); }, [page, load]);

  async function doVoid() {
    if (!voidTarget || busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("receipt_issue_void", {
      p_issue_id: voidTarget.id, p_note: voidNote.trim() === "" ? null : voidNote.trim(),
    });
    setBusy(false);
    if (error) {
      setMsg(isBillingLocked(error.message) ? BILLING_LOCKED_MSG
        : error.message.includes("forbidden") ? "権限がありません" : error.message);
      return;
    }
    setMsg(`${serialNo(voidTarget.serial)} を取り消しました（公開ページも無効になります）`);
    setVoidTarget(null);
    setVoidNote("");
    await load(page);
  }

  async function doReissue() {
    if (!reTarget || busy) return;
    setBusy(true); setMsg(null);
    if (!reTarget.voided) {
      const v = await supabase.rpc("receipt_issue_void", { p_issue_id: reTarget.id, p_note: "再発行のため" });
      if (v.error) { setBusy(false); setMsg(isBillingLocked(v.error.message) ? BILLING_LOCKED_MSG : receiptReissueErrJa(v.error.message)); return; }
    }
    const { data, error } = await supabase.rpc("receipt_issue", {
      p_check_id: reTarget.check_id, p_amount: reTarget.amount,
      p_recipient: reForm.name.trim() === "" ? null : reForm.name.trim(),
      p_proviso: reForm.note.trim() === "" ? null : reForm.note.trim(),
    });
    setBusy(false);
    if (error) {
      setMsg((isBillingLocked(error.message) ? BILLING_LOCKED_MSG : receiptReissueErrJa(error.message))
        + (reTarget.voided ? "" : `（${serialNo(reTarget.serial)} は取消済みになりました。取消済みの行から再発行し直せます）`));
      setReTarget(null); await load(page); return;
    }
    const x = data as { serial: number };
    setMsg(`${serialNo(x.serial)} を再発行しました（${serialNo(reTarget.serial)}${reTarget.voided ? "" : " は取消済み"}）`);
    setReTarget(null);
    setPage(0);
    await load(0);
  }

  const printRow = (r: Issue) => setPrintItem({
    id: r.id, serial: r.serial, amount: r.amount, name: r.recipient ?? "", note: r.proviso ?? "",
    biz_date: r.biz_date, token: r.token, store_name: r.store_name_snap, issued_on: r.issued_at.slice(0, 10),
  });

  const publicUrl = (token: string) =>
    (typeof window !== "undefined" ? window.location.origin : "") + `/r/${token}`;

  return (
    <div className="nox-mv1 nox-mv1-m nox-printpage">
      <PageHead eyebrow="RECEIPT LEDGER" title="領収書"
        desc="発行台帳（正式領収書＝レジの会計完了から発行）。行ごとに再発行・公開ページ・印刷ができます。取り消すと公開ページも無効になります。" />
      {printItem && <ReceiptPrintSheet items={[printItem]} storeName={curStore?.name ?? ""} invoiceRegNo={invoiceRegNo} />}
      <Toast msg={msg} />

      {stores.length > 1 && (
        <div className="nox-ctoolbar">
          <select value={storeId} onChange={(e) => { setPage(0); setStoreId(e.target.value); }}
            aria-label="店舗" className="nox-input" style={{ width: "auto" }}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <section className="nox-panel">
        {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>発行済みの領収書はありません。</p>}
        {rows.length > 0 && (
          <div className="nox-ptwrap">
            <table className="nox-ptable">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>番号</th>
                  <th style={{ width: 96, textAlign: "right" }}>金額</th>
                  <th>宛名</th>
                  <th style={{ width: 110 }}>取引日</th>
                  {rules0175On() && <th style={{ width: 90 }}>支払</th>}{/* ★追補 2 同乗 R-6 */}
                  <th style={{ width: 110 }}>発行者</th>
                  <th style={{ width: 84 }}>状態</th>
                  <th style={{ width: 300 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={r.voided ? { opacity: 0.55 } : undefined}>
                    <td data-label="番号"><span style={{ ...t.num, fontWeight: 700 }}>{serialNo(r.serial)}</span></td>
                    <td data-label="金額" style={{ textAlign: "right" }}><span style={t.num}>{yen(r.amount)}</span></td>
                    <td data-label="宛名">
                      {r.recipient ?? <span style={{ color: "var(--v2-muted)" }}>上様</span>}
                      {r.proviso && <small style={{ display: "block", color: "var(--sub)" }}>但し {r.proviso}</small>}
                      {r.voided && r.void_note && <small style={{ display: "block", color: "var(--bad)" }}>取消理由: {r.void_note}</small>}
                    </td>
                    <td data-label="取引日"><span style={t.num}>{r.biz_date}</span></td>
                    {rules0175On() && <td data-label="支払">{r.payment_method ? (PAYMENT_METHOD_LABEL[r.payment_method as "cash" | "card" | "other" | "mixed"] ?? r.payment_method) : "—"}{stampNoticeOf(r.payment_method, r.amount) ? <small style={{ display: "block", color: "var(--champ)" }}>印紙</small> : null}</td>}
                    <td data-label="発行者">{(r.issued_by && userNames.get(r.issued_by)) ?? "—"}</td>
                    <td data-label="状態">
                      <span className={`nox-stpill ${r.voided ? "ng" : "ok"}`}>{r.voided ? "取消済み" : "有効"}</span>
                    </td>
                    <td data-label="操作">
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-receipt-ops="1">
                        <button style={{ ...t.btnGhost, ...t.btnSm }} data-receipt-reissue="1"
                          onClick={() => { setReForm({ name: r.recipient ?? "", note: r.proviso ?? "" }); setReTarget(r); }}>
                          再発行
                        </button>
                        {!r.voided && (
                          <>
                            <a style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none" }} data-receipt-public="1" href={`/r/${r.token}`} target="_blank" rel="noopener noreferrer">
                              公開ページ
                            </a>
                            <button style={{ ...t.btnGhost, ...t.btnSm }} data-receipt-print-row="1" onClick={() => printRow(r)}>
                              印刷
                            </button>
                            <button style={{ ...t.btnGhost, ...t.btnSm }}
                              onClick={() => { void navigator.clipboard?.writeText(publicUrl(r.token)); setMsg("公開ページの URL をコピーしました"); }}>
                              URL コピー
                            </button>
                            <button style={{ ...t.btnGhost, ...t.btnSm, color: "var(--bad)" }}
                              onClick={() => { setVoidNote(""); setVoidTarget(r); }}>
                              取消
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
        <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
          発行番号は店舗ごとの通し番号（欠番なし・取消も台帳に残ります）。公開ページの掲載期限は発行から90日。
          金額の訂正は「取消 → 再発行」で行ってください（発行済みの行は編集できません・再発行は新しい番号になります）。
        </p>
      </section>

      {reTarget && (
        <Modal onClose={() => { if (!busy) setReTarget(null); }}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>{serialNo(reTarget.serial)} を再発行</h3>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            同じ会計・同じ金額で新しい番号の領収書を発行します。{reTarget.voided ? "" : `${serialNo(reTarget.serial)} は取り消されます（公開ページも無効）。`}宛名と但し書きは直せます。
          </p>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ ...t.fieldLabel }} data-reissue-amount="1">金額（固定） <b className="num" style={{ fontSize: 16, color: "var(--ink)" }}>{yen(reTarget.amount)}</b></div>
            <label style={{ ...t.fieldLabel, display: "block" }}>宛名（空欄＝上様）
              <input value={reForm.name} maxLength={100} onChange={(e) => setReForm((f) => ({ ...f, name: e.target.value }))} style={{ ...t.input, width: "100%", display: "block", marginTop: 5 }} />
            </label>
            <label style={{ ...t.fieldLabel, display: "block" }}>但し書き
              <input value={reForm.note} maxLength={100} onChange={(e) => setReForm((f) => ({ ...f, note: e.target.value }))} style={{ ...t.input, width: "100%", display: "block", marginTop: 5 }} />
            </label>
          </div>
          <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
            <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setReTarget(null)}>やめる</button>
            <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={busy} onClick={() => void doReissue()}>再発行する</button>
          </div>
        </Modal>
      )}

      {voidTarget && (
        <Modal onClose={() => { if (!busy) setVoidTarget(null); }}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>{serialNo(voidTarget.serial)} を取り消す</h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            {yen(voidTarget.amount)}（{voidTarget.recipient ?? "上様"}）を取り消します。
            公開ページは即時無効になります。この操作は元に戻せません（必要なら再発行してください）。
          </p>
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 14 }}>
            取消理由（任意）
            <input value={voidNote} onChange={(e) => setVoidNote(e.target.value)} maxLength={100}
              placeholder="例: 金額誤り・再発行のため" style={{ ...t.input, width: "100%", display: "block", marginTop: 5 }} />
          </label>
          <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
            <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setVoidTarget(null)}>やめる</button>
            <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={busy} onClick={() => void doVoid()}>取り消す</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
