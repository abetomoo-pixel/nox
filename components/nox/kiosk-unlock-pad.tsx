"use client";

// ★追補 2 同乗 R-7（裁定423 候補・0175 v2 ★27）: レジ端末の解除＝誰かを選ばず PIN だけ（kiosk_unlock）／「QR で解除」タブ（kiosk_unlock_qr＝端末カメラ・BarcodeDetector→jsQR のフォールバック・カメラが無い端末はタブを出さない）。
//   同じ PIN が 2 人いたら名前を選ぶ（ambiguous）。RULES_0175_APPLIED=false の間は mount されない（kiosk-register が rules0175On() で出し分け＝従来の操作担当選択）。
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { parseQrToken, qrTabAvailableOf } from "@/lib/nox/rules-0175/kiosk-qr";
import { unlockNextOf, type UnlockResult } from "@/lib/nox/rules-0175/kiosk";

type Cand = { membership_id: string; name: string; role: string };
type BarcodeDetectorLike = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type JsQrFn = (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;

export default function KioskUnlockPad({ onUnlocked }: { onUnlocked: (r: { membership_id?: string; operator_name?: string; role?: string; idle_sec?: number; unlock_method?: string }) => void | Promise<void> }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"pin" | "qr">("pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [qrOk, setQrOk] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => { setQrOk(qrTabAvailableOf({ hasBarcodeDetector: typeof window !== "undefined" && "BarcodeDetector" in window, hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia })); }, []);

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
  async function unlockQr(token: string) {
    if (busy) return;
    const parsed = parseQrToken(token); if (!parsed) { setMsg("この QR はキオスク用ではありません"); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("kiosk_unlock_qr", { p_token: token.trim() });
    setBusy(false);
    if (error) { setMsg("この端末は現在使用できません（0175 適用前か店に確認）"); return; }
    const r = data as UnlockResult & { reason?: string };
    if (!r.ok && r.reason === "replay") { setMsg("この QR は使用済みです（新しい QR を出してください）"); return; }
    await handle(r);
  }

  // カメラ＝BarcodeDetector があればそれ・無ければ jsQR（cdnjs）で canvas を読む。タブを離れたら止める
  useEffect(() => {
    if (tab !== "qr" || !qrOk) { stopRef.current?.(); stopRef.current = null; return; }
    let alive = true; let stream: MediaStream | null = null; let timer: number | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!alive || !videoRef.current) return;
        videoRef.current.srcObject = stream; await videoRef.current.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        let detector: BarcodeDetectorLike | null = BD ? new BD({ formats: ["qr_code"] }) : null;
        let jsqr: JsQrFn | null = null;
        if (!detector) {
          await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("jsqr")); document.head.appendChild(s); });
          jsqr = (window as unknown as { jsQR?: JsQrFn }).jsQR ?? null;
        }
        const canvas = document.createElement("canvas");
        timer = window.setInterval(async () => {
          const v = videoRef.current; if (!v || v.readyState < 2 || busy) return;
          try {
            let text: string | null = null;
            if (detector) { const codes = await detector.detect(v); text = codes[0]?.rawValue ?? null; }
            else if (jsqr) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.drawImage(v, 0, 0); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); text = jsqr(img.data, img.width, img.height)?.data ?? null; }
            if (text && parseQrToken(text)) { if (timer) { clearInterval(timer); timer = null; } await unlockQr(text); if (alive && tab === "qr") timer = window.setInterval(() => undefined, 1e9); }
          } catch { /* 読めない瞬間は無視 */ }
        }, 400);
        stopRef.current = () => { if (timer) clearInterval(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
      } catch { if (alive) setMsg("カメラを使えませんでした（許可を確認してください）"); }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, qrOk]);

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
      {tab === "qr" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>スマホの「キオスク用 QR」をかざしてください</p>
          <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: 360, borderRadius: 12, background: "#000" }} />
        </div>
      )}
      {msg && <Toast msg={msg} style={{ margin: "12px 0 0", textAlign: "center" }} />}
    </div>
  );
}
