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
// ★夜間便 N6（便 S-1〜S-3・裁定287-1・0151 ★1 staff_shift_cancel）: 配置フローをキャスト側と同型に（日付→人／人→日付）・取消
import StaffPlaceDayModal from "./staff-place-day";
import StaffPlaceByStaffModal from "./staff-place-by-staff";
import type { PlaceArgs } from "./staff-place-form";
import { mdDowOf, wishIdFor } from "@/lib/nox/shift/staff-place";
import { isRpcMissingError } from "@/lib/nox/ui/rpc-err";

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
  // ★N6: 入口①（日付セル→モーダル）・入口②（スタッフから配置）・取消 RPC の有無（0151 手貼り前＝'missing'＝取消ボタンを出さない）
  const [placeDay, setPlaceDay] = useState<string | null>(null);
  const [byStaff, setByStaff] = useState(false);
  const [cancelRpc, setCancelRpc] = useState<"unknown" | "ok" | "missing">("unknown");
  useEffect(() => {
    // probe: p_id null → RPC は 'invalid_input' を raise（書込なし）。未適用なら PostgREST が「関数が無い」を返す
    let alive = true;
    void supabase.rpc("staff_shift_cancel", { p_id: null, p_reason: null })
      .then(({ error }) => { if (alive) setCancelRpc(error && isRpcMissingError(error.message) ? "missing" : "ok"); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ★N6: 配置＝propose（希望があれば wish_id を添える）→ 時刻を調整していれば override を続けて呼ぶ（枠の時刻で行を作る RPC の仕様のため 2 段）。
  //   失敗文言を返す（null＝成功）。成否の表示はモーダル内（裁定281-3）＝共有 msg には出さない。
  async function placeShift(day: string, staffId: string, args: PlaceArgs): Promise<string | null> {
    if (busy) return "処理中です";
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("staff_shift_propose", {
        p_store_id: storeId, p_staff_id: staffId, p_biz_date: day, p_pattern_id: args.patternId, p_wish_id: wishIdFor(wishes, staffId, day, args.patternId),
      });
      if (error) return staffShiftErrJa(error.message);
      const pat = patterns.find((p) => p.id === args.patternId);
      if (pat && (args.startHm !== pat.start_hm || args.endHm !== pat.end_hm)) {
        const { error: e2 } = await supabase.rpc("staff_shift_override", { p_shift_id: data as string, p_start_hm: args.startHm, p_end_hm: args.endHm, p_reason: null });
        if (e2) { await onChanged(); return `配置しましたが時刻の調整に失敗しました（枠の時刻のまま）: ${staffShiftErrJa(e2.message)}`; }
      }
      await onChanged();
      return null;
    } finally { setBusy(false); }
  }
  // ★N6（裁定287-1・0151 ★1）: 取消＝staff_shift_cancel(p_id, p_reason)。confirmed は理由必須（RPC 'reason required'）・過去日は 'biz_date_past'
  async function cancelShift(s: StaffShift, reason: string | null): Promise<string | null> {
    if (busy) return "処理中です";
    setBusy(true);
    try {
      const { error } = await supabase.rpc("staff_shift_cancel", { p_id: s.id, p_reason: reason });
      if (error) { if (isRpcMissingError(error.message)) setCancelRpc("missing"); return staffShiftErrJa(error.message); }
      await onChanged();
      return null;
    } finally { setBusy(false); }
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

  const list = dayShifts(selDay);
  // ★N6: モーダルに渡すスタッフ（名前解決済み・cast 以外）
  const staffList = members.filter((m) => m.role !== "cast").map((m) => ({ id: m.id, name: nameOf(m.id), role: m.role }));

  return (
    <>
      {/* ★N6 S-2: 入口②（補助＝青枠）。S-5: セルの見た目はキャスト側と同じ .nox-cald の button（hover／focus は共通 CSS） */}
      <div className="nox-actions" style={{ justifyContent: "flex-end", margin: "0 0 8px" }}>
        <button type="button" style={btnLight} disabled={busy} onClick={() => { setMsg(null); setByStaff(true); }}>スタッフから配置</button>
      </div>
      {/* 月ストリップ＝営業日ごとの「枠×充足 n/m」（n＝行数・m＝◯希望者） */}
      <div className="nox-calgrid">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => <div key={d} className="nox-calh">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`m${i}`} />;
          const e = effectivePatterns(patterns, day);
          const ds = dayShifts(day), dw = dayWishes(day);
          const cls = ["nox-cald", day === selDay ? "sel" : "", day === bizToday ? "today" : "", day < bizToday ? "past" : "", ds.length > 0 ? "ok" : ""].filter(Boolean).join(" ");
          return (
            <button key={day} className={cls} style={{ minHeight: 84, alignItems: "stretch" }} onClick={() => { setSelDay(day); setMsg(null); setPlaceDay(day); }}
              title={`${mdDowOf(day)}・配置 ${ds.length}／希望 ${dw.filter((w) => w.available).length}（クリックで配置）`}>
              <span className="nox-cald-n num">{Number(day.slice(8))}</span>
              {e.map((p) => {
                const n = ds.filter((s) => s.pattern_id === p.id || patterns.find((q) => q.id === s.pattern_id)?.name === p.name).length;
                const m = dw.filter((w) => w.available && (patterns.find((q) => q.id === w.pattern_id)?.name === p.name)).length;
                return (
                  <span key={p.id} style={{ display: "block", fontSize: 9.5, lineHeight: 1.5, textAlign: "left", color: n > 0 ? "var(--ok)" : "var(--v2-muted)" }}>
                    {p.name} <span className="num">配置{n}／希望{m}</span>{/* ★裁定235: ラベル＝「配置 n／希望 m」（n＝行数・m＝◯希望者数） */}
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
          <b className="num" style={{ fontSize: 13.5 }}>{mdDowOf(selDay)}</b>{/* ★N6 S-3: 「M/D(曜)」表記 */}
          <button style={btnLight} disabled={busy} onClick={() => { setMsg(null); setPlaceDay(selDay); }}>この日に配置</button>
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

        {/* ★N6 S-3: 「希望から配置」「直接配置（素の select 2 本）」は入口①のモーダルに吸収＝撤去。下段は選択日の配置一覧表のみ */}
      </div>

      {placeDay && (
        <StaffPlaceDayModal day={placeDay} bizToday={bizToday} patterns={patterns} staff={staffList} wishes={wishes} shifts={shifts} busy={busy}
          cancelRpc={cancelRpc} onPlace={placeShift} onCancel={cancelShift} onClose={() => setPlaceDay(null)} />
      )}
      {byStaff && (
        <StaffPlaceByStaffModal storeId={storeId} bizToday={bizToday} initialMonth={month} patterns={patterns} staff={staffList} busy={busy}
          onPlace={placeShift} onChanged={onChanged} onClose={() => setByStaff(false)} />
      )}

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
          <div className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={btnLight} onClick={() => setOv(null)}>キャンセル</button>
            <button style={btnDark} disabled={busy} onClick={() => void submitOverride()}>上書きする</button>
          </div>
        </Modal>
      )}
    </>
  );
}
