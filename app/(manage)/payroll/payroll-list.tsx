"use client";

// B5 給与 月次一覧（設計書 B5 v1 §3.1／§3.3・裁定 B5-2〜B5-8・裁定238）。/payroll の起点＝店舗×期間（payroll_runs 1 行）を 1 行で。
//   読取＝authenticated select のみ（RLS: owner=全店・manager=自店・payslips は staff 除外・audit_logs は owner 限定）。route は不要。
//   金額＝payslips 凍結値（breakdown_json.pay.gross＋Σextras・net）を list.ts で足すだけ＝サーバ再計算なし（golden 6 値不変）。
//   B4 部品の写し: KPI 4 枚（H18）・nox-seg 切替（H20）・印刷隔離 nox-printpage（H37）・変更履歴（H39・owner 限定）・状態バッジ（既存 nox-runbadge）。
//   裁定238: 「明細へ」＝.nox-link（遷移）／「支払済みにする」＝実行（青塗り＝t.btnGold）／CSV・印刷＝補助（ghost）／店舗別・月別＝(4) 切替（nox-seg）。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHead from "@/components/ui/page-head";
import Modal from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import {
  buildPayrollListRows, sumListKpi, markPaidEnabled, PAYROLL_LIST_ACTIONS,
  type ListRow, type ListRun, type ListPayslip, type ListPayment, type ListAudit,
} from "@/lib/nox/payroll/list";
import { exportPayrollCsvForRun } from "./export-csv";

