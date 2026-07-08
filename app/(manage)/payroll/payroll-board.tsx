"use client";

import { useState } from "react";
import PaymentPanel from "./payment-panel";

type Store = { id: string; name: string };
type Row = {
  castId: string; castName: string; net: number; taxMode: string; anomalyCount: number;
  arDeductTotal?: number; arCarriedTotal?: number;
  advDeductTotal?: number; advCarriedTotal?: number; // F2e-2 前借り（繰越あり）
  okuriDeductTotal?: number; // F2e-2 送り実費（繰越なし）
};
type Blocker = { castName: string; reason: string };
type Incentive = { id: string; bizDate: string; amountMode: string; amount: number; recipientCount: number; distributedTotal: number; warnEmptyPool: boolean };

// 3段フロー（期間選択→プレビュー→確定）。プレビューは参考値（確定時点で再計算が正）。
export default function PayrollBoard({ stores }: { stores: Store[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [finalized, setFinalized] = useState<string | null>(null);

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
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>給与確定</h1>

      {/* 段1: 期間選択 */}
      <section style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          店舗
          <br />
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ padding: 6 }}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          期間（YYYY-MM）
          <br />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: 6 }} />
        </label>
        <button onClick={preview} disabled={busy || !storeId} style={btn}>
          プレビュー
        </button>
      </section>

      {msg && <p style={{ color: "#c0392b", fontSize: 13 }}>{msg}</p>}
      {finalized && <p style={{ color: "#1e824c", fontSize: 14, fontWeight: "bold" }}>{finalized}</p>}

      {/* 段2: プレビュー（参考値） */}
      {rows && (
        <>
          {blockers.length > 0 && (
            <div style={{ background: "#fff3cd", border: "1px solid #ffe08a", borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 13 }}>
              ⚠ 確定不可の cast（要 税区分/プラン登録）:{" "}
              {blockers.map((b) => `${b.castName}(${b.reason === "no_tax" ? "税区分未登録" : "プラン未設定"})`).join("、")}
            </div>
          )}
          <p style={{ fontSize: 12, color: "#777" }}>※参考値です。確定時点で再計算した値が正となります。</p>
          {incentives.length > 0 && (
            <div style={{ background: "#eef7f0", border: "1px solid #cde8d4", borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 13 }}>
              <strong>出勤ボーナス（給与へ加算済み）</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {incentives.map((inc) => (
                  <li key={inc.id} style={{ color: inc.warnEmptyPool ? "#b8860b" : undefined }}>
                    {inc.bizDate} {inc.amountMode === "per_head" ? "定額/人" : "プール按分"} ¥{inc.amount.toLocaleString()} →
                    {" "}総配分 ¥{inc.distributedTotal.toLocaleString()}・受給 {inc.recipientCount} 人
                    {inc.warnEmptyPool && " ⚠ 受給者0人（プール未配分）"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalyTotal > 0 && (
            <p style={{ fontSize: 12, color: "#b8860b" }}>打刻 anomaly（out 欠損等）: 計 {anomalyTotal} 件。確定は止まりませんが内容をご確認ください。</p>
          )}
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: "#f2f2f2" }}>
                <th style={th}>キャスト</th>
                <th style={th}>税区分</th>
                <th style={{ ...th, textAlign: "right" }}>売掛</th>
                <th style={{ ...th, textAlign: "right" }}>前借り</th>
                <th style={{ ...th, textAlign: "right" }}>送り</th>
                <th style={{ ...th, textAlign: "right" }}>差引支給(net)</th>
                <th style={{ ...th, textAlign: "right" }}>anomaly</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.castId}>
                  <td style={td}>{r.castName}</td>
                  <td style={td}>{r.taxMode}</td>
                  {dedCell(r.arDeductTotal, r.arCarriedTotal)}
                  {dedCell(r.advDeductTotal, r.advCarriedTotal)}
                  {dedCell(r.okuriDeductTotal)}
                  <td style={{ ...td, textAlign: "right" }}>{r.net.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", color: r.anomalyCount ? "#b8860b" : "#ccc" }}>{r.anomalyCount || "-"}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: "bold", background: "#fafafa" }}>
                <td style={td} colSpan={5}>合計（{rows.length} 名）</td>
                <td style={{ ...td, textAlign: "right" }}>{total.toLocaleString()}</td>
                <td style={td} />
              </tr>
            </tbody>
          </table>

          {/* 段3: 確定 */}
          <button onClick={finalize} disabled={busy || blockers.length > 0 || rows.length === 0} style={{ ...btn, background: blockers.length ? "#aaa" : "#c0392b" }}>
            この期間を確定する
          </button>
          {blockers.length > 0 && <span style={{ marginLeft: 10, fontSize: 12, color: "#c0392b" }}>未登録 cast を解消してください</span>}
        </>
      )}

      {/* 確定済み給与の支払記録（選択中の店舗・期間に対して） */}
      {storeId && <PaymentPanel storeId={storeId} period={period} />}
    </div>
  );
}

const btn: React.CSSProperties = { padding: "8px 16px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };
const th: React.CSSProperties = { border: "1px solid #ddd", padding: "6px 10px", textAlign: "left" };
const td: React.CSSProperties = { border: "1px solid #eee", padding: "6px 10px" };

// 天引きセル（−¥X ＋ 繰越表示）。carried 未指定（送り実費＝繰越なし）は繰越を出さない。
function dedCell(deduct?: number, carried?: number) {
  return (
    <td style={{ ...td, textAlign: "right", color: deduct ? "#c0392b" : "#ccc" }}>
      {deduct ? `−${deduct.toLocaleString()}` : "-"}
      {carried ? <span style={{ color: "#b8860b", fontSize: 11 }}>（繰越 {carried.toLocaleString()}）</span> : null}
    </td>
  );
}
