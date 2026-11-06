// ★M-117（2026-11-06・便 F）: 予約の承認待ちの取得＝ホーム（/api/home/pending＝server の client）と シフト › 今日タブ（browser の client）が同じ 1 本を使う（二重実装しない）。
//   読取＝reservations（RLS＝店の人）＋customers／casts の名前。status='pending'（キャストの申請）。bizDate を渡すとその営業日の booked（承認済み＝緑チップ）も返す。
import type { SupabaseClient } from "@supabase/supabase-js";
import { sortPendingReservations, type PendingReservation } from "./pending";

type Rec = Record<string, unknown>;
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** 営業日（cutoff）の範囲を JST の ISO で */
export function bizDateRangeIsoOf(bizDate: string, cutoffHm: string): { from: string; to: string } {
  const [h, m] = cutoffHm.split(":").map(Number);
  const base = new Date(`${bizDate}T00:00:00+09:00`).getTime() + (h * 60 + m) * 60_000;
  return { from: new Date(base).toISOString(), to: new Date(base + 86_400_000).toISOString() };
}

function rowOf(r: Rec, castName: Map<string, string>): PendingReservation {
  const cu = one(r.customers as Rec | Rec[] | null);
  return {
    id: r.id as string, storeId: r.store_id as string, castId: (r.cast_id as string | null) ?? null, castName: r.cast_id ? castName.get(r.cast_id as string) ?? null : null,
    customerName: (cu?.name as string | null) ?? null, guestName: (r.guest_name as string | null) ?? null, reservedAt: r.reserved_at as string, partySize: (r.party_size as number | null) ?? null,
    nomType: (r.nom_type as string | null) ?? null, status: String(r.status), memo: (r.memo as string | null) ?? null, requestedByCast: !!r.requested_by_cast,
  };
}

/** 承認待ち（店の全部＝来店時刻の近い順）。opts.bizDate＋cutoffHm を渡すとその営業日の pending と booked を返す（今日タブ） */
export async function pendingReservationsOf(supabase: SupabaseClient, storeId: string, opts?: { bizDate?: string; cutoffHm?: string }): Promise<{ pending: PendingReservation[]; booked: PendingReservation[] }> {
  let q = supabase.from("reservations").select("id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type, status, memo, requested_by_cast, customers(name)").eq("store_id", storeId);
  if (opts?.bizDate) { const rg = bizDateRangeIsoOf(opts.bizDate, opts.cutoffHm ?? "06:00"); q = q.in("status", ["pending", "booked"]).gte("reserved_at", rg.from).lt("reserved_at", rg.to); }
  else q = q.eq("status", "pending");
  const { data, error } = await q.order("reserved_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Rec[];
  const castIds = [...new Set(rows.map((r) => r.cast_id as string | null).filter((x): x is string => !!x))];
  const { data: casts } = castIds.length ? await supabase.from("casts").select("id, name").in("id", castIds) : { data: [] as Rec[] };
  const castName = new Map(((casts ?? []) as Rec[]).map((c) => [c.id as string, c.name as string]));
  const all = rows.map((r) => rowOf(r, castName));
  return { pending: sortPendingReservations(all.filter((r) => r.status === "pending")), booked: sortPendingReservations(all.filter((r) => r.status === "booked")) };
}
