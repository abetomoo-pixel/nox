"use client";

// ★夜間便 N6（便 S-2・裁定287-1・2026-09-18）: 入口②＝「スタッフから配置」（補助＝青枠）→ モーダル:
//   (1) スタッフを選ぶ（components/nox/picker＝裁定259・select 不使用）→ (2) 月カレンダー（その人の ◯ 希望の日に印・配置済みの日に印と枠名）
//   → 日付をクリック → (3) 枠と時刻（StaffPlaceForm）→「配置」→ (2) のカレンダーに戻り続けて別の日を配置できる。月送り可。
//   写経元＝キャスト側 ShiftAddForm（左＝picker／右＝月カレンダー・.nox-2col--side・≤899 は 1 列・「保存して続ける」型）。
//   その人の希望・配置は月ごとに自前で読む（staff_shift_wishes／staff_shifts＝RLS で manager は自店全行）。RPC は親（onPlace）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import Picker from "@/components/nox/picker";
import { Message, type MessageKind } from "@/components/ui/toast";
import { effectivePatterns, fmtEnd30 } from "../master/staff-shift-panel";
import { monthAfter, monthCells, type Pattern, type StaffShift, type Wish } from "./staff-shift-board";
import StaffPlaceForm, { type PlaceArgs } from "./staff-place-form";
import { byStaffNext, mdDowOf, placedDaysOf, wishDaysOf, type ByStaffStep, type StaffLike } from "@/lib/nox/shift/staff-place";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function StaffPlaceByStaffModal({ storeId, bizToday, initialMonth, patterns, staff, busy, onPlace, onChanged, onClose }: {
  storeId: string; bizToday: string; initialMonth: string; patterns: Pattern[]; staff: StaffLike[]; busy: boolean;
  onPlace: (day: string, staffId: string, args: PlaceArgs) => Promise<string | null>;
  /** 配置できたら親のカレンダーも更新 */
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [step, setStep] = useState<ByStaffStep>("pick");
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  const loadMine = useCallback(async () => {
    if (!staffId) { setWishes([]); setShifts([]); return; }
    const from = `${month}-01`, to = `${monthAfter(month, 1)}-01`;
    const [{ data: ws }, { data: ss }] = await Promise.all([
      supabase.from("staff_shift_wishes").select("id, staff_id, biz_date, pattern_id, available, note").eq("store_id", storeId).eq("staff_id", staffId).gte("biz_date", from).lt("biz_date", to),
      supabase.from("staff_shifts").select("id, staff_id, biz_date, pattern_id, start_hm, end_hm, status, wish_id").eq("store_id", storeId).eq("staff_id", staffId).gte("biz_date", from).lt("biz_date", to).order("biz_date"),
    ]);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as StaffShift[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, staffId, month]);
  useEffect(() => { void loadMine(); }, [loadMine]);

  const name = staff.find((s) => s.id === staffId)?.name ?? "—";
  const patName = (id: string) => patterns.find((p) => p.id === id)?.name ?? "—";
  const wishDays = staffId ? wishDaysOf(wishes, staffId) : new Map<string, string[]>();
  const placedDays = staffId ? placedDaysOf(shifts, staffId) : new Map<string, StaffShift>();
  const cells = monthCells(month);
  const [my, mm] = month.split("-");

  function pick(id: string) { setStaffId(id); setDay(null); setMsg(null); setStep(byStaffNext(step, "picked")); }
  function clear() { setStaffId(null); setDay(null); setMsg(null); setStep(byStaffNext(step, "cleared")); }
  function clickDay(d: string) { if (d < bizToday) return; setDay(d); setMsg(null); setStep(byStaffNext(step, "day")); }
  function moveMonth(n: number) { setMonth(monthAfter(month, n)); setDay(null); setStep(staffId ? "calendar" : "pick"); }
  async function place(args: PlaceArgs) {
    if (!staffId || !day) return;
    setMsg(null);
    const err = await onPlace(day, staffId, args);
    if (err) { setMsg({ kind: "error", text: err }); return; }
    setMsg({ kind: "success", text: `${name} を ${mdDowOf(day)} ${patName(args.patternId)} に配置しました（確認待ち）。続けて別の日も配置できます` });
    setTick((n) => n + 1);
    await Promise.all([loadMine(), onChanged()]);
    setStep(byStaffNext("place", "placed"));
    setDay(null);
  }

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={980} scroll>
      <div className="nox-formmodal-head">
        <strong>スタッフから配置</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <div className="nox-2col nox-2col--side">
        {/* ── 左: スタッフを選ぶ（picker・裁定259）── */}
        <div>
          <b style={{ fontSize: 13, display: "block", marginBottom: 6 }}>1. スタッフを選ぶ</b>
          <Picker items={staff.map((s) => ({ id: s.id, label: s.name, sublabel: s.role && s.role !== "staff" ? s.role : undefined, avatar: true }))}
            value={staffId} onPick={pick} onClear={clear} disabled={busy} placeholder="名前で検索" empty="この店のスタッフがいません" dense />
        </div>
        {/* ── 右: (2) 月カレンダー／(3) 枠と時刻 ── */}
        <div>
          {step === "pick" && <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>スタッフを選択してください</p>}
          {step !== "pick" && staffId && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>2. <span style={{ color: "var(--champ)" }}>{name}</span> の配置日</b>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <button style={btnLight} disabled={busy} onClick={() => moveMonth(-1)} aria-label="前の月">‹</button>
                  <b className="num" style={{ fontSize: 13 }}>{my}年{mm}月</b>
                  <button style={btnLight} disabled={busy} onClick={() => moveMonth(1)} aria-label="次の月">›</button>
                </span>
              </div>
              {step === "calendar" && (
                <>
                  <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0" }}>日付をクリックすると枠と時刻を選べます。<span style={{ color: "var(--blue)" }}>希</span>＝◯ 希望の日・<span style={{ color: "var(--ok)" }}>枠名</span>＝配置済み</p>
                  <div className="nox-calgrid">
                    {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                    {cells.map((ymd, i) => {
                      if (!ymd) return <div key={`p${i}`} />;
                      const eff = effectivePatterns(patterns, ymd);
                      const w = wishDays.get(ymd) ?? [];
                      const p = placedDays.get(ymd) ?? null;
                      const past = ymd < bizToday;
                      const cls = ["nox-cald", p ? "ok" : "", past ? "past" : "", ymd === bizToday ? "today" : ""].filter(Boolean).join(" ");
                      return (
                        <button key={ymd} type="button" className={cls} disabled={past || busy || eff.length === 0} onClick={() => clickDay(ymd)}
                          title={past ? "過去の営業日" : eff.length === 0 ? "有効な枠がありません" : `${mdDowOf(ymd)}${w.length ? `・希望 ${w.map(patName).join("・")}` : ""}${p ? `・配置済み ${patName(p.pattern_id)}` : ""}`}>
                          <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                          {p && <span className="num" style={{ fontSize: 8.5, color: "var(--ok)" }}>{patName(p.pattern_id)}</span>}
                          {!p && w.length > 0 && <span style={{ fontSize: 8.5, color: "var(--blue)" }}>希 {w.map(patName).join("・")}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {step === "place" && day && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <b className="num" style={{ fontSize: 13 }}>3. {mdDowOf(day)}</b>
                    <button style={btnLight} disabled={busy} onClick={() => { setDay(null); setMsg(null); setStep(byStaffNext("place", "back")); }}>‹ カレンダーへ戻る</button>
                  </div>
                  {(() => {
                    const p = placedDays.get(day);
                    return p ? <p style={{ fontSize: 11.5, color: "var(--ok)", margin: "0 0 6px" }}>この日は {patName(p.pattern_id)} {p.start_hm}〜{fmtEnd30(p.end_hm)} に配置済みです。</p> : null;
                  })()}
                  <StaffPlaceForm key={`${day}:${staffId}:${tick}`} staffName={name} patterns={effectivePatterns(patterns, day)}
                    wishPatternIds={wishDays.get(day) ?? []}
                    placedPatternIds={shifts.filter((s) => s.biz_date === day).map((s) => s.pattern_id)}
                    busy={busy} onPlace={place} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </Modal>
  );
}
