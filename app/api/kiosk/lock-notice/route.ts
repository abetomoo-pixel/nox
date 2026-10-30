// ★0190 フラグ true 便 K-1（裁定437・2026-10-30）: レジ端末の PIN が 5 回失敗して 10 分ロックされたとき、店長以上のお知らせ欄に 1 行を置く。
//   呼び手＝端末アカウントのセッション（kiosk-register の doPinLogin が reason 'locked' を受けたとき・失敗しても画面は止めない）。
//   端末アカウントは notices を書けない（auth_org_id() null＝notice_create は forbidden）ため、この route が端末を kiosk_devices で確かめて admin で 1 行 insert する。
//   ① 端末の確認＝kiosk_devices.auth_user_id = セッションの uid かつ is_active（無ければ 403）＝店・org はサーバ導出（クライアント申告を使わない）
//   ② 作成者＝created_by は users.id が必須＝その org の有効なオーナー（memberships role owner）を代筆者にする（無ければ manager・それも無ければ 409）
//   ③ 重複＝同じ端末の同じ案内が直近 10 分にあれば書かない（kiosk_login のロックは 10 分＝1 ロック 1 行）
//   ④ audience は 'staff'（notices_audience_check＝all／cast／staff＝キャストには出さない・店長以上専用の区分は無い＝器なし・第 2 期）。掲載期限 until＝翌日。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lockNoticeTextOf } from "@/lib/nox/kiosk/lock-notice";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: { membership_id?: unknown; locked_until?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const membershipId = typeof body.membership_id === "string" && UUID_RE.test(body.membership_id) ? body.membership_id : null;
  const lockedUntil = typeof body.locked_until === "string" && !Number.isNaN(Date.parse(body.locked_until)) ? body.locked_until : null;
  try {
    const admin = createAdminClient();
    // ① 端末の確認（端末でなければ 403＝fail-closed）
    const { data: dev } = await admin.from("kiosk_devices").select("id, org_id, store_id, label, purpose").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
    if (!dev) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // 操作担当の名前（同じ店の membership だけ・無ければ「操作担当」）
    let opName: string | null = null;
    if (membershipId) {
      const { data: m } = await admin.from("memberships").select("user_id, store_id").eq("id", membershipId).eq("store_id", dev.store_id as string).maybeSingle();
      if (m?.user_id) {
        const { data: u } = await admin.from("users").select("name").eq("id", m.user_id as string).maybeSingle();
        opName = (u?.name as string | null) ?? null;
      }
    }
    // ② 代筆者＝org の有効なオーナー（無ければ manager）
    const { data: writers } = await admin.from("memberships").select("user_id, role").eq("org_id", dev.org_id as string).eq("is_active", true).in("role", ["owner", "manager"]).limit(20);
    const writer = (writers ?? []).find((w) => w.role === "owner") ?? (writers ?? [])[0];
    if (!writer?.user_id) return NextResponse.json({ error: "no writer" }, { status: 409 });
    const text = lockNoticeTextOf({ deviceLabel: (dev.label as string | null) ?? (dev.purpose === "register" ? "レジ端末" : "打刻端末"), operatorName: opName, lockedUntil, now: new Date() });
    // ③ 直近 10 分の重複は書かない
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: dup } = await admin.from("notices").select("id").eq("store_id", dev.store_id as string).eq("title", text.title).gte("created_at", since).limit(1);
    if ((dup ?? []).length > 0) return NextResponse.json({ ok: true, created: false, reason: "duplicate" });
    const { error } = await admin.from("notices").insert({ org_id: dev.org_id, store_id: dev.store_id, title: text.title, body: text.body, audience: "staff", pinned: false, until: text.until, created_by: writer.user_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, created: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
