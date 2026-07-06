// 出勤インセンティブ取消（manager+）。ユーザー文脈クライアントで incentive_cancel を呼ぶ
//   （RPC が二重防御＝manager+ 検証・org 照合・paid 期間ガード・status flip・audit）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { incentiveId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const incentiveId = body.incentiveId;
  if (typeof incentiveId !== "string" || !incentiveId) return NextResponse.json({ error: "incentiveId required" }, { status: 400 });

  const { data, error } = await supabase.rpc("incentive_cancel", { p_incentive_id: incentiveId });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : m.includes("paid period") ? 409 : m.includes("not published") ? 409 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ id: data });
}
