// ★0201f（案 1）: マイナンバーの末尾 4 桁＝get_cast_mynumber_masked(p_org_id, p_actor, p_cast_id)（service_role だけ・権限＝管理者／自店の店長／本人を DB が確かめる）→ サーバーで復号 → 末尾 4 桁だけ返す。
//   org はサーバー導出（auth_org_id）・呼ぶ人は users.id（app/api/cast/mynumber/route.ts と同じ引き方）。forbidden は 403・デモ org は 403。フラグ false は 404。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotDemo } from "@/lib/nox/demo/guard";
import { mig0201fOn } from "@/lib/nox/rules-0175/flag";
import { mynumberMaskedOf } from "@/lib/nox/mynumber/cipher";
import { decryptMynumberEnv } from "@/lib/nox/mynumber/crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!mig0201fOn()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: orgId } = await supabase.rpc("auth_org_id");
  if (!orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const demo = await assertNotDemo(orgId as string); if (demo) return demo;

  let body: { castId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const castId = body.castId;
  if (typeof castId !== "string" || !UUID_RE.test(castId)) return NextResponse.json({ error: "castId required (uuid)" }, { status: 400 });

  const admin = createAdminClient();
  const { data: actor, error: eA } = await admin.from("users").select("id").eq("auth_user_id", user.id).single();
  if (eA || !actor) return NextResponse.json({ error: "actor resolve failed" }, { status: 500 });
  const { data, error } = await admin.rpc("get_cast_mynumber_masked", { p_org_id: orgId, p_actor: actor.id, p_cast_id: castId });
  if (error) return NextResponse.json({ error: error.message }, { status: /forbidden|not found/.test(error.message) ? 403 : 500 });
  if (typeof data !== "string") return NextResponse.json({ masked: null });
  try { return NextResponse.json({ masked: mynumberMaskedOf(decryptMynumberEnv(data, castId)) }); }
  catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: m === "mynumber key missing" ? "mynumber key missing" : "decrypt failed" }, { status: m === "mynumber key missing" ? 503 : 500 }); }
}
