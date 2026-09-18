"use client";

// ★mig0144（店舗設定の統合 setter＝set_store_profile）: /master/business-hours の先頭に置く 2 節。
//   ① 店舗情報（owner のみ表示）: 店舗名（name・必須 1..50）／略称（short・0..20）／店舗コード（store_code・0..20）／
//      表示名（display_name・0..50）。保存は変更分だけを patch で渡す（触っていないキーは送らない）。
//   ② シフト運用: キャスト確認トグル（shift_cast_confirm・既定 OFF・裁定245-1）。owner は切替・manager は現在値のみ。
//   読みは stores の直読（RLS 越し・owner は org 全店／manager は自店 1 件）。キー無しは既定（''／false）に倒す。
//   保存後は同じ select で再取得して現値を表示。エラーは storeProfileErrJa で日本語へ。
//   配置＝保存ボタンは .nox-actions で中央（裁定244）・トグルは切替＝例外。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import StoreFlagToggle, { storeProfileErrJa } from "./store-flag-toggle";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Store = { id: string; name: string };
type Profile = { name: string; short: string; store_code: string; display_name: string; shift_cast_confirm: boolean };
const EMPTY: Profile = { name: "", short: "", store_code: "", display_name: "", shift_cast_confirm: false };

const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { ...t.fieldLabel, display: "block", marginBottom: 4 };

export default function StoreProfilePanel({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<Profile>(EMPTY);   // サーバ現値
  const [form, setForm] = useState<Profile>(EMPTY); // 入力中
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("stores").select("name, short, settings_json").eq("id", storeSel).single();
    if (error) { setMsg(`読み込みに失敗: ${error.message}`); return; }
    const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
    const p: Profile = {
      name: typeof data?.name === "string" ? data.name : "",
      short: typeof data?.short === "string" ? data.short : "",
      store_code: typeof sj.store_code === "string" ? sj.store_code : "",
      display_name: typeof sj.display_name === "string" ? sj.display_name : "",
      shift_cast_confirm: sj.shift_cast_confirm === true,
    };
    setCur(p); setForm(p); setLoaded(true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  // 変更分だけを patch に（trim 後の比較・空欄は '' のまま送る＝short は RPC 側で null 化）
  const patchOf = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of ["name", "short", "store_code", "display_name"] as const) {
      const v = form[k].trim();
      if (v !== cur[k]) out[k] = v;
    }
    return out;
  };
  const dirty = Object.keys(patchOf()).length > 0;

  async function save() {
    const patch = patchOf();
    if (!Object.keys(patch).length) { setMsg("変更がありません"); return; }
    if ("name" in patch && (patch.name.length < 1 || patch.name.length > 50)) { setMsg("店舗名は 1〜50 文字で入力してください"); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeSel, p_patch: patch });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setMsg("店舗情報を保存しました");
    await load();
  }

  const field = (k: "name" | "short" | "store_code" | "display_name", lbl: string, max: number, hint: string) => (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={label}>{lbl}<span style={{ fontWeight: 400, marginLeft: 6 }}>{hint}</span></span>
      <input value={form[k]} maxLength={max} disabled={busy || !loaded}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={input} aria-label={lbl} />
    </label>
  );

  return (
    <>
      {isOwner && (
        <section className="nox-cardtop" style={t.card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h2 style={{ ...secTitle, margin: 0 }}>店舗情報</h2>
              <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>店舗名・略称・店舗コード・表示名。変更した項目だけを保存します（オーナーのみ）。</p>
            </div>
            {stores.length > 1 && (
              <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "auto" }} aria-label="店舗">
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {field("name", "店舗名", 50, "必須・50 文字まで")}
            {field("short", "略称", 20, "20 文字まで")}
            {field("store_code", "店舗コード", 20, "20 文字まで")}
            {field("display_name", "表示名", 50, "50 文字まで")}
          </div>
          {msg && (
            <Toast msg={msg} style={{ margin: "10px 0 0" }} />
          )}
          <div className="nox-actions" style={{ marginTop: 12 }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !dirty} onClick={() => { setForm(cur); setMsg(null); }}>元に戻す</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !dirty || !loaded} onClick={() => void save()}>店舗情報を保存</button>
          </div>
        </section>
      )}

      {/* ★裁定245-1: キャスト確認の任意化（settings_json.shift_cast_confirm・既定 OFF）。shift/page.tsx が読む */}
      <section className="nox-cardtop" style={t.card}>
        <h2 style={{ ...secTitle, margin: "0 0 8px" }}>シフト運用</h2>
        {loaded && (
          <StoreFlagToggle key={`${storeSel}:${cur.shift_cast_confirm}`} storeId={storeSel} flagKey="shift_cast_confirm" isOwner={isOwner}
            label="キャスト確認"
            desc="ONにすると、承認後にキャストの確認を挟みます。OFF の店は承認した時点で確定できます"
            initial={cur.shift_cast_confirm} onSaved={() => load()} />
        )}
      </section>
    </>
  );
}
