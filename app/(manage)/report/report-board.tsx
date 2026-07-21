"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import { roundYen } from "@/lib/nox/money";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import MonthReport from "./month-report";

type Preview = {
  open: number; slips: number; guests: number; dohan: number;
  cash: number; card: number; cardTax: number; uri: number; other: number; drink: number;
};
type Report = {
  id: string; biz_date: string; cash: number; card_gross: number; card_tax: number; uri: number; other: number;
  drink_sales: number; dohan_checks: number; slips: number; guests: number; open_checks_count: number;
  expense: number; cash_payout: number; cash_float: number; counted_cash: number | null; diff: number | null;
  reclosed_count: number;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto" };
const btnDark: React.CSSProperties = t.btnGold;
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

export default function ReportBoard({
  storeId, cutoff, cardTaxRate, isManagerUp, stores,
}: { storeId: string; cutoff: string; cardTaxRate: number; isManagerUp: boolean; stores: { id: string; name: string }[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"day" | "month">("day"); // A4: 日報/月報 タブ（分析/会計連携/本部連結は A4 の外）
  const [bizDate, setBizDate] = useState(bizDateOf(new Date().toISOString(), cutoff));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [expense, setExpense] = useState(0);
  const [payout, setPayout] = useState(0);
  const [cashFloat, setCashFloat] = useState(50_000);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);

  // プレビュー＝クライアント TS 集計（biz-date 純関数で範囲決定・権威は close 時のサーバ再集計）
  const loadPreview = useCallback(async (d: string) => {
    const { startIso, endIso } = bizDateRange(d, cutoff);
    const { data: checks } = await supabase
      .from("checks").select("id, status, people, nom_type")
      .eq("store_id", storeId).gte("started_at", startIso).lt("started_at", endIso);
    const closed = (checks ?? []).filter((c) => c.status === "closed");
    const ids = closed.map((c) => c.id as string);
    let cash = 0, cardSum = 0, uri = 0, other = 0, drink = 0;
    if (ids.length) {
      const { data: pays } = await supabase.from("payments").select("method, amount, check_id").in("check_id", ids);
      for (const p of pays ?? []) {
        if (p.method === "cash") cash += p.amount;
        else if (p.method === "card") cardSum += p.amount;
        else if (p.method === "ar") uri += p.amount;
        else other += p.amount;
      }
      const { data: lines } = await supabase.from("check_lines").select("kind, line_total, check_id").in("check_id", ids);
      drink = (lines ?? []).filter((l) => l.kind === "drink" || l.kind === "champ").reduce((a, l) => a + l.line_total, 0);
    }
    setPreview({
      open: (checks ?? []).filter((c) => c.status === "open").length,
      slips: closed.length,
      guests: closed.reduce((a, c) => a + (c.people ?? 0), 0),
      dohan: closed.filter((c) => c.nom_type === "dohan").length,
      cash, card: cardSum, cardTax: roundYen((cardSum * cardTaxRate) / 100), uri, other, drink,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, cutoff, cardTaxRate]);

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from("daily_reports").select("*").order("biz_date", { ascending: false }).limit(14);
    setReports((data ?? []) as Report[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadPreview(bizDate); }, [bizDate, loadPreview]);
  useEffect(() => { void loadReports(); }, [loadReports]);

  async function closeDay() {
    setMsg(null);
    const { error } = await supabase.rpc("daily_report_close", {
      p_store_id: storeId, p_biz_date: bizDate,
      p_expense: expense, p_cash_payout: payout, p_cash_float: cashFloat,
      p_counted_cash: counted === "" ? null : Number(counted),
      p_note: note || null, p_force: force, p_idem_key: crypto.randomUUID(),
    });
    setMsg(error ? error.message : "締めを確定しました");
    await loadReports();
  }

  async function reclose(reportId: string) {
    setMsg(null);
    const { error } = await supabase.rpc("daily_report_reclose", { p_report_id: reportId, p_force: force });
    setMsg(error ? error.message : "再締めしました（凍結 cutoff/税率で再集計）");
    await loadReports();
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={t.pheadH1}>レポート</h1>
      <Toast msg={msg} />

      {/* A4: 日報/月報 タブ（モックの segment のうち月報のみ実装・分析=C5/会計連携=C3/本部連結=C2 は A4 の外） */}
      <div className="nox-cardtop" style={{ ...card, padding: 11 }}>
        <div style={{ display: "flex", gap: 8, maxWidth: 320 }}>
          {(["day", "month"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                flex: 1, fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "9px 10px", borderRadius: 9, cursor: "pointer",
                border: tab === k ? "1px solid var(--gold)" : "1px solid var(--line2)",
                background: tab === k ? "linear-gradient(135deg,#1F1B12,#14120C)" : "transparent",
                color: tab === k ? "var(--champ)" : "var(--sub)",
              }}>{k === "day" ? "日報" : "月報"}</button>
          ))}
        </div>
      </div>

      {tab === "month" && <MonthReport stores={stores} defaultStoreId={storeId} isManagerUp={isManagerUp} />}

      {tab === "day" && (<>
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>
          プレビュー（クライアント集計・確定値は締め時のサーバ再集計が正）
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "var(--ink)" }}>営業日</span>
          <input type="date" value={bizDate} onChange={(e) => setBizDate(e.target.value)} style={input} />
          <span style={{ ...t.sub, fontSize: 12 }}>区切り {cutoff}（範囲: 当日{cutoff}〜翌日{cutoff}）</span>
        </div>
        {preview && (
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr>
                {[
                  ["伝票", preview.slips], ["組客数", preview.guests], ["同伴", preview.dohan], ["未会計", preview.open],
                  ["現金", yen(preview.cash)], ["カード", yen(preview.card)], ["カードTAX", yen(preview.cardTax)],
                  ["売掛", yen(preview.uri)], ["その他", yen(preview.other)], ["ドリンク/シャンパン売上", yen(preview.drink)],
                ].map(([label, v]) => (
                  <td key={label as string} style={{ padding: "4px 12px", borderRight: "1px solid var(--line)" }}>
                    <div style={{ ...t.sub, fontSize: 11 }}>{label}</div>
                    <div style={{ ...t.num, fontWeight: 700, color: "var(--ink)" }}>{v}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* 締めは manager 以上のみ（RPC 側も owner/manager 強制＝二重） */}
      {isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>締め（{bizDate}）</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>諸経費 <input type="number" min={0} value={expense} onChange={(e) => setExpense(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>現金支払（送り・日払い等） <input type="number" min={0} value={payout} onChange={(e) => setPayout(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>釣銭準備金 <input type="number" min={0} value={cashFloat} onChange={(e) => setCashFloat(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>実査（数えた現金） <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="未入力可" style={{ ...input, width: 110 }} /></label>
            <input placeholder="メモ" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, width: 160 }} />
            <label style={{ ...t.fieldLabel, fontSize: 12 }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> 未会計があっても強行
            </label>
            <button style={btnDark} onClick={closeDay}>締め確定</button>
          </div>
        </section>
      )}

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>締め済み日報</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              {["営業日", "伝票", "客数", "現金", "カード", "TAX", "売掛", "ドリンク売上", "未会計", "諸経費", "現金支払", "実査差", "再締め回数", ""].map((h) => (
                <th key={h} style={t.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td style={{ ...t.td, ...t.num }}>{r.biz_date}</td>
                <td style={{ ...t.td, ...t.num }}>{r.slips}</td>
                <td style={{ ...t.td, ...t.num }}>{r.guests}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.cash)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.card_gross)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.card_tax)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.uri)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.drink_sales)}</td>
                <td style={{ ...t.td, ...t.num }}>{r.open_checks_count}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.expense)}</td>
                <td style={{ ...t.td, ...t.num }}>{yen(r.cash_payout)}</td>
                <td style={{ ...t.td, ...t.num, color: (r.diff ?? 0) < 0 ? "var(--bad)" : undefined }}>
                  {r.diff == null ? "—" : yen(r.diff)}
                </td>
                <td style={{ ...t.td, ...t.num }}>{r.reclosed_count}</td>
                <td style={t.td}>
                  {isManagerUp && <button style={btnLight} onClick={() => reclose(r.id)}>再締め</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      </>)}
    </div>
  );
}
