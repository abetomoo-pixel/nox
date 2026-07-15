"use client";

// F2d インボイス・支払調書セクション（モック忠実・owner/manager）。cast 別に 源泉(確定凍結値)・
// 区分(報酬/給与=mode)・インボイス(登録/免税=invoice)・登録番号(reg_no) を表示/編集。編集は
// set_cast_tax_profile（既存 RPC・manager+）。支払調書CSV は owner のみ（route が最狭防御）。
// マイナンバー未取得は route が真偽のみ返す（値は client に出さない）。★源泉計算には一切触れない。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Row = {
  castId: string; castName: string;
  mode: string | null; invoice: string | null; regNo: string | null;
  withholding: number | null; gross: number | null; hasMynumber: boolean;
};

const REG_RE = /^T\d{13}$/;

export default function InvoicePanel({ storeId, period, isOwner }: { storeId: string; period: string; isOwner: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [year, setYear] = useState(period.slice(0, 4));

  async function load() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/payroll/tax-overview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
      setRows(j.rows as Row[]);
      setFinalized(!!j.finalized);
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  // 区分/インボイス/登録番号の保存（規約: 全フィールド明示送信。mode 未登録は既定 委託）。
  async function saveTax(r: Row, patch: { mode?: string; invoice?: string | null; regNo?: string | null }) {
    const mode = patch.mode ?? r.mode ?? "委託";
    const invoice = patch.invoice !== undefined ? patch.invoice : r.invoice;
    const regNo = patch.regNo !== undefined ? patch.regNo : r.regNo;
    if (regNo && !REG_RE.test(regNo)) { setMsg(`登録番号は「T」+13桁で入力してください（${r.castName}）`); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_cast_tax_profile", {
      p_cast_id: r.castId, p_mode: mode, p_invoice: invoice, p_reg_no: regNo || null,
    });
    if (error) setMsg(`${r.castName} の更新に失敗: ${error.message}`);
    else await load();
    setBusy(false);
  }

  async function downloadCsv() {
    if (!/^\d{4}$/.test(year)) { setMsg("暦年は西暦4桁で入力してください"); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/payroll/tax-report-csv", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, year }),
      });
      if (!res.ok) { const j = await res.json(); setMsg(`CSVエラー(${res.status}): ${j.error ?? ""}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `tax-report-${year}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setMsg(`${year}年の支払調書作成用データを出力しました`);
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  const registered = rows?.filter((r) => r.invoice === "課税").length ?? 0;
  const exempt = rows?.filter((r) => r.invoice === "免税").length ?? 0;
  const noMynumber = rows?.filter((r) => r.mode === "委託" && !r.hasMynumber) ?? [];

  return (
    <section className="nox-cardtop" style={{ ...t.card, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--champ)", margin: 0 }}>インボイス・支払調書</h2>
        <button onClick={() => void load()} disabled={busy} style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }}>
          {rows ? "再読込" : "表示する"}
        </button>
      </div>
      <p style={{ ...t.sub, margin: "4px 0 0" }}>
        報酬（個人事業主）は支払調書・源泉徴収（10.21%）の対象。免税事業者への報酬は仕入税額控除に制限（経過措置あり）。区分・登録状況をご確認ください。
      </p>
      {msg && <p style={{ fontSize: 12, color: msg.includes("エラー") || msg.includes("失敗") ? "var(--bad)" : "var(--ok)", margin: "6px 0 0" }}>{msg}</p>}

      {rows && (
        <>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 4px" }}>
            適格請求書 登録 <b style={{ color: "var(--champ)" }}>{registered}</b> 名 ／ 免税事業者 <b style={{ color: "var(--champ)" }}>{exempt}</b> 名
            {!finalized && <span style={{ marginLeft: 8, color: "var(--sub)" }}>※源泉は当該期間の給与確定後に表示されます。</span>}
          </p>
          {noMynumber.length > 0 && (
            <p style={{ ...t.alert, fontSize: 12 }}>
              マイナンバー未取得（支払調書・源泉に必要）: {noMynumber.map((r) => r.castName).join("、")}
            </p>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={t.th}>キャスト</th>
                  <th style={{ ...t.th, textAlign: "right" }}>源泉</th>
                  <th style={t.th}>区分</th>
                  <th style={t.th}>インボイス</th>
                  <th style={t.th}>登録番号</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.castId}>
                    <td style={t.td}>{r.castName}</td>
                    <td style={{ ...t.td, ...t.num, textAlign: "right" }}>{r.withholding != null ? `¥${r.withholding.toLocaleString()}` : "—"}</td>
                    <td style={t.td}>
                      <select value={r.mode ?? "委託"} disabled={busy} onChange={(e) => void saveTax(r, { mode: e.target.value })}
                        style={{ ...t.input, width: "auto", padding: "4px 8px", fontSize: 12 }}>
                        <option value="委託">報酬</option>
                        <option value="雇用">給与</option>
                      </select>
                    </td>
                    <td style={t.td}>
                      {r.mode !== "雇用" ? (
                        <select value={r.invoice ?? ""} disabled={busy} onChange={(e) => void saveTax(r, { invoice: e.target.value || null })}
                          style={{ ...t.input, width: "auto", padding: "4px 8px", fontSize: 12 }}>
                          <option value="">—</option>
                          <option value="課税">登録</option>
                          <option value="免税">免税</option>
                        </select>
                      ) : <span style={t.sub}>—</span>}
                    </td>
                    <td style={t.td}>
                      {r.invoice === "課税" ? (
                        <RegNoInput initial={r.regNo ?? ""} disabled={busy} onSave={(v) => void saveTax(r, { regNo: v })} />
                      ) : <span style={t.sub}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isOwner && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 12 }}>
              <label style={{ fontSize: 12, color: "var(--sub)" }}>支払調書 暦年<br />
                <input value={year} onChange={(e) => setYear(e.target.value)} style={{ ...t.input, width: 80, padding: "8px 10px", fontSize: 13 }} maxLength={4} />
              </label>
              <button onClick={() => void downloadCsv()} disabled={busy} style={{ ...t.btnGold, ...t.btnSm }}>支払調書CSVを出力</button>
              <span style={{ fontSize: 11, color: "var(--sub)" }}>※法定様式ではありません（様式は税理士にご確認ください）。owner のみ出力可。</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RegNoInput({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} placeholder="T+13桁"
        style={{ ...t.input, width: 130, padding: "4px 8px", fontSize: 12 }} maxLength={14} />
      <button onClick={() => onSave(v.trim())} disabled={disabled} style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px" }}>保存</button>
    </div>
  );
}
