// 前借り発行（manager+）。ユーザー文脈クライアントで adv_issue を呼ぶ（RPC が二重防御＝manager+ 検証・
//   org 照合・paid 期間ガード・cast org+store 照合・audit）。route は薄い認証＋入力整形＋エラーマッピングのみ。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { storeId?: unknown; castId?: unknown; amount?: unknown; advancedOn?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { storeId, castId, amount, advancedOn, note } = body;
  if (typeof storeId !== "string" || !storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  if (typeof castId !== "string" || !castId) return NextResponse.json({ error: "castId required" }, { status: 400 });
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
  if (typeof advancedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(advancedOn)) return NextResponse.json({ error: "advancedOn must be YYYY-MM-DD" }, { status: 400 });
  const noteVal = typeof note === "string" ? note : null;

  const { data, error } = await supabase.rpc("adv_issue", {
    p_store_id: storeId, p_cast_id: castId, p_amount: amount, p_advanced_on: advancedOn, p_note: noteVal,
  });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : m.includes("paid period") ? 409 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ id: data });
}
