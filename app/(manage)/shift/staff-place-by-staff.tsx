"use client";

// ★夜間便 N6（便 S-2・裁定287-1・2026-09-18）→ ★裁定333（便 S1・2026-10-02）: 入口②＝「スタッフから配置」をキャストの複数日配置（ShiftAddForm）と同じ流れに。
//   (1) スタッフを選ぶ（components/nox/picker＝裁定259）→ (2) 月カレンダーで日付を複数クリック（トグル・選択日は強調・月送りしても選択は保持・
//   定休日／配置済みの日／過去日／有効な枠が無い日は選べずその旨を表示）→ (3) 枠（名前で束ねる＝日ごとに有効な版が違う）と時刻を 1 回だけ選ぶ（枠から写す・上書き可・翌日）
//   → (4) 右に「選択した日」一覧（日付・曜日・枠・時刻・個別の ×）→「N 日に配置」で一括＝既存の staff_shift_propose（＋時刻が違えば override）を日ごとに呼ぶ（親の onPlace・新規 RPC なし）。
//   途中で失敗した日は一覧に赤で残し、成功分はそのまま（全取消はしない）。1 日だけ選んだ場合も同じ流れ（従来の 1 日画面＝StaffPlaceForm は本モーダルから撤去）。
//   配置の単位と状態は現状どおり（各日が「確認待ち」で入り、確定は既存の「この営業日を一括確定」）。
//   その人の希望・配置は選択日を含む月範囲で自前で読む（staff_shift_wishes／staff_shifts＝RLS で manager は自店全行）。定休日＝store_business_hours の is_closed。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import Picker from "@/components/nox/picker";
import { Message, type MessageKind } from "@/components/ui/toast";
import { hm2min, min2hm } from "@/lib/nox/shift-time";
import { effectivePatterns, fmtEnd30 } from "../master/staff-shift-panel";
import { monthAfter, monthCells, type Pattern, type StaffShift, type Wish } from "./staff-shift-board";
import type { PlaceArgs } from "./staff-place-form";
import {
  DAY_BLOCK_JA, byStaffNext, dayBlockOf, dayPlansOf, defaultPatternNameFor, mdDowOf, nextOf30h, partitionResults, patternChoicesOf, placeLabelOf, placedDaysOf, toggleDay, wishDaysOf,
  type ByStaffStep, type PatternLike, type StaffLike,
} from "@/lib/nox/shift/staff-place";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "6px 8px", fontSize: 12.5 };
const monthOf = (ymd: string) => ymd.slice(0, 7);

