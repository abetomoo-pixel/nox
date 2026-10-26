"use client";

// ★便 ON-3（2026-10-26・0176 ★4＝400 の残り）: /mine「連絡先」＝本人の連絡用メール・電話（users.contact_email／phone）を set_my_contact で変える。
//   変更は contact_changes に 1 行（店が確認済みにする）。ログインのメールは変えない。デモ org は RPC が 'forbidden'＝案内（isDemo のときはボタンを出さない）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { useIsDemo } from "@/lib/nox/demo/context"; // デモ org＝RPC が 'forbidden'（案内だけ）
import { CONTACT_DEMO_NOTE, CONTACT_FIELD_LABEL, CONTACT_MINE_NOTE, contactErrJa, contactErrorOf, contactPatchOf, type ContactForm as Form } from "@/lib/nox/people/contact";

export default function ContactForm({ contactEmail, phone }: { contactEmail: string | null; phone: string | null }) {
  const supabase = createClient();
  const isDemo = useIsDemo();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Form>({ contact_email: contactEmail ?? "", phone: phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", borderRadius: 9 };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = contactErrorOf(form); if (v) { setMsg(v); return; }
    const patch = contactPatchOf(form, { contact_email: contactEmail, phone });
    if (!patch) { setMsg("変更がありません"); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("set_my_contact", { p_patch: patch });
    setBusy(false);
    if (error) { setMsg(contactErrJa(error.message)); return; }
    setMsg("連絡先を保存しました（店に通知されます）"); setEdit(false);
    router.refresh();
  }

  return (
    <div data-mine-contact={edit ? "edit" : "view"} style={{ display: "grid", gap: 6 }}>
      {!edit ? (
        <>
          <p style={{ margin: 0, fontSize: 13 }}><span style={{ color: "var(--sub)" }}>{CONTACT_FIELD_LABEL.contact_email}</span> {contactEmail || "未設定"}</p>
          <p style={{ margin: 0, fontSize: 13 }}><span style={{ color: "var(--sub)" }}>{CONTACT_FIELD_LABEL.phone}</span> {phone || "未設定"}</p>
          {isDemo ? <p className="sub" style={{ margin: 0, fontSize: 12 }}>{CONTACT_DEMO_NOTE}</p>
            : <button type="button" style={{ ...t.btnGhost, ...t.btnSm, justifySelf: "start" }} onClick={() => setEdit(true)} data-mine-contact-edit="1">変更する</button>}
        </>
      ) : (
        <form onSubmit={save} style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>{CONTACT_FIELD_LABEL.contact_email}
            <input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} style={input} placeholder="example@example.com" data-mine-contact-email="1" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>{CONTACT_FIELD_LABEL.phone}
            <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={input} placeholder="090-0000-0000" maxLength={20} data-mine-contact-phone="1" />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={busy} style={{ ...t.btnGold, padding: "8px 20px", minHeight: 40 }} data-mine-contact-save="1">{busy ? "保存中…" : "保存"}</button>
            <button type="button" disabled={busy} style={{ ...t.btnGhost, padding: "8px 16px", minHeight: 40 }} onClick={() => { setEdit(false); setForm({ contact_email: contactEmail ?? "", phone: phone ?? "" }); setMsg(null); }}>やめる</button>
          </div>
        </form>
      )}
      <p className="sub" style={{ margin: 0, fontSize: 11.5 }}>{CONTACT_MINE_NOTE}</p>
      {msg && <Toast msg={msg} />}
    </div>
  );
}
