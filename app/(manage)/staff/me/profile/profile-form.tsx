"use client";

// ★M-177（2026-11-11 Agoora 確定・夜便レーン 1）: スタッフ（と店長）本人の「自分の情報を編集」の client 部品。
//   住所・緊急連絡先＝member_profile_self_save（本人の行・許した項目だけ）。パスワードはこの画面で変えない（demo-guard dg(6-1)＝client で auth.updateUser を呼ばない・password の route を足さない＝ログイン画面の「パスワードを忘れた」から）。
//   連絡先（電話・連絡用メール）は /mine と同じ部品（ContactForm）・PIN は PinSelfCard（page.tsx が並べる）。デモ org は RPC が 'forbidden'＝ボタンを出さない。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { useIsDemo } from "@/lib/nox/demo/context";
import { SELF_PROFILE_DEMO_NOTE, SELF_PROFILE_LABEL, selfProfileErrJa, selfProfileErrorOf, selfProfileFormOf, selfProfilePatchOf, type SelfProfileForm, type SelfProfileRow } from "@/lib/nox/people/self-profile";

const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", borderRadius: 9 };

export function SelfProfileFields({ row }: { row: SelfProfileRow }) {
  const supabase = createClient();
  const isDemo = useIsDemo();
  const router = useRouter();
  const [form, setForm] = useState<SelfProfileForm>(selfProfileFormOf(row));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = selfProfileErrorOf(form); if (v) { setMsg(v); return; }
    const patch = selfProfilePatchOf(form, row);
    if (!patch) { setMsg("変更がありません"); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("member_profile_self_save", { p: patch });
    setBusy(false);
    if (error) { setMsg(selfProfileErrJa(error.message)); return; }
    setMsg("住所・緊急連絡先を保存しました");
    router.refresh();
  }
  return (
    <form onSubmit={save} style={{ display: "grid", gap: 8 }} data-self-profile="1">
      {(Object.keys(SELF_PROFILE_LABEL) as (keyof SelfProfileForm)[]).map((k) => (
        <label key={k} style={{ display: "grid", gap: 3, fontSize: 12.5 }}>
          <span style={{ color: "var(--sub)" }}>{SELF_PROFILE_LABEL[k]}</span>
          <input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} disabled={isDemo || busy} style={input} inputMode={k === "emergency_phone" ? "tel" : undefined} aria-label={SELF_PROFILE_LABEL[k]} />
        </label>
      ))}
      {isDemo ? <p style={{ fontSize: 11.5, color: "var(--sub)", margin: 0 }} data-self-demo="1">{SELF_PROFILE_DEMO_NOTE}</p> : (
        <div className="nox-actions"><button type="submit" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy}>住所・緊急連絡先を保存</button></div>
      )}
      {msg && <Toast msg={msg} />}
    </form>
  );
}
