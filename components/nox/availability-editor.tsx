"use client";

// ★便 P175-prep P-4（裁定397＋413・0175 v2 ★9 availability／availability_terms・availability_set）: 基本の働き方の編集カード。
//   曜日ごと 可／不可／相談＋時間帯・週の出勤日数の目安・適用開始日・メモ。雇用キャストの時間帯は店のみ（本人は表示＋メモで希望）。
//   RULES_0175_APPLIED=false の間はどこにも mount されない（キャスト詳細と /mine が rules0175On() で出し分け）＝表も RPC も触らない。
//   通知は audit だけ（RPC 側）。保存＝availability_set（p_rows 7 行・p_terms）。membership は cast_id から解く（memberships の active 行）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { AVAIL_LABEL, DOW_JA, availChipsOf, availFormOf, availPatchOf, canEditTimeOf, emptyAvailForm, type Avail, type AvailForm, type AvailRow, type AvailTerms } from "@/lib/nox/rules-0175/availability";

const hm = (min: number | null): string => (min === null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
const minOf = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return Number.isFinite(v) ? v : null; };

export default function AvailabilityEditor({ castId, storeId, employment, bySelf, readOnly = false }: {
  castId: string; storeId: string; employment: string | null; bySelf: boolean; readOnly?: boolean;
}) {
  const supabase = createClient();
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [form, setForm] = useState<AvailForm>(emptyAvailForm());
  const [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const timeEditable = canEditTimeOf(employment, bySelf);

  const load = useCallback(async () => {
    const { data: m } = await supabase.from("memberships").select("id").eq("cast_id", castId).eq("is_active", true).limit(1).maybeSingle();
    const mid = (m?.id as string | undefined) ?? null;
    setMembershipId(mid);
    if (!mid) { setLoaded(true); return; }
    const [{ data: rows }, { data: terms }] = await Promise.all([
      supabase.from("availability").select("dow, avail, from_min, to_min, memo").eq("membership_id", mid).order("dow"),
      supabase.from("availability_terms").select("week_days_target, fixed_off_dows, effective_from, memo").eq("membership_id", mid).maybeSingle(),
    ]);
    setForm(availFormOf((rows ?? []) as Partial<AvailRow>[], (terms ?? null) as Partial<AvailTerms> | null));
    setLoaded(true);
  }, [supabase, castId]);
  useEffect(() => { void load(); }, [load]);

  const setRow = (dow: number, patch: Partial<AvailRow>) => setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.dow === dow ? { ...r, ...patch } : r)) }));
  async function save() {
    if (busy || !membershipId) return; setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("availability_set", { p_membership_id: membershipId, ...availPatchOf(form) });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: `保存に失敗: ${rpcErrJa(error.message)}` }); return; }
    setMsg({ kind: "success", text: "基本の働き方を保存しました" }); setEdit(false); await load();
  }

  return (
    <div data-availability-editor="1" data-store-id={storeId} style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>基本の働き方</b>
        {loaded && !edit && <span style={{ fontSize: 12, color: "var(--sub)" }}>{membershipId ? `${availChipsOf(form)}${form.terms.week_days_target !== null ? `・週 ${form.terms.week_days_target} 日目安` : ""}` : "（アカウント未発行＝基本の働き方は設定できません）"}</span>}
        {!readOnly && !edit && membershipId && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy || !loaded} onClick={() => setEdit(true)}>編集</button>}
      </div>
      {edit && (
        <div style={{ display: "grid", gap: 4 }}>
          {form.rows.map((r) => (
            <div key={r.dow} data-avail-row={r.dow} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ width: 20, fontWeight: 700 }}>{DOW_JA[r.dow]}</span>
              <span role="radiogroup" aria-label={`${DOW_JA[r.dow]}曜の可否`} style={{ display: "inline-flex", gap: 8 }}>
                {(["ok", "ask", "ng"] as Avail[]).map((a) => (
                  <label key={a} style={{ display: "inline-flex", gap: 3, alignItems: "center", minHeight: 32 }}>
                    <input type="radio" name={`avail-${r.dow}`} checked={r.avail === a} disabled={busy} onChange={() => setRow(r.dow, { avail: a })} />{AVAIL_LABEL[a]}
                  </label>
                ))}
              </span>
              {r.avail !== "ng" && (
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <input value={hm(r.from_min)} placeholder="20:00" disabled={busy || !timeEditable} aria-label={`${DOW_JA[r.dow]}曜の開始`} style={{ ...t.input, width: 64, padding: "2px 6px" }}
                    onChange={(e) => setRow(r.dow, { from_min: minOf(e.target.value) })} />
                  〜
                  <input value={hm(r.to_min)} placeholder="26:00" disabled={busy || !timeEditable} aria-label={`${DOW_JA[r.dow]}曜の終了`} style={{ ...t.input, width: 64, padding: "2px 6px" }}
                    onChange={(e) => setRow(r.dow, { to_min: minOf(e.target.value) })} />
                </span>
              )}
            </div>
          ))}
          {!timeEditable && <p style={{ fontSize: 11.5, color: "var(--champ)", margin: 0 }}>雇用のため時間帯は店が決めます（変更の希望はメモに書いてください）</p>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
            <label>週の目安 <input type="number" min={0} max={7} value={form.terms.week_days_target ?? ""} disabled={busy} aria-label="週の出勤日数の目安" style={{ ...t.input, width: 56, padding: "2px 6px" }}
              onChange={(e) => setForm((f) => ({ ...f, terms: { ...f.terms, week_days_target: e.target.value === "" ? null : Math.max(0, Math.min(7, Number(e.target.value))) } }))} /> 日</label>
            <label>適用開始日 <input type="date" value={form.terms.effective_from ?? ""} disabled={busy} aria-label="適用開始日" style={{ ...t.input, width: 150, padding: "2px 6px" }}
              onChange={(e) => setForm((f) => ({ ...f, terms: { ...f.terms, effective_from: e.target.value || null } }))} /></label>
          </div>
          <input value={form.terms.memo ?? ""} placeholder="メモ（200 字まで）" maxLength={200} disabled={busy} aria-label="基本の働き方のメモ" style={{ ...t.input }}
            onChange={(e) => setForm((f) => ({ ...f, terms: { ...f.terms, memo: e.target.value || null } }))} />
          <div className="nox-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setEdit(false); void load(); }}>キャンセル</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()}>保存</button>
          </div>
        </div>
      )}
      {msg && <Toast msg={msg.text} kind={msg.kind} />}
    </div>
  );
}
