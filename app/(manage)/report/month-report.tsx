"use client";

// A4 月報（裁定8 N1-b・裁定12）。会計 write RPC は叩かない・daily_report_aggregate 非改修。
// 取得＝売上系は daily_reports 直 SELECT（月内 biz_date 合算）・指名は get_store_nom_counts（mig0054・
//   半期split で3回呼び）・人件費は payslips.breakdown_json.pay.gross 合計（owner/mgr のみ・裁定④ draft は未確定）。
// 半期境界は営業日(biz_date) の日で統一：前期=1〜15 / 後期=16〜末（daily_reports 振り分けと nom_counts 範囲呼びで一致）。
// 役割別（裁定⑤）：人件費/人件費率は isManagerUp のみ（staff は payroll RLS でも 0行＝二重）。cast は layout で /mine へ（本タブに来ない）。
// 客単価＝売上/来客数（モック現物 sales/guests。相談役の「売上/組数」指示とは分母が異なるため報告で申告）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Store = { id: string; name: string };
type DR = { biz_date: string; cash: number; card_gross: number; uri: number; other: number; slips: number; guests: number; dohan_checks: number; drink_sales: number };
type Split = { sales: number; groups: number; guests: number; dohan: number; drink: number; shimei: number };
type Labor = { state: "final" | "draft" | "none"; gross: number };

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const empty = (): Split => ({ sales: 0, groups: 0, guests: 0, dohan: 0, drink: 0, shimei: 0 });
const per = (s: Split) => (s.guests > 0 ? Math.round(s.sales / s.guests) : 0); // 客単価＝売上/来客数（モック準拠）
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthReport({ stores, defaultStoreId, isManagerUp }: {
  stores: Store[]; defaultStoreId: string; isManagerUp: boolean;
}) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(defaultStoreId || stores[0]?.id || "");
  const [period, setPeriod] = useState(currentMonth());
  const [h1, setH1] = useState<Split>(empty());
  const [h2, setH2] = useState<Split>(empty());
  const [labor, setLabor] = useState<Labor>({ state: "none", gross: 0 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
    setLoading(true); setMsg(null);
    // 月境界（period_bounds・営業月）
    const { data: pb, error: ePb } = await supabase.rpc("period_bounds", { p_period: period });
    const pbr = (pb as Array<{ period_start: string; period_end: string }> | null)?.[0];
    if (ePb || !pbr) { setMsg("期間の解決に失敗しました"); setLoading(false); return; }
    const start = pbr.period_start, end = pbr.period_end;         // YYYY-MM-01 / YYYY-MM-末
    const d15 = `${start.slice(0, 8)}15`, d16 = `${start.slice(0, 8)}16`; // 15日 / 16日（営業日基準の半期境界）

    // 売上系＝daily_reports 直 SELECT → biz_date の日で前期/後期へ振り分け合算
    const { data: drs } = await supabase.from("daily_reports")
      .select("biz_date, cash, card_gross, uri, other, slips, guests, dohan_checks, drink_sales")
      .eq("store_id", storeId).gte("biz_date", start).lte("biz_date", end);
    const s1 = empty(), s2 = empty();
    for (const r of (drs ?? []) as DR[]) {
      const s = Number(r.biz_date.slice(8, 10)) <= 15 ? s1 : s2;
      s.sales += r.cash + r.card_gross + r.uri + r.other; // 裁定③E5 踏襲
      s.groups += r.slips; s.guests += r.guests; s.dohan += r.dohan_checks; s.drink += r.drink_sales;
    }
    // 指名(本)＝hon+jonai（同伴=dohan は別行ゆえ除外・get_store_nom_counts を半期split で2回呼び）
    const nc = async (from: string, to: string): Promise<number> => {
      const { data } = await supabase.rpc("get_store_nom_counts", { p_store_id: storeId, p_from: from, p_to: to });
      const r = (data as Array<{ hon_count: number; jonai_count: number }> | null)?.[0];
      return r ? r.hon_count + r.jonai_count : 0;
    };
    s1.shimei = await nc(start, d15);
    s2.shimei = await nc(d16, end);

    // 人件費＝payslips.breakdown_json.pay.gross 合計（owner/mgr のみ・裁定④ draft は未確定）
    let lab: Labor = { state: "none", gross: 0 };
    if (isManagerUp) {
      const { data: runs } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period);
      const fin = (runs ?? []).find((r) => r.status === "finalized" || r.status === "paid");
      if (fin) {
        const { data: slips } = await supabase.from("payslips").select("breakdown_json").eq("run_id", fin.id as string);
        const g = (slips ?? []).reduce((a, s) => {
          const bj = s.breakdown_json as { pay?: { gross?: number } } | null;
          return a + Number(bj?.pay?.gross ?? 0);
        }, 0);
        lab = { state: "final", gross: g };
      } else lab = { state: (runs ?? []).length ? "draft" : "none", gross: 0 };
    }
    setH1(s1); setH2(s2); setLabor(lab); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, period, isManagerUp]);
  useEffect(() => { void load(); }, [load]);

  const full: Split = {
    sales: h1.sales + h2.sales, groups: h1.groups + h2.groups, guests: h1.guests + h2.guests,
    dohan: h1.dohan + h2.dohan, drink: h1.drink + h2.drink, shimei: h1.shimei + h2.shimei,
  };
  const rate = (labor.state === "final" && full.sales > 0) ? Math.round((labor.gross / full.sales) * 100) : null;
  const barMax = Math.max(h1.sales, h2.sales, 1);

  // 4列テーブルの行（daily 系は3列・人件費/率は payroll が月次ゆえ通期のみ）
  const rows: Array<[string, string, string, string]> = [
    ["売上", yen(h1.sales), yen(h2.sales), yen(full.sales)],
    ["組数", String(h1.groups), String(h2.groups), String(full.groups)],
    ["来客数", String(h1.guests), String(h2.guests), String(full.guests)],
    ["客単価", yen(per(h1)), yen(per(h2)), yen(per(full))],
    ["同伴", `${h1.dohan}件`, `${h2.dohan}件`, `${full.dohan}件`],
    ["指名（本指名+場内）", `${h1.shimei}本`, `${h2.shimei}本`, `${full.shimei}本`],
  ];
  if (isManagerUp) {
    const laborCell = labor.state === "final" ? yen(labor.gross) : "未確定";
    rows.push(["人件費（源泉前）", "—", "—", laborCell]);
    rows.push(["人件費率", "—", "—", rate == null ? "—" : `${rate}%`]);
  }

  const th: React.CSSProperties = { fontSize: 11, color: "var(--sub)", textAlign: "right", padding: "4px 6px" };
  const td: React.CSSProperties = { ...t.num, textAlign: "right", padding: "5px 6px", fontSize: 13 };

  return (
    <section className="nox-cardtop" style={card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ ...t.cardTitle, margin: 0 }}>月報</h2>
        {stores.length > 1 && (
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...t.input, width: "auto", fontSize: 13 }}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...t.input, width: "auto", fontSize: 13 }} />
        <span style={{ fontSize: 11, color: "var(--sub)" }}>営業月・半期は営業日15日で分割</span>
      </div>
      {msg && <p style={{ fontSize: 12, color: "var(--bad)" }}>{msg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr 1fr", gap: "4px 4px", alignItems: "center" }}>
        <div />
        <div style={th}>前期 1–15</div>
        <div style={th}>後期 16–末</div>
        <div style={{ ...th, color: "var(--champ)" }}>通期</div>
        {rows.map((r) => (
          <div key={r[0]} style={{ display: "contents" }}>
            <div style={{ fontSize: 12.5, color: "var(--ink)", padding: "5px 2px" }}>{r[0]}</div>
            <div style={td}>{r[1]}</div>
            <div style={td}>{r[2]}</div>
            <div style={{ ...td, color: "var(--champ)", fontWeight: 700 }}>{r[3]}</div>
          </div>
        ))}
      </div>

      {/* 売上バー（半期2本・裁定⑤） */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 5 }}>売上（半期）</div>
        {([["前期 1–15", h1.sales], ["後期 16–末", h2.sales]] as Array<[string, number]>).map(([lbl, v]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "var(--sub)", width: 74 }}>{lbl}</span>
            <div style={{ flex: 1, height: 14, background: "var(--card2)", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((v / barMax) * 100)}%`, height: "100%", background: "var(--gold)" }} />
            </div>
            <span style={{ ...t.num, fontSize: 12, width: 96, textAlign: "right", color: "var(--ink)" }}>{yen(v)}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "var(--sub)", marginTop: 12, lineHeight: 1.7 }}>
        売上・組数・来客数・同伴・drink は締め済み日報の合算。指名は本指名+場内の件数（同伴は別行）。
        {isManagerUp && "人件費は給与確定（源泉前 gross 合計）＝月次のため通期のみ・未確定月は「未確定」。"}
        {loading && " 集計中…"}
      </p>
    </section>
  );
}
