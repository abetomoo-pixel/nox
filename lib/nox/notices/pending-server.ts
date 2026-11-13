// ★0201i（裁定486・2026-11-13 画面の便 2）: スタッフ・店長（宛先のとき）の未確認・未回答の数（server・RLS）。ナビの「お知らせ（N）」とホームの 1 行。
import type { SupabaseClient } from "@supabase/supabase-js";
import { noticeAudienceHasOf, noticePendingCountOf, type MyResponse, type RsvpAnswer } from "@/lib/nox/notices/response";

export async function staffNoticePendingOf(supabase: SupabaseClient, role: string): Promise<number> {
  if (role !== "staff" && role !== "manager") return 0;
  const { data: mid } = await supabase.rpc("auth_membership_id");
  if (!mid) return 0;
  const [{ data: nr }, { data: rr }] = await Promise.all([
    supabase.from("notices").select("id, audience, cast_ids, staff_ids, rsvp, rsvp_at, rsvp_due"),
    supabase.from("notice_responses").select("notice_id, acked_at, rsvp").eq("subject_kind", "membership").eq("subject_id", mid as string),
  ]);
  const mine = new Map(((rr ?? []) as { notice_id: string; acked_at: string | null; rsvp: RsvpAnswer | null }[]).map((r) => [r.notice_id, { acked_at: r.acked_at, rsvp: r.rsvp } as MyResponse]));
  const vis = ((nr ?? []) as { id: string; audience: string; cast_ids: string[] | null; staff_ids: string[] | null; rsvp: boolean; rsvp_at: string | null; rsvp_due: string | null }[])
    .filter((n) => noticeAudienceHasOf(n, { kind: "membership", role, membershipId: mid as string }));
  return noticePendingCountOf(vis, mine, Date.now());
}
