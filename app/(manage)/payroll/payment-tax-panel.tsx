"use client";

// 納付管理（裁定28・mig0075）。源泉徴収税額の月次集計と納付記録。owner のみ描画。
//   データ源＝withholding_monthly_summary（owner 限定 RPC・**paid run のみ**・org 合算）。
//   税区分は payslips.breakdown_json->'pay'->>'taxMode' の**凍結値のみ**（現在値フォールバックなし）。
//   凍結が無い過去 run は '(未凍結)' として返るため、その行は記録不可＋再確定を促す。
//   ★源泉の計算・payOf・payslips には一切書き込まない（読取と納付記録のみ）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Row = {
  target_month: string;
  tax_category: string;
  headcount: number;
  gross_total: number;
  withholding_total: number;
  deadline: string;
  paid_on: string | null;
};

const UNFROZEN = "(未凍結)";

// RPC の raise 文字列 → 固定の日本語（生メッセージは出さない＝invoice-panel 同流儀）。
const MSG: Record<string, string> = {
  "already recorded": "この月・区分はすでに記録済みです。",
  "bad month": "対象月の形式が不正です（YYYY-MM）。",
  "bad category": "税区分が不正です（委託／雇用）。",
  forbidden: "納付を記録する権限がありません（owner のみ）。",
};

// 委託＝報酬・料金／雇用＝給与。納付書の様式が別なので区分名も帳票語で出す。
const CAT_LABEL: Record<string, string> = { 委託: "報酬・料金（委託）", 雇用: "給与（雇用）" };

export default function PaymentTaxPanel({ hasUnpaidFinalized }: { hasUnpaidFinalized: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [paidOn, setPaidOn] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("withholding_monthly_summary");
    if (error) setMsg(`読込に失敗: ${error.message}`);
    else setRows((data ?? []) as Row[]);
    setBusy(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const keyOf = (r: Row) => `${r.target_month}|${r.tax_category}`;
  // 既定は当日（JST）。日付は行ごとに変更できる（実際の納付日を入れる運用）。
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  async function record(r: Row) {
    const on = paidOn[keyOf(r)] || todayJst;
    if (!confirm(`${r.target_month} の「${CAT_LABEL[r.tax_category] ?? r.tax_category}」を ${on} に納付済みとして記録します。よろしいですか？\n（取消機能は未実装です）`)) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("withholding_payment_record", {
      p_target_month: r.target_month, p_tax_category: r.tax_category, p_paid_on: on,
    });
    const hit = Object.keys(MSG).find((k) => (error?.message ?? "").includes(k));
    setMsg(error ? (hit ? MSG[hit] : `記録に失敗: ${error.message}`) : "納付を記録しました");
    setBusy(false);
    if (!error) await load();
  }

  const overdue = (r: Row) => !r.paid_on && r.deadline < todayJst;

  return (
    <section className="nox-cardtop" style={{ ...t.card, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--champ)", margin: 0 }}>源泉所得税の納付管理</h2>
        <button onClick={() => void load()} disabled={busy} style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }}>再読込</button>
      </div>
      <p style={{ ...t.sub, margin: "4px 0 0" }}>
        支払済み（paid）の給与から源泉徴収税額を月次で合算します（会社全体・店舗を合算）。納付期限は支払month の翌月10日です。
        報酬・料金（委託）と給与（雇用）は納付書の様式が別のため、区分ごとに記録します。
      </p>
      {msg && <p style={{ fontSize: 12, margin: "6px 0 0", color: msg.includes("失敗") || msg.includes("できません") || msg.includes("不正") || msg.includes("済み") ? "var(--bad)" : "var(--ok)" }}>{msg}</p>}

      {hasUnpaidFinalized && (
        <p style={{ ...t.alert, marginTop: 10 }}>
          確定済みでまだ「支払済み」にしていない給与があります。納付管理は<b>支払済みの給与のみ</b>を集計するため、
          支払が済んだら上の支払記録から「支払済みにする」を実行してください（未実行のあいだ、その月はこの表に出ません）。
        </p>
      )}

      {rows && rows.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "10px 0 0" }}>
          支払済みの給与がまだありません（確定しただけの月は集計対象外です）。
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={t.th}>支払月</th>
                <th style={t.th}>税区分</th>
                <th style={{ ...t.th, textAlign: "right" }}>人数</th>
                <th style={{ ...t.th, textAlign: "right" }}>支払額計</th>
                <th style={{ ...t.th, textAlign: "right" }}>源泉税額計</th>
                <th style={t.th}>納付期限</th>
                <th style={t.th}>納付状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const unfrozen = r.tax_category === UNFROZEN;
                return (
                  <tr key={keyOf(r)}>
                    <td style={t.td}>{r.target_month}</td>
                    <td style={t.td}>
                      {unfrozen
                        ? <span style={{ color: "var(--bad)" }}>{UNFROZEN}</span>
                        : (CAT_LABEL[r.tax_category] ?? r.tax_category)}
                    </td>
                    <td style={{ ...t.td, ...t.num, textAlign: "right" }}>{r.headcount}</td>
                    <td style={{ ...t.td, ...t.num, textAlign: "right" }}>¥{Number(r.gross_total).toLocaleString()}</td>
                    <td style={{ ...t.td, ...t.num, textAlign: "right" }}>¥{Number(r.withholding_total).toLocaleString()}</td>
                    <td style={{ ...t.td, ...t.num, color: overdue(r) ? "var(--bad)" : undefined }}>{r.deadline}</td>
                    <td style={t.td}>
                      {unfrozen ? (
                        <span style={{ fontSize: 11.5, color: "var(--bad)" }}>
                          税区分が未凍結です。給与を解除して再確定すると区分が記録され、納付を記録できます。
                        </span>
                      ) : r.paid_on ? (
                        <span style={{ color: "var(--ok)" }}>納付済み（{r.paid_on}）</span>
                      ) : (
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="date" value={paidOn[keyOf(r)] ?? todayJst}
                            onChange={(e) => setPaidOn({ ...paidOn, [keyOf(r)]: e.target.value })}
                            disabled={busy} style={{ ...t.input, width: "auto", padding: "4px 8px", fontSize: 12 }} />
                          <button onClick={() => void record(r)} disabled={busy} style={{ ...t.btnGold, ...t.btnSm }}>納付を記録</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
        ※ 納期の特例（半年分をまとめて納付）はホステス等の報酬には適用されません（翌月10日納付）。
        期限が土日祝のときの順延は表示していません。記録の取消は未実装です。
      </p>
    </section>
  );
}
