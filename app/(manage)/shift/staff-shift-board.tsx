"use client";

// ★C層② 面 b（設計書 v1 §4・mig0136/0137）: 黒服本人（role=staff）の月カレンダー×枠の ◯× タップ。
//   読取＝staff_shift_patterns／staff_shift_deadlines（自店）・staff_shift_wishes（RLS＝本人行 or 管理者は自店全行）・
//   staff_shifts（同）・auth_membership_id（RPC）。書込＝staff_wish_set（本人・締切前のみ）。
//   締切＝staff_shift_deadline_at は内部専用のため client で deadlines 表から同式で算出
//   （対象営業日 − days_before の deadline_hm・JST・行なし＝3 日前 21:00）。
//   面 c（manager）は staff-shift-manage.tsx＝本ファイルはデータ読込と本人カレンダーを持ち、manager 以上には面 c を差す。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { addDays, bizDateOf } from "@/lib/nox/biz-date";
import { effectivePatterns, fmtEnd30, staffShiftErrJa } from "../master/staff-shift-panel";
import StaffShiftManage from "./staff-shift-manage";

export type Pattern = { id: string; name: string; start_hm: string; end_hm: string; effective_from: string; sort_order: number };
export type Deadline = { id: string; days_before: number; deadline_hm: string; effective_from: string };
export type Wish = { id: string; staff_id: string; biz_date: string; pattern_id: string; available: boolean; note: string | null };
export type StaffShift = { id: string; staff_id: string; biz_date: string; pattern_id: string; start_hm: string; end_hm: string; status: string; wish_id: string | null };

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "6px 8px", fontSize: 12.5 };

