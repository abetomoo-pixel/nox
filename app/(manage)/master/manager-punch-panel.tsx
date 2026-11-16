"use client";

// ★2026-11-16（■8・店舗設定の作り直し）: 店長の打刻の許可（stores.manager_punch_enabled）のスイッチ＝「シフトと打刻」のタブ。
//   保存＝set_store_manager_punch(p_store_id, p_on)（0201・オーナーだけ＝RPC も auth_role()='owner'・boolean は明示値＝規約 7）。店長は値を見るだけ。
//   0201g の端末の一覧（kiosk_staff_list）は OFF の店では店長を出さない。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import OnOffSeg from "@/components/ui/on-off";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";

export const MANAGER_PUNCH_NOTE = "ON にすると、店長も出退勤の打刻をします（店の端末の名前の一覧にも出ます）。OFF の店では店長は打刻しません。";

export default function ManagerPunchPanel({ stores, isOwner }: { stores: { id: string; name: string }[]; isOwner: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data, error } = await createClient().from("stores").select("manager_punch_enabled").eq("id", storeSel).maybeSingle();
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    setCur((data as { manager_punch_enabled?: boolean } | null)?.manager_punch_enabled === true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);
  async function save(v: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("set_store_manager_punch", { p_store_id: storeSel, p_on: v });
    setBusy(false);
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    setMsg(v ? "店長の打刻を ON にしました" : "店長の打刻を OFF にしました");
    await load();
  }
  return (
    <section className="nox-cardtop" style={{ ...t.card, marginTop: 14 }} data-manager-punch="1">
      <h3 style={t.cardTitle}>店長の打刻</h3>
      {stores.length > 1 && (
        <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...t.input, width: "auto", marginBottom: 10 }} aria-label="店舗">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <OnOffSeg value={cur === true} onChange={(x) => { if (isOwner && cur !== null && (x === true) !== cur) void save(x === true); }} ariaLabel="店長の打刻" disabled={!isOwner || busy || cur === null} />
        {!isOwner && <span style={{ fontSize: 12, color: "var(--sub)" }}>（変更はオーナーが行います）</span>}
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0", lineHeight: 1.7 }}>{MANAGER_PUNCH_NOTE}</p>
      <Toast msg={msg} />
    </section>
  );
}
