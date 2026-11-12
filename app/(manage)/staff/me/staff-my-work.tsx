"use client";

// ★0201e ★7（2026-11-12）: スタッフ本人の勤怠と日計（/staff/me）＝RPC staff_my_work（本人の分だけ・店の端末では金額を返さない）。
//   月を選ぶ → 日ごとの出勤・退勤・実働・日計（時給制だけ）→ 月のまとめ（出勤日数・実働・見込み・確定・支払い済み）。読取だけ。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { staffMonthRangeOf } from "@/lib/nox/staff/pay";
import { STAFF_MY_WORK_HIDDEN_NOTE, STAFF_MY_WORK_RPC, staffMyWorkViewOf, type StaffMyWorkView } from "@/lib/nox/staff/my-work";

const yen = (n: number) => "¥" + n.toLocaleString();
const monthNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
const monthShift = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function StaffMyWork({ storeId }: { storeId: string | null }) {
  const [month, setMonth] = useState(monthNow());
  const [view, setView] = useState<StaffMyWorkView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setErr(null);
    const { from, to } = staffMonthRangeOf(month);
    let todayBiz = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    if (storeId) { const { data: tb } = await supabase.rpc("biz_date_of", { p_store_id: storeId, p_at: new Date().toISOString() }); if (typeof tb === "string") todayBiz = tb; }
    const { data, error } = await supabase.rpc(STAFF_MY_WORK_RPC, { p_from: from, p_to: to });
    if (error) { setErr(rpcErrJa(error.message)); setView(null); return; }
    setView(staffMyWorkViewOf(data, month, todayBiz));
  }, [month, storeId]);
  useEffect(() => { void load(); }, [load]);

  const th: React.CSSProperties = { padding: "6px 8px", color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap", textAlign: "left" };
  const td: React.CSSProperties = { padding: "6px 8px", whiteSpace: "nowrap" };
  return (
    <section className="nox-panel" data-staff-my-work="1">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>自分の勤怠</h3>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setMonth((m) => monthShift(m, -1))} aria-label="前の月">‹</button>
          <b className="num">{month.replace("-", "年")}月</b>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setMonth((m) => monthShift(m, 1))} aria-label="次の月" disabled={month >= monthNow()}>›</button>
        </span>
      </div>
      {err && <Toast msg={err} />}
      {view && (
        <>
          {view.hidden && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>{STAFF_MY_WORK_HIDDEN_NOTE}</p>}
          {!view.hidden && <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>{view.payHead ?? "働き方（給与）は店が登録します"}</p>}
          <div className="nox-repsum" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginBottom: 10 }}>
            <div className="nox-rs"><div className="l">出勤日数</div><div className="v num">{view.days}<small>日</small></div></div>
            <div className="nox-rs"><div className="l">実働</div><div className="v num">{view.minutesLabel}</div></div>
            {!view.hidden && view.gross !== null && <div className="nox-rs"><div className="l">見込み（総支給）</div><div className="v num">{yen(view.gross)}</div></div>}
            {view.confirmed && <div className="nox-rs"><div className="l">店の確定</div><div className="v num">{view.confirmed.amount !== null ? yen(view.confirmed.amount) : `${view.confirmed.days}日・${view.confirmed.minutesLabel}`}</div></div>}
            {view.paid && <div className="nox-rs"><div className="l">支払い</div><div className="v num" style={{ fontSize: 14 }}>{view.paid.paidOn ? dayLabel(view.paid.paidOn) : "済"}{view.paid.method ? `・${view.paid.method}` : ""}</div></div>}
          </div>
          {view.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--sub)" }}>この月の打刻はありません</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ borderBottom: "1px solid var(--line2)" }}>
                  <th style={th}>日付</th><th style={th}>出勤</th><th style={th}>退勤</th><th style={th}>実働</th>{!view.hidden && <th style={th}>日計</th>}<th style={th}>区分</th>
                </tr></thead>
                <tbody>
                  {view.rows.map((d) => (
                    <tr key={d.bizDate} style={{ borderBottom: "1px solid var(--line)" }} data-staff-my-day={d.bizDate}>
                      <td style={td} className="num">{dayLabel(d.bizDate)}</td>
                      <td style={td} className="num">{d.inHm ?? "—"}</td>
                      <td style={td} className="num">{d.working ? "勤務中" : d.missingOut ? "退勤の記録なし" : d.outHm ?? "—"}</td>
                      <td style={td} className="num">{d.hours ? `${d.hours}h` : "—"}</td>
                      {!view.hidden && <td style={td} className="num">{d.dayPay !== null ? yen(d.dayPay) : "—"}</td>}
                      <td style={td}>{d.statusLabel ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0 0" }}>見込みは打刻からの計算です。給与の確定は店が行います。日計は時給の人だけ出します。</p>
        </>
      )}
    </section>
  );
}
