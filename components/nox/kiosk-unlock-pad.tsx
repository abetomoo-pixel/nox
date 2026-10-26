"use client";

// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: レジ端末の解除＝誰かを選ばず PIN だけ（kiosk_unlock）。
//   ★QR 便（裁定423 変更＝Agoora 確定 10/26 ⑫・0185）: 「QR で解除」タブ＝キオスクに QR を出す（KioskQrDisplay）→本人がログイン済みのスマホで読む→本人の権限で開く。
//   旧向き（キオスクのカメラでスマホの QR を読む＝kiosk_unlock_qr）は撤去。QR のタブは mig0185On() の間だけ（false＝PIN だけ）。
//   同じ PIN が 2 人いたら名前を選ぶ（ambiguous）。RULES_0175_APPLIED=false の間は mount されない（kiosk-register が rules0175On() で出し分け＝従来の操作担当選択）。
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { mig0185On } from "@/lib/nox/rules-0175/flag";
import KioskQrDisplay from "@/components/nox/kiosk-qr-display";
import { unlockNextOf, type UnlockResult } from "@/lib/nox/rules-0175/kiosk";

type Cand = { membership_id: string; name: string; role: string };

export default function KioskUnlockPad({ onUnlocked }: { onUnlocked: (r: { membership_id?: string; operator_name?: string; role?: string; idle_sec?: number; unlock_method?: string }) => void | Promise<void> }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"pin" | "qr">("pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const qrOk = mig0185On();

  const handle = useCallback(async (r: UnlockResult) => {
    const next = unlockNextOf(r);
    if (next.phase === "unlocked" && r.ok) { setMsg(null); await onUnlocked({ membership_id: r.membership_id, operator_name: (r as { operator_name?: string; name?: string }).operator_name ?? (r as { name?: string }).name, role: r.role, idle_sec: r.idle_sec, unlock_method: (r as { unlock_method?: string }).unlock_method }); return; }
    if (next.phase === "choose") { setCands(next.candidates ?? []); setMsg(next.message); return; }
    setMsg(next.message); setPin("");
  }, [onUnlocked]);

  async function unlockPin(membershipId?: string) {
    if (busy || pin.length < 4) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("kiosk_unlock", { p_pin: pin, p_membership_id: membershipId ?? null });
    setBusy(false);
    if (error) { setMsg("この端末は現在使用できません（0175 適用前か店に確認）"); setPin(""); return; }
    await handle(data as UnlockResult);
  }
  const keyBtn: React.CSSProperties = { ...t.btnGhost, fontSize: 24, fontWeight: 800, padding: "14px 0", borderRadius: 12 };
  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }} data-kiosk-unlock="1" data-kiosk-unlock-tab={tab}>
      {qrOk && (
        <div role="tablist" aria-label="解除の方法" style={{ display: "flex", gap: 8, justifyContent: "center", margin: "0 0 12px" }}>
          {([["pin", "PIN で解除"], ["qr", "QR で解除"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); setCands(null); }}
              style={{ ...t.btnGhost, ...t.btnSm, borderColor: tab === k ? "var(--gold)" : "var(--line2)", color: tab === k ? "var(--gold)" : "var(--ink)" }}>{label}</button>
          ))}
        </div>
      )}
      {tab === "pin" && !cands && (
        <>
          <p style={{ textAlign: "center", fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>PIN を入力してください</p>
          <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>誰かを選ぶ必要はありません（PIN で本人を特定します）</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 999, border: "1px solid var(--line2)", background: i < pin.length ? "var(--gold)" : "transparent", opacity: i >= 4 && pin.length <= 4 ? 0.35 : 1 }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} style={keyBtn} onClick={() => setPin((p) => (p.length >= 6 ? p : p + d))}>{d}</button>)}
            <button style={{ ...keyBtn, fontSize: 15, color: "var(--sub)" }} onClick={() => setPin("")}>クリア</button>
            <button style={keyBtn} onClick={() => setPin((p) => (p.length >= 6 ? p : p + "0"))}>0</button>
            <button style={{ ...keyBtn, fontSize: 20, color: "var(--sub)" }} onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
          </div>
          <button disabled={pin.length < 4 || busy} onClick={() => void unlockPin()} data-kiosk-unlock-go="1"
            style={{ ...t.btnGold, width: "100%", marginTop: 16, padding: "16px 0", fontSize: 18, fontWeight: 900, borderRadius: 14, opacity: pin.length >= 4 ? 1 : 0.4 }}>解除</button>
        </>
      )}
      {cands && (
        <>
          <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>名前を選んでください</p>
          <div style={{ display: "grid", gap: 8 }}>
            {cands.map((c) => <button key={c.membership_id} style={{ ...t.btnGhost, padding: "12px 0", fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={() => void unlockPin(c.membership_id)}>{c.name}<span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 8 }}>{c.role === "cast" ? "キャスト" : c.role === "staff" ? "スタッフ" : c.role === "manager" ? "店長" : "オーナー"}</span></button>)}
          </div>
          <button style={{ ...t.btnGhost, ...t.btnSm, width: "100%", marginTop: 10 }} onClick={() => { setCands(null); setPin(""); }}>もどる</button>
        </>
      )}
      {tab === "qr" && qrOk && <KioskQrDisplay onUnlocked={onUnlocked} />}
      {msg && <Toast msg={msg} style={{ margin: "12px 0 0", textAlign: "center" }} />}
    </div>
  );
}
