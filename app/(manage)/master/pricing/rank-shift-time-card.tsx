"use client";
// ★0208（相談役 11/24 夜 N6・時間別の時給 B）: ランクの既定の出勤の時刻のカード（旗 MIG_0208_APPLIED の後ろでだけ出す＝列の無い本番では読まない）。
//   使い道はシフトを作るときの初期値だけ（希望 → 人の基本の働き方 → ランクの時刻 → 営業時間 → 既定）。作成済みのシフトは書き換えない・一括で直す道は付けない。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TimeInput from "@/components/ui/time-input";
import { Message } from "@/components/ui/toast";
import { rankShiftHmOf, rankShiftTimeErrJa, rankShiftTimeOf } from "@/lib/nox/shift/rank-time";

type Row = { id: string; name: string; shift_start_min: number | null; shift_end_min: number | null };

export default function RankShiftTimeCard({ storeId, version }: { storeId: string; version: number }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [vals, setVals] = useState<Record<string, { start: string; end: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; bad: boolean } | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("cast_ranks").select("id, name, shift_start_min, shift_end_min").eq("store_id", storeId).order("sort_order").order("name");
    const rs = (data ?? []) as Row[];
    setRows(rs);
    setVals(Object.fromEntries(rs.map((r) => [r.id, { start: rankShiftHmOf(r.shift_start_min), end: rankShiftHmOf(r.shift_end_min) }])));
  }, [supabase, storeId]);
  useEffect(() => { void load(); }, [load, version]);

  async function save(r: Row) {
    const v = vals[r.id] ?? { start: "", end: "" };
    const o = rankShiftTimeOf(v);
    if (!o.ok) { setMsg({ id: r.id, text: o.err, bad: true }); return; }
    setBusy(r.id);
    const { error } = await supabase.rpc("set_cast_rank_shift_time", { p_id: r.id, p_start_min: o.start, p_end_min: o.end });
    setBusy(null);
    setMsg(error ? { id: r.id, text: rankShiftTimeErrJa(error.message), bad: true } : { id: r.id, text: o.start === null ? "ランクの時刻を外しました" : "保存しました", bad: false });
    await load();
  }

  if (rows.length === 0) return null;
  return (
    <div data-rank-shift-time="1" style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>ランクの出勤の時刻</div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 10px" }}>
        シフトを作るときの初めの時刻です（本人の希望や基本の働き方が無い日に使います）。作成済みのシフトは変わりません。空にすると営業時間から始まります。
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => {
          const v = vals[r.id] ?? { start: "", end: "" };
          const set = (k: "start" | "end", x: string) => setVals((p) => ({ ...p, [r.id]: { ...v, [k]: x } }));
          return (
            <div key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ minWidth: 80, fontWeight: 600 }}>{r.name}</span>
              <TimeInput value={v.start} onChange={(x) => set("start", x)} maxHour={23} ariaLabel={`${r.name}の出勤の開始`} width={110} />
              <span>〜</span>
              <TimeInput value={v.end} onChange={(x) => set("end", x)} ariaLabel={`${r.name}の出勤の終了`} width={110} after={v.start || undefined} />
              <button type="button" disabled={busy !== null} onClick={() => void save(r)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontWeight: 700 }}>保存</button>
              {(v.start || v.end) && <button type="button" disabled={busy !== null} onClick={() => setVals((p) => ({ ...p, [r.id]: { start: "", end: "" } }))} style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--sub)" }}>空にする</button>}
              {msg?.id === r.id && <Message kind={msg.bad ? "error" : "success"} style={{ margin: 0, fontSize: 12 }}>{msg.text}</Message>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