type Store = { id: string; name: string };
type BreakdownJson = { pay?: { gross?: number }; extras?: { amount?: number }[] };
const yen = (n: number) => "¥" + n.toLocaleString();
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const STATUS_LABEL: Record<string, string> = { draft: "下書き（未確定）", finalized: "確定済み", paid: "支払済" };
const ACTION_LABEL: Record<string, string> = { payroll_finalize: "確定", payroll_reopen: "解除", payroll_mark_paid: "支払済み化" };
// 総支給＝CSV と同じ定義（pay.gross＋Σextras.amount・欠落キーは 0）。凍結値を読むだけ＝再計算しない。
const grossOf = (bj: BreakdownJson | null): number =>
  (bj?.pay?.gross ?? 0) + (bj?.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0);
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function PayrollList({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const role = isOwner ? "owner" : "manager"; // page.tsx が owner／manager 以外を redirect 済み（裁定 B5-5）
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<"store" | "period">("store"); // (4) 切替＝nox-seg（B4 H20 写し・裁定238-a）
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [periodSel, setPeriodSel] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false); // CSV／支払済み化の pending（連打ガード＝裁定 B5-7）
  const [payPick, setPayPick] = useState<ListRow | null>(null); // 支払済み化の確認ダイアログ（§3.3）
  const [payMsg, setPayMsg] = useState("");
  const nameOf = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  // 読取: payroll_runs → payslips／payment_records（run_id in）→ owner のみ audit_logs（3 action・target=payroll_runs:<id>）
  const load = useCallback(async () => {
    const { data: runsData, error } = await supabase
      .from("payroll_runs").select("id, store_id, period, status, finalized_at, paid_at, updated_at").order("period", { ascending: false });
    if (error) { setMsg(error.message); setRows([]); return; }
    const runs = (runsData ?? []) as ListRun[];
    const ids = runs.map((r) => r.id);
    let payslips: ListPayslip[] = [], payments: ListPayment[] = [], audits: ListAudit[] = [];
    if (ids.length > 0) {
      const [{ data: ps }, { data: prs }] = await Promise.all([
        supabase.from("payslips").select("run_id, cast_id, net, breakdown_json").in("run_id", ids),
        supabase.from("payment_records").select("run_id, cast_id, paid_amount").in("run_id", ids),
      ]);
      payslips = ((ps ?? []) as { run_id: string; cast_id: string; net: number; breakdown_json: BreakdownJson | null }[])
        .map((s) => ({ run_id: s.run_id, cast_id: s.cast_id, net: s.net, gross: grossOf(s.breakdown_json) }));
      payments = (prs ?? []) as ListPayment[];
      if (isOwner) {
        // 履歴列（B4 H39 写し）: owner のときだけ読む（audit_logs の RLS は owner 限定のまま・manager は要素も描かない）
        const { data: au } = await supabase.from("audit_logs").select("target, action, at, reason")
          .in("action", [...PAYROLL_LIST_ACTIONS]).in("target", ids.map((id) => `payroll_runs:${id}`))
          .order("at", { ascending: false }).limit(500);
        audits = (au ?? []) as ListAudit[];
      }
    }
    setRows(buildPayrollListRows(runs, payslips, payments, audits));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);
  useEffect(() => { void load(); }, [load]);

  const periods = useMemo(() => {
    const s = new Set<string>([new Date().toISOString().slice(0, 7), ...(rows ?? []).map((r) => r.period)]);
    return [...s].sort().reverse();
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => (view === "store" ? r.storeId === storeSel : r.period === periodSel)), [rows, view, storeSel, periodSel]);
  const kpi = sumListKpi(shown);

  async function csv(r: ListRow) {
    if (!r.csvEnabled || busy) return;
    setBusy(true); setMsg("");
    try { setMsg(await exportPayrollCsvForRun(supabase, r.runId, nameOf.get(r.storeId) ?? "店舗", r.period)); }
    finally { setBusy(false); }
  }
  // 支払済み化（§3.3・裁定 B5-6）: POST /api/payroll/mark-paid（owner 限定・idem_key は run ごと randomUUID）。成功後は再 select（楽観更新なし）。
  async function markPaid() {
    if (!payPick || busy) return;
    setBusy(true); setPayMsg("");
    try {
      const res = await fetch("/api/payroll/mark-paid", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId: payPick.storeId, period: payPick.period, idemKey: crypto.randomUUID() }),
      });
      const j = await res.json();
      if (!res.ok) { setPayMsg(String(j.error ?? `エラー(${res.status})`)); return; } // RPC／route の文言をそのまま
      setPayPick(null);
      setMsg(`${nameOf.get(payPick.storeId) ?? ""} ${payPick.period} を支払済みにしました。`);
      await load();
    } finally { setBusy(false); }
  }

  return (
    <div className="nox-mv1 nox-printpage">{/* 印刷隔離（B4 H37 写し）＝一覧の nox-print だけを出す */}
      <PageHead eyebrow="PAYROLL" title="給与 月次一覧" desc="店舗×期間ごとの確定状況・支払状況を一覧し、明細・CSV・支払済み化へ進みます。" />
      {msg && <p style={{ fontSize: 12.5, color: msg.includes("失敗") || msg.includes("エラー") ? "var(--danger-ink)" : "var(--ok)", fontWeight: 700 }}>{msg}</p>}

      <div className="nox-ctoolbar">
        <div className="nox-seg" style={{ display: "inline-flex" }}>
          {(([["store", "店舗別"], ["period", "月別"]]) as const).map(([k, label]) => (
            <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        {view === "store" ? (
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...t.input, width: "auto" }}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <select value={periodSel} onChange={(e) => setPeriodSel(e.target.value)} style={{ ...t.input, width: "auto" }}>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <button type="button" style={{ ...btnLight, marginLeft: "auto" }} onClick={() => window.print()}>印刷</button>
      </div>

      <section className="nox-panel nox-print">
        <h3>{view === "store" ? `${nameOf.get(storeSel) ?? "店舗"}の期間一覧` : `${periodSel} の店舗一覧`}</h3>
        {/* KPI 4 枚（B4 H18 写し）＝表示スコープの合計。値は list.ts の sum＝凍結値の再形 */}
        <div className="nox-inset" style={{ padding: "8px 12px", marginBottom: 10, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px 12px" }}>
          {(([["対象者", `${kpi.castCount}`, "人"], ["総支給", yen(kpi.gross), ""], ["差引支給", yen(kpi.net), ""], ["支払済み", `${kpi.paidCount}`, "件"]]) as const).map(([l, v, u]) => (
            <span key={l} style={{ fontSize: 12 }}>
              <span style={{ color: "var(--sub)", fontSize: 11 }}>{l}</span><br />
              <b className="num" style={{ fontSize: 14, color: "var(--ink)" }}>{v}<small style={{ fontWeight: 400, fontSize: 10, marginLeft: 2 }}>{u}</small></b>
            </span>
          ))}
        </div>
        {rows === null ? (
          <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0 }}>読み込み中…</p>
        ) : shown.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0 }}>
            この{view === "store" ? "店舗" : "期間"}に給与 run がありません。明細画面のプレビューから確定すると 1 行できます。
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr>
                  {["店舗", "期間", "状態", "対象者", "総支給", "差引支給", "支払状況", "更新日時", ...(isOwner ? ["履歴"] : []), "操作"].map((h) => (
                    <th key={h} style={t.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.runId}>
                    <td style={t.td}>{nameOf.get(r.storeId) ?? "—"}</td>
                    <td style={{ ...t.td, ...t.num }}>{r.period}</td>
                    <td style={t.td}>
                      <span className={`nox-runbadge ${r.status === "paid" ? "paid" : r.status === "finalized" ? "fin" : ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </td>
                    <td style={{ ...t.td, ...t.num }}>{r.castCount}</td>
                    <td style={{ ...t.td, ...t.num }}>{r.castCount > 0 ? yen(r.gross) : "—"}</td>
                    <td style={{ ...t.td, ...t.num }}>{r.castCount > 0 ? yen(r.net) : "—"}</td>
                    <td style={{ ...t.td, ...t.num }}>{r.paidCount > 0 ? `${r.paidCount} 件・${yen(r.paidTotal)}` : "—"}</td>
                    <td style={{ ...t.td, ...t.num, whiteSpace: "nowrap" }}>{fmtAt(r.paidAt ?? r.finalizedAt ?? r.updatedAt)}</td>
                    {isOwner && (
                      <td style={t.td}>
                        {r.lastAction ? (
                          <details>
                            <summary style={{ cursor: "pointer", whiteSpace: "nowrap" }}>{ACTION_LABEL[r.lastAction.action] ?? r.lastAction.action}・{fmtAt(r.lastAction.at)}</summary>
                            <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>理由: {r.lastAction.reason ?? "—"}</span>
                          </details>
                        ) : "—"}
                      </td>
                    )}
                    <td style={{ ...t.td, whiteSpace: "nowrap" }}>
                      <Link href={`/payroll?store=${encodeURIComponent(r.storeId)}&period=${r.period}`} className="nox-link">明細へ</Link>
                      <button type="button" style={{ ...btnLight, marginLeft: 8 }} disabled={busy || !r.csvEnabled}
                        title={r.csvEnabled ? "" : "確定済みの期間のみ出力できます"} onClick={() => void csv(r)}>CSV</button>
                      {markPaidEnabled(role, r.status) && (
                        <button type="button" style={{ ...t.btnGold, marginLeft: 8 }} disabled={busy} onClick={() => { setPayMsg(""); setPayPick(r); }}>支払済みにする</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ ...t.sub, fontSize: 11, marginTop: 8 }}>
          総支給・差引支給は確定時に凍結した明細の合計（再計算しません）。確定・解除・CSV は「明細へ」から。
          {isOwner ? "支払済み化は確定済みの期間のみ（owner）。" : "支払済み化は owner のみ。"}
        </p>
      </section>

      {/* 支払済み化の確認ダイアログ（§3.3）: 店舗・期間・差引合計を表示 → POST mark-paid。失敗は RPC 文言をそのまま */}
      {payPick && (
        <Modal onClose={() => { if (!busy) setPayPick(null); }}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 6px" }}>支払済みにします</h3>
          <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
              <span>店舗</span><span>{nameOf.get(payPick.storeId) ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
              <span>期間</span><span className="num">{payPick.period}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800 }}>差引支給 合計</span>
              <span style={{ ...t.num, fontSize: 20, fontWeight: 900 }}>{yen(payPick.net)}</span>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
            状態を「確定済み」→「支払済」に変えます（金額は変わりません・元に戻す操作はありません）。
            支払記録が {payPick.paidCount} 件・{yen(payPick.paidTotal)} あります。
          </p>
          {payMsg && <p style={{ fontSize: 12, color: "var(--danger-ink)", fontWeight: 700, margin: "0 0 10px" }}>{payMsg}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={btnLight} disabled={busy} onClick={() => setPayPick(null)}>やめる</button>
            <button type="button" style={{ ...t.btnGold, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => void markPaid()}>
              {busy ? "処理中…" : "支払済みにする"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
