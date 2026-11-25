"use client";

// ★起票159（相談役 11/24 夜の決め）: 店舗設定 › シフトと打刻「勤務時間の丸め」＝単位（1／5／10／15／30 分）・向き（働く人に有利／四捨五入／店に有利）・同意（店ごと・BANZEN の文・版 v1）。
//   保存＝set_store_profile の 3 キー（オーナーだけ＝RPC と同じ・変えたときに単位が 1 より大きいと同意の版が要る）。DB 変更 0。
//   給与の計算に丸めを入れるのは起票159 の本体（docs/tmp/round_1124/plan.md）＝この枝はそれと一緒に main に入れる。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import { PUNCH_ROUND_CONSENT_LABEL, PUNCH_ROUND_CONSENT_TEXT } from "@/lib/nox/setup/v5";
import { PUNCH_ROUND_MODE_NOTE, PUNCH_ROUND_MODE_OPTIONS, PUNCH_ROUND_UNIT_OPTIONS, punchRoundErrJa, punchRoundErrOf, punchRoundLineOf, punchRoundPatchOf, punchRoundArgsOf, punchRoundHistoryLineOf, punchRoundSavedMsgOf, PUNCH_ROUND_NOT_APPLIED_NOTE, PUNCH_ROUND_EFFECT_NOTE, type PunchRoundForm, type PunchRoundMode } from "@/lib/nox/punch/round-form";
import { mig0213On } from "@/lib/nox/rules-0175/flag"; // ★0213: 旗 true＝set_punch_round（変えた営業日から効く・履歴）
import { payTimeBasisOf } from "@/lib/nox/payroll/time-basis";
import { punchModeOf } from "@/lib/nox/shift/punch-mode";
import { dayAdjAppliesOf } from "@/lib/nox/punch/day-window";

type Store = { id: string; name: string };
const EMPTY: PunchRoundForm = { unit: 1, mode: "nearest" };

export default function PunchRoundPanel({ stores, isOwner = false }: { stores: Store[]; isOwner?: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<PunchRoundForm>(EMPTY);
  const [form, setForm] = useState<PunchRoundForm>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hist, setHist] = useState<{ effective_from: string; unit: number; mode: PunchRoundMode }[]>([]); // ★0213: 履歴（新しい順・3 行）
  const [applies, setApplies] = useState(true); // ★0213: 実打刻の店か（確定シフトどおり・打刻しない店は効かない）

  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data, error } = await createClient().from("stores").select("punch_round_unit, punch_round_mode, settings_json").eq("id", storeSel).single();
    if (error || !data) { setMsg("読み込みに失敗しました"); return; }
    const sj = (data.settings_json ?? null) as Record<string, unknown> | null;
    setApplies(dayAdjAppliesOf({ payTimeBasis: payTimeBasisOf(sj, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)), punchMode: punchModeOf(sj) }));
    if (mig0213On()) { const h = await createClient().from("punch_round_rules").select("effective_from, unit, mode").eq("store_id", storeSel).order("effective_from", { ascending: false }).limit(3); setHist(((h.data ?? []) as { effective_from: string; unit: number; mode: PunchRoundMode }[])); }
    const f: PunchRoundForm = { unit: Number(data.punch_round_unit ?? 1), mode: ((data.punch_round_mode as string | null) ?? "nearest") as PunchRoundMode };
    setCur(f); setForm(f); setConsent(false); setLoaded(true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    const e = punchRoundErrOf(cur, form, consent);
    if (e) { setMsg(e); return; }
    setBusy(true);
    if (mig0213On()) { // ★0213（相談役 11/25 の D4）: オーナーだけ・変えた営業日から効く（同じ営業日の直しはその日の行を上書き）
      const { data, error } = await createClient().rpc("set_punch_round", punchRoundArgsOf(storeSel, form, consent));
      setBusy(false);
      setMsg(error ? punchRoundErrJa(error.message) : punchRoundSavedMsgOf(form, (data ?? null) as { effective_from?: string } | null));
      if (!error) await load();
      return;
    }
    const { error } = await createClient().rpc("set_store_profile", { p_store_id: storeSel, p_patch: punchRoundPatchOf(form, consent) });
    setBusy(false);
    setMsg(error ? punchRoundErrJa(error.message) : `勤務時間の丸めを「${punchRoundLineOf(form)}」にしました`);
    if (!error) await load();
  }

  const changed = form.unit !== cur.unit || form.mode !== cur.mode;
  const needConsent = changed && form.unit > 1;
  return (
    <section className="nox-panel" data-punch-round-panel="1" style={{ marginBottom: 12 }}>
      <h3>勤務時間の丸め</h3>
      <p style={{ ...t.sub, margin: "0 0 8px", lineHeight: 1.6 }}>打刻の時刻を何分単位で数えるか。遅刻の判定は丸める前の時刻のままです。今の設定：<b data-punch-round-now="1">{loaded ? punchRoundLineOf(cur) : "…"}</b></p>
      {stores.length > 1 && (
        <label style={{ display: "grid", gap: 4, marginBottom: 8 }}><span style={t.fieldLabel}>店舗</span>
          <SegSelect value={storeSel} onChange={setStoreSel} options={stores.map((s) => [s.id, s.name] as const)} ariaLabel="店舗" wrap />
        </label>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>単位</span>
          <SegSelect value={String(form.unit)} onChange={(v) => setForm({ ...form, unit: Number(v) })} options={PUNCH_ROUND_UNIT_OPTIONS} ariaLabel="丸めの単位" wrap />
        </label>
        {form.unit > 1 && (
          <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>向き</span>
            <SegSelect value={form.mode} onChange={(v) => setForm({ ...form, mode: v as PunchRoundMode })} options={PUNCH_ROUND_MODE_OPTIONS} ariaLabel="丸めの向き" wrap />
            <span style={{ ...t.sub, lineHeight: 1.6 }}>{PUNCH_ROUND_MODE_NOTE[form.mode]}</span>
          </label>
        )}
        {needConsent && (
          <div data-punch-round-consent="1" style={{ border: "1px solid var(--warn, var(--gold))", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{PUNCH_ROUND_CONSENT_TEXT}</p>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={consent} disabled={!isOwner} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, flex: "0 0 auto" }} />
              <span>{PUNCH_ROUND_CONSENT_LABEL}</span>
            </label>
          </div>
        )}
        {!isOwner && <p style={{ ...t.sub, margin: 0 }}>この設定はオーナーだけが変更できます。</p>}
        {mig0213On() && <p style={{ ...t.sub, margin: 0, lineHeight: 1.6 }} data-punch-round-effect="1">{PUNCH_ROUND_EFFECT_NOTE}</p>}
        {mig0213On() && hist.length > 0 && <p style={{ ...t.sub, margin: 0, lineHeight: 1.6 }} data-punch-round-history={hist.length}>{hist.map(punchRoundHistoryLineOf).join("／")}</p>}
        {!applies && <p style={{ ...t.sub, margin: 0, lineHeight: 1.6, color: "var(--gold2)" }} data-punch-round-not-applied="1">{PUNCH_ROUND_NOT_APPLIED_NOTE}</p>}
        <div className="nox-actions" style={{ display: "flex", justifyContent: "center" }}>
          <button type="button" style={{ ...t.btnGold, minWidth: 160 }} disabled={!isOwner || busy || !changed || (needConsent && !consent)} onClick={() => void save()}>{busy ? "保存中…" : "保存"}</button>
        </div>
        <Toast msg={msg} style={{ margin: "4px 0 0" }} />
      </div>
    </section>
  );
}
