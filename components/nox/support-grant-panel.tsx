"use client";
// ★導入の代行 版 2（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ）: 店の設定 › サポート許可（オーナーだけ）。
//   運営に 1 日・3 日・7 日だけ代行を許す（support_grant_set）・取り消す（support_grant_revoke）・「導入完了にする」（onboarding_done_by_owner＝代行の窓口が閉じる）。ボタンは中央。
//   許可の間に運営ができること＝初期設定の下書き・LINE 連携・キャストの仮の登録だけ（店の設定・会計・給与は触れない）。デモの会社では関数が止める（forbidden (demo)）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { fmtJst } from "@/lib/nox/ops/labels";
import { assistErrJa } from "@/lib/nox/ops/assist";

export default function SupportGrantPanel({ orgId, initial }: { orgId: string; initial?: { until: string | null; onb: string | null } }) {
  const [until, setUntil] = useState<string | null>(initial?.until ?? null);
  const [onb, setOnb] = useState<string | null>(initial?.onb ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function load() {
    const sb = createClient();
    const [{ data: g }, { data: o }] = await Promise.all([
      sb.from("ops_support_grants").select("expires_at").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("orgs").select("onboarding_state").eq("id", orgId).maybeSingle(),
    ]);
    setUntil((g?.expires_at as string | undefined) ?? null); setOnb((o?.onboarding_state as string | undefined) ?? null);
  }
  useEffect(() => { if (!initial) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function rpc(fn: string, args: Record<string, unknown>, okText: string) {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: assistErrJa(error.message) }); return; }
    setMsg({ ok: true, text: okText }); void load();
  }
  return (
    <section className="nox-readable" style={{ ...t.card }} data-support-grant="1">
      <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>サポート許可</h2>
      <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }}>運営に、決めた日数だけ代行を許します。許可の間に運営ができるのは、初期設定の下書き・LINE 連携・キャストの仮の登録だけです（会計・給与・店の設定は触れません）。</p>
      <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }} data-support-until={until ?? ""}>{until ? `許可しています（${fmtJst(until)} まで）` : "許可していません"}</p>
      <div className="nox-actions">
        {[1, 3, 7].map((d) => <button key={d} type="button" style={t.btnGhost} disabled={busy} onClick={() => void rpc("support_grant_set", { p_days: d }, `${d} 日の許可を出しました`)} data-support-days={d}>{d} 日</button>)}
        {until && <button type="button" style={t.btnGhost} disabled={busy} onClick={() => void rpc("support_grant_revoke", {}, "許可を取り消しました")} data-support-revoke="1">取り消す</button>}
      </div>
      {onb === "onboarding" && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }}>導入中は運営が代行できます。導入が済んだら「導入完了にする」を押してください（その後はサポート許可の間だけ代行できます）。</p>
          <div className="nox-actions"><button type="button" style={t.btnGold} disabled={busy} onClick={() => { if (window.confirm("導入完了にします。よろしいですか（戻せません）")) void rpc("onboarding_done_by_owner", {}, "導入完了にしました"); }} data-onboarding-done="1">導入完了にする</button></div>
        </div>
      )}
      {msg && <div style={{ marginTop: 10 }}><Message kind={msg.ok ? "success" : "error"}>{msg.text}</Message></div>}
    </section>
  );
}
