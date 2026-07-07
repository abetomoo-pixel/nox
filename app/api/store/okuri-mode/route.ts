// 店の送り方式（okuri_mode）切替（owner 限定）。set_store_okuri_mode を呼ぶ（RPC が二重防御＝owner のみ・
//   org 照合・p_mode 検証・jsonb_set で settings_json.okuri_mode のみ書換・audit）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { storeId?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { storeId, mode } = body;
  if (typeof storeId !== "string" || !storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  if (mode !== "flat" && mode !== "actual") return NextResponse.json({ error: "mode must be flat|actual" }, { status: 400 });

  const { error } = await supabase.rpc("set_store_okuri_mode", { p_store_id: storeId, p_mode: mode });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ ok: true, mode });
}
