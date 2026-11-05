"use client";

// ★便 P175-prep P-4（裁定397＋413・0175 v2 ★9 availability／availability_terms・availability_set）: 基本の働き方の編集カード。
//   曜日ごと 可／不可／相談＋時間帯・週の出勤日数の目安・適用開始日・メモ。雇用キャストの時間帯は店のみ（本人は表示＋メモで希望）。
//   RULES_0175_APPLIED=false の間はどこにも mount されない（キャスト詳細と /mine が rules0175On() で出し分け）＝表も RPC も触らない。
//   通知は audit だけ（RPC 側）。保存＝availability_set（p_rows 7 行・p_terms）。membership は casts.user_id → memberships（store・active）で解く（★便 ON-1）。
import TimeInput from "@/components/ui/time-input"; // ★便 M5b M-51 追補 2
import { hmPickOf } from "@/lib/nox/time/hhmm";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { mig0192On } from "@/lib/nox/rules-0175/flag"; // ★0192 M-34: アカウント未発行のキャストも店が設定（availability_set_cast＝cast_id で持つ）
import { notifyCast } from "@/lib/nox/people/notify"; // ★便 ON-3（0176 ★5 (d)・裁定413 の「相手に通知」）: 店が変えたら本人へ
import { AVAILABILITY_CHANGED_BODY, notifRefOf } from "@/lib/nox/people/notify-text";
import { AVAIL_LABEL, DOW_JA, availChipsOf, availFormOf, availPatchOf, canEditTimeOf, emptyAvailForm, type Avail, type AvailForm, type AvailRow, type AvailTerms } from "@/lib/nox/rules-0175/availability";

const hm = (min: number | null): string => (min === null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
const minOf = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return Number.isFinite(v) ? v : null; };

