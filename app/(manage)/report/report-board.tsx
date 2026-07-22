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
  ar_collected: number; // B6（mig0055）: 回収現金（別掲・理論在高加算対象）
  expense: number; cash_payout: number; cash_float: number; counted_cash: number | null; diff: number | null;
  reclosed_count: number;
};
// B6 未回収売掛（open receivables・embedded で伝票日/席・客・cast を同伴）
type Recv = {
  id: string; amount: number; deducted_amount: number; cast_id: string | null; customer_id: string | null; deduct_from_cast: boolean;
  checks: { started_at: string; seats: { name: string } | null } | null;
  customers: { name: string } | null;
  casts: { name: string } | null;
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
  const [tab, setTab] = useState<"day" | "month" | "ar">("day"); // A4: 日報/月報 タブ＋B6: 売掛タブ（案7-A・owner/manager のみ）
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
  const [recvs, setRecvs] = useState<Recv[]>([]);                        // B6 未回収売掛（open）
  const [consent, setConsent] = useState<Record<string, boolean>>({});   // B6 本人同意チェック（行単位）

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

  // B6 未回収売掛（open）＝receivables 直 SELECT（RLS で owner/manager/staff-can_register・cast 0行）。
  const loadRecvs = useCallback(async () => {
    const { data } = await supabase
      .from("receivables")
      .select("id, amount, deducted_amount, cast_id, customer_id, deduct_from_cast, checks(started_at, seats(name)), customers(name), casts(name)")
      .eq("store_id", storeId).eq("status", "open")
      .order("created_at", { ascending: false });
    setRecvs((data ?? []) as unknown as Recv[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => { void loadPreview(bizDate); }, [bizDate, loadPreview]);
  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => { if (isManagerUp) void loadRecvs(); }, [isManagerUp, loadRecvs]);

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

  // B6 回収＝receivable_collect（当日営業日・全額・現金・冪等キーはクライアント生成）。回収日日報に別掲加算。
  async function collectRecv(r: Recv) {
    setMsg(null);
    const { error } = await supabase.rpc("receivable_collect", {
      p_receivable_id: r.id, p_biz_date: bizDateOf(new Date().toISOString(), cutoff),
      p_method: "cash", p_note: null, p_idem_key: crypto.randomUUID(),
    });
    setMsg(error ? error.message : `売掛 ${yen(r.amount)} を回収（現金へ振替）。`);
    await loadRecvs();
    await loadReports();
  }

  // B6 給与天引き対象化＝receivable_mark_deduct（本人同意必須・実減算は次回 payroll_finalize＝UX 正直性の設計3 注記）。
  async function markDeductRecv(r: Recv) {
    setMsg(null);
    if (!consent[r.id]) { setMsg("本人同意が未取得のため天引きできません（労基法・全額払い）"); return; }
    const { error } = await supabase.rpc("receivable_mark_deduct", {
      p_receivable_id: r.id, p_consent: true, p_note: null,
    });
    setMsg(error ? error.message : `${r.casts?.name ?? "本人"} さんの売掛を次回給与で天引き予定にしました。`);
    await loadRecvs();
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={t.pheadH1}>レポート</h1>
      <Toast msg={msg} />

      {/* A4: 日報/月報 タブ（モックの segment のうち月報のみ実装・分析=C5/会計連携=C3/本部連結=C2 は A4 の外） */}
      <div className="nox-cardtop" style={{ ...card, padding: 11 }}>
        <div style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          {(isManagerUp ? (["day", "month", "ar"] as const) : (["day", "month"] as const)).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                flex: 1, fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "9px 10px", borderRadius: 9, cursor: "pointer",
                border: tab === k ? "1px solid var(--gold)" : "1px solid var(--line2)",
                background: tab === k ? "linear-gradient(135deg,#1F1B12,#14120C)" : "transparent",
                color: tab === k ? "var(--champ)" : "var(--sub)",
              }}>{k === "day" ? "日報" : k === "month" ? "月報" : "売掛"}</button>
          ))}
        </div>
      </div>

      {tab === "month" && <MonthReport stores={stores} defaultStoreId={storeId} isManagerUp={isManagerUp} />}

      {/* B6 売掛タブ（案7-A・owner/manager のみ・post-launch で C3 仕訳画面へ移設）。文言はモック現物（教訓D）。 */}
      {tab === "ar" && isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>
            売掛（未回収）残高 {yen(recvs.reduce((a, r) => a + (r.amount - r.deducted_amount), 0))}
          </h2>
          {recvs.length === 0 ? (
            <p style={{ ...t.sub, margin: 0 }}>未回収の売掛はありません。</p>
          ) : (
            <div>
              {recvs.map((r) => {
                const remaining = r.amount - r.deducted_amount;
                const dt = r.checks?.started_at ? bizDateOf(r.checks.started_at, cutoff) : "—";
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 13, color: "var(--ink)", flex: "1 1 260px" }}>
                      {dt}
                      {r.checks?.seats?.name ? ` ・ ${r.checks.seats.name}` : ""}
                      {" ・ "}{r.customers?.name ?? "フリー"}
                      {r.casts?.name ? ` ・ 指名 ${r.casts.name}` : ""}
                      <span style={{ ...t.num, color: "var(--champ)", marginLeft: 8 }}>{yen(remaining)}</span>
                    </span>
                    {r.deduct_from_cast ? (
                      <span style={{ ...t.sub, fontSize: 12 }}>次回給与で天引き予定</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {r.cast_id && (
                          <label style={{ ...t.fieldLabel, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!consent[r.id]}
                              onChange={(e) => setConsent((s) => ({ ...s, [r.id]: e.target.checked }))} />
                            本人同意
                          </label>
                        )}
                        {r.cast_id && (
                          <button style={btnLight} disabled={!consent[r.id]}
                            title={!consent[r.id] ? "本人同意が未取得のため天引きできません（労基法・全額払い）" : ""}
                            onClick={() => markDeductRecv(r)}>給与天引き</button>
                        )}
                        <button style={btnLight} onClick={() => collectRecv(r)}>回収</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ ...t.sub, fontSize: 12, marginTop: 8 }}>
            掛売は当日現金に計上せず売掛として分離。回収で現金へ振替えます。
          </p>
        </section>
      )}

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
              {["営業日", "伝票", "客数", "現金", "回収現金", "カード", "TAX", "売掛", "ドリンク売上", "未会計", "諸経費", "現金支払", "実査差", "再締め回数", ""].map((h) => (
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
                <td style={{ ...t.td, ...t.num, color: r.ar_collected > 0 ? "var(--champ)" : undefined }}>{yen(r.ar_collected)}</td>
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
        <p style={{ ...t.sub, fontSize: 11, marginTop: 8 }}>
          実査差 = 実査 −（釣銭準備金 + 現金売上 + 回収現金 − 諸経費 − 現金支払）。現金売上と回収現金は別掲（混ぜない）。
        </p>
      </section>
      </>)}
    </div>
  );
}
