"use client";

// ★mig0144（店舗設定の統合 setter＝set_store_profile・白名単 8 キーの patch 型・owner 限定）:
//   boolean 1 キーのトグル（ext_shimei_enabled／dohan_auto_hon／shift_cast_confirm）を 1 つの部品で描く。
//   書込は set_store_profile に {key: boolean} の 1 キー patch だけを渡す（他キーは触らない）。
//   owner 以外は現在値のみ（RPC も auth_role()<>'owner' で forbidden＝表示ゲートは二重防御の外側）。
//   配置＝切替（.nox-seg）は裁定244 の例外（中央化しない）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
export type StoreFlagKey = "ext_shimei_enabled" | "dohan_auto_hon" | "shift_cast_confirm" | "show_open_status";

/** set_store_profile の raise 文言 → 日本語（bad name 等は入力欄の制約・forbidden は owner 限定） */
export function storeProfileErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad name")) return "店舗名は 1〜50 文字で入力してください";
  if (msg.includes("bad short")) return "略称は 20 文字以内で入力してください";
  if (msg.includes("bad store_code")) return "店舗コードは 20 文字以内で入力してください";
  if (msg.includes("bad display_name")) return "表示名は 50 文字以内で入力してください";
  if (msg.includes("bad key")) return "送信内容に設定できない項目が含まれています";
  if (msg.includes("bad type")) return "送信内容の形式が不正です";
  if (msg.includes("bad patch")) return "変更がありません";
  if (msg.includes("billing locked")) return "課金の状態により設定を変更できません";
  if (msg.includes("forbidden")) return "権限がありません（オーナーのみ変更できます）";
  return msg;
}

export default function StoreFlagToggle({
  storeId, flagKey, label, desc, initial, isOwner, onSaved,
}: {
  storeId: string;
  flagKey: StoreFlagKey;
  label: string;
  desc?: string;
  initial: boolean;
  isOwner: boolean;
  onSaved?: (next: boolean) => void | Promise<void>;
}) {
  const supabase = createClient();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function switchTo(next: boolean) {
    if (next === on || busy || !storeId) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { [flagKey]: next } });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setOn(next);
    setMsg(`${label}を「${next ? "ON" : "OFF"}」にしました`);
    await onSaved?.(next);
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
        {desc && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{desc}</p>}
        {msg && <Toast msg={msg} style={{ margin: "6px 0 0" }} />}
      </div>
      {isOwner ? (
        <div className="nox-seg" role="group" aria-label={label}>
          <button type="button" className={!on ? "on" : ""} disabled={busy} onClick={() => void switchTo(false)}>OFF</button>
          <button type="button" className={on ? "on" : ""} disabled={busy} onClick={() => void switchTo(true)}>ON</button>
        </div>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <b style={{ color: on ? "var(--ok)" : "var(--sub)" }}>{on ? "ON" : "OFF"}</b>
          <span className="nox-stpill">オーナーのみ変更できます</span>
        </span>
      )}
    </div>
  );
}
