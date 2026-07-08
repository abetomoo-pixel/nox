// 支払調書用マイナンバー 完全平文復号（owner 限定）。full 平文は service_role のみ実行可能な
//   get_cast_mynumber を admin（サービスキー）で呼ぶ＝この route が「事業者単位の 支払調書」ゲート。
// 二重ゲート: (1) route で owner を明示検証（cast/manager は到達不可） (2) org はサーバ導出（auth_org_id）を
//   p_org_id に渡し、RPC 内で cast の org 一致を再照合＝他 org の cast は復号不可。復号は RPC が全件 audit。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // 権限: owner のみ（支払調書 = 事業者単位・full 平文は最重要機密＝manager/cast は 403）。
  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  if (role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { castId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const castId = body.castId;
  if (typeof castId !== "string" || !UUID_RE.test(castId)) return NextResponse.json({ error: "castId required (uuid)" }, { status: 400 });

  const admin = createAdminClient();
  const { data: actor, error: eA } = await admin.from("users").select("id").eq("auth_user_id", user.id).single();
  if (eA || !actor) return NextResponse.json({ error: "actor resolve failed" }, { status: 500 });

  // org はサーバ導出（auth_org_id）を渡す＝クライアント申告を使わない。RPC が org 一致を再照合。
  const { data, error } = await admin.rpc("get_cast_mynumber", {
    p_org_id: orgId, p_actor: actor.id, p_cast_id: castId,
  });
  if (error) {
    const status = error.message.includes("forbidden") || error.message.includes("not found") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  // data は復号済み平文 or null（未登録）。ブラウザ表示は呼び出し側で一時的に扱う（保存しない）。
  return NextResponse.json({ mynumber: (data as string | null) ?? null });
}
