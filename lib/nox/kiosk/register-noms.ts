// ★便 E（2026-11-05・0196 用＝裁定448 §6-4）: 端末セッションのレジ＝卓カードの指名キャスト（kiosk_register_state の checks[].nominations＝0196 で足した）を checkId → cast_id[] に写す。
//   K-0 の包み（kiosk-workspace）は RLS の読取だけで本体を組む＝この 1 本だけ RPC（フラグ false の間は呼ばない＝従来どおり）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { mig0196On } from "@/lib/nox/rules-0175/flag";

export type KioskNomRow = { id: string; nominations?: { cast_id: string }[] };
/** 戻りの形 → checkId → cast_id[]（position 順は RPC が保証） */
export function kioskNomsOf(checks: readonly KioskNomRow[] | null | undefined): Record<string, string[]> {
  return Object.fromEntries((checks ?? []).map((c) => [c.id, (c.nominations ?? []).map((n) => n.cast_id)]));
}
export async function loadKioskNoms(supabase: SupabaseClient): Promise<Record<string, string[]> | undefined> {
  if (!mig0196On()) return undefined;
  const { data } = await supabase.rpc("kiosk_register_state");
  return kioskNomsOf(((data as { checks?: KioskNomRow[] } | null)?.checks ?? []));
}
