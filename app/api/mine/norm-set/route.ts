// /mine ノルマ目標の自己設定（★裁定272-3・0148: RPC set_cast_norm_self＝cast 本人のみ・店の sys_norms='false' は 'norms off'）。
// 写経元＝/api/mine/norm-progress（cast 側の既存 route・ユーザー文脈の supabase.rpc＝RLS と auth_cast_id() が DB 内で本人を解決）。
//   ① 認証 401 → ② auth_role='cast' 以外 403 → ③ 入力検証 400 → ④ ユーザー文脈で rpc（cast_id は RPC 内 auth_cast_id() 導出＝body に cast_id を受けない）。
// ★0148 手貼り前は RPC が無い＝エラー文言をそのまま返して止まる（細工しない）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PERIOD_RE = /^20[0-9]{2}-(0[1-9]|1[0-2])$/; // set_cast_norm と同じ正規表現

function intOf(v: unknown, max: number): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max) return v;
  if (typeof v === "string" && /^\d{1,12}$/.test(v.trim())) { const n = Number(v.trim()); return n <= max ? n : null; }
  return null;
}

/** RPC の raise 文言 → HTTP（set_cast_norm と同じ語彙＋'norms off'） */
function statusOf(message: string): number {
  if (/norms off/.test(message)) return 409;
  if (/forbidden|no cast for caller/.test(message)) return 403;
  if (/billing locked/.test(message)) return 402;
  if (/^bad /.test(message) || /bad period|bad .*_target/.test(message)) return 400;
  return 500;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: role } = await supabase.rpc("auth_role");
  if (role !== "cast") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { period?: unknown; days?: unknown; dohan?: unknown; sales?: unknown; shimei?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const period = typeof body.period === "string" && PERIOD_RE.test(body.period) ? body.period : null;
  const days = intOf(body.days, 31);
  const dohan = intOf(body.dohan, 999);
  const sales = intOf(body.sales, 999_999_999);
  const shimei = intOf(body.shimei, 9_999);
  if (!period) return NextResponse.json({ error: "bad period" }, { status: 400 });
  if (days === null || dohan === null || sales === null || shimei === null) {
    return NextResponse.json({ error: "targets must be non-negative integers" }, { status: 400 });
  }

  // ユーザー文脈＝cast_id は RPC 内で auth_cast_id() が解決（他人の cast_id を指せない）
  const { data, error } = await supabase.rpc("set_cast_norm_self", {
    p_period: period, p_days_target: days, p_dohan_target: dohan, p_sales_target: sales, p_shimei_target: shimei,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: statusOf(error.message) });
  return NextResponse.json({ ok: true, id: data, period });
}
