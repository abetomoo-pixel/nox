// ★夜間便 N7-3（裁定273／277・2026-09-18）→ ★裁定328 追補1 ②③⑤（便 D1・2026-10-02）: デモ入場。POST（form: store, role）→
//   env DEMO_USERS（店:役割→auth user id）から対象ユーザーを引き、auth admin generateLink(magiclink) → 同じサーバで verifyOtp（token_hash）→
//   @supabase/ssr が cookie を載せる → 役割の初期画面へ 303。パスワード／メール入力なし・メールは送らない（magiclink はサーバ内で消費）。
//   ★店 6（muse／luna／noir／ace／lily／nest）× 役割 4（owner／manager／staff／cast）＋ kiosk（店ごとの固定端末ユーザー→/kiosk）。
//   ★資格情報・リンク・token をレスポンスにもログにも出さない。env が無い／対応が無い＝503「デモは準備中です」。
//   ★対象ユーザーが demo org（orgs.is_demo）に属していなければ 403＝env の誤設定で本番ユーザーに入れない（kiosk は kiosk_devices の org で判定）。
//   ★入場ログ＝demo_entries（0163）へ service で 1 行（表が無い間は no-op・失敗しても入場は止めない）。
//   ★セッション 24 時間＝★D2-b（328 追補4）: Free は refresh token が無期限のため、本 route が httpOnly cookie nox_demo_until（入場＋24h）を置き、
//     middleware（lib/supabase/middleware.ts）がデモユーザー（DEMO_USERS の auth user id）かつ期限切れ／欠落なら signOut → /demo?expired=1（lib/nox/demo/session.ts）。
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_KIOSK_KEY, demoDestOf, isDemoRole, isDemoStore, parseDemoUsers } from "@/lib/nox/demo/seed";
import { DEMO_UNTIL_COOKIE, demoUntilCookieOptions, demoUntilValue } from "@/lib/nox/demo/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_READY = "デモは準備中です";

function plain(status: number, text: string) {
  return new NextResponse(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" } });
}

async function readForm(req: Request): Promise<{ store: string; role: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as { store?: unknown; biz?: unknown; role?: unknown };
    return { store: String(j.store ?? j.biz ?? ""), role: String(j.role ?? "") };
  }
  const fd = await req.formData().catch(() => null);
  return { store: String(fd?.get("store") ?? fd?.get("biz") ?? ""), role: String(fd?.get("role") ?? "") };
}

/** 入場ログ（0163 demo_entries）。表が無い（42P01）間は no-op。IP は sha256 の先頭 16 桁だけ（裁定293-7・30 日で purge） */
async function logEntry(admin: ReturnType<typeof createAdminClient>, orgId: string, store: string, role: string, req: Request): Promise<void> {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
    const { error } = await admin.from("demo_entries").insert({ org_id: orgId, store_code: store, role, ip_hash: ipHash, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null });
    if (error && !/demo_entries|schema cache|42P01/.test(error.message)) console.error(`demo enter: log failed ${error.message}`);
  } catch { /* 入場は止めない */ }
}

export async function POST(req: Request) {
  const { store, role } = await readForm(req);
  if (!isDemoStore(store) || !(isDemoRole(role) || role === DEMO_KIOSK_KEY)) return plain(400, "店か役割が正しくありません");
  const map = parseDemoUsers(process.env.DEMO_USERS);
  const authUserId = map?.[`${store}:${role}`];
  if (!map || !authUserId) return plain(503, NOT_READY);

  const admin = createAdminClient();
  // 対象は demo org のユーザーに限る（env の誤設定で本番ユーザーへ入らない）。kiosk は kiosk_devices.auth_user_id の org で判定
  let orgId: string | null = null;
  if (role === DEMO_KIOSK_KEY) {
    const { data: d } = await admin.from("kiosk_devices").select("org_id").eq("auth_user_id", authUserId).eq("is_active", true).maybeSingle();
    orgId = (d?.org_id as string | undefined) ?? null;
  } else {
    const { data: u } = await admin.from("users").select("org_id").eq("auth_user_id", authUserId).eq("is_active", true).maybeSingle();
    orgId = (u?.org_id as string | undefined) ?? null;
  }
  const { data: org } = orgId ? await admin.from("orgs").select("is_demo").eq("id", orgId).maybeSingle() : { data: null };
  if (!orgId || org?.is_demo !== true) return plain(403, "デモ用のユーザーではありません");

  const { data: au, error: eUser } = await admin.auth.admin.getUserById(authUserId);
  const email = au?.user?.email;
  if (eUser || !email) { console.error("demo enter: user lookup failed"); return plain(503, NOT_READY); }
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (eLink || !tokenHash) { console.error("demo enter: link generation failed"); return plain(503, NOT_READY); }

  const supabase = await createClient(); // Route Handler＝cookie を書ける（@supabase/ssr）
  const { error: eOtp } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (eOtp) { console.error("demo enter: verify failed"); return plain(500, "デモに入れませんでした。もう一度お試しください"); }

  await logEntry(admin, orgId, store, role, req);
  const res = NextResponse.redirect(new URL(demoDestOf(role as "owner" | "manager" | "staff" | "cast" | typeof DEMO_KIOSK_KEY), req.url), 303);
  // ★D2-b（328 追補4）: デモのセッション期限＝入場＋24h（httpOnly・Secure（https）・SameSite=Lax・path=/）。値は epoch ms＝資格情報ではない
  res.cookies.set(DEMO_UNTIL_COOKIE, demoUntilValue(Date.now()), demoUntilCookieOptions(new URL(req.url).protocol === "https:"));
  return res;
}
