"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import * as t from "@/lib/nox/ui/theme";
import IncentivePanel from "./incentive-panel";

type Cast = { id: string; name: string };
type Wish = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Att = { cast_id: string; status: string; eta: string | null };
type Need = { dow: number; required: number };

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const ATT_OPTIONS = [
  ["", "—"], ["shukkin", "出勤"], ["dohan", "同伴"], ["late", "遅刻"], ["off", "休み"], ["absent", "当欠"],
] as const;

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
const btnDark: React.CSSProperties = { ...t.btnGold, padding: "8px 16px" };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

export default function ShiftBoard({ storeId, casts, isManagerUp }: { storeId: string; casts: Cast[]; isManagerUp: boolean }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [attDate, setAttDate] = useState(bizToday);
  const [atts, setAtts] = useState<Att[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  // 新規シフトフォーム（manager）
  const [fCast, setFCast] = useState("");
  const [fDate, setFDate] = useState(bizToday);
  const [fStart, setFStart] = useState("20:00");
  const [fEnd, setFEnd] = useState("26:00");
  const [fStatus, setFStatus] = useState("planned");

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  const load = useCallback(async () => {
    const { data: ws } = await supabase
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status")
      .eq("status", "pending").order("date");
    const { data: ss } = await supabase
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status")
      .gte("date", bizToday).order("date").limit(30);
    const { data: ns } = await supabase.from("staffing_needs").select("dow, required").order("dow");
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday]);

  const loadAtt = useCallback(async (d: string) => {
    const { data } = await supabase.from("attendance").select("cast_id, status, eta").eq("date", d);
    setAtts((data ?? []) as Att[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAtt(attDate); }, [attDate, loadAtt]);

  async function decide(wishId: string, accept: boolean) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: accept });
    setMsg(error ? error.message : accept ? "採用しシフト案に追加しました" : "見送りました");
    await load();
  }

  async function addShift() {
    if (!fCast) return;
    setMsg(null);
    const { error } = await supabase.rpc("shift_set", {
      p_id: null, p_cast_id: fCast, p_date: fDate, p_start_hm: fStart, p_end_hm: fEnd, p_status: fStatus,
    });
    setMsg(error ? error.message : "シフトを登録しました");
    await load();
  }

  async function confirmShift(s: Shift) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_set", {
      p_id: s.id, p_cast_id: s.cast_id, p_date: s.date, p_start_hm: s.start_hm, p_end_hm: s.end_hm, p_status: "confirmed",
    });
    setMsg(error ? error.message : "確定しました");
    await load();
  }

  async function setAtt(castId: string, status: string) {
    if (!status) return;
    setMsg(null);
    const { error } = await supabase.rpc("attendance_set", {
      p_cast_id: castId, p_date: attDate, p_status: status, p_eta: null, p_reason: null,
    });
    setMsg(error ? error.message : null);
    await loadAtt(attDate);
  }

  async function saveNeed(dow: number, required: number) {
    setMsg(null);
    const { error } = await supabase.rpc("set_staffing_need", { p_store_id: storeId, p_dow: dow, p_required: required });
    setMsg(error ? error.message : null);
    await load();
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={t.pheadH1}>シフト管理</h1>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}

      {isManagerUp && <IncentivePanel storeId={storeId} />}

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>希望（審査待ち）</h2>
        {wishes.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {wishes.map((w) => (
          <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span style={{ ...t.num, width: 90 }}>{w.date}</span>
            <span style={{ width: 110 }}>{castName(w.cast_id)}</span>
            <span style={t.num}>{fmtWin(w.start_hm, w.end_hm)}</span>
            {/* 採否は manager 以上のみ（RPC 側も owner/manager 強制＝二重） */}
            {isManagerUp && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button style={btnDark} onClick={() => decide(w.id, true)}>採用</button>
                <button style={btnLight} onClick={() => decide(w.id, false)}>見送り</button>
              </span>
            )}
          </div>
        ))}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>確定シフト（今後）</h2>
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select value={fCast} onChange={(e) => setFCast(e.target.value)} style={input}>
              <option value="">キャスト</option>
              {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={input} />
            <input value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ ...input, width: 70 }} />
            <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
            <input value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ ...input, width: 70 }} />
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={input}>
              <option value="planned">予定</option>
              <option value="confirmed">確定</option>
            </select>
            <button style={btnDark} onClick={addShift}>登録</button>
          </div>
        )}
        {shifts.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {shifts.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span style={{ ...t.num, width: 90 }}>{s.date}</span>
            <span style={{ width: 110 }}>{castName(s.cast_id)}</span>
            <span style={t.num}>{fmtWin(s.start_hm, s.end_hm)}</span>
            <span style={{ color: s.status === "confirmed" ? "var(--ok)" : "var(--champ)" }}>
              {s.status === "confirmed" ? "確定" : "予定"}
            </span>
            {isManagerUp && s.status === "planned" && (
              <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => confirmShift(s)}>確定にする</button>
            )}
          </div>
        ))}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>
          出勤板（staff も操作可＝attendance のみ開放・台帳 #24）
        </h2>
        <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ ...input, marginBottom: 8 }} />
        {casts.map((c) => {
          const a = atts.find((x) => x.cast_id === c.id);
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ width: 110 }}>{c.name}</span>
              <select value={a?.status ?? ""} onChange={(e) => setAtt(c.id, e.target.value)} style={input}>
                {ATT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {a?.eta && <span style={{ ...t.num, color: "var(--sub)" }}>見込み {a.eta}</span>}
            </div>
          );
        })}
      </section>

      {isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>必要人数（曜日別）</h2>
          <div style={{ display: "flex", gap: 10 }}>
            {DOW.map((label, dow) => {
              const n = needs.find((x) => x.dow === dow);
              return (
                <label key={dow} style={{ fontSize: 12, textAlign: "center", color: "var(--sub)" }}>
                  {label}
                  <input
                    type="number" min={0} defaultValue={n?.required ?? 0}
                    onBlur={(e) => saveNeed(dow, Number(e.target.value))}
                    style={{ ...input, width: 52, display: "block", marginTop: 4 }}
                  />
                </label>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)" }}>変更はフォーカスアウトで保存</p>
        </section>
      )}
    </div>
  );
}
