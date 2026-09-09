"use client";

// ★C層② 面 c（設計書 v1 §4・mig0136/0137）: manager（owner∨manager 自店）の営業日ごとの配置。
//   「枠×充足 n/m」（n＝その枠の確定行＋確認待ち行・m＝◯の希望者数）・希望一覧から propose・行の時刻上書き（override・理由任意）・
//   営業日一括確定＝行ごとに staff_shift_confirm を順次（1 件でも raise したら残りを止めて件数報告）。
//   行の時刻が当日有効枠と違えば「9:00〜11:00（枠 12:00〜）」。名前＝memberships（自店・cast 以外）→users.name（読取 2・表示専用）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import { hm2min, min2hm } from "@/lib/nox/shift-time";
import { effectivePatterns, fmtEnd30, staffShiftErrJa } from "../master/staff-shift-panel";
import type { Deadline, Pattern, StaffShift, Wish } from "./staff-shift-board";
import { deadlineMsOf } from "./staff-shift-board";

const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "6px 8px", fontSize: 12.5 };
const ST: Record<string, string> = { proposed: "確認待ち", confirmed: "確定" };

type Member = { id: string; user_id: string; role: string };

export default function StaffShiftManage({ storeId, month, bizToday, patterns, deadlines, wishes, shifts, cells, onChanged, setMsg }: {
  storeId: string; month: string; bizToday: string; patterns: Pattern[]; deadlines: Deadline[]; wishes: Wish[]; shifts: StaffShift[];
  cells: (string | null)[]; onChanged: () => Promise<void>; setMsg: (m: { kind: "ok" | "bad"; text: string } | null) => void;
}) {
  const supabase = createClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [selDay, setSelDay] = useState<string>(bizToday.startsWith(month) ? bizToday : `${month}-01`);
  const [ov, setOv] = useState<StaffShift | null>(null);
  const [ovStart, setOvStart] = useState("18:00");
  const [ovEnd, setOvEnd] = useState("23:00");
  const [ovNext, setOvNext] = useState(false);
  const [ovReason, setOvReason] = useState("");
  const [pickStaff, setPickStaff] = useState("");
  const [pickPattern, setPickPattern] = useState("");

  // 名前解決（memberships＝owner/manager 自店・cast 以外／users.name）
  const loadNames = useCallback(async () => {
    const { data: ms } = await supabase.from("memberships").select("id, user_id, role").eq("store_id", storeId).eq("is_active", true).neq("role", "cast");
    const list = (ms ?? []) as Member[];
    setMembers(list);
    const uids = [...new Set(list.map((m) => m.user_id))];
    if (uids.length) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      const byUser = new Map(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
      setNames(new Map(list.map((m) => [m.id, byUser.get(m.user_id) ?? "—"])));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { void loadNames(); }, [loadNames]);
  const nameOf = (mid: string) => names.get(mid) ?? "—";

  const dayShifts = (day: string) => shifts.filter((s) => s.biz_date === day);
  const dayWishes = (day: string) => wishes.filter((w) => w.biz_date === day);

  async function propose(day: string, staffId: string, patternId: string, wishId: string | null) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_shift_propose", { p_store_id: storeId, p_staff_id: staffId, p_biz_date: day, p_pattern_id: patternId, p_wish_id: wishId });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `${nameOf(staffId)} を ${day.slice(5).replace("-", "/")} に配置しました（確認待ち）` });
    if (!error) await onChanged();
  }
  function openOverride(s: StaffShift) {
    const endMin = hm2min(s.end_hm);
    setOv(s); setOvStart(s.start_hm); setOvNext(endMin >= 1440); setOvEnd(endMin >= 1440 ? min2hm(endMin - 1440) : s.end_hm); setOvReason("");
  }
  async function submitOverride() {
    if (!ov || busy) return;
    const endMin = hm2min(ovEnd) + (ovNext ? 1440 : 0);
    if (endMin <= hm2min(ovStart)) { setMsg({ kind: "bad", text: "終了は開始より後にしてください（日跨ぎは「翌日」をオン）" }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_shift_override", { p_shift_id: ov.id, p_start_hm: ovStart, p_end_hm: min2hm(endMin), p_reason: ovReason.trim() || null });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `${nameOf(ov.staff_id)} の時刻を ${ovStart}〜${fmtEnd30(min2hm(endMin))} に上書きしました` });
    if (!error) { setOv(null); await onChanged(); }
  }
  async function confirmOne(s: StaffShift) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_shift_confirm", { p_shift_id: s.id });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `${nameOf(s.staff_id)} を確定しました` });
    if (!error) await onChanged();
  }
  // ★営業日一括確定＝行ごとに順次。1 件でも raise したら残りを止めて件数を報告（設計書 v1 §2・C②-3）
  async function confirmDay(day: string) {
    if (busy) return;
    const targets = dayShifts(day).filter((s) => s.status === "proposed");
    if (targets.length === 0) { setMsg({ kind: "bad", text: "確定する行がありません" }); return; }
    setBusy(true); setMsg(null);
    let done = 0; let err: string | null = null;
    for (const s of targets) {
      const { error } = await supabase.rpc("staff_shift_confirm", { p_shift_id: s.id });
      if (error) { err = `${nameOf(s.staff_id)}: ${staffShiftErrJa(error.message)}`; break; }
      done += 1;
    }
    setBusy(false);
    setMsg(err
      ? { kind: "bad", text: `${done}件を確定した時点で停止しました（${err}）。残り ${targets.length - done} 件は未確定です` }
      : { kind: "ok", text: `${day.slice(5).replace("-", "/")} の ${done} 件を確定しました` });
    await onChanged();
  }

  const eff = effectivePatterns(patterns, selDay);
  const list = dayShifts(selDay);
  const dws = dayWishes(selDay);
  const staffOptions = members.filter((m) => m.role !== "cast");

  return (
    <>
      {/* 月ストリップ＝営業日ごとの「枠×充足 n/m」（n＝行数・m＝◯希望者） */}
      <div className="nox-calgrid">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => <div key={d} className="nox-calh">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`m${i}`} />;
          const e = effectivePatterns(patterns, day);
          const ds = dayShifts(day), dw = dayWishes(day);
          const cls = ["nox-cald", day === selDay ? "sel" : "", day === bizToday ? "today" : "", day < bizToday ? "past" : "", ds.length > 0 ? "ok" : ""].filter(Boolean).join(" ");
          return (
            <button key={day} className={cls} style={{ minHeight: 84, alignItems: "stretch" }} onClick={() => setSelDay(day)}
              title={`${day}・行 ${ds.length}・◯希望 ${dw.filter((w) => w.available).length}`}>
              <span className="nox-cald-n num">{Number(day.slice(8))}</span>
              {e.map((p) => {
                const n = ds.filter((s) => s.pattern_id === p.id || patterns.find((q) => q.id === s.pattern_id)?.name === p.name).length;
                const m = dw.filter((w) => w.available && (patterns.find((q) => q.id === w.pattern_id)?.name === p.name)).length;
                return (
                  <span key={p.id} style={{ display: "block", fontSize: 9.5, lineHeight: 1.5, textAlign: "left", color: n > 0 ? "var(--ok)" : "var(--v2-muted)" }}>
                    {p.name} <span className="num">{n}/{m}</span>
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>

      {/* 選択日の詳細＝希望一覧（配置）＋行（上書き・確定）＋一括確定 */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <b className="num" style={{ fontSize: 13.5 }}>{selDay}</b>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>
            希望締切 {new Date(deadlineMsOf(selDay, deadlines)).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          {list.some((s) => s.status === "proposed") && (
            <button style={{ ...btnDark, marginLeft: "auto" }} disabled={busy} onClick={() => void confirmDay(selDay)}>
              この営業日を一括確定（{list.filter((s) => s.status === "proposed").length} 件）
            </button>
          )}
        </div>

        <div className="nox-tablewrap">
          <table className="nox-table">
            <thead><tr><th>黒服</th><th>枠</th><th>時間</th><th>状態</th><th>操作</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const pat = patterns.find((p) => p.id === s.pattern_id);
                const cur = pat ? effectivePatterns(patterns, selDay).find((p) => p.name === pat.name) : undefined;
                const differs = cur && (cur.start_hm !== s.start_hm || cur.end_hm !== s.end_hm);
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 800 }}>{nameOf(s.staff_id)}</td>
                    <td>{pat?.name ?? "—"}</td>
                    <td className="num">
                      {s.start_hm}〜{fmtEnd30(s.end_hm)}
                      {differs && <span style={{ fontSize: 10.5, color: "var(--gold2)", marginLeft: 6 }}>（枠 {cur!.start_hm}〜{fmtEnd30(cur!.end_hm)}）</span>}
                    </td>
                    <td><span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`} style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "var(--gold-bd)" } : undefined}>{ST[s.status] ?? s.status}</span></td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button style={btnLight} disabled={busy || selDay < bizToday} onClick={() => openOverride(s)}>時刻を上書き</button>
                        {s.status === "proposed" && <button style={btnDark} disabled={busy} onClick={() => void confirmOne(s)}>確定</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={5} style={{ color: "var(--sub)" }}>この営業日の黒服シフトはまだありません。</td></tr>}
            </tbody>
          </table>
        </div>

        {/* 希望一覧（◯）から配置。× と未入力は出さない＝配置するのは「出られる」人 */}
        <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 10 }}>
          <b style={{ fontSize: 12.5 }}>希望から配置</b>
          {dws.filter((w) => w.available).length === 0 ? (
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>◯の希望はありません。</p>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {dws.filter((w) => w.available).map((w) => {
                const pat = patterns.find((p) => p.id === w.pattern_id);
                const placed = list.some((s) => s.staff_id === w.staff_id && s.wish_id === w.id);
                return (
                  <button key={w.id} type="button" className="nox-crow" disabled={busy || placed || selDay < bizToday}
                    onClick={() => void propose(selDay, w.staff_id, w.pattern_id, w.id)}
                    style={{ cursor: placed ? "default" : "pointer", opacity: placed ? 0.5 : 1, borderRadius: 8, padding: "6px 10px", border: "1px solid var(--line)", background: "transparent", fontFamily: "inherit", color: "var(--ink)", fontSize: 12.5 }}>
                    {nameOf(w.staff_id)} <span style={{ color: "var(--sub)" }}>{pat?.name ?? "—"}</span>
                    {w.note && <span style={{ color: "var(--v2-muted)", marginLeft: 6, fontSize: 11 }}>「{w.note}」</span>}
                    {placed ? <span className="nox-stpill" style={{ marginLeft: 6 }}>配置済み</span> : <span style={{ marginLeft: 6, color: "var(--champ)" }}>＋配置</span>}
                  </button>
                );
              })}
            </div>
          )}
          {/* 希望なしで直接配置（設計書 v1 §2: propose は希望なしでも可） */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span style={t.fieldLabel}>直接配置</span>
            <select value={pickStaff} onChange={(e) => setPickStaff(e.target.value)} style={input}>
              <option value="">黒服を選ぶ</option>
              {staffOptions.map((m) => <option key={m.id} value={m.id}>{nameOf(m.id)}{m.role !== "staff" ? `（${m.role}）` : ""}</option>)}
            </select>
            <select value={pickPattern} onChange={(e) => setPickPattern(e.target.value)} style={input}>
              <option value="">枠を選ぶ</option>
              {eff.map((p) => <option key={p.id} value={p.id}>{p.name} {p.start_hm}〜{fmtEnd30(p.end_hm)}</option>)}
            </select>
            <button style={btnLight} disabled={busy || !pickStaff || !pickPattern || selDay < bizToday} onClick={() => void propose(selDay, pickStaff, pickPattern, null)}>配置</button>
          </div>
        </div>
      </div>

      {ov && (
        <Modal onClose={() => setOv(null)}>
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>時刻を上書き（{nameOf(ov.staff_id)}・{ov.biz_date}）</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>行の時刻だけを変えます（枠は変わりません・確定後も可・監査に残ります）。</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={t.fieldLabel}>開始</span>
            <input type="time" value={ovStart} onChange={(e) => setOvStart(e.target.value)} style={{ ...input, maxWidth: 108 }} />
            <span style={t.fieldLabel}>終了</span>
            <input type="time" value={ovEnd} onChange={(e) => setOvEnd(e.target.value)} style={{ ...input, maxWidth: 108 }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={ovNext} onChange={(e) => setOvNext(e.target.checked)} />翌日
            </label>
          </div>
          <input value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="理由（任意）" maxLength={200} style={{ ...input, width: "100%", marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button style={btnLight} onClick={() => setOv(null)}>キャンセル</button>
            <button style={btnDark} disabled={busy} onClick={() => void submitOverride()}>上書きする</button>
          </div>
        </Modal>
      )}
    </>
  );
}
