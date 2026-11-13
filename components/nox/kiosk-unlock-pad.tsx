"use client";

// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: レジ端末の解除＝誰かを選ばず PIN だけ（kiosk_unlock）。
//   ★QR 便（裁定423 変更＝Agoora 確定 10/26 ⑫・0185）: 「QR で解除」タブ＝キオスクに QR を出す（KioskQrDisplay）→本人がログイン済みのスマホで読む→本人の権限で開く。
//   旧向き（キオスクのカメラでスマホの QR を読む＝kiosk_unlock_qr）は撤去。QR のタブは mig0185On() の間だけ（false＝PIN だけ）。
//   同じ PIN が 2 人いたら名前を選ぶ（ambiguous）。RULES_0175_APPLIED=false の間は mount されない（kiosk-register が rules0175On() で出し分け＝従来の操作担当選択）。
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { mig0185On, mig0190On } from "@/lib/nox/rules-0175/flag";
import { browserDeviceFp } from "@/lib/nox/kiosk/device-fp"; // ★M-110（2026-11-06・0196 フラグ便）: 束縛済み端末の印
import KioskQrDisplay from "@/components/nox/kiosk-qr-display";
import PinPad from "@/components/nox/pin-pad"; // ★M-154
import { unlockNextOf, type UnlockResult } from "@/lib/nox/rules-0175/kiosk";

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
  const qrOk = mig0185On();
  async function openPeople() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("kiosk_staff_list");
    setBusy(false);
    if (error) { setMsg("名前の一覧を読めませんでした（店にご確認ください）"); return; }
    setPeople(((data ?? []) as { membership_id: string; user_name: string; role: string; has_pin: boolean }[]).filter((x) => x.has_pin).map((x) => ({ membership_id: x.membership_id, name: x.user_name, role: x.role })));
  }

  const handle = useCallback(async (r: UnlockResult) => {
    const next = unlockNextOf(r);
    if (next.phase === "unlocked" && r.ok) { setMsg(null); await onUnlocked({ membership_id: r.membership_id, operator_name: (r as { operator_name?: string; name?: string }).operator_name ?? (r as { name?: string }).name, role: r.role, idle_sec: r.idle_sec, unlock_method: (r as { unlock_method?: string }).unlock_method }); return; }
    if (next.phase === "choose") { setCands(next.candidates ?? []); setMsg(next.message); return; }
    if (!r.ok && r.reason === "device_locked") setLocked(true); // ★相談役 C: ロック中は「名前を選んで入る」を出す
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
      {tab === "pin" && !cands && !people && (
        <>
          <p style={{ textAlign: "center", fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>{named ? `${named.name} さんの PIN を入力してください` : "PIN を入力してください"}</p>
          <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>{named ? "名前を選んで入ります（端末のロックとは別に、本人の PIN の失敗を数えます）" : "誰かを選ぶ必要はありません（PIN で本人を特定します）"}</p>
          <PinPad value={pin} onChange={setPin} />{/* ★M-154（2026-11-11）: 出退勤と同じ共通部品 */}
          <div className="nox-pinpad-go">
            <button disabled={pin.length < 4 || busy} onClick={() => void unlockPin(named?.membership_id)} data-kiosk-unlock-go="1"
              style={{ ...t.btnGold, opacity: pin.length >= 4 ? 1 : 0.4 }}>解除</button>
          </div>
          {named && <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => { setNamed(null); setPin(""); }} data-kiosk-unlock-named-back="1">名前を選び直す</button>}
          {locked && !named && (/* ★相談役 C: ロック中の画面に「名前を選んで入る」 */
            <button style={{ ...t.btnGhost, width: "100%", marginTop: 12, padding: "12px 0", fontWeight: 800 }} disabled={busy} onClick={() => void openPeople()} data-kiosk-unlock-by-name="1">名前を選んで入る</button>
          )}
        </>
      )}
      {tab === "pin" && people && (
        <>
          <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>名前を選んでください</p>
          {people.length === 0 ? <p style={{ textAlign: "center", ...t.sub }}>名前で入れる人がいません（PIN を設定した店長・スタッフだけが出ます）</p> : (
          <div style={{ display: "grid", gap: 8 }} data-kiosk-unlock-people="1">
            {people.map((c) => <button key={c.membership_id} style={{ ...t.btnGhost, padding: "12px 0", fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={() => { setNamed(c); setPeople(null); setPin(""); setMsg(null); }}>{c.name}<span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 8 }}>{c.role === "staff" ? "スタッフ" : c.role === "manager" ? "店長" : "管理者"}</span></button>)}
          </div>)}
          <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => setPeople(null)}>もどる</button>
        </>
      )}
      {cands && (
        <>
          <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>名前を選んでください</p>
          <div style={{ display: "grid", gap: 8 }}>
            {cands.map((c) => <button key={c.membership_id} style={{ ...t.btnGhost, padding: "12px 0", fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={() => void unlockPin(c.membership_id)}>{c.name}<span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 8 }}>{c.role === "cast" ? "キャスト" : c.role === "staff" ? "スタッフ" : c.role === "manager" ? "店長" : "管理者"}</span></button>)}
          </div>
          <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => { setCands(null); setPin(""); }}>もどる</button>
        </>
      )}
      {tab === "qr" && qrOk && <KioskQrDisplay onUnlocked={onUnlocked} />}
      {msg && <Toast msg={msg} style={{ margin: "12px 0 0", textAlign: "center" }} />}
    </div>
  );
}
