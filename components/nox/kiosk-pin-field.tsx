"use client";
// ★M-133（2026-11-10）: キオスクの PIN 欄（スタッフ／店長）＝スタッフ編集モーダルの「LINE 連携」の下。
//   保存先＝staff_pin（membership 単位）＝set_staff_pin（owner／自店の manager・4〜6 桁・上書きで失敗回数とロックもリセット）・staff_pin_unlock（ロック解除）・状態は staff_pin_status。
//   キオスクの解錠（kiosk_unlock）は staff_pin を読む＝ここで設定した PIN で本人セッションに入れる。PIN の値は画面に残さない（入力欄は送信後に空・audit は設定した事実だけ＝RPC 側）。
//   本人が自分で変える口は無い（キャストも同じ＝set_cast_pin は店長以上）＝本人の変更は DDL が要る＝0201 候補。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { errJa } from "@/lib/nox/errors";

export type StaffPinStatus = { has_pin: boolean; fail_count: number; locked_until: string | null };
export const PIN_RULE_TEXT = "数字 4〜6 桁（キャストの PIN と同じ）";
export const pinValidOf = (v: string): boolean => /^[0-9]{4,6}$/.test(v);
/** 状態の 1 行（未設定／設定済み／ロック中） */
export function staffPinStateTextOf(st: StaffPinStatus | null | undefined, nowMs: number): { label: string; locked: boolean } {
  if (!st || !st.has_pin) return { label: "PIN 未設定", locked: false };
  const locked = !!st.locked_until && new Date(st.locked_until).getTime() > nowMs;
  return locked ? { label: "設定済み・ロック中（失敗が続きました）", locked: true } : { label: st.fail_count > 0 ? `設定済み（失敗 ${st.fail_count} 回）` : "設定済み", locked: false };
}

export default function KioskPinField({ membershipId, name, status, disabled = false, onChanged }: {
  membershipId: string; name: string; status: StaffPinStatus | null | undefined; disabled?: boolean; onChanged?: () => void | Promise<void>;
}) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const st = staffPinStateTextOf(status, Date.now());
  async function setPin() {
    if (busy || !pinValidOf(val)) return;
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: val });
    setBusy(false); setVal(""); // PIN の値は残さない
    if (error) { setMsg({ kind: "error", text: error.message.includes("bad pin") ? "PIN は数字 4〜6 桁で入力してください" : error.message.includes("forbidden") ? "権限がありません（自店の店長以上）" : "PIN を設定できませんでした: " + errJa(error.message) }); return; }
    setMsg({ kind: "success", text: `${name} さんの PIN を${status?.has_pin ? "変更" : "設定"}しました（口頭で伝えてください・画面と記録には残りません）` });
    await onChanged?.();
  }
  async function unlock() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("staff_pin_unlock", { p_membership_id: membershipId });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: "ロックを解除できませんでした: " + errJa(error.message) }); return; }
    setMsg({ kind: "success", text: "ロックを解除しました" });
    await onChanged?.();
  }
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }} data-staff-pin-field={status?.has_pin ? (st.locked ? "locked" : "set") : "none"}>
      <span style={{ fontSize: 12.5, color: status?.has_pin ? (st.locked ? "var(--bad)" : "var(--ok)") : "var(--sub)" }}>{st.label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="password" inputMode="numeric" autoComplete="new-password" aria-label={`${name} のキオスク PIN`} placeholder="0000"
          value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} disabled={disabled || busy}
          style={{ ...t.input, width: 130, letterSpacing: 6, fontSize: 18, textAlign: "center" }} data-staff-pin-input="1" />
        <span style={{ ...t.sub, fontSize: 11.5 }}>{PIN_RULE_TEXT}</span>
      </div>
      <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={disabled || busy || !pinValidOf(val)} onClick={() => void setPin()} data-staff-pin-set="1">{busy ? "処理中…" : status?.has_pin ? "PIN を変更（リセット）" : "PIN を設定"}</button>
        {st.locked && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={disabled || busy} onClick={() => void unlock()} data-staff-pin-unlock="1">ロックを解除</button>}
      </div>
      <span style={{ ...t.sub, fontSize: 11 }}>キオスク端末の「スタッフでログイン（PIN）」で使います。設定し直すと失敗回数とロックもリセットされます。</span>
      {msg && <Message kind={msg.kind} style={{ margin: 0 }}>{msg.text}</Message>}
    </div>
  );
}
