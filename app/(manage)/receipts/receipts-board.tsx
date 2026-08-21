"use client";

// 領収書 発行台帳（R2-c mig0099）。一覧＝receipt_issues 直読（RLS owner/manager 自店）・
//   void＝receipt_issue_void 結線（理由入力・既 void は無音＝RPC 側）。
//   発行は /register の会計完了モーダルから（本画面は台帳と取消のみ＝再発行は新規発行で表現）。
//   ★token は一覧に出すが公開 URL の形でのみ（コピー用）。audit には token が載らない（mig0099）。
import { useCallback, useEffect, useState } from "react";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";

type Store = { id: string; name: string };
type Issue = {
  id: string; store_id: string; check_id: string; serial: number; amount: number;
  recipient: string | null; proviso: string | null; store_name_snap: string; biz_date: string;
  issued_at: string; issued_by: string | null; token: string; expires_on: string;
  voided: boolean; void_note: string | null;
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

  const publicUrl = (token: string) =>
    (typeof window !== "undefined" ? window.location.origin : "") + `/r/${token}`;

  return (
    <div>
      <PageHead eyebrow="RECEIPT LEDGER" title="領収書"
        desc="発行台帳（正式領収書＝レジの会計完了から発行）。取り消すと公開ページも無効になります。" />
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
                  <th style={{ width: 110 }}>発行者</th>
                  <th style={{ width: 84 }}>状態</th>
                  <th style={{ width: 170 }}>操作</th>
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
                    <td data-label="発行者">{(r.issued_by && userNames.get(r.issued_by)) ?? "—"}</td>
                    <td data-label="状態">
                      <span className={`nox-stpill ${r.voided ? "ng" : "ok"}`}>{r.voided ? "取消済み" : "有効"}</span>
                    </td>
                    <td data-label="操作">
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {!r.voided && (
                          <>
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
          金額の訂正は「取消 → レジの会計完了モーダルから再発行」で行ってください（発行済みの行は編集できません）。
        </p>
      </section>

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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setVoidTarget(null)}>やめる</button>
            <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={busy} onClick={() => void doVoid()}>取り消す</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
