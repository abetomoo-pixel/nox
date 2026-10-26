"use client";

// ★QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫・0185 起草）: スマホでキオスクの QR を読む画面。
//   入口 2 つ＝①スマホの標準カメラで QR（URL）を読む→この画面が # の後のトークンを受け取る ②NOX の「キオスクを開く」→この画面のカメラで読む（BarcodeDetector→jsQR のフォールバック）。
//   本人のログインのまま kiosk_qr_claim＝そのキオスクが本人の権限で開く（スタッフは権限のある機能・キャストはレジのみ＝店のキャストのレジ操作 OFF なら打刻だけ）。
//   トークンは読んだら URL から消す（履歴に残さない）。未ログインはログインへの案内だけ（# は引き継がない＝ログイン後にもう一度読む）。
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージ表示の共通部品
import { kioskQrClaimMessageOf, kioskQrTokenFromScanOf } from "@/lib/nox/rules-0175/kiosk-qr";

type BarcodeDetectorLike = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type JsQrFn = (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;

export default function KqClient() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "scan" | "done">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "warn"; text: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const fromHash = typeof window !== "undefined" ? kioskQrTokenFromScanOf(window.location.hash.replace(/^#/, "")) : null;
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname);   // トークンを履歴に残さない
    void createClient().auth.getUser().then(({ data }) => {
      if (!data.user) { setPhase("login"); return; }
      setToken(fromHash); setPhase(fromHash ? "ready" : "scan");
    });
  }, []);

  const claim = useCallback(async (tok: string) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc("kiosk_qr_claim", { p_token: tok });
    setBusy(false);
    if (error || !data) { setMsg({ kind: "error", text: "キオスクを開けませんでした（ログインし直すか店に確認してください）" }); return; }
    const r = data as { ok: boolean; reason?: string; store_name?: string; name?: string };
    setMsg(kioskQrClaimMessageOf(r));
    if (r.ok) setPhase("done");
  }, [busy]);

  // カメラ＝この画面で読む（BarcodeDetector があればそれ・無ければ jsQR）。読めたら止めて確認へ
  useEffect(() => {
    if (phase !== "scan") return;
    let alive = true; let stream: MediaStream | null = null; let timer: number | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setMsg({ kind: "warn", text: "この端末ではカメラを使えません。スマホの標準カメラで QR を読んでください" }); return; }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!alive || !videoRef.current) return;
        videoRef.current.srcObject = stream; await videoRef.current.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector: BarcodeDetectorLike | null = BD ? new BD({ formats: ["qr_code"] }) : null;
        let jsqr: JsQrFn | null = null;
        if (!detector) {
          await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("jsqr")); document.head.appendChild(s); });
          jsqr = (window as unknown as { jsQR?: JsQrFn }).jsQR ?? null;
        }
        const canvas = document.createElement("canvas");
        timer = window.setInterval(async () => {
          const v = videoRef.current; if (!v || v.readyState < 2) return;
          try {
            let text: string | null = null;
            if (detector) { const codes = await detector.detect(v); text = codes[0]?.rawValue ?? null; }
            else if (jsqr) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.drawImage(v, 0, 0); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); text = jsqr(img.data, img.width, img.height)?.data ?? null; }
            const tok = text ? kioskQrTokenFromScanOf(text) : null;
            if (tok && alive) { if (timer) { clearInterval(timer); timer = null; } stream?.getTracks().forEach((tr) => tr.stop()); setToken(tok); setPhase("ready"); }
          } catch { /* 読めない瞬間は無視 */ }
        }, 400);
      } catch { if (alive) setMsg({ kind: "warn", text: "カメラを使えませんでした（許可を確認するか、スマホの標準カメラで読んでください）" }); }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [phase]);

  return (
    <div style={{ ...t.wrap, padding: "24px 16px" }} data-kq="1" data-kq-phase={phase}>
      <h1 style={t.pheadH1}>キオスクを開く</h1>
      <p style={t.pheadP}>キオスクに出ている QR を読むと、そのキオスクがあなたの権限で開きます</p>
      <div style={{ ...t.card, marginTop: 14 }}>
        {phase === "loading" && <p style={t.sub}>確認しています…</p>}
        {phase === "login" && (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 13 }}>ログインしてから、もう一度キオスクの QR を読んでください。</p>
            <Link href="/login" style={{ ...t.btnPrimaryLg, display: "block", textAlign: "center", textDecoration: "none" }}>ログインへ</Link>
          </>
        )}
        {phase === "scan" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800 }}>キオスクの QR にカメラを向けてください</p>
            <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: 360, borderRadius: 12, background: "#000" }} />
          </div>
        )}
        {phase === "ready" && token && (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800 }}>このキオスクを開きますか？</p>
            <button type="button" data-kq-go="1" disabled={busy} onClick={() => void claim(token)} style={{ ...t.btnPrimary56, opacity: busy ? 0.7 : 1 }}>開く</button>
            <button type="button" onClick={() => { setToken(null); setMsg(null); setPhase("scan"); }} style={{ ...t.btnGhostLg, marginTop: 10 }}>読み直す</button>
          </>
        )}
        {phase === "done" && <p style={{ margin: 0, fontSize: 13 }}>この画面は閉じて大丈夫です。</p>}
        {msg && <Message kind={msg.kind} style={{ marginTop: 12 }}>{msg.text}</Message>}
      </div>
    </div>
  );
}
