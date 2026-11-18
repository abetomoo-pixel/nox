"use client";

// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: レジ端末の解除＝誰かを選ばず PIN だけ（kiosk_unlock）。
//   ★QR 便（裁定423 変更＝Agoora 確定 10/26 ⑫・0185）: 「QR で解除」タブ＝キオスクに QR を出す（KioskQrDisplay）→本人がログイン済みのスマホで読む→本人の権限で開く。
//   旧向き（キオスクのカメラでスマホの QR を読む＝kiosk_unlock_qr）は撤去。QR のタブは mig0185On() の間だけ（false＝PIN だけ）。
//   同じ PIN が 2 人いたら名前を選ぶ（ambiguous）。RULES_0175_APPLIED=false の間は mount されない（kiosk-register が rules0175On() で出し分け＝従来の操作担当選択）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { mig0185On, mig0190On, mig0201mOn } from "@/lib/nox/rules-0175/flag";
import { browserDeviceFp } from "@/lib/nox/kiosk/device-fp"; // ★M-110（2026-11-06・0196 フラグ便）: 束縛済み端末の印
import KioskQrDisplay from "@/components/nox/kiosk-qr-display";
import PinPad from "@/components/nox/pin-pad"; // ★M-154
import { unlockNextOf, unlockRoleLabelOf, UNLOCK_PEOPLE_EMPTY, type UnlockResult } from "@/lib/nox/rules-0175/kiosk";
import { deviceLockActiveOf, deviceLockNoteOf, deviceLockProbeOf, DEVICE_LOCK_PROBE_ARGS } from "@/lib/nox/kiosk/device-lock"; // ★2026-11-18 夜（相談役 ⑥ B）

type Cand = { membership_id: string; name: string; role: string };

