// ★裁定302／304（2026-09-25・mig0157）: 送り実費の一括発行（manager+）。ユーザー文脈クライアントで transport_issue_bulk を呼ぶ
//   （RPC が二重防御＝店 org 照合・role・okuri_mode='actual'（1 回）・件ごと amount／biz_date／paid period／cast・'duplicate cast'・件ごと idem・1 tx・audit）。
//   route は薄い認証＋入力整形＋エラーマッピングのみ（/api/transport/issue と同型）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Item = { cast_id: string; amount: number; date: string; note: string | null };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { storeId?: unknown; date?: unknown; note?: unknown; idemKey?: unknown; items?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const { storeId, date, note, idemKey, items } = body;
  if (typeof storeId !== "string" || !storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  if (typeof idemKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idemKey)) return NextResponse.json({ error: "bad idem" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "bad items" }, { status: 400 });
  const noteVal = typeof note === "string" && note.trim() !== "" ? note.trim() : null;
  const pItems: Item[] = [];
  for (const it of items as unknown[]) {
    const o = it as { castId?: unknown; amount?: unknown };
    if (typeof o.castId !== "string" || !o.castId) return NextResponse.json({ error: "castId required" }, { status: 400 });
    if (typeof o.amount !== "number" || !Number.isInteger(o.amount) || o.amount <= 0) return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
    pItems.push({ cast_id: o.castId, amount: o.amount, date, note: noteVal });
  }

  const { data, error } = await supabase.rpc("transport_issue_bulk", { p_store_id: storeId, p_items: pItems, p_idem_key: idemKey });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403 : (m.includes("paid period") || m.includes("duplicate cast") || m.includes("okuri not actual")) ? 409 : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ ids: data });
}
