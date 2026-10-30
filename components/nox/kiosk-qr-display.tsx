"use client";

// ★QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫・0185 起草）: キオスクに QR を出す（30 秒で回る・1 回限り）。
//   秘密鍵＝kiosk_qr_secret（端末自身）・中身＝URL（origin/kq#noxq:<device>.<6 桁>）・本人がログイン済みのスマホで読む（標準カメラでも NOX の「キオスクを開く」でも）。
//   読まれたら kiosk_qr_poll（2 秒ごと・この画面を出している間だけ）が本人の解除を返す→onUnlocked（そのキオスクが本人の権限で開く・無操作 3 分で戻る）。
//   MIG_0185_APPLIED=false の間は mount されない（kiosk-unlock-pad が mig0185On() で出し分け）。
import { useEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージ表示の共通部品
import { kioskQrDisplayCounterOf, kioskQrTokenOf, kioskQrUrlOf, totpCodeOf, totpCounterOf, totpRemainSecOf, TOTP_STEP_SEC } from "@/lib/nox/rules-0175/kiosk-qr";
import { mig0190On } from "@/lib/nox/rules-0175/flag"; // ★0190（裁定436 ①b）: 端末の印を kiosk_qr_secret／kiosk_qr_poll に添える
import { browserDeviceFp } from "@/lib/nox/kiosk/device-fp";
/** ★0190: 端末の印（フラグ false のときは引数ごと送らない＝旧署名のまま） */
const fpArg = (): { p_device_fp: string | null } | Record<string, never> => (mig0190On() ? { p_device_fp: browserDeviceFp() } : {});

export type KioskQrUnlocked = { membership_id?: string; operator_name?: string; role?: string; idle_sec?: number; unlock_method?: string };

export default function KioskQrDisplay({ onUnlocked }: { onUnlocked: (r: KioskQrUnlocked) => void | Promise<void> }) {
  const [secret, setSecret] = useState<{ device_id: string; secret_hex: string } | null>(null);
  const [svg, setSvg] = useState("");
  const [remain, setRemain] = useState(TOTP_STEP_SEC);
  const [err, setErr] = useState<string | null>(null);
  const usedRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const cbRef = useRef(onUnlocked); cbRef.current = onUnlocked;

  useEffect(() => {
    let alive = true;
    void createClient().rpc("kiosk_qr_secret", { p_rotate: false, ...fpArg() }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setErr("QR を用意できませんでした（この端末はレジ端末として登録されていません）"); return; }
      setSecret(data as { device_id: string; secret_hex: string });
    });
    return () => { alive = false; };
  }, []);

  // QR＝1 秒ごとに残り秒・counter が変わったら描き直す（使用済みの counter の次から）
  useEffect(() => {
    if (!secret) return;
    let alive = true; let last = -1;
    const tick = async () => {
      const now = Date.now();
      const c = kioskQrDisplayCounterOf(totpCounterOf(now), usedRef.current);
      setRemain(c > totpCounterOf(now) ? totpRemainSecOf(now) + TOTP_STEP_SEC : totpRemainSecOf(now));
      if (c !== last) {
        last = c;
        const code = await totpCodeOf(secret.secret_hex, c);
        if (alive) setSvg(renderSVG(kioskQrUrlOf(window.location.origin, kioskQrTokenOf(secret.device_id, code)), { border: 1 }));
      }
    };
    void tick(); const id = setInterval(() => void tick(), 1000);
    return () => { alive = false; clearInterval(id); };
  }, [secret]);

  // 読まれたかの確認＝2 秒ごと（この画面を出している間だけ・レジの読取の自動ポーリングとは別＝解除前）
  useEffect(() => {
    if (!secret) return;
    let alive = true; let busy = false;
    const supabase = createClient();
    const id = setInterval(async () => {
      if (busy || doneRef.current) return;
      busy = true;
      const { data, error } = await supabase.rpc("kiosk_qr_poll", { ...fpArg() });
      busy = false;
      if (!alive || error || !data) return;
      const r = data as { ok: boolean; name?: string; role?: string; membership_id?: string; idle_sec?: number; unlock_method?: string; counter?: number };
      if (!r.ok) return;
      usedRef.current = typeof r.counter === "number" ? r.counter : usedRef.current;
      doneRef.current = true;
      await cbRef.current({ membership_id: r.membership_id, operator_name: r.name, role: r.role, idle_sec: r.idle_sec, unlock_method: "qr" });
    }, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [secret]);

  return (
    <div data-kiosk-qr-display="1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, textAlign: "center" }}>スマホの NOX で読み取ってください</p>
      <p style={{ margin: 0, fontSize: 12, color: "var(--sub)", textAlign: "center" }}>ログイン済みのスマホのカメラで読むと、このキオスクがあなたの権限で開きます</p>
      {err && <Message kind="error">{err}</Message>}
      {svg && <div style={{ width: "min(70vw, 300px)", background: "#fff", padding: 10, borderRadius: 12 }} dangerouslySetInnerHTML={{ __html: svg }} />}
      {svg && (
        <div style={{ position: "relative", width: 52, height: 52 }} aria-label={`残り ${remain} 秒`}>
          <svg viewBox="0 0 56 56" width="52" height="52">
            <circle cx="28" cy="28" r="24" fill="none" stroke="var(--line2)" strokeWidth="6" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="var(--gold)" strokeWidth="6" strokeDasharray={`${(Math.min(remain, TOTP_STEP_SEC) / TOTP_STEP_SEC) * 150.8} 150.8`} transform="rotate(-90 28 28)" />
          </svg>
          <span className="num" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>{Math.min(remain, TOTP_STEP_SEC)}</span>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 11, color: "var(--sub)", textAlign: "center" }}>30 秒ごとに変わります・同じ QR は 1 回だけ・3 分操作がないとこの画面に戻ります</p>
    </div>
  );
}