/** 希望入力の締切（JST ms）＝deadlines の当日有効行（effective_from ≤ 日の最大）・行なし＝3 日前 21:00（RPC と同式） */
export function deadlineMsOf(day: string, deadlines: Deadline[]): number {
  const d = deadlines.filter((x) => x.effective_from <= day).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  const days = d?.days_before ?? 3, hm = d?.deadline_hm ?? "21:00";
  return Date.parse(`${addDays(day, -days)}T${hm}:00+09:00`);
}
export const monthCells = (month: string): (string | null)[] => {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= n; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  return cells;
};
export const monthAfter = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export default function StaffShiftBoard({ storeId, role, cutoff }: { storeId: string; role: string; cutoff: string }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const isManagerUp = role === "owner" || role === "manager";
  const [month, setMonth] = useState(bizToday.slice(0, 7));
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [myMid, setMyMid] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string>(bizToday);
  const [noteOf, setNoteOf] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    const from = `${month}-01`, to = `${monthAfter(month, 1)}-01`;
    const [{ data: ps }, { data: ds }, { data: ws }, { data: ss }, { data: mid }] = await Promise.all([
      supabase.from("staff_shift_patterns").select("id, name, start_hm, end_hm, effective_from, sort_order").eq("store_id", storeId).order("name").order("effective_from", { ascending: false }),
      supabase.from("staff_shift_deadlines").select("id, days_before, deadline_hm, effective_from").eq("store_id", storeId),
      supabase.from("staff_shift_wishes").select("id, staff_id, biz_date, pattern_id, available, note").eq("store_id", storeId).gte("biz_date", from).lt("biz_date", to),
      supabase.from("staff_shifts").select("id, staff_id, biz_date, pattern_id, start_hm, end_hm, status, wish_id").eq("store_id", storeId).gte("biz_date", from).lt("biz_date", to).order("biz_date"),
      supabase.rpc("auth_membership_id"),
    ]);
    setPatterns((ps ?? []) as Pattern[]);
    setDeadlines((ds ?? []) as Deadline[]);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as StaffShift[]);
    setMyMid((mid as string | null) ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, month]);
  useEffect(() => { void load(); }, [load]);

  const myWish = (day: string, patternId: string) => wishes.find((w) => w.staff_id === myMid && w.biz_date === day && w.pattern_id === patternId) ?? null;
  const locked = (day: string) => Date.now() > deadlineMsOf(day, deadlines);

  // ★面 b: タップ＝◯（なし→◯・◯→×・×→◯）。staff_wish_set は upsert のみ（削除 RPC は設計外）。
  async function tap(day: string, p: Pattern) {
    if (busy || locked(day) || day < bizToday) return;
    const cur = myWish(day, p.id);
    const next = cur ? !cur.available : true;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_wish_set", { p_biz_date: day, p_pattern_id: p.id, p_available: next, p_note: (noteOf[day] ?? cur?.note ?? "") || null });
    setBusy(false);
    if (error) setMsg({ kind: "bad", text: staffShiftErrJa(error.message) });
    else { setMsg({ kind: "ok", text: `${day.slice(5).replace("-", "/")} ${p.name}＝${next ? "◯" : "×"}` }); await load(); }
  }
  async function saveNote(day: string) {
    // note だけ変える＝その日の既存希望を同じ◯×で上書き（希望が無ければ何もしない）
    const mine = wishes.filter((w) => w.staff_id === myMid && w.biz_date === day);
    if (mine.length === 0 || locked(day)) return;
    setBusy(true); setMsg(null);
    let err: string | null = null;
    for (const w of mine) {
      const { error } = await supabase.rpc("staff_wish_set", { p_biz_date: day, p_pattern_id: w.pattern_id, p_available: w.available, p_note: (noteOf[day] ?? "") || null });
      if (error) { err = staffShiftErrJa(error.message); break; }
    }
    setBusy(false);
    setMsg(err ? { kind: "bad", text: err } : { kind: "ok", text: "備考を保存しました" });
    if (!err) await load();
  }

  const cells = monthCells(month);
  const [my, mm] = month.split("-");

  return (
    <section className="nox-cardtop" style={t.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h2 style={{ ...t.cardTitle, margin: 0 }}>黒服シフト</h2>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
            {isManagerUp ? "希望から配置し、営業日ごとに確定します。行の時刻は枠から写して固定（例外は上書き）。" : "枠ごとに ◯× をタップして希望を出します。締切後はロックされます。"}
          </p>
        </div>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button style={btnLight} onClick={() => setMonth(monthAfter(month, -1))} aria-label="前の月">‹</button>
          <b className="num" style={{ fontSize: 14 }}>{my}年{mm}月</b>
          <button style={btnLight} onClick={() => setMonth(monthAfter(month, 1))} aria-label="次の月">›</button>
          <button style={btnLight} onClick={() => { setMonth(bizToday.slice(0, 7)); setSelDay(bizToday); }}>今日</button>
        </span>
      </div>
      {msg && <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 8px", color: msg.kind === "ok" ? "var(--ok)" : "var(--danger-ink)" }}>{msg.text}</p>}

      {isManagerUp ? (
        <StaffShiftManage storeId={storeId} month={month} bizToday={bizToday} patterns={patterns} deadlines={deadlines} wishes={wishes} shifts={shifts}
          cells={cells} onChanged={load} setMsg={setMsg} />
      ) : (
        <>
          {/* ★面 b: 月カレンダー × その日に有効な枠。◯／×／—（未入力）。締切後・過去日は減光してロック */}
          <div className="nox-calgrid">
            {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`b${i}`} />;
              const eff = effectivePatterns(patterns, day);
              const isLocked = locked(day) || day < bizToday;
              const cls = ["nox-cald", day === selDay ? "sel" : "", day === bizToday ? "today" : "", isLocked ? "past" : ""].filter(Boolean).join(" ");
              return (
                <div key={day} className={cls} style={{ minHeight: 84, alignItems: "stretch", cursor: "default" }} onClick={() => setSelDay(day)}>
                  <span className="nox-cald-n num">{Number(day.slice(8))}{isLocked && day >= bizToday && <small style={{ fontSize: 9, marginLeft: 3, color: "var(--v2-muted)" }}>締切</small>}</span>
                  {eff.map((p) => {
                    const w = myWish(day, p.id);
                    const mark = w ? (w.available ? "◯" : "×") : "—";
                    return (
                      <button key={p.id} type="button" disabled={isLocked || busy}
                        title={`${p.name} ${p.start_hm}〜${fmtEnd30(p.end_hm)}${isLocked ? "（締切後）" : "（タップで ◯／× 切替）"}`}
                        onClick={(e) => { e.stopPropagation(); setSelDay(day); void tap(day, p); }}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, width: "100%",
                          fontSize: 10.5, padding: "2px 5px", borderRadius: 6, cursor: isLocked ? "default" : "pointer", fontFamily: "inherit",
                          background: w?.available ? "var(--goldface2)" : "var(--card2)",
                          border: w?.available ? "1px solid var(--gold)" : "1px solid var(--line)",
                          color: w ? (w.available ? "var(--champ)" : "var(--sub)") : "var(--v2-muted)",
                        }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <b>{mark}</b>
                      </button>
                    );
                  })}
                  {eff.length === 0 && <span style={{ fontSize: 9.5, color: "var(--v2-muted)" }}>枠なし</span>}
                </div>
              );
            })}
          </div>
          {/* 選択日の備考 1 行（希望がある日だけ保存できる） */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>{selDay}</span>
            <span style={{ fontSize: 11, color: "var(--sub)" }}>
              締切 {new Date(deadlineMsOf(selDay, deadlines)).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {locked(selDay) ? "（締切後）" : ""}
            </span>
            <input value={noteOf[selDay] ?? wishes.find((w) => w.staff_id === myMid && w.biz_date === selDay)?.note ?? ""}
              onChange={(e) => setNoteOf((s) => ({ ...s, [selDay]: e.target.value }))}
              placeholder="備考（11時まで など）" maxLength={200} style={{ ...input, width: 220 }} disabled={locked(selDay)} />
            <button style={btnLight} disabled={busy || locked(selDay)} onClick={() => void saveNote(selDay)}>備考を保存</button>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            ◯＝出られる・×＝出られない・—＝未入力。配置された日は店長の確定後に「確定シフト」で見えます（本人分＝
            <span className="num">{shifts.filter((s) => s.staff_id === myMid).length}</span> 行）。
          </p>
        </>
      )}
    </section>
  );
}
