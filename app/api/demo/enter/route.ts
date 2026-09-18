// ★夜間便 N7-3（裁定273／277・2026-09-18）: デモ入場。POST（form: biz, role）→ env DEMO_USERS（業態:役割→auth user id）から対象ユーザーを引き、
//   auth admin generateLink(magiclink) → 同じサーバで verifyOtp（token_hash）→ @supabase/ssr が cookie を載せる → 役割の初期画面へ 303。
//   ★資格情報・リンク・token をレスポンスにもログにも出さない。env が無い／対応が無い＝503「デモは準備中です」。
//   ★対象ユーザーが demo org（orgs.is_demo）に属していなければ 403＝env の誤設定で本番ユーザーに入れない。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_BIZ_TYPES, parseDemoUsers } from "@/lib/nox/demo/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["owner", "manager", "cast"] as const;
const NOT_READY = "デモは準備中です";

function plain(status: number, text: string) {
  return new NextResponse(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" } });
}

async function readForm(req: Request): Promise<{ biz: string; role: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as { biz?: unknown; role?: unknown };
    return { biz: String(j.biz ?? ""), role: String(j.role ?? "") };
  }
  const fd = await req.formData().catch(() => null);
  return { biz: String(fd?.get("biz") ?? ""), role: String(fd?.get("role") ?? "") };
}

export async function POST(req: Request) {
  const { biz, role } = await readForm(req);
  if (!(DEMO_BIZ_TYPES as readonly string[]).includes(biz) || !(ROLES as readonly string[]).includes(role)) return plain(400, "業態か役割が正しくありません");
  const map = parseDemoUsers(process.env.DEMO_USERS);
  const authUserId = map?.[`${biz}:${role}`];
  if (!map || !authUserId) return plain(503, NOT_READY);

  const admin = createAdminClient();
  // 対象は demo org のユーザーに限る（env の誤設定で本番ユーザーへ入らない）
  const { data: u } = await admin.from("users").select("org_id").eq("auth_user_id", authUserId).eq("is_active", true).maybeSingle();
  const { data: org } = u ? await admin.from("orgs").select("is_demo").eq("id", u.org_id as string).maybeSingle() : { data: null };
  if (!u || org?.is_demo !== true) return plain(403, "デモ用のユーザーではありません");

  const { data: au, error: eUser } = await admin.auth.admin.getUserById(authUserId);
  const email = au?.user?.email;
  if (eUser || !email) { console.error("demo enter: user lookup failed"); return plain(503, NOT_READY); }
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (eLink || !tokenHash) { console.error("demo enter: link generation failed"); return plain(503, NOT_READY); }

  const supabase = await createClient(); // Route Handler＝cookie を書ける（@supabase/ssr）
  const { error: eOtp } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (eOtp) { console.error("demo enter: verify failed"); return plain(500, "デモに入れませんでした。もう一度お試しください"); }

  const dest = role === "cast" ? "/mine" : "/dashboard";
  return NextResponse.redirect(new URL(dest, req.url), 303);
}
