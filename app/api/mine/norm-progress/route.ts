// /mine ノルマ進捗（cast 本人専用・純参照＝DB 書き込みなし）。
// 裁定: 新2軸（売上・指名）は表示のみ（payOf/normPenalty 非接続）＝この route は「見せる」だけ。
// self ガード（/api/cast/invite と同型の厳しさ・ただし本人限定）:
//   ① 認証 401 → ② auth_role='cast' 以外 403 → ③ cast_id は auth_cast_id() でサーバ導出
//   （リクエスト入力を一切受けない GET＝他人の cast_id 指定は構造的に不可能）。
//   加えて全 SELECT/RPC を本人セッションで実行＝RLS パターン1・get_cast_sales の cast=本人スコープが物理保証。
// 集計定義（payroll と同一・SQL 再実装しない＝定義乖離防止の裁定）:
//   - 期間 = 当月 'YYYY-MM'（営業日 cutoff 基準＝cutoff 前の深夜は前営業日の月）。
//     window は resolvePayrollWindow を再利用（period_bounds＋stores.settings_json.biz_cutoff_hm 既定 '06:00'）。
//   - days_actual = collect.ts loadPunch（buildMatchInput→matchPunches・final∈{ok,late} カウント）をそのまま呼ぶ。
//   - sales/hon/jonai/dohan actual = get_cast_sales 月レンジ合算（collect.ts の合算と同型）。
//   - shimei_actual = 店フラグ shimei_norm_scope（'hon'=本指名のみ／'hon_jonai'=場内+本指名）を
//     route 内で解決して返す（クライアントに切替ロジックを置かない）。
//   - targets = cast_norms 自行（4軸）。未登録は全 0。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import { resolvePayrollWindow } from "@/lib/nox/payroll/window";
import { loadPunch } from "@/lib/nox/payroll/collect";

export async function GET() {
  try {
    const supabase = await createClient();

    // ① 認証
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // ② cast ロール限定（manager/owner/staff は /mine の対象外＝この API も閉じる）
    const { data: role } = await supabase.rpc("auth_role");
    if (role !== "cast") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // ③ cast_id サーバ導出（auth.uid→users.auth_user_id→casts.user_id＝auth_cast_id() が DB 内で解決）
    const { data: castId } = await supabase.rpc("auth_cast_id");
    if (typeof castId !== "string") return NextResponse.json({ error: "no cast for caller" }, { status: 403 });

    // 自分の store（casts パターン1＝自行のみ可視）
    const { data: castRow, error: eCast } = await supabase
      .from("casts")
      .select("store_id")
      .eq("id", castId)
      .single();
    if (eCast || !castRow?.store_id) {
      return NextResponse.json({ error: `cast lookup failed: ${eCast?.message ?? "no store"}` }, { status: 500 });
    }
    const storeId = castRow.store_id as string;

    // 当月 period（営業日 cutoff 基準）＋店フラグ（settings_json）
    const { data: storeRow, error: eStore } = await supabase
      .from("stores")
      .select("settings_json")
      .eq("id", storeId)
      .single();
    if (eStore) return NextResponse.json({ error: `store lookup failed: ${eStore.message}` }, { status: 500 });
    const settings = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
    const cutoffHm =
      typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? settings.biz_cutoff_hm : "06:00";
    const period = bizDateOf(new Date().toISOString(), cutoffHm).slice(0, 7);

    // 店フラグ（fail-closed: 明示 true のみ有効・scope は 'hon_jonai' 以外すべて既定 'hon'）
    const salesNormEnabled = settings.sales_norm_enabled === true;
    const shimeiNormEnabled = settings.shimei_norm_enabled === true;
    const shimeiNormScope =
      (typeof settings.shimei_norm_scope === "string" ? settings.shimei_norm_scope.trim() : "") === "hon_jonai"
        ? "hon_jonai"
        : "hon";

    // payroll と同一の window（period_bounds＋cutoff/close）
    const win = await resolvePayrollWindow(supabase, storeId, period);

    // grace（penalty_config・未設定は loadPunch/matchPunches の既定 10/30/90）
    //   ※ days カウント自体は ok/late とも算入のため grace 値に依存しないが、定義を collect.ts と揃える。
    const { data: pen } = await supabase
      .from("penalty_config")
      .select("late_grace_min, early_grace_min, over_grace_min")
      .eq("store_id", storeId)
      .maybeSingle();
    const grace = {
      lateGrace: (pen?.late_grace_min as number | undefined) ?? undefined,
      earlyGrace: (pen?.early_grace_min as number | undefined) ?? undefined,
      overGrace: (pen?.over_grace_min as number | undefined) ?? undefined,
    };

    // days_actual = loadPunch（本人セッション＝RLS で自分の行のみ・final∈{ok,late}）
    const { byCast } = await loadPunch(supabase, storeId, win, grace);
    const daysActual = byCast.get(castId)?.days ?? 0;

    // sales/hon/jonai/dohan = get_cast_sales 月レンジ合算（cast=本人スコープは RPC 内で物理保証）
    const { data: salesRows, error: eSales } = await supabase.rpc("get_cast_sales", {
      p_store_id: storeId,
      p_from: win.periodStart,
      p_to: win.periodEnd,
    });
    if (eSales) return NextResponse.json({ error: `get_cast_sales failed: ${eSales.message}` }, { status: 500 });
    let sales = 0;
    let hon = 0;
    let jonai = 0;
    let dohan = 0;
    for (const r of (salesRows ?? []) as Array<Record<string, unknown>>) {
      if (r.cast_id !== castId) continue; // RPC が本人限定だが念のため照合
      sales += (r.sales as number) ?? 0;
      hon += (r.hon as number) ?? 0;
      jonai += (r.jonai as number) ?? 0;
      dohan += (r.dohan as number) ?? 0;
    }
    const shimeiActual = shimeiNormScope === "hon_jonai" ? hon + jonai : hon;

    // targets = cast_norms 自行（パターン1・未登録は全 0）
    const { data: normRow, error: eNorm } = await supabase
      .from("cast_norms")
      .select("days_target, dohan_target, sales_target, shimei_target")
      .eq("cast_id", castId)
      .eq("period", period)
      .maybeSingle();
    if (eNorm) return NextResponse.json({ error: `cast_norms failed: ${eNorm.message}` }, { status: 500 });

    return NextResponse.json({
      period,
      flags: {
        sales_norm_enabled: salesNormEnabled,
        shimei_norm_enabled: shimeiNormEnabled,
        shimei_norm_scope: shimeiNormScope,
      },
      targets: {
        days: (normRow?.days_target as number | undefined) ?? 0,
        dohan: (normRow?.dohan_target as number | undefined) ?? 0,
        sales: (normRow?.sales_target as number | undefined) ?? 0,
        shimei: (normRow?.shimei_target as number | undefined) ?? 0,
      },
      actual: {
        days: daysActual,
        dohan,
        sales,
        shimei: shimeiActual,
        hon,
        jonai,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
