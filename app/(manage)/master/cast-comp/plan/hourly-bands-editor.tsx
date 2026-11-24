"use client";
// ★時間帯の時給（2026-11-24 夕・相談役の便【9】・枝 hourly-bands-1124・旗 HOURLY_BANDS_ON の後ろ）: 待遇プランの「時間帯の時給」の表（owner だけ・開始日は持たない）。
//   器＝0175 v2 の plan_rate_bands（target 'hourly'）・保存＝plan_rate_band_set（今ある関数・owner・全置換・audit）。重なりは画面で止める（関数は断らない＝mig なし）。
//   時刻は営業日の中の時刻（翌 2 時＝26:00）。額 0＝その時間は時給なし。帯の無い時間はプランの基本時給。個別の時給の上書きがある人は帯を使わない。ボタンは中央。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { hourlyBandRowsErrOf } from "@/lib/nox/payroll/hourly-bands";

type Row = { from: string; to: string; amount: string };
const hmToMin = (hm: string): number => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const minToHm = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const HOURLY_BAND_MAX = 12;
export function hourlyRowsOf(rows: readonly Row[]): { from_min: number; to_min: number; value_amount: number | null }[] {
  return rows.map((r) => ({ from_min: hmToMin(r.from), to_min: hmToMin(r.to), value_amount: /^\d+$/.test(r.amount.trim()) ? Number(r.amount) : null }));
}

export default function HourlyBandsEditor({ planId, onSaved, onErr }: { planId: string; onSaved: (msg: string) => void | Promise<void>; onErr: (msg: string) => void }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.from("plan_rate_bands").select("from_min, to_min, value_amount").eq("plan_id", planId).eq("target", "hourly").eq("is_active", true).order("from_min").then(({ data }) => {
      if (alive) setRows(((data ?? []) as { from_min: number; to_min: number; value_amount: number | null }[]).map((b) => ({ from: minToHm(b.from_min), to: minToHm(b.to_min), amount: String(b.value_amount ?? "") })));
    });
    return () => { alive = false; };
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
  const conv = hourlyRowsOf(rows);
  const err = rows.length > HOURLY_BAND_MAX ? `時間帯は ${HOURLY_BAND_MAX} 個までです` : rows.some((r) => !/^\d{1,2}:\d{2}$/.test(r.from.trim()) || !/^\d{1,2}:\d{2}$/.test(r.to.trim())) ? "時刻は 20:00 の形で入れてください（翌 2 時は 26:00）" : hourlyBandRowsErrOf(conv);
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: k === "amount" ? v.replace(/[^0-9]/g, "") : v.replace(/[^0-9:]/g, "") } : r)));
  const save = async () => {
    if (err) { onErr(err); return; }
    setBusy(true);
    const p_rows = [...conv].sort((a, b) => a.from_min - b.from_min).map((r, i) => ({ from_min: r.from_min, to_min: r.to_min, value_amount: r.value_amount, priority: 100 + i }));
    const { error } = await supabase.rpc("plan_rate_band_set", { p_plan_id: planId, p_rows, p_target: "hourly" });
    setBusy(false);
    if (error) { onErr(error.message.includes("forbidden") ? "保存できるのはオーナーだけです" : "時間帯の時給を保存できませんでした（時刻と額を確かめてください）"); return; }
    await onSaved(p_rows.length ? `時間帯の時給を保存しました（${p_rows.length} 個）` : "時間帯の時給を外しました（いつも基本時給）");
  };
  return (
    <div id="hourly-bands" data-hourly-bands="1" style={{ margin: "8px 0", padding: "10px 12px", border: "1px solid var(--line2)", borderRadius: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>時間帯の時給</div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 8px", lineHeight: 1.7 }}>
        時間帯ごとに基本時給の代わりの額を決めます（スライドの段や保証が上回る時間は段や保証）。0 円の時間帯は時給なし。帯の無い時間は基本時給。翌 2 時は 26:00 と入れます。個別に時給を上書きしている人には使いません。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }} data-hourly-empty="1">時間帯がありません＝いつも基本時給。</p>}
      {rows.map((r, i) => (
        <div key={i} data-hourly-row={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: i ? "1px solid var(--line2)" : undefined }}>
          <input inputMode="numeric" value={r.from} onChange={(e) => set(i, "from", e.target.value)} aria-label={`${i + 1} 個目の始まり`} placeholder="20:00" style={{ ...t.input, width: 76 }} />
          <span style={{ fontSize: 12, color: "var(--sub)" }}>〜</span>
          <input inputMode="numeric" value={r.to} onChange={(e) => set(i, "to", e.target.value)} aria-label={`${i + 1} 個目の終わり`} placeholder="26:00" style={{ ...t.input, width: 76 }} />
          <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}><span style={{ color: "var(--sub)" }}>時給 ¥</span><input inputMode="numeric" value={r.amount} onChange={(e) => set(i, "amount", e.target.value)} aria-label={`${i + 1} 個目の時給`} style={{ ...t.input, width: 92 }} /></label>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`${i + 1} 個目を消す`} disabled={busy}>消す</button>
        </div>
      ))}
      {err && <Message kind="error" style={{ margin: "6px 0 0" }}>{err}</Message>}
      <div className="nox-actions" style={{ marginTop: 8 }}>
        <button type="button" style={t.btnGhost} disabled={busy || rows.length >= HOURLY_BAND_MAX} onClick={() => setRows((rs) => [...rs, { from: "", to: "", amount: "" }])}>時間帯を足す</button>
        <button type="button" style={t.btnGold} disabled={busy || !!err} onClick={() => void save()} data-hourly-save="1">{busy ? "保存中…" : "保存"}</button>
      </div>
    </div>
  );
}
