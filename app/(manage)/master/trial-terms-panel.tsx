"use client";

// ★0201c（裁定480・2026-11-12）: 店舗設定 › 店舗情報「体験入店の条件」＝店の既定（settings_json の trial_wage・trial_back・trial_guarantee_days）。
//   保存＝set_store_profile（オーナーだけ・変更分だけの patch）。店長は値を見るだけ。キャストごとの上書きはキャスト管理の詳細（set_cast_trial）。
import { TRIAL_WAGE_NOT_IN_PAY_NOTE } from "@/lib/nox/cast/trial-terms"; // ★2026-11-13（相談役【3】c）
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import { UnitBox } from "@/components/ui/unit-input";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { TRIAL_BACK_OPTIONS, trialStorePatchOf, trialStoreTermsOf, type TrialBack } from "@/lib/nox/cast/trial-terms";

const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { ...t.fieldLabel, display: "block", marginBottom: 4 };

export default function TrialTermsPanel({ stores, isOwner }: { stores: { id: string; name: string }[]; isOwner: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<{ wage: number | null; back: TrialBack; days: number }>({ wage: null, back: "same", days: 3 });
  const [form, setForm] = useState<{ wage: string; back: TrialBack; days: string }>({ wage: "", back: "same", days: "3" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data, error } = await createClient().from("stores").select("settings_json").eq("id", storeSel).maybeSingle();
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    const c = trialStoreTermsOf((data?.settings_json ?? null) as Record<string, unknown> | null);
    setCur(c); setForm({ wage: c.wage !== null ? String(c.wage) : "", back: c.back, days: String(c.days) }); setLoaded(true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    const p = trialStorePatchOf(form, cur);
    if (!p.ok) { setMsg(p.err); return; }
    if (Object.keys(p.patch).length === 0) { setMsg("変更はありません"); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("set_store_profile", { p_store_id: storeSel, p_patch: p.patch });
    setBusy(false);
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    setMsg("体験入店の条件を保存しました");
    await load();
  }

  const ro = !isOwner || busy || !loaded;
  return (
    <section className="nox-cardtop" style={{ ...t.card, marginTop: 14 }} data-trial-store-terms="1">
      <h3 style={t.cardTitle}>体験入店の条件</h3>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
        体入の方の既定です。キャストごとの変更は「キャスト管理」の詳細（体入の条件）から。本採用のときの待遇プランは店の既定プランです。{!isOwner && "（変更はオーナーが行います）"}
      </p>
      {stores.length > 1 && (
        <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "auto", marginBottom: 10 }} aria-label="店舗">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <label style={{ display: "block", minWidth: 0 }}>
          <span style={label}>体入の時給<span style={{ fontWeight: 400, marginLeft: 6 }}>0〜100,000 円</span></span>
          <span data-trial-wage-note="1" style={{ display: "block", fontSize: 12, color: "var(--warning)", margin: "0 0 4px" }}>{TRIAL_WAGE_NOT_IN_PAY_NOTE}</span>{/* ★2026-11-13（相談役【3】c）: 式が入った便で外す */}
          <UnitBox pre="¥" width="100%"><input type="number" inputMode="numeric" min={0} max={100000} value={form.wage} disabled={ro} onChange={(e) => setForm((f) => ({ ...f, wage: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} style={input} aria-label="体入の時給" data-trial-wage="1" /></UnitBox>
        </label>
        <label style={{ display: "block", minWidth: 0 }}>
          <span style={label}>体入の日数<span style={{ fontWeight: 400, marginLeft: 6 }}>出勤日数・1〜90</span></span>
          <UnitBox post="日" width="100%"><input type="number" inputMode="numeric" min={1} max={90} value={form.days} disabled={ro} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))} style={input} aria-label="体入の日数" /></UnitBox>
        </label>
        <div style={{ minWidth: 0 }}>
          <span style={label}>体入中のバック</span>
          <span data-trial-back="1" style={{ display: "block" }}><SegSelect value={form.back} disabled={ro} onChange={(v) => setForm((f) => ({ ...f, back: v === "none" ? "none" : "same" }))} options={TRIAL_BACK_OPTIONS} ariaLabel="体入中のバック" /></span>
        </div>
      </div>
      <Toast msg={msg} />
      {isOwner && (
        <div className="nox-actions">
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !loaded} data-trial-store-save="1" onClick={() => void save()}>保存</button>
        </div>
      )}
    </section>
  );
}
