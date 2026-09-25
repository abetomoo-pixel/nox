"use client";

// ★C層② 面 c（設計書 v1 §4・mig0136/0137）: manager（owner∨manager 自店）の営業日ごとの配置。
//   「枠×充足 n/m」（n＝その枠の確定行＋確認待ち行・m＝◯の希望者数）・希望一覧から propose・行の時刻上書き（override・理由任意）・
//   営業日一括確定＝行ごとに staff_shift_confirm を順次（1 件でも raise したら残りを止めて件数報告）。
//   行の時刻が当日有効枠と違えば「9:00〜11:00（枠 12:00〜）」。名前＝memberships（自店・cast 以外）→users.name（読取 2・表示専用）。
import { staffCellCompactOf } from "@/lib/nox/ui/month-nav"; // ★裁定306-10: ≤899px の月セルは「早 0/0」の 1 行ずつ・折返し禁止・3 枠以上は「+n」
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
import { mdDowOf, wishIdFor, canCancel, cancelNeedsReason, nextOf30h } from "@/lib/nox/shift/staff-place";
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
  // ★便 X2-2（2026-09-24）: 一覧の「取消」＝入口①と同じ理由モーダル（裁定265 の型）。上書き（ov）と排他＝片方を開くと他方を閉じる
  const [cancelTarget, setCancelTarget] = useState<StaffShift | null>(null);
  const [cancelReason, setCancelReason] = useState("");
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
    setCancelTarget(null); setCancelReason(""); // ★X2-2: 排他
    setOv(s); setOvStart(s.start_hm); setOvNext(endMin >= 1440); setOvEnd(endMin >= 1440 ? min2hm(endMin - 1440) : s.end_hm); setOvReason("");
  }
  function openCancel(s: StaffShift) {
    setOv(null); // ★X2-2: 排他
    setMsg(null); setCancelReason(""); setCancelTarget(s);
  }
  async function submitCancel() {
    if (!cancelTarget || busy) return;
    const needs = cancelNeedsReason(cancelTarget);
    const reason = cancelReason.trim();
    if (needs && reason.length === 0) return;
    const err = await cancelShift(cancelTarget, reason.length ? reason : null);
    if (err) { setMsg({ kind: "bad", text: err }); return; }
    setMsg({ kind: "ok", text: `${nameOf(cancelTarget.staff_id)} の ${mdDowOf(cancelTarget.biz_date)} の配置を取り消しました` });
    setCancelTarget(null); setCancelReason("");
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
              {(() => {
                const rows = e.map((p) => ({
                  id: p.id, name: p.name,
                  n: ds.filter((s) => s.pattern_id === p.id || patterns.find((q) => q.id === s.pattern_id)?.name === p.name).length,
                  m: dw.filter((w) => w.available && (patterns.find((q) => q.id === w.pattern_id)?.name === p.name)).length,
                }));
                const compact = staffCellCompactOf(rows); // ★306-10: ≤899px＝「早 0/0」の 1 行ずつ（最大 2 行＋「+n」）・≥900px は現行
                return (
                  <>
                    {rows.map((r) => (
                      <span key={r.id} className="nox-sscell-wide" style={{ display: "block", fontSize: 9.5, lineHeight: 1.5, textAlign: "left", color: r.n > 0 ? "var(--ok)" : "var(--v2-muted)" }}>
                        {r.name} <span className="num">配置{r.n}／希望{r.m}</span>{/* ★裁定235: ラベル＝「配置 n／希望 m」（n＝行数・m＝◯希望者数） */}
                      </span>
                    ))}
                    {compact.lines.map((l, k) => <span key={`c${k}`} className="nox-sscell-narrow num" style={{ color: rows[k].n > 0 ? "var(--ok)" : "var(--v2-muted)" }}>{l}</span>)}
                    {compact.more > 0 && <span className="nox-sscell-narrow num" style={{ color: "var(--v2-muted)" }}>+{compact.more}</span>}
                  </>
                );
              })()}
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
            <thead><tr><th>スタッフ</th><th>枠</th><th>時間</th><th>状態</th><th>操作</th></tr></thead>
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
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        {/* ★便 X2-2: 一覧にも「取消」（Danger 左＝裁定244・過去日と RPC 未適用は出さない・confirmed は理由モーダル）→「時刻を上書き」→「確定」 */}
                        {cancelRpc !== "missing" && canCancel(s, bizToday) && (
                          <button type="button" style={{ ...btnLight, border: "1px solid var(--bad)", color: "var(--bad)" }} disabled={busy || cancelRpc !== "ok"} onClick={() => openCancel(s)}>取消</button>
                        )}
                        <button type="button" style={btnLight} disabled={busy || selDay < bizToday} onClick={() => openOverride(s)}>時刻を上書き</button>
                        {s.status === "proposed" && <button type="button" style={btnDark} disabled={busy} onClick={() => void confirmOne(s)}>確定</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={5} style={{ color: "var(--sub)" }}>この営業日のスタッフシフトはまだありません。</td></tr>}
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

      {/* ★便 X2-2: 上書きモーダル＝裁定265 の型（.nox-formmodal-head／foot・× で閉じる・キャンセル左・実行右）。翌日は終了≦開始で自動オン（X2-3） */}
      {ov && !cancelTarget && (
        <Modal onClose={() => { if (!busy) setOv(null); }}>
          <div className="nox-formmodal-head">
            <strong>時刻を上書き</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => setOv(null)}>×</button>
          </div>
          <p style={{ fontSize: 12.5, margin: "0 0 4px" }}>{nameOf(ov.staff_id)}・{mdDowOf(ov.biz_date)}（現在 {ov.start_hm}〜{fmtEnd30(ov.end_hm)}）</p>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>行の時刻だけを変えます（枠は変わりません・確定後も可・監査に残ります）。終了が開始より前の時刻なら「翌日」が自動でオンになります。</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={t.fieldLabel}>開始</span>
            <input type="time" value={ovStart} onChange={(e) => { setOvStart(e.target.value); setOvNext(nextOf30h(e.target.value, ovEnd)); }} style={{ ...input, maxWidth: 108 }} />
            <span style={t.fieldLabel}>終了</span>
            <input type="time" value={ovEnd} onChange={(e) => { setOvEnd(e.target.value); setOvNext(nextOf30h(ovStart, e.target.value)); }} style={{ ...input, maxWidth: 108 }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={ovNext} onChange={(e) => setOvNext(e.target.checked)} />翌日
            </label>
          </div>
          <input value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="理由（任意）" maxLength={200} style={{ ...input, width: "100%", marginTop: 8 }} />
          <div className="nox-formmodal-foot">
            <button type="button" style={btnLight} disabled={busy} onClick={() => setOv(null)}>キャンセル</button>
            <button type="button" style={btnDark} disabled={busy} onClick={() => void submitOverride()}>{busy ? "保存中…" : "上書きする"}</button>
          </div>
        </Modal>
      )}
      {/* ★便 X2-2: 一覧の取消＝裁定265 の型（confirmed＝理由必須・proposed＝理由なし可）。入口①（staff-place-day）のモーダルと同文言 */}
      {cancelTarget && (
        <Modal onClose={() => { if (!busy) { setCancelTarget(null); setCancelReason(""); } }} maxWidth={430}>
          <div className="nox-formmodal-head">
            <strong>配置を取り消す</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => { setCancelTarget(null); setCancelReason(""); }}>×</button>
          </div>
          <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
            {nameOf(cancelTarget.staff_id)}・{mdDowOf(cancelTarget.biz_date)} {patterns.find((p) => p.id === cancelTarget.pattern_id)?.name ?? "—"} {cancelTarget.start_hm}〜{fmtEnd30(cancelTarget.end_hm)}（{ST[cancelTarget.status] ?? cancelTarget.status}）
          </p>
          {cancelNeedsReason(cancelTarget) ? (
            <>
              <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>確定済みの取消には理由が必要です（200 字まで・監査に残ります）</p>
              <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={200} placeholder="例: 本人都合で出勤不可" autoFocus style={{ ...t.input, width: "100%" }} />
            </>
          ) : (
            <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>確認待ちの行を取り消します（本人の希望は残ります・再配置できます）。</p>
          )}
          <div className="nox-formmodal-foot">
            <button type="button" onClick={() => void submitCancel()} disabled={busy || (cancelNeedsReason(cancelTarget) && cancelReason.trim().length === 0)}
              style={{ ...t.btnGhost, border: "1px solid var(--bad)", color: "var(--bad)", opacity: busy || (cancelNeedsReason(cancelTarget) && cancelReason.trim().length === 0) ? 0.5 : 1 }}>
              {busy ? "取消中…" : "取り消す"}
            </button>
            <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} disabled={busy} style={btnLight}>キャンセル</button>
          </div>
        </Modal>
      )}
    </>
  );
}
