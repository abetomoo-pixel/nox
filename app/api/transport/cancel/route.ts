// 送り実費取消（manager+）。transport_cancel を呼ぶ（RPC が二重防御＝未天引きのみ許可・audit）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { transportId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const transportId = body.transportId;
  if (typeof transportId !== "string" || !transportId) return NextResponse.json({ error: "transportId required" }, { status: 400 });

  const { data, error } = await supabase.rpc("transport_cancel", { p_transport_id: transportId });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : m.includes("settled") ? 409 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ id: data });
}
