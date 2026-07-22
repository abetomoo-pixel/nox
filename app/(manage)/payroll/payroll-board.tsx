"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { buildPayrollCsv, type PayrollCsvRow, type PayrollCsvPay } from "@/lib/nox/payroll/csv";
import PaymentPanel from "./payment-panel";
import InvoicePanel from "./invoice-panel";

type Store = { id: string; name: string };
// D3: payslips.breakdown_json（finalize が凍結）の CSV が使う部分。back 内訳の生値は CSV に出さず合算のみ。
type BreakdownPay = PayrollCsvPay;
type BreakdownExtra = { amount: number };
type BreakdownJson = { pay: BreakdownPay; extras?: BreakdownExtra[] };
type Row = {
  castId: string; castName: string; net: number; taxMode: string; anomalyCount: number;
  arDeductTotal?: number; arCarriedTotal?: number;
  advDeductTotal?: number; advCarriedTotal?: number; // F2e-2 前借り（繰越あり）
  okuriDeductTotal?: number; // F2e-2 送り実費（繰越なし）
};
type Blocker = { castName: string; reason: string };
type Incentive = { id: string; bizDate: string; amountMode: string; amount: number; recipientCount: number; distributedTotal: number; warnEmptyPool: boolean };

// 3段フロー（期間選択→プレビュー→確定）。プレビューは参考値（確定時点で再計算が正）。
export default function PayrollBoard({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [finalized, setFinalized] = useState<string | null>(null);
  // D3 給与明細CSV: 選択中 store/period の run 状態（finalized/paid のみ CSV 活性）
  const [runInfo, setRunInfo] = useState<{ id: string; status: string } | null>(null);
  const [csvMsg, setCsvMsg] = useState("");

  // run 状態を読む（payroll_runs は owner/manager RLS 可視）。store/period 変更・確定完了で再読込。
  const loadRun = useCallback(async () => {
    if (!storeId || !period) { setRunInfo(null); return; }
    const { data } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle();
    setRunInfo(data ? { id: data.id as string, status: data.status as string } : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, period]);
  useEffect(() => { void loadRun(); }, [loadRun, finalized]);

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "店舗";

  // D3: 確定済み run の payslips を owner/manager 直読みして給与明細CSVを生成（client Blob・BOM UTF-8）。
  //   機微（口座/マイナンバー/back 内訳生値）は含めない＝合算のみ。tax-report（支払調書）とは別物。
  async function exportPayrollCsv() {
    if (!runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")) return;
    setCsvMsg(""); setBusy(true);
    try {
      const runId = runInfo.id;
      const [{ data: ps }, { data: prs }] = await Promise.all([
        supabase.from("payslips").select("cast_id, period, net, breakdown_json").eq("run_id", runId),
        supabase.from("payment_records").select("cast_id, paid_amount").eq("run_id", runId),
      ]);
      const slips = (ps ?? []) as { cast_id: string; period: string; net: number; breakdown_json: BreakdownJson }[];
      if (slips.length === 0) { setCsvMsg("この期間に給与明細がありません（確定済みの run が空です）。"); return; }
      const castIds = slips.map((s) => s.cast_id);
      const [{ data: cs }, { data: tp }] = await Promise.all([
        supabase.from("casts").select("id, name").in("id", castIds),
        supabase.from("cast_tax_profiles").select("cast_id, mode").in("cast_id", castIds),
      ]);
      const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
      const modeOf = new Map((tp ?? []).map((r) => [r.cast_id as string, r.mode as string]));
      const paidOf = new Map<string, number>();
      for (const r of (prs ?? []) as { cast_id: string; paid_amount: number }[]) {
        paidOf.set(r.cast_id, (paidOf.get(r.cast_id) ?? 0) + r.paid_amount);
      }
      const csvRows: PayrollCsvRow[] = slips
        .slice()
        .sort((a, b) => (nameOf.get(a.cast_id) ?? "").localeCompare(nameOf.get(b.cast_id) ?? "", "ja"))
        .map((s) => ({
          castName: nameOf.get(s.cast_id) ?? "(不明)",
          taxMode: modeOf.get(s.cast_id) ?? "—",
          period: s.period,
          pay: s.breakdown_json.pay,
          extrasTotal: (s.breakdown_json.extras ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0),
          net: s.net,
          paidTotal: paidOf.get(s.cast_id) ?? 0,
        }));
      const csv = buildPayrollCsv(csvRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `給与明細_${storeName}_${period}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setCsvMsg(`給与明細CSVを出力しました（${csvRows.length} 名分）。`);
    } catch (e) {
      setCsvMsg(`出力に失敗: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    setMsg("");
    setFinalized(null);
    try {
      const res = await fetch("/api/payroll/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRows(null);
        setBlockers([]);
        setIncentives([]);
        setMsg(`エラー(${res.status}): ${j.error ?? ""}`);
        return;
      }
      setRows(j.rows as Row[]);
      setBlockers((j.blockers ?? []) as Blocker[]);
      setIncentives((j.incentives ?? []) as Incentive[]);
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!confirm(`${period} の給与を確定します。確定後はマスタ変更の影響を受けません。よろしいですか？`)) return;
    setBusy(true);
    setMsg("");
    try {
      const idemKey = crypto.randomUUID();
      const res = await fetch("/api/payroll/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period, idemKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(j.blockers)) {
          setMsg(`確定不可（税区分/プラン未設定）: ${(j.blockers as Blocker[]).map((b) => b.castName).join("、")}`);
        } else {
          setMsg(`エラー(${res.status}): ${j.error ?? ""}`);
        }
        return;
      }
      setFinalized(`確定完了: ${j.castCount} 名分（run ${j.runId}）`);
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const total = rows?.reduce((s, r) => s + r.net, 0) ?? 0;
  const anomalyTotal = rows?.reduce((s, r) => s + r.anomalyCount, 0) ?? 0;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>給与確定</h1>
      </div>

      {/* 段1: 期間選択 */}
      <section className="nox-cardtop" style={{ ...t.card, display: "flex", gap: 12, alignItems: "flex-end" }}>
        <label style={t.fieldLabel}>
          店舗
          <br />
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label style={t.fieldLabel}>
          期間（YYYY-MM）
          <br />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }} />
        </label>
        <button onClick={preview} disabled={busy || !storeId} style={t.btnGold}>
          プレビュー
        </button>
      </section>

      {msg && <p style={{ color: "var(--bad)", fontSize: 13 }}>{msg}</p>}
      {finalized && <p style={{ color: "var(--champ)", fontSize: 14, fontWeight: "bold" }}>{finalized}</p>}

      {/* 段2: プレビュー（参考値） */}
      {rows && (
        <>
          {blockers.length > 0 && (
            <div style={t.alert}>
              ⚠ 確定不可の cast（要 税区分/プラン登録）:{" "}
              {blockers.map((b) => `${b.castName}(${b.reason === "no_tax" ? "税区分未登録" : "プラン未設定"})`).join("、")}
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--sub)" }}>※参考値です。確定時点で再計算した値が正となります。</p>
          {incentives.length > 0 && (
            <div className="nox-cardtop" style={{ ...t.card, border: "1px solid var(--line2)", fontSize: 13 }}>
              <strong style={{ color: "var(--champ)" }}>出勤ボーナス（給与へ加算済み）</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {incentives.map((inc) => (
                  <li key={inc.id} style={{ color: inc.warnEmptyPool ? "var(--bad)" : undefined }}>
                    {inc.bizDate} {inc.amountMode === "per_head" ? "定額/人" : "プール按分"} <span style={t.num}>¥{inc.amount.toLocaleString()}</span> →
                    {" "}総配分 <span style={t.num}>¥{inc.distributedTotal.toLocaleString()}</span>・受給 <span style={t.num}>{inc.recipientCount}</span> 人
                    {inc.warnEmptyPool && " ⚠ 受給者0人（プール未配分）"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalyTotal > 0 && (
            <p style={{ fontSize: 12, color: "var(--bad)" }}>打刻 anomaly（out 欠損等）: 計 <span style={t.num}>{anomalyTotal}</span> 件。確定は止まりませんが内容をご確認ください。</p>
          )}
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={t.th}>キャスト</th>
                <th style={t.th}>税区分</th>
                <th style={{ ...t.th, textAlign: "right" }}>売掛</th>
                <th style={{ ...t.th, textAlign: "right" }}>前借り</th>
                <th style={{ ...t.th, textAlign: "right" }}>送り</th>
                <th style={{ ...t.th, textAlign: "right" }}>差引支給(net)</th>
                <th style={{ ...t.th, textAlign: "right" }}>anomaly</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.castId}>
                  <td style={t.td}>{r.castName}</td>
                  <td style={t.td}>{r.taxMode}</td>
                  {dedCell(r.arDeductTotal, r.arCarriedTotal)}
                  {dedCell(r.advDeductTotal, r.advCarriedTotal)}
                  {dedCell(r.okuriDeductTotal)}
                  <td style={{ ...t.td, ...t.num, textAlign: "right" }}>{r.net.toLocaleString()}</td>
                  <td style={{ ...t.td, ...t.num, textAlign: "right", color: r.anomalyCount ? "var(--bad)" : "var(--sub)" }}>{r.anomalyCount || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 複数キャスト表の「締め」＝合計行を slipFoot バー化（gold バー・net は slipFootVal tabular）。表本体は t.th/t.td 維持。 */}
          <div style={t.slipFoot}>
            <span>合計（{rows.length} 名）</span>
            <b style={t.slipFootVal}>¥{total.toLocaleString()}</b>
          </div>

          {/* 段3: 確定 */}
          <button onClick={finalize} disabled={busy || blockers.length > 0 || rows.length === 0} style={blockers.length ? { ...t.btnGhost } : { ...t.btnGold }}>
            この期間を確定する
          </button>
          {blockers.length > 0 && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--bad)" }}>未登録 cast を解消してください</span>}
        </>
      )}

      {/* D3 給与明細CSV（確定済み run のみ活性・全cast の支給/控除/差引・振込フォーマットではない＝口座なし）。
          支払調書CSV（invoice-panel＝源泉/インボイス・委託のみ・暦年）とは別物。 */}
      {storeId && (
        <section className="nox-cardtop" style={{ ...t.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 4px" }}>給与明細CSV</h3>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>
              確定済み（{period}）の全キャストの支給・控除・差引を CSV 出力します（BOM UTF-8）。
              口座・マイナンバーは含みません（振込用フォーマットは別）。支払調書CSVとは別物です。
            </p>
          </div>
          <button
            onClick={() => void exportPayrollCsv()}
            disabled={busy || !runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")}
            style={runInfo && (runInfo.status === "finalized" || runInfo.status === "paid") ? { ...t.btnGold } : { ...t.btnGhost, opacity: 0.5 }}
            title={runInfo ? "" : "この期間はまだ確定されていません"}
          >
            給与明細CSVを出力
          </button>
        </section>
      )}
      {csvMsg && <p style={{ fontSize: 12, color: csvMsg.includes("失敗") || csvMsg.includes("ありません") ? "var(--bad)" : "var(--ok)" }}>{csvMsg}</p>}

      {/* 確定済み給与の支払記録（選択中の店舗・期間に対して） */}
      {storeId && <PaymentPanel storeId={storeId} period={period} />}

      {/* F2d インボイス・支払調書（税区分管理＋支払調書CSV・源泉計算には非接触） */}
      {storeId && <InvoicePanel storeId={storeId} period={period} isOwner={isOwner} />}
    </div>
  );
}

// 天引きセル（−¥X ＋ 繰越表示）。carried 未指定（送り実費＝繰越なし）は繰越を出さない。
function dedCell(deduct?: number, carried?: number) {
  return (
    <td style={{ ...t.td, ...t.num, textAlign: "right", color: deduct ? "var(--bad)" : "var(--sub)" }}>
      {deduct ? `−${deduct.toLocaleString()}` : "-"}
      {carried ? <span style={{ color: "var(--champ)", fontSize: 11 }}>（繰越 {carried.toLocaleString()}）</span> : null}
    </td>
  );
}