export default function KioskUnlockPad({ onUnlocked }: { onUnlocked: (r: { membership_id?: string; operator_name?: string; role?: string; idle_sec?: number; unlock_method?: string }) => void | Promise<void> }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"pin" | "qr">("pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  // ★2026-11-13（相談役 C）: 端末がロック中（PIN の失敗が続いた）でも、名前を選んで本人の PIN で入れる（kiosk_unlock に p_membership_id＝DB は端末のロックを見ず本人の側で数える＝0201g）
  const [locked, setLocked] = useState(false);
  const [people, setPeople] = useState<Cand[] | null>(null);
  const [named, setNamed] = useState<Cand | null>(null);
  // ★2026-11-18 夜（相談役 ⑥ B）: ロックの解ける時刻（kiosk_unlock の返りの locked_until）と残りの分の時計（15 秒ごと・過ぎたら畳みを解く）
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lockOn = locked && deviceLockActiveOf(lockedUntil, now);
  const qrOk = mig0185On();
  // ★2026-11-18 夜（相談役 ⑥ B）: 開いた時点でロック中かを確かめる＝PIN なしの kiosk_unlock（device_lock.ts の頭の説明＝ロック中なら device_locked、そうでなければ bad_pin が返るだけで数えない）。エラーは今までの画面のまま
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await createClient().rpc("kiosk_unlock", { ...DEVICE_LOCK_PROBE_ARGS, ...(mig0190On() ? { p_device_fp: browserDeviceFp() } : {}) });
      if (!alive || error) return;
      const p = deviceLockProbeOf(data);
      if (p.locked) { setLocked(true); setLockedUntil(p.lockedUntil); setNow(Date.now()); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [locked]);
  async function openPeople() {
    setBusy(true); setMsg(null);
    // ★0201m（2026-11-16）: フラグ true＝kiosk_unlock_people（kiosk_login が通す人と同じ＝オーナー・管理者・店長・スタッフ・レジに入れるキャスト・PIN を設定した人だけ）。false＝従来の kiosk_staff_list（店長とスタッフ・has_pin で絞る）
    const { data, error } = mig0201mOn() ? await supabase.rpc("kiosk_unlock_people") : await supabase.rpc("kiosk_staff_list");
    setBusy(false);
    if (error) { setMsg("名前の一覧を読めませんでした（店にご確認ください）"); return; }
    setPeople(mig0201mOn()
      ? ((data ?? []) as { membership_id: string; user_name: string; role: string }[]).map((x) => ({ membership_id: x.membership_id, name: x.user_name, role: x.role }))
      : ((data ?? []) as { membership_id: string; user_name: string; role: string; has_pin: boolean }[]).filter((x) => x.has_pin).map((x) => ({ membership_id: x.membership_id, name: x.user_name, role: x.role })));
  }

  const handle = useCallback(async (r: UnlockResult) => {
    const next = unlockNextOf(r);
    if (next.phase === "unlocked" && r.ok) { setMsg(null); await onUnlocked({ membership_id: r.membership_id, operator_name: (r as { operator_name?: string; name?: string }).operator_name ?? (r as { name?: string }).name, role: r.role, idle_sec: r.idle_sec, unlock_method: (r as { unlock_method?: string }).unlock_method }); return; }
    if (next.phase === "choose") { setCands(next.candidates ?? []); setMsg(next.message); return; }
    // ★相談役 C: ロック中は「名前を選んで入る」を出す
    // ★2026-11-18 夜（相談役 ⑥ B）: ロック中はキーを畳んで案内（deviceLockNoteOf）を出す＝トーストは重ねない
    if (!r.ok && r.reason === "device_locked") { setLocked(true); setLockedUntil((r as { locked_until?: string | null }).locked_until ?? null); setNow(Date.now()); setMsg(null); setPin(""); return; }
    setMsg(next.message); setPin("");
  }, [onUnlocked]);

  async function unlockPin(membershipId?: string) {
    if (busy || pin.length < 4) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("kiosk_unlock", { p_pin: pin, p_membership_id: membershipId ?? null, ...(mig0190On() ? { p_device_fp: browserDeviceFp() } : {}) }); // ★M-110（裁定457）: 端末の印を添える（束縛済み端末で 'device bound' にならない＝kiosk-workspace の kiosk_login と同じ型）
    setBusy(false);
    if (error) { setMsg("この端末は現在使用できません（店にご確認ください）"); setPin(""); return; }
    await handle(data as UnlockResult);
  }
  return (
    <div className="nox-pinpad-frame" data-pin-frame="unlock" data-kiosk-unlock="1" data-kiosk-unlock-tab={tab}>{/* ★M-154 の残り: 枠は出退勤と同じ */}
      {qrOk && (
        <div role="tablist" aria-label="解除の方法" style={{ display: "flex", gap: 8, justifyContent: "center", margin: "0 0 12px" }}>
          {([["pin", "PIN で解除"], ["qr", "QR で解除"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); setCands(null); setPeople(null); setNamed(null); }}
              style={{ ...t.btnGhost, ...t.btnSm, borderColor: tab === k ? "var(--gold)" : "var(--line2)", color: tab === k ? "var(--gold)" : "var(--ink)" }}>{label}</button>
          ))}
        </div>
      )}
      {tab === "pin" && !cands && !people && lockOn && !named && (/* ★2026-11-18 夜（相談役 ⑥ B）: ロック中＝数字のキーと「解除」を畳み、「名前を選んで入る」を主ボタンに（「誰かを選ぶ必要はありません」は出さない） */
        <div data-kiosk-unlock-locked="1">
          <p style={{ textAlign: "center", fontSize: 15, fontWeight: 800, margin: "0 0 6px" }}>端末のロック中</p>
          <p style={{ ...t.sub, lineHeight: 1.7, margin: "0 0 16px" }} data-kiosk-unlock-lock-note="1">{deviceLockNoteOf(lockedUntil, now)}</p>
          <button style={t.btnPrimary56} disabled={busy} onClick={() => void openPeople()} data-kiosk-unlock-by-name="1">名前を選んで入る</button>
        </div>
      )}
      {tab === "pin" && !cands && !people && !(lockOn && !named) && (
        <>
          <p style={{ textAlign: "center", fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>{named ? `${named.name} さんの PIN を入力してください` : "PIN を入力してください"}</p>
          <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>{named ? "名前を選んで入ります（端末のロックとは別に、本人の PIN の失敗を数えます）" : "誰かを選ぶ必要はありません（PIN で本人を特定します）"}</p>
          <PinPad value={pin} onChange={setPin} />{/* ★M-154（2026-11-11）: 出退勤と同じ共通部品 */}
          <div className="nox-pinpad-go">
            <button disabled={pin.length < 4 || busy} onClick={() => void unlockPin(named?.membership_id)} data-kiosk-unlock-go="1"
              style={{ ...t.btnGold, opacity: pin.length >= 4 ? 1 : 0.4 }}>解除</button>
          </div>
          {named && <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => { setNamed(null); setPin(""); }} data-kiosk-unlock-named-back="1">名前を選び直す</button>}
          {!named && (/* ★相談役 C: ロック中の画面に「名前を選んで入る」 ★2026-11-18 夜（相談役 ⑥ B）: ロック中かどうかに関係なくいつも出す（ロック中は上の畳んだ枠の主ボタン） */
            <button style={{ ...t.btnGhost, width: "100%", marginTop: 12, padding: "12px 0", fontWeight: 800 }} disabled={busy} onClick={() => void openPeople()} data-kiosk-unlock-by-name="1">名前を選んで入る</button>
          )}
        </>
      )}
      {tab === "pin" && people && (
        <>
          <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>名前を選んでください</p>
          {people.length === 0 ? <p style={{ textAlign: "center", ...t.sub }} data-kiosk-unlock-empty="1">{mig0201mOn() ? UNLOCK_PEOPLE_EMPTY : "名前で入れる人がいません（PIN を設定した店長・スタッフだけが出ます）"}</p> : (
          <div style={{ display: "grid", gap: 8 }} data-kiosk-unlock-people="1">
            {people.map((c) => <button key={c.membership_id} style={{ ...t.btnGhost, padding: "12px 0", fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={() => { setNamed(c); setPeople(null); setPin(""); setMsg(null); }}>{c.name}<span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 8 }}>{unlockRoleLabelOf(c.role)}</span></button>)}
          </div>)}
          <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => setPeople(null)}>もどる</button>
        </>
      )}
      {cands && (
        <>
          <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>名前を選んでください</p>
          <div style={{ display: "grid", gap: 8 }}>
            {cands.map((c) => <button key={c.membership_id} style={{ ...t.btnGhost, padding: "12px 0", fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={() => void unlockPin(c.membership_id)}>{c.name}<span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 8 }}>{unlockRoleLabelOf(c.role)}</span></button>)}
          </div>
          <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => { setCands(null); setPin(""); }}>もどる</button>
        </>
      )}
      {tab === "qr" && qrOk && <KioskQrDisplay onUnlocked={onUnlocked} />}
      {msg && <Toast msg={msg} style={{ margin: "12px 0 0", textAlign: "center" }} />}
    </div>
  );
}
