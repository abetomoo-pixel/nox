// キオスク端末アカウント発行/無効化（F4a・mig0043 kiosk_provision/kiosk_deactivate と対）。
// cast/invite route を正本に同型（owner 専用・合成 email・初期PW一度返し・補償 deleteUser）。
// provision:
//   ① owner セッション検証（401→400→403・org はサーバ導出＝クライアント申告を使わない）
//   ② 合成 email k-<idem8>@o-<org8>.nox.local（cast の c- と同系・送信不能予約ドメイン）
//      ★idem8 は idemKey 先頭から導出＝同一 idemKey の再送で同一 email → createUser 重複 409 が
//        リプレイ検知を兼ねる（kiosk は users 行を作らないため cast/invite の users 先引きは使えない）
//   ③ admin.createUser（email_confirm:true・初期PW16字CSPRNG・レスポンスで一度だけ返す）
//   ④ kiosk_provision RPC を呼び出しユーザーのセッションで実行（owner/org/1店1台/bad target は RPC 内で二重防御）
//   ⑤ ★補償: RPC 失敗時は deleteUser で auth user を巻き戻す（孤児残存はログに残して握り潰さない）
// deactivate:
//   kiosk_deactivate RPC（owner 限定・is_active=false＝kiosk_punch/kiosk_cast_list が即 forbidden/0行）
//   → auth 側は ban_duration 適用（★deleteUser ではなく ban 採用: auth 履歴と kiosk_devices.auth_user_id の
//     参照先を保全・誤操作時は unban で復旧可・真の防御は kiosk_devices.is_active＝RPC 毎回照合）。
// GET: owner 専用の端末一覧（kiosk_devices は deny-all のため owner でも直 SELECT 不可＝
//   この route が admin で読んで返す唯一の管理用読み口。master のキオスク管理セクションが使う）。
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 紛らわしい文字（0/O・1/l/I）を除いた英数＋記号・randomInt は CSPRNG（cast/invite と同一）
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
function genPassword(len = 16): string {
  let out = "";
  for (let i = 0; i < len; i++) out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  return out;
}

// 合成 email: k-<8桁>@o-<org先頭8桁>.nox.local（kiosk 用 k- プレフィクス）
function syntheticEmail(orgId: string, seed: string): string {
  return `k-${seed.replace(/-/g, "").slice(0, 8).toLowerCase()}@o-${orgId.replace(/-/g, "").slice(0, 8)}.nox.local`;
}

// owner セッション検証（401/403）＋ org サーバ導出。POST/GET 共通。
async function guardOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, body: { error: "unauthenticated" } };
  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  if (role !== "owner" || !orgId)
    return { ok: false as const, status: 403, body: { error: "forbidden" } };
  return { ok: true as const, supabase, orgId: orgId as string };
}

export async function GET() {
  const g = await guardOwner();
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("kiosk_devices")
      .select("id, store_id, label, is_active, created_at")
      .eq("org_id", g.orgId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ devices: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardOwner();
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });

  let body: { action?: unknown; storeId?: unknown; label?: unknown; idemKey?: unknown; deviceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // ── deactivate 分岐 ──
    if (body.action === "deactivate") {
      const deviceId = body.deviceId;
      if (typeof deviceId !== "string" || !UUID_RE.test(deviceId))
        return NextResponse.json({ error: "deviceId required (uuid)" }, { status: 400 });
      // auth_user_id を先引き（RPC 成功後に ban する対象）
      const { data: dev } = await admin
        .from("kiosk_devices")
        .select("auth_user_id")
        .eq("id", deviceId)
        .eq("org_id", g.orgId)
        .single();
      const { error: eRpc } = await g.supabase.rpc("kiosk_deactivate", { p_device_id: deviceId });
      if (eRpc) {
        const m = eRpc.message;
        const status = m.includes("forbidden") ? 403 : m.includes("not found") ? 404 : 500;
        return NextResponse.json({ error: m }, { status });
      }
      // auth 側 ban（≈100年）。失敗しても kiosk_devices.is_active=false が真の防御＝再実行で ban リトライ可。
      if (dev?.auth_user_id) {
        const { error: eBan } = await admin.auth.admin.updateUserById(dev.auth_user_id as string, {
          ban_duration: "876000h",
        });
        if (eBan) {
          console.error(`[kiosk/provision] deactivate: auth ban 失敗（device は無効化済み・再実行でリトライ可） auth_user_id=${dev.auth_user_id} error=${eBan.message}`);
          return NextResponse.json({ deactivated: true, auth_banned: false, warn: `auth ban failed: ${eBan.message}` });
        }
      }
      return NextResponse.json({ deactivated: true, auth_banned: true });
    }

    // ── provision 分岐 ──
    if (body.action !== "provision")
      return NextResponse.json({ error: "action must be provision or deactivate" }, { status: 400 });
    const storeId = body.storeId;
    if (typeof storeId !== "string" || !UUID_RE.test(storeId))
      return NextResponse.json({ error: "storeId required (uuid)" }, { status: 400 });
    if (typeof body.idemKey !== "string" || !UUID_RE.test(body.idemKey))
      return NextResponse.json({ error: "idemKey required (uuid)" }, { status: 400 });
    const label =
      typeof body.label === "string" && body.label.trim().length > 0 ? body.label.trim().slice(0, 100) : null;

    // 合成 email（idemKey 由来＝再送で同一 email → createUser 重複がリプレイ検知を兼ねる）
    const loginEmail = syntheticEmail(g.orgId, body.idemKey);
    const password = genPassword();
    const { data: cu, error: eCu } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
    });
    if (eCu || !cu?.user) {
      if (/already|registered|exists/i.test(eCu?.message ?? ""))
        return NextResponse.json({ error: "already processed (idemKey replay)" }, { status: 409 });
      return NextResponse.json({ error: `auth create failed: ${eCu?.message}` }, { status: 500 });
    }
    const authUserId = cu.user.id;

    // kiosk_provision RPC（owner セッション＝owner/org/1店1台/bad target は RPC 内で完結・二重防御）
    const { data: deviceId, error: eRpc } = await g.supabase.rpc("kiosk_provision", {
      p_auth_user_id: authUserId,
      p_store_id: storeId,
      p_label: label,
    });
    if (eRpc) {
      // 補償: 今回作った auth user を巻き戻す
      const { error: eDel } = await admin.auth.admin.deleteUser(authUserId);
      if (eDel) {
        console.error(`[kiosk/provision] 補償失敗: auth user 孤児が残存 auth_user_id=${authUserId} email=${loginEmail} 削除エラー=${eDel.message}`);
      }
      const m = eRpc.message;
      const status = m.includes("forbidden")
        ? 403
        : m.includes("already provisioned")
          ? 409
          : m.includes("bad")
            ? 400
            : 500;
      return NextResponse.json({ error: m }, { status });
    }

    // initial_password はこのレスポンス一度だけ（DB に平文は残らない）
    return NextResponse.json({
      device_id: deviceId,
      login_email: loginEmail,
      initial_password: password,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