export default function StaffPlaceByStaffModal({ storeId, bizToday, initialMonth, patterns, staff, busy, onPlace, onChanged, onClose }: {
  storeId: string; bizToday: string; initialMonth: string; patterns: Pattern[]; staff: StaffLike[]; busy: boolean;
  /** 1 日分の配置（propose→必要なら override）。失敗文言を返す（null＝成功）。複数日はこれを日ごとに呼ぶ */
  onPlace: (day: string, staffId: string, args: PlaceArgs) => Promise<string | null>;
  /** 配置できたら親のカレンダーも更新 */
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [step, setStep] = useState<ByStaffStep>("pick");
  const [month, setMonth] = useState(initialMonth);
  const [selDays, setSelDays] = useState<string[]>([]);
  const [patternName, setPatternName] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [endBase, setEndBase] = useState("");
  const [next, setNext] = useState(false);
  const [timesTouched, setTimesTouched] = useState(false);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [closedDows, setClosedDows] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({}); // 失敗した日 → 文言（赤で残す）
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);

  // 希望・配置＝表示中の月と選択日の月を含む範囲（月送りしても選択は保持するため）
  const months = useMemo(() => [...new Set([month, ...selDays.map(monthOf)])].sort(), [month, selDays]);
  const loadMine = useCallback(async () => {
    if (!staffId) { setWishes([]); setShifts([]); return; }
    const from = `${months[0]}-01`, to = `${monthAfter(months[months.length - 1], 1)}-01`;
    const [{ data: ws }, { data: ss }] = await Promise.all([
      supabase.from("staff_shift_wishes").select("id, staff_id, biz_date, pattern_id, available, note").eq("store_id", storeId).eq("staff_id", staffId).gte("biz_date", from).lt("biz_date", to),
      supabase.from("staff_shifts").select("id, staff_id, biz_date, pattern_id, start_hm, end_hm, status, wish_id").eq("store_id", storeId).eq("staff_id", staffId).gte("biz_date", from).lt("biz_date", to).order("biz_date"),
    ]);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as StaffShift[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, staffId, months.join()]);
  useEffect(() => { void loadMine(); }, [loadMine]);
  useEffect(() => {
    // 定休日（店の営業時間＝曜日ごと）。読めなければ定休日なし扱い（RPC 側の検査は従来どおり）
    let alive = true;
    void supabase.from("store_business_hours").select("dow, is_closed").eq("store_id", storeId)
      .then(({ data }) => { if (alive) setClosedDows(new Set(((data ?? []) as { dow: number; is_closed: boolean }[]).filter((r) => r.is_closed).map((r) => r.dow))); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const name = staff.find((s) => s.id === staffId)?.name ?? "—";
  const patName = (id: string) => patterns.find((p) => p.id === id)?.name ?? "—";
  const wishDays = staffId ? wishDaysOf(wishes, staffId) : new Map<string, string[]>();
  const placedDays = staffId ? placedDaysOf(shifts, staffId) : new Map<string, StaffShift>();
  const cells = monthCells(month);
  const [my, mm] = month.split("-");
  const effectiveByDay = useMemo(() => new Map<string, PatternLike[]>(selDays.map((d) => [d, effectivePatterns(patterns, d)])), [selDays, patterns]);
  const choices = useMemo(() => patternChoicesOf(selDays, effectiveByDay), [selDays, effectiveByDay]);
  const wishNamesByDay = useMemo(() => new Map<string, string[]>(selDays.map((d) => [d, (wishDays.get(d) ?? []).map(patName)])), [selDays, wishes]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = choices.find((c) => c.name === patternName) ?? null;
  const endHm = start && endBase ? min2hm(hm2min(endBase) + (next ? 1440 : 0)) : "";
  const invalid = !!start && !!endBase && hm2min(endHm) <= hm2min(start);
  const times = useMemo(() => (timesTouched && start && endBase && !invalid ? { startHm: start, endHm } : null), [timesTouched, start, endBase, invalid, endHm]);
  const plans = useMemo(() => (staffId ? dayPlansOf(selDays, patternName, times, effectiveByDay, wishes, staffId) : []), [selDays, patternName, times, effectiveByDay, wishes, staffId]);
  const adjusted = !!chosen && !!times && (times.startHm !== chosen.sample.start_hm || times.endHm !== chosen.sample.end_hm);
  const noPatternDays = plans.filter((p) => !p.pattern).map((p) => p.day);
  const canPlace = !!staffId && selDays.length > 0 && !!patternName && !invalid && noPatternDays.length === 0 && !busy && !running;

  /** 枠を選ぶ＝時刻を枠から写す（上書きは timesTouched で区別） */
  function pickPattern(c: { name: string; sample: PatternLike }) {
    setPatternName(c.name);
    setStart(c.sample.start_hm);
    const m = hm2min(c.sample.end_hm); setNext(m >= 1440); setEndBase(min2hm(m >= 1440 ? m - 1440 : m));
    setTimesTouched(false);
  }
  // 選択日が変わって既定の枠が未選択（または無効）なら既定へ
  useEffect(() => {
    if (selDays.length === 0) return;
    if (patternName && choices.some((c) => c.name === patternName)) return;
    const def = defaultPatternNameFor(choices, selDays, wishNamesByDay);
    const c = choices.find((x) => x.name === def);
    if (c) pickPattern(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDays.join(), choices.map((c) => c.name).join()]);

  function pick(id: string) { setStaffId(id); setSelDays([]); setFailed({}); setPatternName(null); setMsg(null); setStep(byStaffNext(step, "picked")); }
  function clear() { setStaffId(null); setSelDays([]); setFailed({}); setPatternName(null); setMsg(null); setStep(byStaffNext(step, "cleared")); }
  function clickDay(d: string) {
    const block = dayBlockOf(d, { bizToday, closedDows, placed: placedDays.has(d), effectiveCount: effectivePatterns(patterns, d).length });
    if (block) return;
    setMsg(null);
    setFailed((f) => { if (!(d in f)) return f; const n = { ...f }; delete n[d]; return n; });
    setSelDays((s) => toggleDay(s, d));
  }
  function removeDay(d: string) { setSelDays((s) => s.filter((x) => x !== d)); setFailed((f) => { const n = { ...f }; delete n[d]; return n; }); }
  function moveMonth(n: number) { setMonth(monthAfter(month, n)); } // ★333: 月送りしても選択は保持
  async function placeAll() {
    if (!canPlace || !staffId) return;
    setRunning(true); setMsg(null);
    const results: { day: string; error: string | null }[] = [];
    for (const p of plans) {
      if (!p.pattern) { results.push({ day: p.day, error: DAY_BLOCK_JA.no_pattern }); continue; }
      const err = await onPlace(p.day, staffId, { patternId: p.pattern.id, startHm: p.startHm, endHm: p.endHm });
      results.push({ day: p.day, error: err });
    }
    const { ok, failed: ng } = partitionResults(results);
    setFailed(Object.fromEntries(ng.map((r) => [r.day, r.error ?? "失敗"])));
    setSelDays((s) => s.filter((d) => !ok.includes(d))); // 成功分は選択から外す（失敗は赤で残す）
    await Promise.all([loadMine(), onChanged()]);
    setMsg(ok.length === 0
      ? { kind: "error", text: `配置できませんでした（${ng.length} 日）。赤の行の理由を確認してください` }
      : { kind: ng.length ? "warn" : "success", text: `${name} を ${ok.length} 日に配置しました（確認待ち）${ng.length ? `。${ng.length} 日は失敗＝赤の行に残しています（成功分はそのまま）` : "。続けて別の日も配置できます"}` });
    setStep(byStaffNext("select", "placed"));
    setRunning(false);
  }

  return (
    <Modal onClose={() => { if (!busy && !running) onClose(); }} maxWidth={1100} scroll>
      <div className="nox-formmodal-head">
        <strong>スタッフから配置</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy || running} onClick={onClose}>×</button>
      </div>
      <div className="nox-2col nox-2col--side">
        {/* ── 左: スタッフを選ぶ（picker・裁定259）── */}
        <div>
          <b style={{ fontSize: 13, display: "block", marginBottom: 6 }}>1. スタッフを選ぶ</b>
          <Picker items={staff.map((s) => ({ id: s.id, label: s.name, sublabel: s.role && s.role !== "staff" ? s.role : undefined, avatar: s.photoUrl ? { url: s.photoUrl } : true }))}
            value={staffId} onPick={pick} onClear={clear} disabled={busy || running} placeholder="名前で検索" empty="この店のスタッフがいません" dense />
          {step === "select" && staffId && <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>スタッフを切り替えると選択中の日はリセットされます。</p>}
        </div>
        {/* ── 右: (2) 月カレンダー（複数選択）→ (3) 枠と時刻（1 回）→ (4) 選択した日の一覧 ── */}
        <div>
          {step === "pick" && <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>スタッフを選択してください</p>}
          {step === "select" && staffId && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>2. <span style={{ color: "var(--champ)" }}>{name}</span> の配置日を選ぶ <span style={{ fontWeight: 400, color: "var(--sub)" }}>（クリックで選択・もう一度で解除）</span></b>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <button style={btnLight} disabled={busy || running} onClick={() => moveMonth(-1)} aria-label="前の月">‹</button>
                  <b className="num" style={{ fontSize: 13 }}>{my}年{mm}月</b>
                  <button style={btnLight} disabled={busy || running} onClick={() => moveMonth(1)} aria-label="次の月">›</button>
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0" }}>
                <span style={{ color: "var(--champ)" }}>■ 今回選択</span>・<span style={{ color: "var(--blue)" }}>希</span>＝◯ 希望の日・<span style={{ color: "var(--ok)" }}>枠名</span>＝配置済み（選べません）・休＝定休日（選べません）・<span style={{ color: "var(--bad)" }}>赤枠</span>＝前回の配置に失敗した日
              </p>
              <div className="nox-calgrid">
                {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                {cells.map((ymd, i) => {
                  if (!ymd) return <div key={`p${i}`} />;
                  const eff = effectivePatterns(patterns, ymd);
                  const w = wishDays.get(ymd) ?? [];
                  const p = placedDays.get(ymd) ?? null;
                  const block = dayBlockOf(ymd, { bizToday, closedDows, placed: !!p, effectiveCount: eff.length });
                  const sel = selDays.includes(ymd);
                  const ng = ymd in failed;
                  const cls = ["nox-cald", sel ? "sel" : "", p ? "ok" : "", block === "past" ? "past" : "", ymd === bizToday ? "today" : ""].filter(Boolean).join(" ");
                  const style: React.CSSProperties = {
                    ...(block === "closed" ? { background: "var(--line)", opacity: 0.55, cursor: "not-allowed" } : {}),
                    ...(block === "placed" || block === "no_pattern" ? { cursor: "not-allowed" } : {}),
                    ...(ng ? { outline: "2px solid var(--bad)", outlineOffset: -2 } : {}),
                  };
                  return (
                    <button key={ymd} type="button" className={cls} style={style} disabled={!!block || busy || running} aria-pressed={sel} onClick={() => clickDay(ymd)}
                      title={block ? `${mdDowOf(ymd)}・${DAY_BLOCK_JA[block]}${p ? `（${patName(p.pattern_id)} ${p.start_hm}〜${fmtEnd30(p.end_hm)}）` : ""}` : `${mdDowOf(ymd)}${w.length ? `・希望 ${w.map(patName).join("・")}` : ""}${ng ? `・前回失敗: ${failed[ymd]}` : ""}`}>
                      <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                      {block === "closed" && <span style={{ fontSize: 8.5, color: "var(--sub)" }}>休</span>}
                      {p && <span className="num" style={{ fontSize: 8.5, color: "var(--ok)" }}>{patName(p.pattern_id)}</span>}
                      {!p && block !== "closed" && w.length > 0 && <span style={{ fontSize: 8.5, color: "var(--blue)" }}>希 {w.map(patName).join("・")}</span>}
                    </button>
                  );
                })}
              </div>

              {selDays.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--sub)", border: "1px dashed var(--line2)", borderRadius: 8, padding: "16px 12px", textAlign: "center", marginTop: 10 }}>
                  配置する日付を選ぶと、ここに枠と時刻・選択した日の一覧が表示されます。
                </p>
              ) : (
                <div className="nox-2col" style={{ marginTop: 10 }}>
                  {/* (3) 枠と時刻＝1 回だけ */}
                  <div className="nox-inset" style={{ padding: 9 }}>
                    <b style={{ fontSize: 12 }}>3. 枠と時刻 <span style={{ fontWeight: 400, color: "var(--v2-muted)" }}>選択した日すべてに同じ枠・時刻で配置します（時刻は枠から写します）</span></b>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {choices.map((c) => {
                        const on = c.name === patternName;
                        const wished = selDays.some((d) => (wishNamesByDay.get(d) ?? []).includes(c.name));
                        return (
                          <button key={c.name} type="button" aria-pressed={on} disabled={busy || running} onClick={() => pickPattern(c)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                              background: on ? "var(--goldface2)" : "var(--card2)", border: on ? "1px solid var(--gold)" : "1px solid var(--line)", color: on ? "var(--champ)" : "var(--ink)" }}>
                            <b>{c.name}</b>
                            <span className="num" style={{ color: "var(--sub)" }}>{c.sample.start_hm}〜{fmtEnd30(c.sample.end_hm)}</span>
                            {wished && <span className="nox-stpill" style={{ color: "var(--blue)" }}>希望</span>}
                            {c.days < selDays.length && <span className="nox-stpill warn">{c.days}/{selDays.length} 日で有効</span>}
                          </button>
                        );
                      })}
                      {choices.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>選択した日に有効な枠がありません（マスタ ▸ スタッフの勤務パターンで枠を作ってください）。</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                      <span style={t.fieldLabel}>開始</span>
                      <input type="time" value={start} disabled={busy || running || !chosen} onChange={(e) => { setStart(e.target.value); setNext(nextOf30h(e.target.value, endBase)); setTimesTouched(true); }} style={{ ...input, maxWidth: 108 }} aria-label="開始" />
                      <span style={t.fieldLabel}>終了</span>
                      <input type="time" value={endBase} disabled={busy || running || !chosen} onChange={(e) => { setEndBase(e.target.value); setNext(nextOf30h(start, e.target.value)); setTimesTouched(true); }} style={{ ...input, maxWidth: 108 }} aria-label="終了" />{/* ★X2-3: 翌日は自動判定 */}
                      <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={next} disabled={busy || running || !chosen} onChange={(e) => { setNext(e.target.checked); setTimesTouched(true); }} />翌日
                      </label>
                    </div>
                    <p style={{ fontSize: 11, color: adjusted ? "var(--gold2)" : "var(--v2-muted)", margin: "6px 0 0" }}>
                      {!chosen ? "枠を選んでください"
                        : invalid ? "終了は開始より後にしてください（日跨ぎは「翌日」をオン）"
                        : adjusted ? `枠の時刻（${chosen.sample.start_hm}〜${fmtEnd30(chosen.sample.end_hm)}）と違うため、各日とも配置後に例外として上書きします（監査に残ります）`
                        : "枠の時刻のまま配置します（配置後の変更は「時刻を上書き」）"}
                    </p>
                    {noPatternDays.length > 0 && <p style={{ fontSize: 11, color: "var(--bad)", margin: "6px 0 0" }}>この枠は {noPatternDays.map(mdDowOf).join("・")} に有効ではありません（その日を外すか、別の枠を選んでください）。</p>}
                  </div>
                  {/* (4) 選択した日の一覧＝日付・曜日・枠・時刻・個別の × */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <b style={{ fontSize: 12 }}>4. 選択した日 <span className="num">{selDays.length}</span> 日</b>
                      <button type="button" style={{ ...btnLight, marginLeft: "auto", padding: "1px 8px" }} disabled={busy || running} onClick={() => { setSelDays([]); setFailed({}); }}>選択をすべて解除</button>
                    </div>
                    <div style={{ display: "grid", gap: 5, marginTop: 6, maxHeight: 320, overflowY: "auto" }}>
                      {plans.map((p) => {
                        const err = failed[p.day] ?? (p.pattern ? null : DAY_BLOCK_JA.no_pattern);
                        return (
                          <div key={p.day} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", border: `1px solid ${err ? "var(--bad)" : "var(--line)"}`, borderRadius: 8, padding: "6px 9px", fontSize: 12, color: err ? "var(--bad)" : undefined }}>
                            <b className="num" style={{ width: 84 }}>{mdDowOf(p.day)}</b>
                            <span style={{ color: err ? "var(--bad)" : "var(--sub)" }}>{p.pattern?.name ?? chosen?.name ?? "—"}</span>
                            <span className="num">{p.startHm && p.endHm ? `${p.startHm}〜${fmtEnd30(p.endHm)}` : "—"}</span>
                            {p.adjusted && !err && <span style={{ fontSize: 10, color: "var(--gold2)", fontWeight: 700 }}>上書き</span>}
                            {p.wishId && !err && <span style={{ fontSize: 10, color: "var(--blue)", fontWeight: 700 }}>希望から</span>}
                            {err && <span className="nox-stpill ng" title={err}>失敗</span>}{/* 理由は下の Message に列挙（裁定281-3＝素の描画はしない） */}
                            <button type="button" aria-label={`${p.day} を外す`} style={{ ...btnLight, marginLeft: "auto", padding: "1px 8px" }} disabled={busy || running} onClick={() => removeDay(p.day)}>×</button>
                          </div>
                        );
                      })}
                    </div>
                    {plans.some((p) => failed[p.day] || !p.pattern) && (
                      <Message kind="error" style={{ margin: "8px 0 0" }}>
                        {plans.filter((p) => failed[p.day] || !p.pattern).map((p) => <div key={p.day} className="num">{mdDowOf(p.day)}: {failed[p.day] ?? DAY_BLOCK_JA.no_pattern}</div>)}
                      </Message>
                    )}
                    <div className="nox-actions" style={{ marginTop: 10 }}>
                      <button type="button" style={btnDark} disabled={!canPlace} onClick={() => void placeAll()}>{placeLabelOf(selDays.length, running)}</button>
                    </div>
                    <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>各日が「確認待ち」で入ります。確定は従来どおり「この営業日を一括確定」で。失敗した日は赤で残り、成功した日はそのまま（全取消はしません）。</p>
                  </div>
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
