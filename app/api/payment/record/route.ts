// 支払記録の追加（manager+）。ユーザー文脈クライアントで payment_record_add を呼ぶ（RPC が二重防御＝
//   manager+ 検証・org/store 照合・run finalized ガード・Σ paid_amount ≤ net・冪等キー・payslip 行ロック・audit）。
//   route は薄い認証＋入力整形＋エラーマッピングのみ（金額判定・上限は DB 側で再計算＝クライアント値を信用しない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { runId?: unknown; castId?: unknown; amount?: unknown; paidAt?: unknown; method?: unknown; note?: unknown; idemKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { runId, castId, amount, paidAt, method, note, idemKey } = body;
  if (typeof runId !== "string" || !runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  if (typeof castId !== "string" || !castId) return NextResponse.json({ error: "castId required" }, { status: 400 });
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
  if (typeof paidAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return NextResponse.json({ error: "paidAt must be YYYY-MM-DD" }, { status: 400 });
  if (typeof idemKey !== "string" || !UUID_RE.test(idemKey)) return NextResponse.json({ error: "idemKey required (uuid)" }, { status: 400 });
  const methodVal = typeof method === "string" ? method : null;
  const noteVal = typeof note === "string" ? note : null;

  const { data, error } = await supabase.rpc("payment_record_add", {
    p_run_id: runId, p_cast_id: castId, p_amount: amount, p_paid_at: paidAt, p_method: methodVal, p_note: noteVal, p_idem_key: idemKey,
  });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403
      : m.includes("exceeds net") ? 409
      : m.includes("not finalized") || m.includes("no payslip") ? 422
      : 400;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ id: data });
}
