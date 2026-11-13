"use client";

// ★0201（M-133・2026-11-11 フラグ便）: 本人の PIN 変更＝店長・スタッフは staff_pin_self_set（店の端末で使う操作の PIN）・キャストは cast_pin_self_set（店の端末の打刻の PIN）。
//   今の PIN が要る（未設定なら空欄で可）・新しい PIN は 4〜6 桁・誤りは失敗回数に数え、上限で一定時間ロック（店設定 pin_lock_max_fail／pin_lock_minutes）。
//   RPC は誤りを例外にせず jsonb の reason で返す（作り直し①）＝ここで和文にする。値は画面に残さない（成功で欄を空に）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Fold from "@/components/ui/fold";

export const PIN_SELF_ERR_JA: Record<string, string> = {
  "bad current": "今の PIN が違います",
  locked: "続けて間違えたため、しばらく変更できません。時間をおいてやり直してください",
  "bad pin": "新しい PIN は 4〜6 桁の数字にしてください",
  // ★0201g（作り直し 4・2026-11-13 相談役）: 貼る前の DB は返さない＝先に入れても出ない
  weak: "推測されやすい番号は使えません",
  taken: "この PIN は使えません。別の番号にしてください",
  too_many: "PIN の変更は 1 日 5 回までです。店長に設定を頼んでください。",
};
export const pinSelfErrJa = (reason: string): string => PIN_SELF_ERR_JA[reason] ?? `変更できませんでした（${reason}）`;

export default function PinSelfCard({ kind }: { kind: "staff" | "cast" }) {
  const [cur, setCur] = useState(""), [nw, setNw] = useState(""), [nw2, setNw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const shapeOk = /^[0-9]{4,6}$/.test(nw) && nw === nw2;
  async function save() {
    setBusy(true); setMsg(null);
    const fn = kind === "staff" ? "staff_pin_self_set" : "cast_pin_self_set";
    const { data, error } = await createClient().rpc(fn, { p_current: cur.trim() === "" ? null : cur.trim(), p_new: nw });
    setBusy(false);
    if (error) { setMsg(`変更できませんでした（${error.message}）`); return; }
    const j = (data ?? {}) as { ok?: boolean; reason?: string };
    if (j.ok) { setCur(""); setNw(""); setNw2(""); setMsg("PIN を変更しました"); return; }
    setMsg(pinSelfErrJa(j.reason ?? ""));
  }
  const inp: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 15, letterSpacing: 4, boxSizing: "border-box" };
  return (
    <Fold name="pin-self" title="PIN の変更" summary={kind === "staff" ? "店の端末で使う PIN" : "店の端末で打刻する PIN"}>
      <div style={{ display: "grid", gap: 8, maxWidth: 360 }} data-pin-self={kind}>
        <label style={{ fontSize: 12.5, color: "var(--sub)" }}>今の PIN（まだ設定していなければ空欄）
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))} style={inp} />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--sub)" }}>新しい PIN（4〜6 桁）
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={nw} onChange={(e) => setNw(e.target.value.replace(/\D/g, ""))} style={inp} />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--sub)" }}>新しい PIN（確認）
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={nw2} onChange={(e) => setNw2(e.target.value.replace(/\D/g, ""))} style={inp} />
        </label>
        {nw2 !== "" && nw !== nw2 && <p style={{ margin: 0, fontSize: 12.5, color: "var(--bad)" }}>確認の PIN が一致しません</p>}
        <button type="button" style={{ ...t.btnGold, opacity: busy || !shapeOk ? 0.55 : 1 }} disabled={busy || !shapeOk} onClick={() => void save()}>PIN を変更</button>
        {msg && <Toast msg={msg} />}
      </div>
    </Fold>
  );
}
