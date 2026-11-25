"use client";

// ★0214（起票158 の 2 休憩の打刻・相談役 11/25 の D5）: 店舗設定 › シフトと打刻「休憩の打刻を使う」（2 択のボタン＝教訓133・既定 OFF・オーナーだけ・set_break_punch）。
//   初期設定には出さない（店舗設定だけ）・2 店目には写す（store_copy_settings の写す鍵）。OFF にした後も、ある休憩は時間から引く（休憩中の人は終了を押せる）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import { payTimeBasisOf } from "@/lib/nox/payroll/time-basis";
import { punchModeOf } from "@/lib/nox/shift/punch-mode";
import { dayAdjAppliesOf } from "@/lib/nox/punch/day-window";
import { BREAK_PUNCH_NOTE, BREAK_PUNCH_NOT_APPLIED_NOTE, BREAK_PUNCH_OPTIONS, breakPunchErrJa } from "@/lib/nox/punch/break-form";

type Store = { id: string; name: string };
export default function BreakPunchPanel({ stores, isOwner = false }: { stores: Store[]; isOwner?: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<boolean | null>(null);
  const [applies, setApplies] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data, error } = await createClient().from("stores").select("settings_json").eq("id", storeSel).single();
    if (error || !data) { setMsg("読み込みに失敗しました"); return; }
    const sj = (data.settings_json ?? null) as Record<string, unknown> | null;
    setCur(sj?.break_punch === true);
    setApplies(dayAdjAppliesOf({ payTimeBasis: payTimeBasisOf(sj, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)), punchMode: punchModeOf(sj) }));
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);
  async function save(on: boolean) {
    if (on === cur) return;
    setBusy(true);
    const { error } = await createClient().rpc("set_break_punch", { p_store_id: storeSel, p_on: on });
    setBusy(false);
    setMsg(error ? breakPunchErrJa(error.message) : on ? "休憩の打刻を使うようにしました" : "休憩の打刻を使わないようにしました（休憩中の人は「休憩終了」を押せます）");
    if (!error) await load();
  }
  return (
    <section className="nox-panel" data-break-punch-panel="1" style={{ marginBottom: 12 }}>
      <h3>休憩の打刻</h3>
      <p style={{ ...t.sub, margin: "0 0 8px", lineHeight: 1.6 }}>{BREAK_PUNCH_NOTE}</p>
      {stores.length > 1 && (
        <label style={{ display: "grid", gap: 4, marginBottom: 8 }}><span style={t.fieldLabel}>店舗</span>
          <SegSelect value={storeSel} onChange={setStoreSel} options={stores.map((s) => [s.id, s.name] as const)} ariaLabel="店舗" wrap />
        </label>
      )}
      <SegSelect value={cur === null ? "" : cur ? "on" : "off"} onChange={(v) => { if (isOwner && !busy) void save(v === "on"); }} options={BREAK_PUNCH_OPTIONS} ariaLabel="休憩の打刻" />
      {!isOwner && <p style={{ ...t.sub, margin: "6px 0 0" }}>この設定はオーナーだけが変更できます。</p>}
      {!applies && <p style={{ ...t.sub, margin: "6px 0 0", color: "var(--gold2)" }} data-break-not-applied="1">{BREAK_PUNCH_NOT_APPLIED_NOTE}</p>}
      <Toast msg={msg} style={{ margin: "4px 0 0" }} />
    </section>
  );
}
