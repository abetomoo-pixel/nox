// D1 給与確定解除: finalized run を draft へ戻す（★owner 限定・manager も forbidden＝finalize/mark_paid より狭い）。
//   route は薄い認証＋owner authz＋run 解決＋エラーマッピングのみ。真の防御は payroll_reopen（service_role 限定・
//   org/paid/finalized/payments ガード＋(B) 巻き戻し＋draft 不変量＋監査）＝クライアント申告を信用しない（裁定D と同型）。
//   認可は decideTaxReportAccess（owner-only・支払調書CSV route と同一純関数）＝tax-report-csv 写経。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideReopenAccess } from "@/lib/nox/payroll/authz"; // ★C③-17 → 裁定 B5-5: owner／manager 自店のみ（staff 分岐は削除）

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { storeId?: unknown; period?: unknown; idemKey?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const storeId = body.storeId;
  const period = body.period;
  const idemKey = body.idemKey;
  if (typeof storeId !== "string" || !storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  // idemKey 必須（null は 400・原則9 の冪等 replay を成立させる前提）
  if (typeof idemKey !== "string" || !UUID_RE.test(idemKey)) return NextResponse.json({ error: "idemKey required (uuid)" }, { status: 400 });
  // ★C③-14（mig0138）: 理由必須（1〜200 字・trim）。RPC 側も reason_required で二重。
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 1 || reason.length > 200) return NextResponse.json({ error: "reason required (1-200)" }, { status: 400 });

  const [{ data: role }, { data: orgId }, { data: authStoreId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
    supabase.rpc("auth_store_id"),
  ]);
  // ★裁定 B5-5（#71）: owner／manager 自店のみ（C③-17 の staff∧can_reopen 分岐は削除＝page.tsx と一致・auth_staff_can_reopen の読取も撤去）
  if (decideReopenAccess(role as string | null, false, (authStoreId as string | null) ?? null, storeId) !== "ok")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  // store が org 内か照合（owner の他 org 遮断）
  const { data: store, error: eStore } = await admin.from("stores").select("org_id").eq("id", storeId).single();
  if (eStore || !store || store.org_id !== orgId) return NextResponse.json({ error: "forbidden store" }, { status: 403 });

  // run 解決（store×period・1店1期間）。無ければ確定されていない＝解除対象なし。
  const { data: run } = await admin.from("payroll_runs").select("id").eq("store_id", storeId).eq("period", period).maybeSingle();
  if (!run) return NextResponse.json({ error: "no run" }, { status: 404 });

  // p_actor = 操作者の users.id（監査 actor）
  const { data: actorRow } = await admin.from("users").select("id").eq("auth_user_id", user.id).single();
  const actorId = actorRow?.id as string | undefined;
  if (!actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin.rpc("payroll_reopen", {
    p_org_id: orgId, // サーバ導出（auth_org_id）
    p_actor: actorId, // p_actor = users.id
    p_run_id: run.id as string,
    p_idem_key: idemKey,
    p_reason: reason, // ★mig0138: 5 引数版（理由は監査 reason へ）
  });
  if (error) {
    const m = error.message;
    const status = m.includes("forbidden") ? 403
      : m.includes("run not found") ? 404
      : m.includes("reason_required") ? 400
      : m.includes("run paid") || m.includes("payments exist") || m.includes("not finalized") || m.includes("feature_disabled") ? 409
      : 500;
    return NextResponse.json({ error: m }, { status });
  }
  return NextResponse.json({ runId: run.id, result: data }); // 'reopened'（成功）/ 'draft'（冪等 replay）
}
