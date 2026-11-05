"use client";
// ★便 E（2026-11-05・0196 用＝裁定448 B 方式）: キオスクのタイル画面の入口「スタッフでログイン（PIN）」＝操作担当の解除（KioskUnlockPad＝kiosk_unlock・PIN だけ）→ 本人の auth セッション（startKioskPersonSession）→ /register。
//   M-49 の「本人でログイン（店長以上・パスワード）」を置き換える（mig0196On() が true のときだけこの部品＝false の間は従来の入口）。管理者（owner）の PIN は route が 403＝案内を 1 行。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import KioskUnlockPad from "@/components/nox/kiosk-unlock-pad";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { KIOSK_PERSON_PIN_LINK, KIOSK_PERSON_PIN_NOTE } from "@/lib/nox/kiosk/person-session";
import { startKioskPersonSession } from "@/lib/nox/kiosk/person-session-client";
import * as t from "@/lib/nox/ui/theme";

export default function KioskPersonEntry() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <p style={{ textAlign: "center", margin: "0 0 14px" }}>
        <button type="button" data-kiosk-person-pin="1" onClick={() => { setErr(null); setOpen(true); }}
          style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 12.5, color: "var(--sub)", textDecoration: "underline", cursor: "pointer" }}>{KIOSK_PERSON_PIN_LINK}</button>
      </p>
      {open && (
        <Modal onClose={() => { if (!busy) setOpen(false); }} maxWidth={460}>
          <div data-kiosk-person-entry="1" style={{ padding: "4px 2px" }}>
            <h3 style={{ ...t.cardTitle, margin: "0 0 4px" }}>{KIOSK_PERSON_PIN_LINK}</h3>
            <p style={{ ...t.sub, margin: "0 0 10px", lineHeight: 1.7 }}>{KIOSK_PERSON_PIN_NOTE}</p>
            {busy ? <p style={{ textAlign: "center", color: "var(--sub)" }}>本人の画面を開いています…</p> : (
              <KioskUnlockPad onUnlocked={async () => {
                setBusy(true); setErr(null);
                const r = await startKioskPersonSession(createClient());
                if (!r.ok) { setBusy(false); setErr(r.error); return; }
                window.location.assign(r.dest);
              }} />
            )}
            {err && <Message kind="error">{err}</Message>}
          </div>
        </Modal>
      )}
    </>
  );
}
