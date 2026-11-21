"use client";
// ★0202f（ホストの骨格 B・2026-11-22・枝 night1122-host-core・旗 MIG_0202F_APPLIED の後ろ）: 待遇プランの「歩合の段の表」（owner だけ・最大 10 段・下限は小さい順・率は % の整数＝RPC と同じ検査）。
//   式＝売上の全額 × 届いた段の率（丸め 1 回）。表があるプランの人は既定の売上歩合の表を使わない。表を外す（空で保存）＝既定の表に戻る。
//   率を掛ける売上は店の「売上の基準」（請求額／小計）のまま。保存＝comp_plan_ext_set（p_patch＝commission_tiers だけ）。ボタンは中央。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";

export type CommissionTier = { at: number; rate: number };
type Row = { at: string; rate: string };
export const COMMISSION_TIER_MAX = 10;
const rowsOf = (tiers: readonly CommissionTier[] | null | undefined): Row[] => (tiers ?? []).map((x) => ({ at: String(x.at), rate: String(x.rate) }));
/** 入力の検査（RPC と同じ＝下限は 0 以上の整数の小さい順・率は 0〜100 の整数・10 段まで） */
export function commissionRowsErrOf(rows: readonly Row[]): string | null {
  if (rows.length > COMMISSION_TIER_MAX) return `段は ${COMMISSION_TIER_MAX} 段までです`;
  let prev = -1;
  for (const [i, r] of rows.entries()) {
    if (!/^\d+$/.test(r.at.trim()) || !/^\d+$/.test(r.rate.trim())) return `${i + 1} 段目：売上の下限と率は整数で入れてください`;
    const at = Number(r.at), rate = Number(r.rate);
    if (rate > 100) return `${i + 1} 段目：率は 100% までです`;
    if (at <= prev) return `${i + 1} 段目：売上の下限は上の段より大きくしてください`;
    prev = at;
  }
  return null;
}
export const commissionPatchOf = (rows: readonly Row[]): { commission_tiers: CommissionTier[] | null } | null =>
  commissionRowsErrOf(rows) ? null : { commission_tiers: rows.length ? rows.map((r) => ({ at: Number(r.at), rate: Number(r.rate) })) : null };

export default function CommissionTiersEditor({ planId, tiers, onSaved, onErr }: {
  planId: string; tiers: readonly CommissionTier[] | null | undefined;
  onSaved: (msg: string) => void | Promise<void>; onErr: (msg: string) => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>(() => rowsOf(tiers));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(rowsOf(tiers)); }, [planId, tiers]);
  const err = commissionRowsErrOf(rows);
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v.replace(/[^0-9]/g, "") } : r)));
  const save = async () => {
    const patch = commissionPatchOf(rows);
    if (!patch) { onErr(err ?? "入力を確かめてください"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("comp_plan_ext_set", { p_plan_id: planId, p_patch: patch });
    setBusy(false);
    if (error) { onErr(error.message.includes("bad commission_tiers") ? "段の形が正しくありません（下限は小さい順の整数・率は 100% までの整数・10 段まで）" : error.message.includes("forbidden") ? "保存できるのはオーナーだけです" : "保存できませんでした"); return; }
    await onSaved(patch.commission_tiers ? `歩合の段の表を保存しました（${patch.commission_tiers.length} 段）` : "歩合の段の表を外しました（既定の売上歩合に戻ります）");
  };
  return (
    <div id="commission-tiers" data-commission-tiers="1" style={{ margin: "8px 0", padding: "10px 12px", border: "1px solid var(--line2)", borderRadius: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>歩合の段の表</div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 8px", lineHeight: 1.7 }}>
        期の売上が「下限」以上の段のうち、いちばん上の段の率を<b>売上の全額</b>に掛けます（丸めは 1 回）。表があるプランの人は、既定の売上歩合（3〜10%）を使いません。
        売上は店の「売上の基準」（請求額／小計）のままです。最大 {COMMISSION_TIER_MAX} 段。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }} data-commission-empty="1">段がありません＝既定の売上歩合のまま。</p>}
      {rows.map((r, i) => (
        <div key={i} data-commission-row={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: i ? "1px solid var(--line2)" : undefined }}>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44, color: "var(--ink)" }}>{i + 1} 段目</span>
          <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}><span style={{ color: "var(--sub)" }}>売上の下限</span><input inputMode="numeric" value={r.at} onChange={(e) => set(i, "at", e.target.value)} style={{ ...t.input, width: 110 }} aria-label={`${i + 1} 段目 売上の下限`} disabled={busy} /><span style={{ color: "var(--sub)" }}>円 以上</span></label>
          <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}><span style={{ color: "var(--sub)" }}>率</span><input inputMode="numeric" value={r.rate} onChange={(e) => set(i, "rate", e.target.value)} style={{ ...t.input, width: 64 }} aria-label={`${i + 1} 段目 率`} disabled={busy} /><span style={{ color: "var(--sub)" }}>%</span></label>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`${i + 1} 段目を消す`} disabled={busy}>消す</button>
        </div>
      ))}
      {err && <Message kind="error" style={{ margin: "6px 0 0" }}>{err}</Message>}
      <div className="nox-actions" style={{ marginTop: 8 }}>
        <button type="button" style={t.btnGhost} disabled={busy || rows.length >= COMMISSION_TIER_MAX} onClick={() => setRows((rs) => [...rs, { at: rs.length ? "" : "0", rate: "" }])}>段を足す</button>
        <button type="button" style={t.btnGold} disabled={busy || !!err} onClick={() => void save()} data-commission-save="1">{busy ? "保存中…" : "保存"}</button>
      </div>
    </div>
  );
}
