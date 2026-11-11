// ★M-160（2026-11-11・Agoora 確定）: スタッフ・店長の「自分のシフト」（ホームのカードと自分の分だけの一覧ページ）のデータ（サーバ）。
//   読む＝staff_shifts（RLS＝本人の行）の確定だけ（確定前の行は本人へ公開しない）と、本人の希望 staff_shift_wishes（出られる＝申請済み）。
//   形は /mine の予定（lib/nox/mine/schedule.ts の scheduleOf）に写して、部品（schedule-card）を確認・辞退のボタンなしで使い回す。シフトの全体の表は見せない。
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleOf, type ScheduleItem, type ScheduleShift, type ScheduleWish } from "@/lib/nox/mine/schedule";
import { bizDateOf } from "@/lib/nox/biz-date";
import { monthAfterOf } from "@/lib/nox/month";

export type MyShiftTab = { month: string; label: string; fixed: ScheduleItem[]; pending: ScheduleItem[]; norm: null };

/** staff_shifts／staff_shift_wishes の行 → scheduleOf の形（確定だけ・希望は出られる日だけ） */
export function myStaffScheduleRowsOf(shifts: readonly { id: string; biz_date: string; start_hm: string; end_hm: string; status: string }[], wishes: readonly { id: string; biz_date: string; available: boolean }[]): { shifts: ScheduleShift[]; wishes: ScheduleWish[] } {
  return {
    shifts: shifts.filter((s) => s.status === "confirmed").map((s) => ({ id: s.id, date: s.biz_date, start_hm: s.start_hm, end_hm: s.end_hm, status: "confirmed" })),
    wishes: wishes.filter((w) => w.available).map((w) => ({ id: w.id, date: w.biz_date, start_hm: null, end_hm: null, status: "pending", kind: "work" })),
  };
}

export async function myStaffScheduleOf(supabase: SupabaseClient, cutoff: string): Promise<{ today: string; tabs: MyShiftTab[] } | null> {
  const { data: mid } = await supabase.rpc("auth_membership_id");
  if (!mid) return null;
  const today = bizDateOf(new Date().toISOString(), cutoff);
  const month = today.slice(0, 7), next = monthAfterOf(month);
  const until = `${monthAfterOf(next)}-01`;
  const [{ data: sh }, { data: wi }] = await Promise.all([
    supabase.from("staff_shifts").select("id, biz_date, start_hm, end_hm, status").eq("staff_id", mid as string).gte("biz_date", today).lt("biz_date", until).order("biz_date"),
    supabase.from("staff_shift_wishes").select("id, biz_date, available").eq("staff_id", mid as string).gte("biz_date", today).lt("biz_date", until),
  ]);
  const rows = myStaffScheduleRowsOf((sh ?? []) as { id: string; biz_date: string; start_hm: string; end_hm: string; status: string }[], (wi ?? []) as { id: string; biz_date: string; available: boolean }[]);
  const tabs = ([[month, "今月"], [next, "来月"]] as const).map(([m, label]) => ({ month: m, label, ...scheduleOf({ ...rows, month: m, today }), norm: null }));
  return { today, tabs };
}
