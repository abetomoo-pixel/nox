"use client";
// ★便 M5 M-49（2026-10-30）: 本体画面の guard＝キオスクから「本人でログイン」したセッションだけ（localStorage の印）に効く。
//   無操作 N 分（店設定・既定 10）で local サインアウト→端末のセッションを復元→/kiosk。店長未満（staff）は即戻す。帯＝「今すぐ戻る」。
//   印が無い通常のログインには何もしない（描画 0）。
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { idleExpiredOf, kioskPersonAllowedOf, kioskPersonNoteOf } from "@/lib/nox/kiosk/person-login";
import { kioskPersonActive, kioskPersonMarkOf, leaveKioskPersonLogin } from "@/lib/nox/kiosk/person-login-client";
import { KIOSK_PERSON_LEAVE, kioskPersonBandTextOf, kioskPersonSessionAllowedOf } from "@/lib/nox/kiosk/person-session"; // ★便 E（0196 用）
import { endKioskPersonSession } from "@/lib/nox/kiosk/person-session-client"; // ★便 E

export default function KioskPersonGuard({ idleMinutes, role, name = null }: { idleMinutes: number; role: string; /** ★便 E: 帯に出す本人の名前（PIN の印のとき） */ name?: string | null }) {
  const [active, setActive] = useState(false);
  const [pin, setPin] = useState(false); // ★便 E（0196 用）: PIN の本人セッション（終了は route 経由・manager／staff）
  const last = useRef(Date.now());
  const leaving = useRef(false);
  useEffect(() => {
    if (!kioskPersonActive()) return;
    const supabase = createClient();
    const isPin = kioskPersonMarkOf()?.pin === true; // ★便 E
    const leave = (reason: "idle" | "manual" = "idle") => { if (leaving.current) return; leaving.current = true; void (isPin ? endKioskPersonSession(supabase, reason) : leaveKioskPersonLogin(supabase)); };
    if (isPin ? !kioskPersonSessionAllowedOf(role) : !kioskPersonAllowedOf(role)) { leave("manual"); return; }
    setPin(isPin);
    setActive(true);
    const touch = () => { last.current = Date.now(); };
    const evs: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    for (const e of evs) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => { if (idleExpiredOf(last.current, Date.now(), idleMinutes)) leave(); }, 15_000);
    return () => { for (const e of evs) window.removeEventListener(e, touch); window.clearInterval(timer); };
  }, [idleMinutes, role]);
  if (!active) return null;
  return (
    <div data-kiosk-person-bar="1" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: "6px 12px", background: "var(--goldface2, #1b1710)", borderTop: "1px solid var(--gold, #c9a24a)", color: "var(--champ, #e9d8a6)", fontSize: 12.5 }}>
      <span>{pin ? kioskPersonBandTextOf(name, idleMinutes) : kioskPersonNoteOf(idleMinutes)}</span>{/* ★便 E: PIN の印＝「端末で ◯◯ さんとして操作中」 */}
      <button type="button" data-kiosk-person-leave="1" onClick={() => { leaving.current = true; void (pin ? endKioskPersonSession(createClient(), "manual") : leaveKioskPersonLogin(createClient())); }}
        style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "4px 12px", borderRadius: 8, border: "1px solid var(--gold, #c9a24a)", background: "transparent", color: "inherit", cursor: "pointer" }}>{pin ? KIOSK_PERSON_LEAVE : "今すぐキオスクへ戻る"}</button>
    </div>
  );
}
