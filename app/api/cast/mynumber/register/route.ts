// ★0201f（案 1・裁定497-3／499-9）: マイナンバーの登録＝平文 12 桁をサーバーで暗号化して set_cast_sensitive に暗号文を渡す。
//   権限＝管理者・自店の店長（DB の set_cast_sensitive が auth_* で二重に確かめる＝利用者のセッションの client で呼ぶ・service では呼ばない）。
//   デモ org は 403（assertNotDemo）。フラグ false（0201f の前）は 404＝今の画面は RPC を直に呼ぶ。平文はログにも返りにも出さない。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotDemo } from "@/lib/nox/demo/guard";
import { mig0201fOn } from "@/lib/nox/rules-0175/flag";
import { mynumberPlainOf } from "@/lib/nox/mynumber/cipher";
import { encryptMynumberEnv } from "@/lib/nox/mynumber/crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!mig0201fOn()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [{ data: role }, { data: orgId }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_org_id")]);
  if (!orgId || (role !== "owner" && role !== "manager")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await assertNotDemo(orgId as string); if (demo) return demo;

  let body: { castId?: unknown; realName?: unknown; birthday?: unknown; mynumber?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const castId = body.castId;
  if (typeof castId !== "string" || !UUID_RE.test(castId)) return NextResponse.json({ error: "castId required (uuid)" }, { status: 400 });
  const plain = typeof body.mynumber === "string" ? mynumberPlainOf(body.mynumber) : null;
  if (!plain) return NextResponse.json({ error: "bad mynumber" }, { status: 400 });
  const realName = typeof body.realName === "string" ? body.realName : null;
  const birthday = typeof body.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday) ? body.birthday : null;

  let enc: string;
  try { enc = encryptMynumberEnv(plain, castId); }
  catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: m === "mynumber key missing" ? "mynumber key missing" : "encrypt failed" }, { status: m === "mynumber key missing" ? 503 : 500 }); }

  const { data, error } = await supabase.rpc("set_cast_sensitive", { p_cast_id: castId, p_real_name: realName, p_birthday: birthday, p_mynumber: enc });
  if (error) {
    const status = /forbidden|not found/.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, id: data ?? null });
}
