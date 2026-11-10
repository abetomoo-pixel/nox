"use client";
// ★便 M5 M-49（2026-10-30）: 本体画面の guard＝キオスクから「本人でログイン」したセッションだけ（localStorage の印）に効く。
//   無操作 N 分（店設定・既定 10）で local サインアウト→端末のセッションを復元→/kiosk。店長未満（staff）は即戻す。帯＝「今すぐ戻る」。
//   印が無い通常のログインには何もしない（描画 0）。
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { idleExpiredOf, kioskPersonAllowedOf, kioskPersonNoteOf } from "@/lib/nox/kiosk/person-login";
import { kioskPersonActive, kioskPersonMarkOf, leaveKioskPersonLogin } from "@/lib/nox/kiosk/person-login-client";
import { KIOSK_PERSON_LEAVE, KIOSK_PERSON_LOCK, kioskPersonBandTextOf, kioskPersonRemainTextOf, kioskPersonSessionAllowedOf } from "@/lib/nox/kiosk/person-session"; // ★便 E（0196 用）★M-119: 帯＝上に固定・残り・ロック
import { endKioskPersonSession } from "@/lib/nox/kiosk/person-session-client"; // ★便 E
import { mig0200On } from "@/lib/nox/rules-0175/flag"; // ★0200: 本人セッションの heartbeat
import { browserDeviceFp } from "@/lib/nox/kiosk/device-fp"; // ★0200: heartbeat は端末の束縛（fp）を添える
/** ★0200: heartbeat を送るか＝PIN の本人セッション ∧ 直近 1 分に操作がある（無操作の間は送らない＝idle を過ぎれば DB 側でも本人セッション中でなくなる） */
export const kioskPersonTouchDueOf = (lastActiveMs: number, nowMs: number): boolean => nowMs - lastActiveMs < 60_000;
export const KIOSK_PERSON_TOUCH_MS = 60_000;

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
    // ★0200（相談役 11/10）: heartbeat＝操作がある間だけ 1 分ごとに /api/kiosk/person-touch（本人の auth・cookie の session・端末の fp）。無操作・端末へ戻る・ロックで止まる（leave は person-end が ended_at を立てる）
    const beat = isPin && mig0200On() ? window.setInterval(() => {
      if (leaving.current || !kioskPersonTouchDueOf(last.current, Date.now())) return;
      void fetch("/api/kiosk/person-touch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_fp: browserDeviceFp() }) }).catch(() => undefined);
    }, KIOSK_PERSON_TOUCH_MS) : null;
    return () => { for (const e of evs) window.removeEventListener(e, touch); window.clearInterval(timer); if (beat !== null) window.clearInterval(beat); };
  }, [idleMinutes, role]);
  // ★M-119（2026-11-06・裁定460）: 帯は本店のレイアウトの上に固定＝名前・無操作の残り（15 秒ごと）・「ロック（端末へ戻る）」＝kiosk_person_end（lock）・「キオスクへ戻る」（manual）
  const [remainMin, setRemainMin] = useState<number>(idleMinutes);
  useEffect(() => {
    if (!active) return;
    document.documentElement.setAttribute("data-kiosk-person-bar", "1");
    const tick = () => setRemainMin(Math.max(0, Math.ceil((idleMinutes * 60_000 - (Date.now() - last.current)) / 60_000)));
    tick(); const tm = window.setInterval(tick, 15_000);
    // ★M-119 追い（375 では帯が 2〜3 行＝高さ 38px を超える）: 帯の実高さを CSS 変数 --nox-kpbar に写し、本体の余白を帯に合わせる
    const measure = () => { const el = document.querySelector<HTMLElement>("[data-kiosk-person-bar='1']:not(html)"); if (el) document.documentElement.style.setProperty("--nox-kpbar", `${Math.ceil(el.getBoundingClientRect().height)}px`); };
    measure(); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null; const barEl = document.querySelector<HTMLElement>("[data-kiosk-person-bar='1']:not(html)"); if (ro && barEl) ro.observe(barEl); window.addEventListener("resize", measure);
    return () => { window.clearInterval(tm); ro?.disconnect(); window.removeEventListener("resize", measure); document.documentElement.removeAttribute("data-kiosk-person-bar"); document.documentElement.style.removeProperty("--nox-kpbar"); };
  }, [active, idleMinutes]);
  if (!active) return null;
  return (
    <div data-kiosk-person-bar="1" data-kiosk-person-remain={remainMin} style={{ position: "fixed", left: 0, right: 0, top: 0, zIndex: 60, display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", minHeight: 38, padding: "6px 12px", background: "var(--goldface2, #1b1710)", borderBottom: "1px solid var(--gold-bd, #6b5a2a)", fontSize: 12.5, color: "var(--ink, #eee)" }}>
      {pin && <span data-kiosk-person-remain-text="1" style={{ fontSize: 11.5, color: "var(--sub)" }}>{kioskPersonRemainTextOf(remainMin)}</span>}
      {pin && <button type="button" data-kiosk-person-lock="1" onClick={() => { leaving.current = true; void endKioskPersonSession(createClient(), "lock"); }}
        style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "4px 12px", borderRadius: 8, border: "1px solid var(--line2, #555)", background: "transparent", color: "inherit", cursor: "pointer" }}>{KIOSK_PERSON_LOCK}</button>}
      <span style={{ fontWeight: 700, color: "var(--champ, #e9d8a6)" }}>{pin ? kioskPersonBandTextOf(name, idleMinutes) : kioskPersonNoteOf(idleMinutes)}</span>{/* ★便 E: PIN の印＝「端末で ◯◯ さんとして操作中」 */}
      <button type="button" data-kiosk-person-leave="1" onClick={() => { leaving.current = true; void (pin ? endKioskPersonSession(createClient(), "manual") : leaveKioskPersonLogin(createClient())); }}
        style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "4px 12px", borderRadius: 8, border: "1px solid var(--gold, #c9a24a)", background: "transparent", color: "inherit", cursor: "pointer" }}>{pin ? KIOSK_PERSON_LEAVE : "今すぐキオスクへ戻る"}</button>
    </div>
  );
}
