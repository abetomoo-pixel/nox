// ★便 M5 M-42（2026-10-30）: キオスク（人を選ぶ・打刻）のキャスト／操作担当の写真＝署名 URL をまとめて返す（読取だけ・DB 書込なし）。
//   原因（読取）: ①kiosk_cast_list／kiosk_operator_list は photo_updated_at を返さない ②端末アカウントは users/memberships 非連動＝auth_org_id() が null＝
//   storage の cast-photos の SELECT ポリシー（org のフォルダ＝auth_org_id()）に当たらず、端末のセッションでは createSignedUrls が発行できない。
//   処置＝本 route が端末を kiosk_devices.auth_user_id で確かめ（無ければ 403・用途は問わない）、admin で自店の有効なキャスト（casts.photo_updated_at）と
//   操作担当（memberships→users.photo_updated_at）を読み、本体画面と同じ関数（signCastPhotos／signUserPhotos＝同じバケット・同じパス・同じ v= 付き URL）で署名して返す。
//   画面は本体と同じ部品 CastAvatar に url を渡すだけ。写真の実体を返さない・1 時間で失効（本体と同じ expiresIn）。デモ org も可（読取のみ）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signCastPhotos } from "@/lib/nox/cast-photo";
import { signUserPhotos } from "@/lib/nox/staff-photo";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const { data: dev } = await admin.from("kiosk_devices").select("org_id, store_id, purpose").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
    if (!dev) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const orgId = dev.org_id as string, storeId = dev.store_id as string;
    const [{ data: casts }, { data: mems }] = await Promise.all([
      admin.from("casts").select("id, photo_updated_at").eq("store_id", storeId).eq("is_active", true),
      admin.from("memberships").select("id, user_id").eq("store_id", storeId).eq("is_active", true),
    ]);
    const userIds = [...new Set(((mems ?? []) as { user_id: string }[]).map((m) => m.user_id))];
    const { data: users } = userIds.length ? await admin.from("users").select("id, photo_updated_at").in("id", userIds) : { data: [] as { id: string; photo_updated_at: string | null }[] };
    const [castMap, userMap] = await Promise.all([
      signCastPhotos(admin, orgId, (casts ?? []) as { id: string; photo_updated_at: string | null }[]),
      signUserPhotos(admin, orgId, (users ?? []) as { id: string; photo_updated_at: string | null }[]),
    ]);
    const operators: Record<string, string> = {};
    for (const m of (mems ?? []) as { id: string; user_id: string }[]) { const u = userMap.get(m.user_id); if (u) operators[m.id] = u; }
    return NextResponse.json({ casts: Object.fromEntries(castMap), operators }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
