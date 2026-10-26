"use client";

// ★便 ON-3（2026-10-26・0176 ★4＝400 の残り）: 店側「連絡先の変更（未確認 N）」＝本人が set_my_contact で変えた contact_changes（RLS＝owner 全店／manager 自店）を一覧し「確認済み」にする（contact_change_confirm）。
//   /casts と /staff の両方に置く（同じ行が出る＝どちらで確認してもよい）。0 件なら見出しだけ畳む。名前は users（RLS）から。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { contactChangeLineOf, contactPanelTitleOf, unconfirmedContactCountOf, type ContactChangeRow } from "@/lib/nox/people/contact";

export default function ContactChangesPanel({ canConfirm }: { canConfirm: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<ContactChangeRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("contact_changes").select("id, user_id, field, old_value, new_value, changed_at, confirmed_at").is("confirmed_at", null).order("changed_at", { ascending: false }).limit(200);
    const list = (data ?? []) as ContactChangeRow[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", ids);
      setNames(Object.fromEntries(((us ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name ?? "—"])));
    }
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  async function confirm(id: string) {
    setBusy(id); setErr(null);
    const { error } = await supabase.rpc("contact_change_confirm", { p_id: id });
    setBusy(null);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    await load();
  }
  const n = unconfirmedContactCountOf(rows);
  if (n === 0) return null;
  return (
    <section className="nox-panel" data-contact-changes={n} style={{ marginBottom: 12 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" style={{ all: "unset", cursor: "pointer", fontWeight: 800, color: "var(--bad)" }} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "▾ " : "▸ "}{contactPanelTitleOf(n)}</button>
      </h3>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id} data-contact-change={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
              <b>{names[r.user_id] ?? "—"}</b>
              <span className="num" style={{ color: "var(--sub)" }}>{contactChangeLineOf(r)}</span>
              {canConfirm && <button type="button" className="nox-rowbtn" disabled={busy === r.id} data-contact-confirm={r.id} onClick={() => void confirm(r.id)}>確認済みにする</button>}
            </li>
          ))}
        </ul>
      )}
      {err && <Message kind="error">{err}</Message>}
      <p style={{ ...t.sub, margin: "6px 0 0" }}>本人がマイページで変えた連絡先です。確認済みにすると一覧から消えます（履歴は残ります）。</p>
    </section>
  );
}
