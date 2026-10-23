"use client";

// ★追補 2 同乗 R-7 の QR 解除（裁定423 候補・0175 v2 ★27）: 「キオスク用 QR」＝押すと全画面で QR（30 秒ごとに更新・残り秒のリング・閉じると消える）。
//   秘密鍵＝my_qr_secret（本人のセッションだけ）・トークン＝'noxk:' + membership_id + '.' + TOTP 6 桁（lib/nox/rules-0175/kiosk-qr.ts＝RPC kiosk_unlock_qr と同じ式）。
//   画面の明るさ＝ブラウザからは変えられない（Screen Brightness API 非対応）＝背景を白・QR を大きく。RULES_0175_APPLIED=false の間は mount されない。
import { useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージ表示の共通部品
import { qrTokenOf, totpCodeOf, totpCounterOf, totpRemainSecOf, TOTP_STEP_SEC } from "@/lib/nox/rules-0175/kiosk-qr";

export default function KioskQrButton({ label = "キオスク用 QR" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ membership_id: string; secret_hex: string } | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [remain, setRemain] = useState(TOTP_STEP_SEC);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const supabase = createClient();
    void supabase.rpc("my_qr_secret", { p_rotate: false }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setErr("QR を用意できませんでした（0175 適用前か権限なし）"); return; }
      setSecret(data as { membership_id: string; secret_hex: string });
    });
    return () => { alive = false; setSecret(null); setSvg(""); };
  }, [open]);

  useEffect(() => {
    if (!open || !secret) return;
    let alive = true; let lastCounter = -1;
    const tick = async () => {
      const now = Date.now(); const c = totpCounterOf(now);
      setRemain(totpRemainSecOf(now));
      if (c !== lastCounter) { lastCounter = c; const code = await totpCodeOf(secret.secret_hex, c); if (alive) setSvg(renderSVG(qrTokenOf(secret.membership_id, code), { border: 1 })); }
    };
    void tick(); const id = setInterval(() => void tick(), 1000);
    return () => { alive = false; clearInterval(id); };
  }, [open, secret]);

  return (
    <>
      <button type="button" data-kiosk-qr-btn="1" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div role="dialog" aria-label="キオスク用 QR" data-kiosk-qr="1" onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#fff", color: "#111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>キオスクのカメラにかざしてください</p>
          {err && <Message kind="error">{err}</Message>}
          {svg && <div style={{ width: "min(78vw, 360px)" }} dangerouslySetInnerHTML={{ __html: svg }} />}
          <div style={{ position: "relative", width: 56, height: 56 }} aria-label={`残り ${remain} 秒`}>
            <svg viewBox="0 0 56 56" width="56" height="56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="#ddd" strokeWidth="6" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="#2f7fe7" strokeWidth="6" strokeDasharray={`${(remain / TOTP_STEP_SEC) * 150.8} 150.8`} transform="rotate(-90 28 28)" />
            </svg>
            <span className="num" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>{remain}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>30 秒ごとに更新・同じ QR は 1 回だけ有効・画面を押すと閉じます</p>
        </div>
      )}
    </>
  );
}
