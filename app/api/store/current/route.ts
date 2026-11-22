// ★0203（2 号店の段 2・相談役 21:40 の ■2-e）: オーナーの「今見ている店」を切り替える（cookie だけ・DB に書かない）。旗 false は 404。
//   通すのは owner で、RLS で見える店（同じ会社の店）だけ。店長・スタッフ・キャストは 403（今のまま＝自店）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mig0203On } from "@/lib/nox/rules-0175/flag";
import { CURRENT_STORE_COOKIE } from "@/lib/nox/store/current";

export async function POST(req: Request) {
  if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { storeId?: string };
  const storeId = typeof b.storeId === "string" && /^[0-9a-f-]{36}$/.test(b.storeId) ? b.storeId : null;
  if (!storeId) return NextResponse.json({ error: "bad store" }, { status: 400 });
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("auth_role");
  if (role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: st } = await supabase.from("stores").select("id").eq("id", storeId).maybeSingle();
  if (!st) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CURRENT_STORE_COOKIE, storeId, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 180 });
  return res;
}
