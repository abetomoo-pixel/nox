"use client";

// ★0201e（裁定481・2026-11-12）: スタッフ管理 › キャストの締めの許可（キャストごと・set_cast_close）。
//   読取＝casts（在籍）と memberships（role cast）を RLS 越しに（owner＝org 全店／manager＝自店）。書込＝set_cast_close（明示の boolean）。
//   締めは「許可 ∧ レジを使える ∧ 出勤中 ∧ 今日の営業日」（RPC の判定）。レジを使えないキャストには、その旨を行に出す。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { CAST_CLOSE_DESC, CAST_CLOSE_RPC, CAST_CLOSE_TITLE, castCloseArgsOf, castCloseRowsOf, type CastCloseCast, type CastCloseMem, type CastCloseRow } from "@/lib/nox/staff/cast-close";

export default function CastClosePanel({ stores }: { stores: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<CastCloseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [cs, ms] = await Promise.all([
      supabase.from("casts").select("id, name, user_id, store_id").eq("is_active", true).order("name"),
      supabase.from("memberships").select("id, user_id, store_id, can_register, cast_can_close").eq("role", "cast").eq("is_active", true),
    ]);
    if (cs.error || ms.error) { setMsg(rpcErrJa((cs.error ?? ms.error)?.message)); setLoaded(true); return; }
    setRows(castCloseRowsOf((cs.data ?? []) as CastCloseCast[], (ms.data ?? []) as CastCloseMem[]));
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(r: CastCloseRow) {
    if (!r.membershipId || busy) return;
    const next = !r.canClose;
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc(CAST_CLOSE_RPC, castCloseArgsOf(r.membershipId, next));
    setBusy(false);
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    setRows((rs) => rs.map((x) => (x.castId === r.castId ? { ...x, canClose: next } : x)));
    setMsg(`${r.name} さんの締めを${next ? "許可しました" : "許可しないにしました"}`);
  }

  const multi = stores.length > 1;
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";
  return (
    <section className="nox-panel" data-cast-close="1" style={{ marginTop: 14 }}>
      <h3>{CAST_CLOSE_TITLE}</h3>
      <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "-4px 0 10px", lineHeight: 1.7 }}>{CAST_CLOSE_DESC}</p>
      <Toast msg={msg} />
      {loaded && rows.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>在籍キャストがいません</p>}
      {rows.map((r) => (
        <div key={r.castId} className="nox-listrow" style={{ padding: "8px 0", fontSize: 13, gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700 }}>{r.name}</span>
          {multi && <span style={{ color: "var(--sub)", fontSize: 12 }}>{storeName(r.storeId)}</span>}
          {r.membershipId && !r.canRegister && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>レジを使えません（キャスト会計の許可で設定）</span>}
          <span style={{ marginLeft: "auto" }}>
            {r.membershipId ? (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5 }}>
                <input type="checkbox" checked={r.canClose} disabled={busy} data-cast-close-toggle="1" onChange={() => void toggle(r)} style={{ width: 18, height: 18, accentColor: "var(--gold)" }} aria-label={`${r.name} さんの締めの許可`} />
                締めを許可
              </label>
            ) : (
              <span style={{ ...t.tag, color: "var(--sub)", borderColor: "var(--line2)" }}>未招待</span>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}
