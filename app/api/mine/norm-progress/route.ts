// /mine ノルマ進捗（cast 本人専用・純参照＝DB 書き込みなし）。
// ★0160（裁定326-3・便 M2-1・2026-10-01）: 目標＝cast_quotas の当月行（本指名／場内／同伴／売上・NULL＝未設定・店が /casts で設定）。
//   旧 cast_norms（days／dohan／sales／shimei＋店フラグ）と loadPunch の出勤日数集計はこの route から外した（cast_norms 表・set_cast_norm は罰金系の結線のため DB は不触）。
// self ガード（/api/cast/invite と同型の厳しさ・ただし本人限定）:
//   ① 認証 401 → ② auth_role='cast' 以外 403 → ③ cast_id は auth_cast_id() でサーバ導出
//   （リクエスト入力を一切受けない GET＝他人の cast_id 指定は構造的に不可能）。
//   加えて全 SELECT/RPC を本人セッションで実行＝RLS パターン1・get_cast_sales の cast=本人スコープが物理保証。
// 集計定義（payroll と同一・SQL 再実装しない）:
//   - 期間 = 当月 'YYYY-MM'（営業日 cutoff 基準）。window は resolvePayrollWindow を再利用（period_bounds＋biz_cutoff_hm 既定 '06:00'）。
//   - hon/jonai/dohan/sales actual = get_cast_sales 月レンジ合算（collect.ts の合算と同型）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import { resolvePayrollWindow } from "@/lib/nox/payroll/window";

export async function GET() {
  try {
    const supabase = await createClient();

    // ① 認証
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // ② cast ロール限定（manager/owner/staff は /mine の対象外＝この API も閉じる）
    const { data: role } = await supabase.rpc("auth_role");
    if (role !== "cast") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // ③ cast_id サーバ導出（auth.uid→users.auth_user_id→casts.user_id＝auth_cast_id() が DB 内で解決）
    const { data: castId } = await supabase.rpc("auth_cast_id");
    if (typeof castId !== "string") return NextResponse.json({ error: "no cast for caller" }, { status: 403 });

    // 自分の store（casts パターン1＝自行のみ可視）
    const { data: castRow, error: eCast } = await supabase.from("casts").select("store_id").eq("id", castId).single();
    if (eCast || !castRow?.store_id) return NextResponse.json({ error: `cast lookup failed: ${eCast?.message ?? "no store"}` }, { status: 500 });
    const storeId = castRow.store_id as string;

    // 当月 period（営業日 cutoff 基準）
    const { data: storeRow, error: eStore } = await supabase.from("stores").select("settings_json").eq("id", storeId).single();
    if (eStore) return NextResponse.json({ error: `store lookup failed: ${eStore.message}` }, { status: 500 });
    const settings = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
    const cutoffHm = typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? settings.biz_cutoff_hm : "06:00";
    const period = bizDateOf(new Date().toISOString(), cutoffHm).slice(0, 7);

    // payroll と同一の window（period_bounds＋cutoff）
    const win = await resolvePayrollWindow(supabase, storeId, period);

    // hon/jonai/dohan/sales = get_cast_sales 月レンジ合算（cast=本人スコープは RPC 内で物理保証）
    const { data: salesRows, error: eSales } = await supabase.rpc("get_cast_sales", { p_store_id: storeId, p_from: win.periodStart, p_to: win.periodEnd });
    if (eSales) return NextResponse.json({ error: `get_cast_sales failed: ${eSales.message}` }, { status: 500 });
    const actual = { hon: 0, jonai: 0, dohan: 0, sales: 0 };
    for (const r of (salesRows ?? []) as Array<Record<string, unknown>>) {
      if (r.cast_id !== castId) continue; // RPC が本人限定だが念のため照合
      actual.sales += (r.sales as number) ?? 0;
      actual.hon += (r.hon as number) ?? 0;
      actual.jonai += (r.jonai as number) ?? 0;
      actual.dohan += (r.dohan as number) ?? 0;
    }

    // 目標 = cast_quotas の当月行（RLS: cast 本人の行のみ・未登録は null）
    const { data: quotaRow, error: eQuota } = await supabase.from("cast_quotas").select("hon, jonai, dohan, sales").eq("cast_id", castId).eq("month", `${period}-01`).maybeSingle();
    if (eQuota) return NextResponse.json({ error: `cast_quotas failed: ${eQuota.message}` }, { status: 500 });

    return NextResponse.json({ period, quota: quotaRow ?? null, actual });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
