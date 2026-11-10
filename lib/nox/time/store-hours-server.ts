// ★M-145（2026-11-10 夜便）: シェルが時刻の選択の既定（営業開始・営業終了・切替時刻）を読む＝今日の営業日の曜日の store_business_hours と settings_json.biz_cutoff_hm。
//   読めなければ null（部品は従来どおり）。server 専用（layout から呼ぶ）。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreHours } from "@/components/ui/store-hours-context";

export async function storeHoursOf(supabase: SupabaseClient, storeId: string | null | undefined): Promise<StoreHours> {
  const none: StoreHours = { open: null, close: null, cutoff: "06:00" };
  if (!storeId) return none;
  try {
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
    const sj = ((st as { settings_json?: Record<string, unknown> } | null)?.settings_json ?? {}) as Record<string, unknown>;
    const cutoff = typeof sj.biz_cutoff_hm === "string" && /^\d{2}:\d{2}$/.test(sj.biz_cutoff_hm) ? sj.biz_cutoff_hm : "06:00";
    // 今日の営業日の曜日（JST から切替時刻を引いた日）
    const now = new Date(Date.now() + 9 * 3600_000);
    const [ch, cm] = cutoff.split(":").map(Number);
    const biz = new Date(now.getTime() - (ch * 60 + cm) * 60_000);
    const dow = biz.getUTCDay();
    const { data: bh } = await supabase.from("store_business_hours").select("is_closed, open_hm, close_hm").eq("store_id", storeId).eq("dow", dow).maybeSingle();
    const row = bh as { is_closed?: boolean; open_hm?: string | null; close_hm?: string | null } | null;
    if (!row || row.is_closed) return { ...none, cutoff };
    const open = row.open_hm ? row.open_hm.slice(0, 5) : null;
    let close = row.close_hm ? row.close_hm.slice(0, 5) : null;
    // 終了が開始以下（01:00 で保存された古い行）は翌日＝24 時超に（M-147 と同じ規則）
    if (open && close) { const o = Number(open.slice(0, 2)) * 60 + Number(open.slice(3)); const c = Number(close.slice(0, 2)) * 60 + Number(close.slice(3)); if (c <= o && c < 1440) close = `${String(Math.floor((c + 1440) / 60)).padStart(2, "0")}:${close.slice(3)}`; }
    return { open, close, cutoff };
  } catch {
    return none;
  }
}
