// 前借り取消（manager+）。adv_cancel を呼ぶ（RPC が二重防御＝未天引き[open かつ deducted_amount=0]のみ許可・audit）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { advanceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const advanceId = body.advanceId;
  if (typeof advanceId !== "string" || !advanceId) return NextResponse.json({ error: "advanceId required" }, { status: 400 });

  const { data, error } = await supabase.rpc("adv_cancel", { p_advance_id: advanceId });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : m.includes("settled") ? 409 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ id: data });
}
