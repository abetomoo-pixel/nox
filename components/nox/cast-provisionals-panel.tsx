"use client";
// ★導入の代行 版 2（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ）: キャストの画面の「仮の登録 n 人」（オーナー・自店の店長）。
//   運営が源氏名だけを入れた人＝打刻・レジ・給与に出ない。生年月日（必須）・本名（任意）→「本登録する」（cast_provisional_promote＝中で cast_create＝18 歳の判定はそのまま）／「登録しない」（cast_provisional_discard）。
//   待遇プランは自動で割り当てない（今のまま＝本登録の後にキャストの画面で）。日付は共通のピッカー（裁定452）。ボタンは中央。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import DatePicker from "@/components/ui/date-picker";
import { fmtJst } from "@/lib/nox/ops/labels";
import { assistErrJa, promoteErrOf } from "@/lib/nox/ops/assist";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";

export type ProvisionalRow = { id: string; name: string; created_who: string; created_at: string };

export default function CastProvisionalsPanel({ initial, initialOpen = false }: { initial?: ProvisionalRow[]; initialOpen?: boolean }) {
  const [rows, setRows] = useState<ProvisionalRow[]>(initial ?? []);
  const [open, setOpen] = useState(initialOpen);
  const [form, setForm] = useState<Record<string, { birthday: string; realName: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  async function load() {
    const { data } = await createClient().from("cast_provisionals").select("id, name, created_who, created_at").is("promoted_at", null).is("discarded_at", null).order("created_at", { ascending: true });
    setRows((data ?? []) as ProvisionalRow[]);
  }
  useEffect(() => { if (!initial) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows.length === 0) return null;
  const f = (id: string) => form[id] ?? { birthday: "", realName: "" };
  async function promote(r: ProvisionalRow) {
    const e = promoteErrOf(f(r.id).birthday); if (e) { setMsg({ id: r.id, ok: false, text: e }); return; }
    setBusy(r.id); setMsg(null);
    const { error } = await createClient().rpc("cast_provisional_promote", { p_id: r.id, p_birthday: f(r.id).birthday, p_real_name: f(r.id).realName.trim() || null });
    setBusy(null);
    if (error) { setMsg({ id: r.id, ok: false, text: /forbidden|promoted|discarded/.test(error.message) ? assistErrJa(error.message) : rpcErrJa(error.message) }); return; }
    setMsg({ id: r.id, ok: true, text: `${r.name} を本登録しました（待遇プランはキャストの一覧で選んでください）` }); void load();
  }
  async function discard(r: ProvisionalRow) {
    if (!window.confirm(`${r.name} を登録しません。よろしいですか`)) return;
    setBusy(r.id); setMsg(null);
    const { error } = await createClient().rpc("cast_provisional_discard", { p_id: r.id });
    setBusy(null);
    if (error) { setMsg({ id: r.id, ok: false, text: assistErrJa(error.message) }); return; }
    void load();
  }
  return (
    <section style={{ ...t.card, marginBottom: 12 }} data-cast-provisionals={String(rows.length)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15, color: "var(--ink)" }}>仮の登録 {rows.length} 人</b>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "閉じる" : "見る"}</button>
      </div>
      <p style={{ ...t.sub, fontSize: 12.5, margin: "6px 0 0", lineHeight: 1.7 }}>運営が源氏名だけを入れた人です。打刻・レジ・給与には出ません。生年月日を入れて本登録すると、キャストになります。</p>
      {open && (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {rows.map((r) => (
            <li key={r.id} data-cast-provisional={r.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 8 }}>
              <div><b style={{ fontSize: 15, color: "var(--ink)" }}>{r.name}</b><span style={{ ...t.sub, fontSize: 12, marginLeft: 8 }}>{r.created_who}・{fmtJst(r.created_at)}</span></div>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>生年月日（必須）</span><DatePicker value={f(r.id).birthday} onChange={(v) => setForm({ ...form, [r.id]: { ...f(r.id), birthday: v } })} ariaLabel={`${r.name} の生年月日`} disabled={busy === r.id} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>本名（任意）</span><input value={f(r.id).realName} maxLength={60} onChange={(e) => setForm({ ...form, [r.id]: { ...f(r.id), realName: e.target.value } })} style={t.input} disabled={busy === r.id} /></label>
              <div className="nox-actions">
                <button type="button" style={t.btnGold} disabled={busy === r.id} onClick={() => void promote(r)}>{busy === r.id ? "登録中…" : "本登録する"}</button>
                <button type="button" style={t.btnGhost} disabled={busy === r.id} onClick={() => void discard(r)}>登録しない</button>
              </div>
              {msg && msg.id === r.id && <Message kind={msg.ok ? "success" : "error"}>{msg.text}</Message>}
            </li>))}
        </ul>)}
    </section>
  );
}
