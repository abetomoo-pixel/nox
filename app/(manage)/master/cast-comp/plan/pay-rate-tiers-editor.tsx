"use client";
// ★2026-11-17 夜（相談役 Y3b）: 待遇プランの「報酬率の段」の入力（owner だけ・最大 10 段・境は小さい順＝RPC と同じ検査）。
//   保存＝comp_plan_ext_set（p_patch＝pay_rate_tiers と slide_streak_n だけ）＝新しい RPC も mig も無い。式「時給分 ÷ 売上小計」と段の当て方は変えない。
//   出すのは、このプランの報酬の軸が報酬率（plan の reward_axis＝pay_rate・または店の軸に従って報酬率）のときだけ。初期設定の「段はあとで待遇プランで設定します」の行き先（#pay-rate-tiers）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージ表示の共通部品
import type { PayRateTier } from "@/lib/nox/rules-0175/canon";
import { PAY_RATE_BACK_HOLD_NOTE, PAY_RATE_TIER_MAX, PAY_RATE_STREAK_MAX, PAY_RATE_STREAK_MIN, emptyPayRateRow, payRatePatchOf, payRateRowBackEnabledOf, payRateRowsErrOf, payRateRowsOf, payRateStreakErrOf, type PayRateTierRow } from "@/lib/nox/comp/pay-rate-tiers";

export default function PayRateTiersEditor({ planId, tiers, streak, onSaved, onErr }: {
  planId: string; tiers: readonly PayRateTier[] | null | undefined; streak: number | null | undefined;
  onSaved: (msg: string) => void | Promise<void>; onErr: (msg: string) => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<PayRateTierRow[]>(() => payRateRowsOf(tiers));
  const [n, setN] = useState<number>(Number(streak ?? 2) || 2);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(payRateRowsOf(tiers)); setN(Number(streak ?? 2) || 2); }, [planId, tiers, streak]);
  // ★2026-11-18: 初期設定・店舗設定のリンク（?tab=slides#pay-rate-tiers）で来たら、描画の後にこの位置まで送る（読み込みの前は要素が無く、ブラウザの自動の位置合わせが効かない）
  useEffect(() => { if (typeof window !== "undefined" && window.location.hash === "#pay-rate-tiers") document.getElementById("pay-rate-tiers")?.scrollIntoView({ block: "start" }); }, []);
  const err = payRateRowsErrOf(rows) ?? payRateStreakErrOf(n);
  const set = (i: number, k: keyof Omit<PayRateTierRow, "rest">, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const cell = (i: number, k: keyof Omit<PayRateTierRow, "rest">, label: string, post: string, off = false) => (
    <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, opacity: off ? 0.5 : 1 }}>
      <span style={{ color: "var(--sub)" }}>{label}</span>
      <input inputMode="decimal" value={rows[i][k]} onChange={(e) => set(i, k, e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...t.input, width: 84 }} aria-label={`${i + 1} 段目 ${label}`} disabled={off} title={off ? PAY_RATE_BACK_HOLD_NOTE : undefined} />
      <span style={{ color: "var(--sub)" }}>{post}</span>
    </label>
  );
  const save = async () => {
    const patch = payRatePatchOf(rows, n);
    if (!patch) { onErr(err ?? "入力を確かめてください"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("comp_plan_ext_set", { p_plan_id: planId, p_patch: patch });
    setBusy(false);
    if (error) { onErr(error.message.includes("bad pay_rate_tiers") ? "段の形が正しくありません（境は 0〜300% の小さい順・率は 100% まで）" : error.message.includes("forbidden") ? "報酬率の段を変えられるのはオーナーだけです" : error.message); return; }
    await onSaved(`報酬率の段を保存しました（${patch.pay_rate_tiers.length} 段・連続 ${patch.slide_streak_n} 期）`);
  };
  return (
    <div id="pay-rate-tiers" data-pay-rate-tiers="1" style={{ margin: "8px 0", padding: "10px 12px", border: "1px solid var(--line2)", borderRadius: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>報酬率の段</div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 8px" }}>
        報酬率＝時給分 ÷ 売上小計。期の報酬率が「境」以上の段のうちいちばん上の段が当たります（境は小さい順・最大 {PAY_RATE_TIER_MAX} 段・0〜300%）。
        UP 額は次の期から決定時給に足します。総報酬の率（100 未満）を入れた段は、その期の総報酬にその率を掛けます（査定）。バック率はその段のバックの倍率です（UP か査定の段で効きます）。
        同じ方向が「連続の期の数」続いたときだけ成立し、店が「適用」すると金額に効きます。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }} data-pay-rate-empty="1">段がありません＝判定しません（時給は基本のまま）。</p>}
      {rows.map((r, i) => (
        <div key={i} data-pay-rate-row={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: i ? "1px solid var(--line2)" : undefined }}>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44 }}>{i + 1} 段目</span>
          {cell(i, "at", "境", "% 以上")}
          {cell(i, "up", "UP 額", "円")}
          {cell(i, "down", "下げる額", "円")}
          {cell(i, "back", "バック率", "%", !payRateRowBackEnabledOf(r)) /* ★2026-11-18（相談役 A-3）: バック率は UP と査定の段だけ（据え置きの段では計算で効かない）・入っている値は保存のときにそのまま戻す */}
          {cell(i, "pay", "総報酬の率", "%")}
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`${i + 1} 段目を消す`} disabled={busy}>消す</button>
          {!payRateRowBackEnabledOf(r) && <span style={{ flexBasis: "100%", fontSize: 11, color: "var(--sub)" }} data-pay-rate-back-hold={i}>{PAY_RATE_BACK_HOLD_NOTE}</span>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows((rs) => [...rs, emptyPayRateRow()])} disabled={busy || rows.length >= PAY_RATE_TIER_MAX} data-pay-rate-add="1">段を足す</button>
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "var(--sub)" }}>連続の期の数</span>
          <input type="number" min={PAY_RATE_STREAK_MIN} max={PAY_RATE_STREAK_MAX} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ ...t.input, width: 70 }} aria-label="連続の期の数" />
          <span style={{ color: "var(--sub)" }}>期</span>
        </label>
      </div>
      {err && <div data-pay-rate-err="1"><Message kind="error" style={{ margin: "6px 0 0" }}>{err}</Message></div>}
      <div className="nox-actions" style={{ marginTop: 10 }}>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm, opacity: busy || err ? 0.5 : 1 }} onClick={() => void save()} disabled={busy || !!err} data-pay-rate-save="1">報酬率の段を保存</button>
      </div>
    </div>
  );
}
