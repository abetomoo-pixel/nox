// ★0203（2 号店の段 1・相談役 21:40 の ■2-a）: 運営が会社に店を足す（POST）＝service 専用 ops_store_add。旗 MIG_0203_APPLIED の後ろ（false は 404）。
//   足した店は初期設定の前。写す内容（part）は 2 店目の初期設定の下書きに入れるだけ＝行を写すのはオーナーが 2 店目の /setup で確定したとき（store_copy_settings）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorApi } from "@/lib/nox/ops/require-operator";
import { mig0203On } from "@/lib/nox/rules-0175/flag";
import { storeAddErrJa, STORE_COPY_PARTS } from "@/lib/nox/ops/store-add";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const g = await requireOperatorApi();
  if (g.res) return g.res;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; bizType?: string; copyFrom?: string | null; parts?: string[] };
  const parts = Array.isArray(b.parts) ? b.parts.filter((p) => (STORE_COPY_PARTS as readonly string[]).includes(p)) : [];
  const copyFrom = typeof b.copyFrom === "string" && /^[0-9a-f-]{36}$/.test(b.copyFrom) && parts.length > 0 ? b.copyFrom : null;
  const { data, error } = await createAdminClient().rpc("ops_store_add", { p_ops: g.op.authUserId, p_org_id: id, p_store_name: String(b.name ?? ""), p_biz_type: String(b.bizType ?? ""), p_copy_from: copyFrom, p_copy_parts: copyFrom ? parts : null });
  if (error) return NextResponse.json({ error: storeAddErrJa(error.message) }, { status: 409 });
  return NextResponse.json({ ok: true, result: data });
}
