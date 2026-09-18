"use client";

// ★夜間便 N6（便 S-1・裁定287-1・2026-09-18）: 入口①＝黒服カレンダーの日付セル → モーダル「M/D(曜) 黒服を配置」。
//   写経元＝キャスト側 DayAddPanel（日詳細モーダル内で人を選び、配置後も閉じず同じ日に続けて配置できる）。
//   左＝スタッフ一覧（その日に ◯ 希望を出している人を上・希望の枠をバッジ・配置済みは印と枠名）／右＝枠と時刻（StaffPlaceForm）→「配置」。
//   下＝その日の配置済み一覧と「取消」（Danger＝red 枠・過去日は出さない・confirmed は理由入力のモーダル＝裁定265 の型・prompt 不使用）。
//   ≤899 は .nox-2col の 1 列。RPC は持たない（onPlace／onCancel は親 staff-shift-manage）。成否はモーダル内の Message（裁定281-3）。
import { useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import CastAvatar from "@/components/ui/cast-avatar";
import { Message, type MessageKind } from "@/components/ui/toast";
import { effectivePatterns, fmtEnd30 } from "../master/staff-shift-panel";
import type { Pattern, StaffShift, Wish } from "./staff-shift-board";
import StaffPlaceForm, { type PlaceArgs } from "./staff-place-form";
import { canCancel, cancelNeedsReason, mdDowOf, staffRowsForDay, wishesOnDay, type StaffLike } from "@/lib/nox/shift/staff-place";

const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnDanger: React.CSSProperties = { ...t.btnGhost, ...t.btnSm, border: "1px solid var(--bad)", color: "var(--bad)" };
const ST: Record<string, string> = { proposed: "確認待ち", confirmed: "確定" };

export default function StaffPlaceDayModal({ day, bizToday, patterns, staff, wishes, shifts, busy, cancelRpc, onPlace, onCancel, onClose }: {
  day: string; bizToday: string; patterns: Pattern[]; staff: StaffLike[]; wishes: Wish[]; shifts: StaffShift[]; busy: boolean;
  /** staff_shift_cancel の有無（0151 手貼り前＝'missing'＝取消ボタンを出さない） */
  cancelRpc: "unknown" | "ok" | "missing";
  /** 配置（propose→必要なら override）。失敗文言を返す（null＝成功） */
  onPlace: (day: string, staffId: string, args: PlaceArgs) => Promise<string | null>;
  /** 取消（staff_shift_cancel）。失敗文言を返す（null＝成功） */
  onCancel: (s: StaffShift, reason: string | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const [selStaff, setSelStaff] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StaffShift | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [placedTick, setPlacedTick] = useState(0); // 配置後にフォームを枠既定へ戻す（key）
  useEffect(() => { setSelStaff(null); setMsg(null); setCancelTarget(null); setCancelReason(""); }, [day]);

  const eff = effectivePatterns(patterns, day);
  const rows = staffRowsForDay(staff, wishes, shifts, day);
  const dayList = shifts.filter((s) => s.biz_date === day);
  const past = day < bizToday;
  const patName = (id: string) => patterns.find((p) => p.id === id)?.name ?? "—";
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "—";
  const sel = selStaff ? rows.find((r) => r.staff.id === selStaff) ?? null : null;

  async function place(args: PlaceArgs) {
    if (!selStaff) return;
    setMsg(null);
    const err = await onPlace(day, selStaff, args);
    if (err) { setMsg({ kind: "error", text: err }); return; }
    setMsg({ kind: "success", text: `${nameOf(selStaff)} を ${mdDowOf(day)} ${patName(args.patternId)} に配置しました（確認待ち）。続けて別の人も配置できます` });
    setPlacedTick((n) => n + 1);
  }
  async function doCancel() {
    if (!cancelTarget) return;
    const needs = cancelNeedsReason(cancelTarget);
    const reason = cancelReason.trim();
    if (needs && reason.length === 0) return;
    setMsg(null);
    const err = await onCancel(cancelTarget, reason.length ? reason : null);
    if (err) { setMsg({ kind: "error", text: err }); return; }
    setMsg({ kind: "success", text: `${nameOf(cancelTarget.staff_id)} の ${patName(cancelTarget.pattern_id)} を取り消しました` });
    setCancelTarget(null); setCancelReason("");
  }

  return (
    <Modal onClose={() => { if (!busy && !cancelTarget) onClose(); }} maxWidth={900} scroll>
      <div className="nox-formmodal-head">
        <strong className="num">{mdDowOf(day)} 黒服を配置</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      {past && <Message kind="warn" style={{ margin: "0 0 10px" }}>過去の営業日です（配置・取消はできません。閲覧のみ）</Message>}
      <div className="nox-2col nox-2col--side">
        {/* ── 左: スタッフ一覧（希望あり→上・希望の枠バッジ・配置済みは印と枠名）── */}
        <div>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "0 0 6px" }}>
            {wishesOnDay(wishes, day).length === 0 ? "この日の希望はありません" : `◯ 希望 ${new Set(wishesOnDay(wishes, day).map((w) => w.staff_id)).size} 名（上に表示）`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
            {rows.map((r) => {
              const on = r.staff.id === selStaff;
              return (
                <button key={r.staff.id} type="button" className="nox-crow" disabled={busy || past} aria-pressed={on}
                  onClick={() => { setSelStaff(r.staff.id); setMsg(null); }}
                  style={{
                    cursor: past ? "default" : "pointer", textAlign: "left", width: "100%", borderRadius: 8, fontFamily: "inherit", padding: "5px 8px",
                    background: on ? "var(--goldface2)" : "transparent", border: on ? "1px solid var(--gold)" : "1px solid transparent", color: on ? "var(--champ)" : "var(--ink)",
                  }}>
                  <CastAvatar name={r.staff.name} variant="flat" />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.staff.name}{r.staff.role && r.staff.role !== "staff" && <span style={{ fontSize: 10.5, color: "var(--sub)", marginLeft: 4 }}>（{r.staff.role}）</span>}
                  </span>
                  {r.wishes.map((w) => <span key={w.id} className="nox-stpill" style={{ color: "var(--blue)" }}>希 {patName(w.pattern_id)}</span>)}
                  {r.placed && <span className="nox-stpill ok">配置済み・{patName(r.placed.pattern_id)}</span>}
                </button>
              );
            })}
            {rows.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>この店の黒服（スタッフ）がいません。</span>}
          </div>
        </div>
        {/* ── 右: 枠と時刻 → 配置 ── */}
        <div>
          {!sel && <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>スタッフを選択してください</p>}
          {sel && (
            <StaffPlaceForm key={`${day}:${sel.staff.id}:${placedTick}`} staffName={sel.staff.name} patterns={eff}
              wishPatternIds={sel.wishes.map((w) => w.pattern_id)}
              placedPatternIds={dayList.filter((s) => s.staff_id === sel.staff.id).map((s) => s.pattern_id)}
              disabled={past} busy={busy} onPlace={place} />
          )}
        </div>
      </div>

      {/* ── この日の配置済み一覧＋取消（Danger 左＝裁定244・過去日と RPC 未適用は出さない）── */}
      <div style={{ marginTop: 14 }}>
        <b style={{ fontSize: 12.5 }}>この日の配置（{dayList.length} 件）</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {dayList.map((s) => (
            <div key={s.id} className="nox-crow" style={{ flexWrap: "wrap", padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 8 }}>
              <span style={{ fontWeight: 800 }}>{nameOf(s.staff_id)}</span>
              <span style={{ color: "var(--sub)" }}>{patName(s.pattern_id)}</span>
              <span className="num">{s.start_hm}〜{fmtEnd30(s.end_hm)}</span>
              <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`} style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "var(--gold-bd)" } : undefined}>{ST[s.status] ?? s.status}</span>
              {cancelRpc !== "missing" && canCancel(s, bizToday) && (
                <button type="button" style={{ ...btnDanger, marginLeft: "auto" }} disabled={busy || cancelRpc !== "ok"}
                  onClick={() => { setMsg(null); setCancelReason(""); setCancelTarget(s); }}>取消</button>
              )}
            </div>
          ))}
          {dayList.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>まだ配置はありません。</span>}
        </div>
      </div>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}

      {/* ★裁定265 の型: 取消の確認（confirmed＝理由必須・proposed＝理由なしで可）。Esc／背景は内側だけ閉じる（外側の onClose は cancelTarget 中は無視） */}
      {cancelTarget && (
        <Modal onClose={() => { if (!busy) { setCancelTarget(null); setCancelReason(""); } }} maxWidth={430}>
          <div className="nox-formmodal-head">
            <strong>配置を取り消す</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => { setCancelTarget(null); setCancelReason(""); }}>×</button>
          </div>
          <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
            {nameOf(cancelTarget.staff_id)}・{mdDowOf(cancelTarget.biz_date)} {patName(cancelTarget.pattern_id)} {cancelTarget.start_hm}〜{fmtEnd30(cancelTarget.end_hm)}（{ST[cancelTarget.status] ?? cancelTarget.status}）
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
            <button type="button" onClick={() => void doCancel()} disabled={busy || (cancelNeedsReason(cancelTarget) && cancelReason.trim().length === 0)}
              style={{ ...t.btnGhost, border: "1px solid var(--bad)", color: "var(--bad)", opacity: busy || (cancelNeedsReason(cancelTarget) && cancelReason.trim().length === 0) ? 0.5 : 1 }}>
              {busy ? "取消中…" : "取り消す"}
            </button>
            <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} disabled={busy} style={btnLight}>キャンセル</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
