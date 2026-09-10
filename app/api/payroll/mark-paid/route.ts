// B5-6 給与 支払済み化: finalized run を paid へ（★owner 限定・状態遷移のみ＝金額計算なし・設計書 B5 v1 §3.3／§5）。
//   route は guardPayroll（認証・入力検証・manager+・store が org 内）＋owner 限定＋run 解決（store×period）＋エラーマッピングのみ。
//   真の防御は payroll_mark_paid（service_role 限定・org 照合・finalized→paid のみ・paid_idem_key で冪等・監査 payroll_mark_paid）。
//   idem_key は run ごと（裁定 B5-7）＝client が送った uuid（guard の idemKey）を使い、無ければ route が randomUUID。返却文言は RPC のまま。
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { guardPayroll } from "@/lib/nox/payroll/route-guard";

export async function POST(req: Request) {
  const g = await guardPayroll(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  // ★owner 限定（manager は forbidden＝finalize より狭い・裁定 B5-6）
  if (g.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // run 解決（store×period・1店1期間）。無ければ確定されていない＝支払済み化の対象なし。
  const { data: run } = await g.admin.from("payroll_runs").select("id").eq("store_id", g.storeId).eq("period", g.period).maybeSingle();
  if (!run) return NextResponse.json({ error: "no run" }, { status: 404 });

  // p_actor = 操作者の users.id（監査 actor）
  const { data: actorRow } = await g.admin.from("users").select("id").eq("auth_user_id", g.authUserId).single();
  const actorId = actorRow?.id as string | undefined;
  if (!actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const idemKey = g.idemKey ?? randomUUID();
  const { data, error } = await g.admin.rpc("payroll_mark_paid", {
    p_org_id: g.orgId, // サーバ導出（auth_org_id）
    p_actor: actorId,
    p_run_id: run.id as string,
    p_idem_key: idemKey,
  });
  if (error) {
    const m = error.message; // RPC の文言をそのまま返す（run not found／forbidden／not finalized）
    const status = m.includes("forbidden") ? 403 : m.includes("run not found") ? 404 : m.includes("not finalized") ? 409 : 500;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ runId: run.id, result: data, idemKey }); // 'paid'（成功・同一キー再送も 'paid'）
}
