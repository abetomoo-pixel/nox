"use client";

// ★便 ON-3（2026-10-26・0176 ★5 (d)・裁定413）: 店からキャスト 1 人への通知＝cast_notification_create（RPC＝owner／自店 manager／staff）＋紐付いていれば LINE push（POST /api/line/push＝route が service_role で送る・デモ org は送らない）。
//   失敗しても本体の操作（シフトの追加／外し等）は止めない＝戻りで知らせるだけ（console にも残す）。宛先が無い（LINE 未連携）は push を黙って飛ばす（route が 204）。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CastNotifKind } from "./notify-text";
import { lineNotifyKindOfNotif, lineNotifyOnOf } from "../line/notify-kinds"; // ★M-114（裁定459）

export type NotifyResult = { ok: boolean; id: string | null; err: string | null; line: "sent" | "skipped" | "failed" | "none" | "off" };

// ★M-114（裁定459）: キャストの店の設定（settings_json.line_notify）を 1 ページ 1 回だけ読む（castId→store→settings）。読めなければ既定（お知らせだけ ON）
const storeSettingsByCast = new Map<string, Promise<Record<string, unknown> | null>>();
async function lineNotifySettingsOfCast(supabase: SupabaseClient, castId: string): Promise<Record<string, unknown> | null> {
  let p = storeSettingsByCast.get(castId);
  if (!p) {
    p = (async () => {
      const { data: c } = await supabase.from("casts").select("store_id").eq("id", castId).maybeSingle();
      if (!c?.store_id) return null;
      const { data: s } = await supabase.from("stores").select("settings_json").eq("id", c.store_id as string).maybeSingle();
      return (s?.settings_json ?? null) as Record<string, unknown> | null;
    })();
    storeSettingsByCast.set(castId, p);
  }
  return p;
}
/** ★M-114: この通知を LINE でも送るか（店の設定の種類ごと ON／OFF・既定＝シフト系 OFF） */
export async function lineNotifyAllowedOf(supabase: SupabaseClient, castId: string, kind: string, opts?: { remind?: boolean }): Promise<boolean> {
  return lineNotifyOnOf(await lineNotifySettingsOfCast(supabase, castId), lineNotifyKindOfNotif(kind, opts));
}

export async function notifyCast(supabase: SupabaseClient, p: { castId: string; kind: CastNotifKind; body: string; ref?: string | null; line?: boolean; lineKind?: string }): Promise<NotifyResult> { // ★便 C① M-77 ①: lineKind＝LINE 台帳の kind（省略＝kind）
  const { data, error } = await supabase.rpc("cast_notification_create", { p_cast_id: p.castId, p_kind: p.kind, p_body: p.body, p_ref: p.ref ?? null });
  if (error) { console.error(`notify: ${error.message}`); return { ok: false, id: null, err: error.message, line: "none" }; }
  let line: NotifyResult["line"] = "none";
  if (p.line !== false && !(await lineNotifyAllowedOf(supabase, p.castId, p.lineKind ?? p.kind))) line = "off"; // ★M-114（裁定459）: 種類が OFF の店は LINE に送らない（通知の節には残る）
  else if (p.line !== false) {
    try {
      const res = await fetch("/api/line/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ castId: p.castId, text: p.body, kind: p.lineKind ?? p.kind }) });
      line = res.status === 204 ? "skipped" : res.ok ? "sent" : "failed";
    } catch { line = "failed"; }
  }
  return { ok: true, id: typeof data === "string" ? data : null, err: null, line };
}

/** 複数人へ（順に・1 人の失敗で止めない）。戻り＝成功数と失敗の文 */
export async function notifyCasts(supabase: SupabaseClient, castIds: readonly string[], make: (castId: string) => { kind: CastNotifKind; body: string; ref?: string | null; lineKind?: string }): Promise<{ sent: number; failed: string[] }> {
  let sent = 0; const failed: string[] = [];
  for (const id of castIds) {
    const r = await notifyCast(supabase, { castId: id, ...make(id) });
    if (r.ok) sent++; else failed.push(r.err ?? "failed");
  }
  return { sent, failed };
}
