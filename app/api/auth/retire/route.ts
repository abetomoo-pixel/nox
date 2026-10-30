// ★0190（裁定436 ①c）退店の失効＝route 側（2026-10-30）。写経元＝app/api/kiosk/provision の deactivate（kiosk_deactivate RPC → auth ban_duration）。
//   RPC（cast_leave／staff_deactivate＝0190）は is_active=false・staff_pin の削除・kiosk_sessions の終了（end_reason 'retired'）まで済ませる。
//   auth の失効（ban）は service_role が要るので RPC では書けない＝client が RPC 成功の直後にこの route を呼ぶ（casts-board／staff-board）。
//   POST { kind: 'cast'|'staff', id: uuid, mode: 'ban'|'unban' }
//   ① guardManagerUp: セッション → auth_role in ('owner','manager') かつ auth_org_id あり（cast_leave／staff_deactivate が manager 自店を許すのと同じ幅）・デモ org は 403
//   ② admin で対象行を読む: cast＝casts(id, org_id, user_id, is_active)→users(id, auth_user_id) ／ staff＝memberships(id, user_id, is_active)→users(id, org_id, auth_user_id)
//      ★memberships には org_id が無い（0001）＝users.org_id で org を照合する。見つからない・org 不一致＝404
//   ③ ban: 対象行が is_active のままなら 409 'still active'（RPC の後に呼ぶ規約・逆順の誤用を封じる）。
//      同じ user に他の有効な membership／cast が残っていれば ban しない（{ banned:false, reason:'other active role' }＝1 人 2 役・兼務の片方だけ退店）。
//      それ以外は updateUserById(ban_duration '876000h' ≈100 年)＝kiosk の deactivate と同値。★deleteUser ではなく ban（履歴・参照先の保全・unban で復旧可）。
//   ④ unban: ban_duration 'none'（cast_rejoin／staff_reactivate の後）。
//   ⑤ auth_user_id の無い user（招待前・LINE だけ等）＝{ banned:false, reason:'no auth user' }。
//   ★既に発行済みのアクセストークンは期限（≤1h）まで有効＝即時の遮断は RLS／RPC の is_active 照合が担う（ban は次のリフレッシュから）。
//   ★監査: RPC 側の audit_log_write（cast_leave／staff_deactivate）が本体。auth ban は Supabase auth のログ（audit_log_write は内部専用＝route から呼べない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoGuardErr } from "@/lib/nox/demo/guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h"; // ≈100 年（kiosk/provision deactivate と同値）

// owner／manager セッション検証（401/403）＋ org サーバ導出（クライアント申告は使わない）
async function guardManagerUp() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, body: { error: "unauthenticated" } };
  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  if ((role !== "owner" && role !== "manager") || !orgId)
    return { ok: false as const, status: 403, body: { error: "forbidden" } };
  const demo = await demoGuardErr(orgId as string); if (demo) return demo; // デモ org は失効操作不可（RPC 側も demo guard）
  return { ok: true as const, orgId: orgId as string };
}

export async function POST(req: Request) {
  const g = await guardManagerUp();
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });

  let body: { kind?: unknown; id?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const kind = body.kind === "cast" || body.kind === "staff" ? body.kind : null;
  const mode = body.mode === "ban" || body.mode === "unban" ? body.mode : null;
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
  if (!kind) return NextResponse.json({ error: "kind must be cast or staff" }, { status: 400 });
  if (!mode) return NextResponse.json({ error: "mode must be ban or unban" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "id required (uuid)" }, { status: 400 });

  try {
    const admin = createAdminClient();

    // ── ② 対象行 → users（org 照合は admin 読取＝RLS を通らないので必ず自前で） ──
    let userId: string | null = null;
    let subjectActive = false;
    if (kind === "cast") {
      const { data: c } = await admin.from("casts").select("id, org_id, user_id, is_active").eq("id", id).eq("org_id", g.orgId).maybeSingle();
      if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
      userId = (c.user_id as string | null) ?? null;
      subjectActive = c.is_active === true;
    } else {
      const { data: m } = await admin.from("memberships").select("id, user_id, is_active").eq("id", id).maybeSingle();
      if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
      userId = (m.user_id as string | null) ?? null;
      subjectActive = m.is_active === true;
    }
    if (!userId) return NextResponse.json({ ok: true, banned: false, reason: "no auth user" }); // user 紐付けの無い cast（ログインしない源氏名だけの行）
    const { data: u } = await admin.from("users").select("id, org_id, auth_user_id").eq("id", userId).maybeSingle();
    if (!u || u.org_id !== g.orgId) return NextResponse.json({ error: "not found" }, { status: 404 }); // ★memberships は org_id を持たない＝users.org_id で照合
    const authUserId = (u.auth_user_id as string | null) ?? null;
    if (!authUserId) return NextResponse.json({ ok: true, banned: false, reason: "no auth user" });

    // ── ④ unban（復活・再雇用の後） ──
    if (mode === "unban") {
      const { error } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: `auth update failed: ${error.message}` }, { status: 500 });
      return NextResponse.json({ ok: true, banned: false });
    }

    // ── ③ ban（退店・在籍解除の後） ──
    if (subjectActive) return NextResponse.json({ error: "still active" }, { status: 409 }); // RPC の前に呼ばれた＝逆順の誤用
    // 同じ user に他の有効な役が残っていれば ban しない（兼務の片方だけ退店・1 ユーザー 1 アクティブ membership でも cast 行が別に残る形がある）
    const [{ count: memActive }, { count: castActive }] = await Promise.all([
      admin.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true),
      admin.from("casts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true),
    ]);
    if ((memActive ?? 0) > 0 || (castActive ?? 0) > 0)
      return NextResponse.json({ ok: true, banned: false, reason: "other active role" });
    const { error: eBan } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: BAN_FOREVER });
    if (eBan) {
      // 失敗しても is_active=false・staff_pin 削除・kiosk_sessions 終了は RPC で済んでいる＝真の防御は RLS／RPC 側。再実行でリトライ可
      console.error(`[auth/retire] ban 失敗（${kind} は退店済み・再実行でリトライ可） auth_user_id=${authUserId} error=${eBan.message}`);
      return NextResponse.json({ error: `auth update failed: ${eBan.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, banned: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