export default function AvailabilityEditor({ castId, storeId, employment, bySelf, readOnly = false, membershipId: fixedMembershipId = null }: {
  castId: string; storeId: string; employment: string | null; bySelf: boolean; readOnly?: boolean;
  /** ★M-88: membership を直接渡す（スタッフ＝casts が無い）。渡せば casts.user_id → memberships の解決はしない */
  membershipId?: string | null;
}) {
  const supabase = createClient();
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [form, setForm] = useState<AvailForm>(emptyAvailForm());
  const [loaded, setLoaded] = useState(false);
  const [hasData, setHasData] = useState(false); // ★M-87
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const timeEditable = canEditTimeOf(employment, bySelf);
  const [bh, setBh] = useState<Record<number, { open: string; close: string }>>({});
  const [closedDows, setClosedDows] = useState<Set<number>>(new Set()); // ★M-92: 店の定休日の曜日（store_business_hours.is_closed＝設定値を読むだけ） // ★便 M5b M-51 追補 2: 店の営業時間（曜日→開始／終了）＝時刻の初期値
  const noAccount = !membershipId && mig0192On() && !bySelf; // ★0192 M-34: 未発行＝店が cast_id で置く（本人の確認は初回ログイン後の保存で membership へ引き取る）
  const canEdit = !!membershipId || noAccount;

  const load = useCallback(async () => {
    void supabase.from("store_business_hours").select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId).then(({ data }) => { setClosedDows(new Set(((data ?? []) as { dow: number; is_closed: boolean }[]).filter((x) => x.is_closed).map((x) => x.dow))); setBh(Object.fromEntries(((data ?? []) as { dow: number; is_closed: boolean; open_hm: string | null; close_hm: string | null }[]).filter((x) => !x.is_closed && x.open_hm && x.close_hm).map((x) => [x.dow, { open: x.open_hm!.slice(0, 5), close: x.close_hm!.slice(0, 5) }]))); }); // ★M-92: 定休日も読む
    // ★便 ON-1（2026-10-26）: memberships に cast_id 列は無い（user × store）＝casts.user_id → memberships（store・active）で解く
    // ★M-87（2026-11-05）: 本人（bySelf）は memberships を読めない（RLS は owner／manager だけ）＝RPC auth_membership_id() で解く。店側は従来どおり casts.user_id → memberships
    let mid: string | null = null;
    if (fixedMembershipId) mid = fixedMembershipId; // ★M-88: スタッフ（membership 軸）
    else if (bySelf) { const { data: me } = await supabase.rpc("auth_membership_id"); mid = typeof me === "string" ? me : null; }
    else {
      const { data: cs } = await supabase.from("casts").select("user_id").eq("id", castId).maybeSingle();
      const uid = (cs?.user_id as string | null | undefined) ?? null;
      const { data: m } = uid ? await supabase.from("memberships").select("id").eq("user_id", uid).eq("store_id", storeId).eq("is_active", true).limit(1).maybeSingle() : { data: null };
      mid = (m?.id as string | undefined) ?? null;
    }
    setMembershipId(mid);
    if (!mid && !mig0192On()) { setLoaded(true); return; }
    const byCast = async () => Promise.all([ // ★0192 M-34: 未発行のうちに店が置いた行（membership_id null・cast_id）
      supabase.from("availability").select("dow, avail, from_min, to_min, memo").is("membership_id", null).eq("cast_id", castId).order("dow"),
      supabase.from("availability_terms").select("week_days_target, fixed_off_dows, effective_from, memo").is("membership_id", null).eq("cast_id", castId).maybeSingle(),
    ]);
    let [{ data: rows }, { data: terms }] = mid ? await Promise.all([
      supabase.from("availability").select("dow, avail, from_min, to_min, memo").eq("membership_id", mid).order("dow"),
      supabase.from("availability_terms").select("week_days_target, fixed_off_dows, effective_from, memo").eq("membership_id", mid).maybeSingle(),
    ]) : await byCast();
    if (mid && castId && mig0192On() && (rows ?? []).length === 0 && !terms) [{ data: rows }, { data: terms }] = await byCast(); // ★M-88: castId が無い（スタッフ）は cast_id の行を見ない // 発行後まだ本人が保存していない＝店が置いた行を見せる（保存で引き取る）
    setHasData((rows ?? []).length > 0 || !!terms); // ★M-87: 店が保存した行があるか（無ければ「店がまだ設定していません」）
    setForm(availFormOf((rows ?? []) as Partial<AvailRow>[], (terms ?? null) as Partial<AvailTerms> | null));
    setLoaded(true);
  }, [supabase, castId, storeId, fixedMembershipId, bySelf]); // ★便 ON-1: storeId で membership を解く（lint exhaustive-deps）★M-88
  useEffect(() => { void load(); }, [load]);

  const setRow = (dow: number, patch: Partial<AvailRow>) => setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.dow === dow ? { ...r, ...patch } : r)) }));
  async function save() {
    if (busy || !canEdit) return; setBusy(true); setMsg(null);
    const patch = availPatchOf(form);
    if (!patch.p_terms.effective_from) patch.p_terms = { ...patch.p_terms, effective_from: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) }; // ★M-91: 適用開始日が空＝保存日（JST）から有効（判定側は日付を見ない＝null でも有効・記録として残す）
    const { error } = membershipId
      ? await supabase.rpc("availability_set", { p_membership_id: membershipId, ...patch })
      : await supabase.rpc("availability_set_cast", { p_cast_id: castId, ...patch }); // ★0192 M-34
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: `保存に失敗: ${rpcErrJa(error.message)}` }); return; }
    // ★便 ON-3: 店側（bySelf=false）の保存＝本人へ通知（cast_notifications availability_changed＋LINE）。本人側の保存＝店は audit と詳細の表示で知る（本人→店の通知の器は無い）
    if (!membershipId) { setMsg({ kind: "success", text: "基本の働き方を保存しました（本人はアカウント発行後に確認します）" }); setEdit(false); await load(); return; } // ★0192 M-34: 未発行＝通知先なし
    if (!bySelf) void notifyCast(supabase, { castId, kind: "availability_changed", body: AVAILABILITY_CHANGED_BODY, ref: notifRefOf("availability", membershipId) });
    setMsg({ kind: "success", text: bySelf ? "基本の働き方を保存しました" : "基本の働き方を保存し、本人に通知しました" }); setEdit(false); await load();
  }

  return (
    <div data-availability-editor="1" data-store-id={storeId} style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>基本の働き方</b>
        {loaded && !edit && !bySelf && <span style={{ fontSize: 12, color: "var(--sub)" }}>{canEdit ? `${availChipsOf(form)}${form.terms.week_days_target !== null ? `・週 ${form.terms.week_days_target} 日目安` : ""}` : "（アカウント未発行＝基本の働き方は設定できません）"}{noAccount && <span data-avail-no-account="1" style={{ marginLeft: 6 }}>（アカウント未発行＝店で設定・本人はアカウント発行後に確認）</span>}</span>}
        {!readOnly && !bySelf && !edit && canEdit && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy || !loaded} onClick={() => setEdit(true)}>編集</button>}
      </div>
      {bySelf && loaded && (/* ★M-87（2026-11-05）: 本人画面＝店が保存した内容を読取専用の表で（曜日×可／相談／不可と時刻・週の目安・適用開始日・メモ）。「アカウント未発行」の分岐は本人画面に無い */
        hasData ? (
          <div data-avail-self-table="1" style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            <table className="nox-table" style={{ width: "100%" }}>
              <thead><tr><th>曜日</th><th>可否</th><th>時間</th><th>メモ</th></tr></thead>
              <tbody>
                {form.rows.map((r) => (
                  <tr key={r.dow} data-avail-self-row={r.dow} data-avail-self-avail={r.avail}>
                    <td>{DOW_JA[r.dow]}</td>
                    {closedDows.has(r.dow) ? <td colSpan={3} data-avail-self-closed="1" style={{ color: "var(--sub)" }}>定休日（店の設定）</td> : (<>
                    <td style={{ color: r.avail === "ng" ? "var(--bad)" : r.avail === "ask" ? "var(--gold2)" : undefined, fontWeight: 700 }}>{AVAIL_LABEL[r.avail]}</td>
                    <td className="num">{r.avail !== "ng" && r.from_min !== null && r.to_min !== null ? `${hm(r.from_min)}〜${r.to_min >= 1440 ? `翌${hm(r.to_min - 1440)}` : hm(r.to_min)}` : "—"}</td>
                    <td>{r.memo || "—"}</td>
                    </>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...t.sub, margin: 0 }} data-avail-self-terms="1">週の目安 {form.terms.week_days_target !== null ? `${form.terms.week_days_target} 日` : "—"}・適用開始日 {form.terms.effective_from ?? "—"}{form.terms.memo ? `・メモ ${form.terms.memo}` : ""}</p>
            <p style={{ ...t.sub, margin: 0 }}>店が設定した内容です（変更は店にご相談ください）。</p>
          </div>
        ) : <p style={{ ...t.sub, margin: 0 }} data-avail-self-none="1">店がまだ設定していません</p>
      )}
      {edit && (
        <div style={{ display: "grid", gap: 4 }}>
          {form.rows.map((r) => (
            <div key={r.dow} data-avail-row={r.dow} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ width: 20, fontWeight: 700 }}>{DOW_JA[r.dow]}</span>
              {closedDows.has(r.dow) ? <span className="nox-stpill" data-avail-closed={String(r.dow)} style={{ color: "var(--sub)" }}>定休日（店の設定）</span> : (<>{/* ★M-92: 定休日の曜日は可否と時刻を出さない（保存値は触らない・判定は定休日が優先） */}
              <span role="radiogroup" aria-label={`${DOW_JA[r.dow]}曜の可否`} style={{ display: "inline-flex", gap: 8 }}>
                {(["ok", "ask", "ng"] as Avail[]).map((a) => (
                  <label key={a} style={{ display: "inline-flex", gap: 3, alignItems: "center", minHeight: 32 }}>
                    <input type="radio" name={`avail-${r.dow}`} checked={r.avail === a} disabled={busy} onChange={() => setRow(r.dow, { avail: a })} />{AVAIL_LABEL[a]}
                  </label>
                ))}
              </span>
              {r.avail !== "ng" && (
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  {/* ★便 M5b M-51 追補 2: 時と分を選ぶ部品（15 分刻み）・初期値は店の営業時間（その曜日）・終了が開始より前なら翌日（保存は 0〜2879 分のまま＝26:00 は 1560） */}
                  <TimeInput value={hm(r.from_min)} step={15} maxHour={23} startAt={bh[r.dow]?.open ?? null} disabled={busy || !timeEditable} ariaLabel={`${DOW_JA[r.dow]}曜の開始`} width={104}
                    onChange={(v) => setRow(r.dow, { from_min: minOf(v), ...(r.to_min === null && bh[r.dow] ? { to_min: minOf(hmPickOf(Number(bh[r.dow]!.close.slice(0, 2)) % 24, Number(bh[r.dow]!.close.slice(3, 5)), v)) } : {}) })} />
                  〜
                  <TimeInput value={hm(r.to_min)} step={15} after={hm(r.from_min) || bh[r.dow]?.open || null} startAt={bh[r.dow]?.close ?? null} disabled={busy || !timeEditable} ariaLabel={`${DOW_JA[r.dow]}曜の終了`} width={112}
                    onChange={(v) => setRow(r.dow, { to_min: minOf(v) })} />
                </span>
              )}
              </>)}
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
          <div className="nox-actions" data-avail-actions="1">{/* ★便 A M-66・教訓133: キャンセル／保存は中央寄せ（.nox-actions の既定） */}
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setEdit(false); void load(); }}>キャンセル</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()}>保存</button>
          </div>
        </div>
      )}
      {msg && <Toast msg={msg.text} kind={msg.kind} />}
    </div>
  );
}
