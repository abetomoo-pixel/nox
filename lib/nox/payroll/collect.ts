// 期間データの読み取り（給与確定サーバの権威読み）。
// 按分の DB 権威（D7a）を保つため get_cast_sales は「ユーザー文脈（manager）クライアント」で呼ぶ
//   （service キーは auth_org_id() null で forbidden＝admin では呼べない）。
// 他の生読み取り（会計バック・打刻・マスタ）は admin（service・RLS バイパス・検証済み store）で読む。
// 対象 cast（裁定C）= get_cast_sales の cast ∪ 窓内 punches の cast（is_active 不問・稼働ゼロは除外）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { punchModeOf, storeModeAttendedDatesOf } from "../shift/punch-mode"; // ★便 E（0197 用）★0197 フラグ便（裁定456 の 18）
import { wageCutRuleOf } from "@/lib/nox/store-systems"; // ★便 SH-UI-a A-1
import { okuriDeductOf } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4 ③）: 店負担は控除しない
import { periodCalendarDays, type PayrollWindow } from "./window";
import { sumCastSales } from "./cast-sales"; // ★裁定346: cast 別合算の純関数（ランキング・/mine ノルマ進捗と共用）
import { normAxesOf, normTargetsOf, resolveNormTargetsOf, shimeiScopeOf, type NormTargets, type QuotaSource } from "../store/norm-axes"; // ★裁定347 追補2（便 N1014 A-4）: 達成ボーナスの目標＝/mine と同じ純関数
import type { CastRaw, StoreMasters, DeductionOverride, DayDeductionRow } from "./assemble"; // ★0195: DayDeductionRow
import { isSystemOn } from "../store-systems"; // ★便 GV-C C-10（R-5c） // ★0156: DeductionOverride（run 別控除上書き）
import { calcPeriodOf } from "./assemble"; // ★0154 D6
import { baseOverrideOf } from "./base-override"; // ★便 P174 T-5（R-11 (d)）
import { attendanceWithDohanOf } from "@/lib/nox/shift/dohan-mark"; // ★便 PR-1 R-4（裁定417）: 同伴の正本＝伝票
import { payTimeBasisOf } from "./time-basis"; // ★裁定324（便 L-2-3）
import { mig0183On, mig0197On, mig0201lOn, rules0175On, mig0202fOn } from "@/lib/nox/rules-0175/flag"; // ★便 P175-prep: 0175 v2 の列・表を読むのはフラグ true のときだけ（false＝従来と 1 バイト同値）
import { loadCanonCtx, loadCastMeta0175, loadRateHistory, loadRules0175Store } from "./rules-0175-collect"; // ★便 P175-prep P-1／P-5
import type { ShortfallDay } from "./shortfall"; // ★裁定324-3（便 L-2-4）: 不就労控除の入力（営業日ごとの確定シフト×打刻）: 勤務時間の計算基準（store 設定・期の初日で解決）
/** ★0154 D2: 'HH:MM'（0-47 域）→ 分（shift-time.hm2min と同式・collect 内で閉じる） */
const hm2minOf = (hm: string): number => { const [h, mm] = String(hm).split(":").map(Number); return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(mm) ? mm : 0); };
import type { AdjustmentRow } from "./adjust"; // 裁定258／264
import type { CompPlan, PlanOverride, Deduction, BackDef, TaxMode } from "../pay";
import { buildMatchInput, dayWorkedHours, type PunchRow, type ShiftRow, type AttendanceRow } from "../punch-io";
import { matchPunches } from "../punch-match";
import { bizDateOf } from "../biz-date";
import { anomalyFlagsOf, punchCountsUpToOf, shiftHoursUpToOf } from "./anomaly"; // ★X-13-27（便 X-13d-2a）: 未来日の確定シフトは不整合に数えない・★裁定342（便 P169）: 日数・当欠・シフト時間も今日まで
import { salesBasisOf, salesRpcOf, salesBackDefaultOffOf } from "./sales-basis"; // ★2026-11-18 夜（相談役 ③）
import { mig0206On } from "../rules-0175/flag"; // ★0206（起票146 案）
import { employmentByCastOf } from "./employment-at"; // ★0206（起票146 案）
import { mig0201qOn } from "../rules-0175/flag"; // ★0201q

import { castPts } from "../pay"; // ★N3b: 前月 pts＝当月と同じ式
import { trialRangeOf, trialRawOf, trialTouchesOf, trialWageOf, inTrialRange, type TrialRange } from "./trial"; // ★裁定490（0201l の後の結線）: 体入の期間・体入の時給・バック「なし」の除外
import { trialStoreTermsOf } from "../cast/trial-terms";
import { noShiftHoursOf } from "./no-shift";
import { bandAmountAt, bandSegmentsOf, bandSegmentsOfSpans, bandWindowOf, type BandSeg } from "./hourly-bands";
import { hourlyBandsOn } from "../rules-0175/flag"; // ★時間帯の時給（旗 HOURLY_BANDS_ON の後ろ）
import { liftPunchAt } from "../punch-io"; // ★時間帯の時給: シフトの無い日の区間（0〜47 時）
import { mig0213On, mig0214On } from "../rules-0175/flag"; // ★0213（丸め）・0214（休憩）
import { dayWindowOf, minOfBizDay } from "../punch/day-window"; // ★0213／0214: 日の窓（丸め・休憩・帯が同じ窓を読む）
import { EMPTY_DAY_ADJ, dayAdjOfSource, loadDayAdjSource } from "../punch/day-adj-load"; // ★0213／0214
import type { RateBand } from "../rules-0175/canon"; // ★裁定501-8 // ★裁定490: 店の体入の条件（trial_wage・trial_back）
import { monthsInRange, prevMonthOf, lastDayOf, periodKeysInRange, periodRangeOfKey, prevPeriodKeyOf, slidePeriodOf, slideBasisOf, slideBasisValueOf, slideRankIncludedOf, type SlideBasis, type SlidePeriod, type SlideTotals } from "./slide"; // ★N3b（裁定288）・★裁定338（0168・便 P168）
import type { PayrollWindow as _PW } from "./window";
const addDaysYmd = (ymd: string, n: number) => { const [y, mo, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10); }; // ★N3b
void (0 as unknown as _PW);
type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };

// #32 出勤インセンティブ（published・当該期間の biz_date）
// E8-4（mig0095）: targetCastIds＝対象キャスト（null=全員=現行完全互換）・reason は表示専用
export type Incentive = {
  id: string; bizDate: string; amountMode: "per_head" | "pooled"; amount: number;
  targetCastIds: string[] | null; reason: string | null;
};

// F2e-1 売掛天引き（E9 対象＝open・deduct_from_cast・当該 period 帰属）。remaining=amount−deducted_amount。
export type Receivable = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string; // coalesce(deduct_period, biz_date→'YYYY-MM')
  createdAt: string;
};

// F2e-2 前借り天引き（E9 同型・open・当該 period 帰属＝coalesce(deduct_period, advanced_on→'YYYY-MM')・繰越あり）。
export type Advance = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string;
  createdAt: string;
};

// F2e-2 送り実費天引き（open・当該 period 帰属＝biz_date→'YYYY-MM'・繰越なし＝deduct_period 列を持たない）。
export type Transport = {
  id: string;
  castId: string;
  amount: number;
  deductedAmount: number;
  remaining: number;
  effPeriod: string; // biz_date→'YYYY-MM'（固定・繰越しない）
  bizDate: string; // 古い順ソート用（同一 period 内は日付順 FIFO）
  createdAt: string;
  /** ★裁定414（0177）: 記録時の方式 actual／flat（store はここに来ない・列が無い間は 'actual'） */
  mode: string;
};

export type CollectResult = {
  casts: CastRaw[];
  masters: StoreMasters;
  incentives: Incentive[];
  // bizDate → 受給者 cast_id（final∈{ok,late}・cast_id 昇順＝pooled 端数 +1 の順序＝確認1）
  recipientsByDate: Map<string, string[]>;
  // cast_id → 当該 period の E9 対象 receivable（古い順）
  receivablesByCast: Map<string, Receivable[]>;
  // cast_id → 当該 period の前借り（古い順）／送り実費（biz_date 古い順・繰越なし）
  advancesByCast: Map<string, Advance[]>;
  transportByCast: Map<string, Transport[]>;
};

// 店共通マスタ＋cast 個別マスタ（plan/norm/tax）を1回読む。
// periodEnd は period_bounds 由来の 'YYYY-MM-DD'（win.periodEnd・写像単一ソース＝Date 非経由）。
async function loadMasters(admin: SupabaseClient, storeId: string, period: string, periodEnd: string, runPeriodStart?: string) {
  const [plansR, castPlanR, penR, dedR, cbR, normR, taxR, compR, stR] = await Promise.all([
    admin.from("comp_plans").select("norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target, id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate, dohan_back_mode, dohan_back_rate, product_back_mode, product_back_rate, product_back_fixed, slide_period, slide_basis, slide_rank_ids, slide_apply" + (mig0202fOn() ? ", commission_tiers" : "")) /* ★0202f: 歩合の段の表は旗の後ろ（列が無い間は読まない） */.eq("store_id", storeId), // ★便 P174 T-4（裁定395・0174 ★4）: slide_apply（null＝店設定）・★裁定343（0170）: 判定基準・対象
    // ★裁定97: 適用行の選択は3段（期間と重なる行を全部読み、下の castPlanByCast 構築で選ぶ）。
    //   a) 期首（period-01）時点で有効な行があればそれ＝裁定96-④ 不変（期中変更は翌期から）。
    //   b) 無ければ期間内（期首 < valid_from ≤ 期末）で最も早い valid_from の行＝backfill 導入月の救済。日割りなし。
    //   c) どちらも無ければ plan なし＝no_plan blocker（従来どおり）。
    //   UI 系（comp-sections）の現在行読み（valid_to is null）は別経路＝不変。
    admin.from("cast_plan").select("cast_id, plan_id, overrides_json, valid_from, valid_to").eq("store_id", storeId) // ★N3: valid_to も読む（保証行の期間）
      .lte("valid_from", periodEnd)
      .or(`valid_to.is.null,valid_to.gte.${period}-01`),
    admin.from("penalty_config").select("*").eq("store_id", storeId).maybeSingle(),
    // ★裁定98: kind（sanction 分離）と basis_confirmed_at（表示用）を読む＝sim-data.ts:33 と二面鏡（片方だけ触らない）
    admin.from("deductions").select("id, name, amount, per, kind, basis_confirmed_at, day_rule").eq("store_id", storeId).eq("is_active", true), // ★0195: +day_rule
    admin.from("custom_back_defs").select("id, name, basis, value, cond_json").eq("store_id", storeId).eq("is_active", true),
    admin.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target, shimei_target").eq("store_id", storeId).eq("period", period), // ★347 追補2: shimei も（解決の入力）
    admin.from("cast_tax_profiles").select("cast_id, mode, dependents_form").eq("store_id", storeId), // ★0172（裁定349）: +dependents_form（雇用の甲／乙）
    // ★mig0114（読み経路段）: 行型コンポーネント（plan_id で束ねる・空なら旧式同値＝pay.ts 非参照）
    admin.from("comp_plan_components").select("plan_id, kind, mode, amount, rate, params, priority")
      .eq("store_id", storeId).eq("is_active", true).order("priority"),
    admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle(), // ★324（便 L-2-3）: pay_time_basis／_next／_next_from（配列の末尾＝分割代入の stR と対応）
  ]);
  for (const r of [plansR, castPlanR, penR, dedR, cbR, normR, taxR, compR, stR]) {
    if (r.error) throw new Error(`マスタ読み取り: ${r.error.message}`);
  }
  const compsByPlan = new Map<string, CompPlan["components"]>();
  for (const r of (compR.data ?? []) as Record<string, unknown>[]) {
    const arr = compsByPlan.get(r.plan_id as string) ?? [];
    arr!.push({
      kind: r.kind as string, mode: r.mode as string,
      amount: (r.amount ?? null) as number | null, rate: (r.rate ?? null) as number | null,
      params: (r.params ?? {}) as Record<string, unknown>, priority: r.priority as number,
    });
    compsByPlan.set(r.plan_id as string, arr);
  }
  const plansById = new Map<string, CompPlan>();
  const slidePeriodByPlan = new Map<string, SlidePeriod>(); // ★裁定338（0168）: プランの判定期間（CompPlan＝pay.ts は不変＝別 map）
  const slideBasisByPlan = new Map<string, SlideBasis>(); // ★裁定343（0170）: 判定基準（sales／hon_count／dohan_count）
  const slideRankIdsByPlan = new Map<string, string[]>(); // ★裁定343（0170）: 対象ランク（空＝全員）
  const slideApplyByPlan = new Map<string, "next" | "current">(); // ★便 P174 T-4（裁定395）: プランの判定タイミング（null＝店設定＝ここに入れない）
  const planNormById = new Map<string, NormTargets>(); // ★裁定347 追補2（0171）: プラン既定の目標 4 軸
  for (const p of (plansR.data ?? []) as unknown as Record<string, unknown>[]) {
    planNormById.set(p.id as string, normTargetsOf(p as { norm_days_target?: number | null; norm_dohan_target?: number | null; norm_sales_target?: number | null; norm_shimei_target?: number | null }));
    slidePeriodByPlan.set(p.id as string, slidePeriodOf(p.slide_period));
    slideBasisByPlan.set(p.id as string, slideBasisOf(p.slide_basis));
    slideRankIdsByPlan.set(p.id as string, Array.isArray(p.slide_rank_ids) ? (p.slide_rank_ids as string[]) : []);
    if (p.slide_apply === "next" || p.slide_apply === "current") slideApplyByPlan.set(p.id as string, p.slide_apply); // ★便 P174 T-4
    plansById.set(p.id as string, {
      id: p.id as string,
      name: p.name as string,
      base: p.base as number,
      honBack: p.hon_back as number,
      jonaiBack: p.jonai_back as number,
      dohanBack: p.dohan_back as number,
      salesSlide: (p.sales_slide ?? []) as CompPlan["salesSlide"],
      pointSlide: (p.point_slide ?? []) as CompPlan["pointSlide"],
      // mig0086: 指名バック方式（default 'per_count'＝既存プラン現行同値）
      honBackMode: (p.hon_back_mode ?? "per_count") as CompPlan["honBackMode"],
      honBackRate: (p.hon_back_rate ?? null) as number | null,
      jonaiBackMode: (p.jonai_back_mode ?? "per_count") as CompPlan["jonaiBackMode"],
      jonaiBackRate: (p.jonai_back_rate ?? null) as number | null,
      // ★mig0114: dohan 対称化＋components（読み経路段＝payOf 非参照・空配列が既定）
      dohanBackMode: (p.dohan_back_mode ?? "per_count") as CompPlan["dohanBackMode"],
      dohanBackRate: (p.dohan_back_rate ?? null) as number | null,
      components: compsByPlan.get(p.id as string) ?? [],
      // ★裁定113（mig0132）: 商品販売バック3方式（payOf は plan_fixed の固定額のみ参照）
      productBackMode: (p.product_back_mode ?? "product_rule") as CompPlan["productBackMode"],
      productBackRate: (p.product_back_rate ?? null) as number | null,
      productBackFixed: (p.product_back_fixed ?? null) as number | null,
      ...(mig0202fOn() && Array.isArray(p.commission_tiers) && (p.commission_tiers as unknown[]).length > 0 ? { commissionTiers: (p.commission_tiers as { at: number; rate: number }[]).map((t) => ({ at: Number(t.at), rate: Number(t.rate) })) } : {}), // ★0202f: 表があるプランだけキーを持つ（無いプランは今と 1 バイト同値）
    });
  }
  // ★便 P174 T-5（R-11 (d)）: 期首行が保証行なら base／guarantee を外す＝lib/nox/payroll/base-override.ts（純関数）
  // ★裁定97: cast 単位の適用行選択（上の query コメントの3段）。
  //   期首行は部分 unique＋set_cast_plan の区間検証で高々1行＝2行以上は不正データとして throw（黙って片方を採らない）。
  const periodStart = `${period}-01`;
  const castPlanByCast = new Map<string, { planId: string; override: PlanOverride }>();
  // ★夜間便 N3（裁定287-5）: 保証行（overrides_json.guarantee=true）は期首行の選択（裁定97）とは別に、期と重なる全行を cast 別に控える
  const guaranteesByCast = new Map<string, { validFrom: string; validTo: string | null; base: number }[]>();
  {
    const rowsByCast = new Map<string, { planId: string; override: PlanOverride; validFrom: string }[]>();
    for (const c of (castPlanR.data ?? []) as Record<string, unknown>[]) {
      const cid = c.cast_id as string;
      const ov = (c.overrides_json ?? {}) as Record<string, unknown>;
      if (ov.guarantee === true && typeof ov.base === "number") {
        (guaranteesByCast.get(cid) ?? guaranteesByCast.set(cid, []).get(cid)!).push({ validFrom: c.valid_from as string, validTo: (c.valid_to as string | null) ?? null, base: ov.base as number });
      }
      const row = { planId: c.plan_id as string, override: (c.overrides_json ?? {}) as PlanOverride, validFrom: c.valid_from as string };
      (rowsByCast.get(cid) ?? rowsByCast.set(cid, []).get(cid)!).push(row);
    }
    for (const [cid, rows] of rowsByCast) {
      const atStart = rows.filter((r) => r.validFrom <= periodStart);
      if (atStart.length >= 2) throw new Error(`cast_plan: 期首時点の有効行が複数（cast=${cid}・period=${period}）`);
      const pick = atStart[0]
        ?? rows.filter((r) => r.validFrom > periodStart).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0];
      if (pick) castPlanByCast.set(cid, { planId: pick.planId, override: baseOverrideOf(pick, rows) });
    }
  }
  const pen = penR.data as Record<string, unknown> | null;
  const basis = payTimeBasisOf(((stR.data?.settings_json ?? null) as Record<string, unknown> | null), runPeriodStart ?? `${period}-01`); // ★324-2: run の期の初日 ≥ next_from なら next
  const masters: StoreMasters = {
    ...(isSystemOn((stR.data?.settings_json ?? null) as Record<string, unknown> | null, "sys_backs") && !salesBackDefaultOffOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()) ? {} : { salesBackTable: [] }), /* ★2026-11-18 夜（③）: sales_back_default_off＝true の店は既定の売上歩合だけを止める（各種バックの行は隠さない） */ /* ★便 SH-UI-c2 C2-10（裁定412 の残り）: 売上歩合＝各種バックに統合（sys_sales_rate は読まない） */ // ★便 GV-C C-10（R-5c）: 売上歩合 OFF の店は売上率テーブルを効かせない（ON／欠損＝従来の既定＝golden 不変）
    ...(salesBasisOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()) === "subtotal" ? { salesBasis: "subtotal" as const } : {}), /* ★2026-11-19（相談役 ②）: 小計の店だけ（明細に基準を出す・凍結形に salesBasis） */
    ...(basis === "shift" ? { payTimeBasis: "shift" as const } : {}), // ★324（便 L-2-3）: 'punch'／未設定はキーを足さない（従来と 1 バイト同値）
    penalty: {
      fineAbsent: (pen?.fine_absent as number) ?? 0,
      fineLate: (pen?.fine_late as number) ?? 0,
      hoursPerShift: Number(pen?.hours_per_shift ?? 5),
    },
    // ★便 X13-I I-5: ノルマ未達の減額の提案（4 軸）＝penalty_config の norm_* と採用軸（norm_axes）・指名の範囲（shimei_norm_scope）。就業規則の定め＝店設定キー（保存先は 0176＝今は読むだけ・未設定＝なし）
    normPenalty4: {
      cfg: { on: (pen?.norm_on as boolean) ?? false,
        days: { flat: Number(pen?.norm_days_flat ?? 0), per: Number(pen?.norm_days_per ?? 0) }, dohan: { flat: Number(pen?.norm_dohan_flat ?? 0), per: Number(pen?.norm_dohan_per ?? 0) },
        shimei: { flat: Number(pen?.norm_shimei_flat ?? 0), per: Number(pen?.norm_shimei_per ?? 0) }, sales: { flat: Number(pen?.norm_sales_flat ?? 0), per: Number(pen?.norm_sales_per ?? 0), unit: Number(pen?.norm_sales_unit ?? 10000) } },
      axes: normAxesOf(stR.data?.settings_json ?? null), shimeiScope: shimeiScopeOf(stR.data?.settings_json ?? null),
      hasWorkRule: wageCutRuleOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null), // ★便 SH-UI-a A-1: 店設定 sys_wage_cut_rule（旧 sanction_work_rule＝保存先が無かった）
    },
    normConfig: {
      on: (pen?.norm_on as boolean) ?? false,
      daysFlat: (pen?.norm_days_flat as number) ?? 0,
      daysPer: (pen?.norm_days_per as number) ?? 0,
      dohanFlat: (pen?.norm_dohan_flat as number) ?? 0,
      dohanPer: (pen?.norm_dohan_per as number) ?? 0,
    },
    deductions: ((dedR.data ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id as string, name: d.name as string, amount: d.amount as number, per: d.per as Deduction["per"],
      kind: d.kind as Deduction["kind"], basisConfirmedAt: (d.basis_confirmed_at ?? null) as string | null, // ★裁定98
      ...(d.day_rule === "pick" ? { dayRule: "pick" as const } : {}), // ★0195: pick のときだけキー（always＝従来と 1 バイト同値）
    })),
    customBackDefs: ((cbR.data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id as string, name: b.name as string, basis: b.basis as BackDef["basis"], value: b.value as number,
      cond: (b.cond_json ?? undefined) as BackDef["cond"],
    })),
  };
  const normByCast = new Map<string, { days: number; dohan: number; salesTarget: number; shimei: number }>();
  for (const n of (normR.data ?? []) as Record<string, unknown>[]) {
    // ★裁定96-②: achievement_bonus の目標は cast_norms.sales_target（個別）。★裁定347 追補2（便 N1014 A-4）: 0／行なしはプラン既定（norm_sales_target）を継承＝raw 組立で解決（normAxes OFF＝なし）
    normByCast.set(n.cast_id as string, { days: n.days_target as number, dohan: n.dohan_target as number,
      salesTarget: Number(n.sales_target ?? 0), shimei: Number(n.shimei_target ?? 0) });
  }
  const normAxes = normAxesOf(stR.data?.settings_json ?? null); // ★347 追補2: 採用軸（OFF の軸は目標なし）
  const taxByCast = new Map<string, TaxMode>();
  const depByCast = new Map<string, boolean>(); // ★0172（裁定349）: 扶養控除等申告書の提出（雇用の甲／乙）
  for (const t of (taxR.data ?? []) as Record<string, unknown>[]) {
    taxByCast.set(t.cast_id as string, t.mode as TaxMode);
    depByCast.set(t.cast_id as string, t.dependents_form === true);
  }
  const lateGrace = (pen?.late_grace_min as number) ?? undefined;
  masters.lateGraceMin = lateGrace; // ★324-3（便 L-2-4）: shortfall の遅刻猶予（裁定268＝punch-match と同じ値）
  const earlyGrace = (pen?.early_grace_min as number) ?? undefined;
  const overGrace = (pen?.over_grace_min as number) ?? undefined;
  const tst = trialStoreTermsOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null); // ★裁定490: 店の体入の時給（未設定＝null）・バック（欠損＝same）
  return { plansById, slidePeriodByPlan, slideBasisByPlan, slideRankIdsByPlan, slideApplyByPlan, planNormById, normAxes, castPlanByCast, guaranteesByCast, masters, normByCast, taxByCast, depByCast, grace: { lateGrace, earlyGrace, overGrace }, trialTerms: { trialWage: tst.wage, trialBack: tst.back } }; // ★N3: guaranteesByCast・★裁定338: slidePeriodByPlan・★裁定343: slideBasisByPlan／slideRankIdsByPlan
}

// 窓内 closed 非 void の会計から cast 別のバック・pt・champ/bottle 本数を集計。
// champ/bottle 判定は check_lines.kind ∈ {'champ','bottle'}（会計確定時スナップショット・商品マスタ属性でなく明細 kind が正）。
// 帰属は check_nominations（sales 按分と同じ在席集合）。本数は重み分割しない＝各在席 cast に満額計上。
// ★F3f: 承認済 drink_claims（自己申告バック・独立枠）を drink バックへ合流。
//   期間フィルタは「対象 check の started_at」＝check_cast_backs と同一の営業日基準（給与サイクル一致）。
//   close 非依存（申告は独立枠＝check_cast_backs を書かない）。承認済0件なら合流額0＝既存 payslip 不変。
//   ★close 非依存は維持（open 伝票の承認済 claim は当月給与に乗る）・void のみ除外（0047 裁定 2026-07-17）。
//     void 伝票の approved は行としては残置される（mig0047 が reject するのは pending のみ）ため、
//     給与から外す単一責任点がこの void フィルタ＝finalize 済み給与への遡及改変を構造的に回避する。
async function loadAccounting(admin: SupabaseClient, storeId: string, win: PayrollWindow) {
  // ★裁定113: calc＝Σ calculated_back_amount（plan_rate の凍結値・null=0＝旧行/他 mode フォールバック）
  const backByCast = new Map<string, { drink: number; champ: number; bottle: number; pt: number; calc: number }>();
  const champBottleByCast = new Map<string, { champCnt: number; bottleCnt: number }>();
  // ★裁定490（0201l の後の結線）: 体入の日の分を引くための日ごとの集計（cast → 営業日 → 値）。期の合計（上の 2 つ）は従来のまま＝値は同じ
  const backByCastDate = new Map<string, Map<string, { drink: number; champ: number; bottle: number; pt: number; calc: number }>>();
  const champBottleByCastDate = new Map<string, Map<string, { champCnt: number; bottleCnt: number }>>();
  const dayBack = (cid: string, d: string) => { const m = backByCastDate.get(cid) ?? backByCastDate.set(cid, new Map()).get(cid)!; return m.get(d) ?? m.set(d, { drink: 0, champ: 0, bottle: 0, pt: 0, calc: 0 }).get(d)!; };
  const dayCb = (cid: string, d: string) => { const m = champBottleByCastDate.get(cid) ?? champBottleByCastDate.set(cid, new Map()).get(cid)!; return m.get(d) ?? m.set(d, { champCnt: 0, bottleCnt: 0 }).get(d)!; };
  const bizOf = (ck: unknown): string | null => { const c = (Array.isArray(ck) ? ck[0] : ck) as { started_at?: string } | null; return c?.started_at ? bizDateOf(c.started_at, win.cutoffHm) : null; };

  // ★F3f: 承認済 drink_claims の back_amount を cast 別に drink バックへ合流（対象 check の営業日で期間フィルタ）
  const { data: claims, error: eDc } = await admin
    .from("drink_claims").select("cast_id, back_amount, checks!inner(started_at, status)")
    .eq("store_id", storeId).eq("status", "approved")
    .not("checks.status", "in", "(void,merged)") // ★C③-16（mig0138）: 統合元 merged も除外（void と同じ述語） // 0047: void 伝票の承認済 claim は給与に乗せない（closed 限定にはしない＝close 非依存の維持）
    .gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs);
  if (eDc) throw new Error(`drink_claims: ${eDc.message}`);
  for (const c of (claims ?? []) as Record<string, unknown>[]) {
    const cid = c.cast_id as string;
    const cur = backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0, calc: 0 };
    cur.drink += c.back_amount as number;
    backByCast.set(cid, cur);
    const bd = bizOf(c.checks); if (bd) dayBack(cid, bd).drink += c.back_amount as number; // ★裁定490
  }

  const { data: checks, error: eC } = await admin
    .from("checks").select("id, started_at").eq("store_id", storeId).eq("status", "closed") // ★裁定490: started_at＝体入の日の分を営業日で分ける
    .gte("started_at", win.startTs).lt("started_at", win.endTs);
  if (eC) throw new Error(`checks: ${eC.message}`);
  const checkIds = ((checks ?? []) as { id: string }[]).map((c) => c.id);
  const bizByCheck = new Map(((checks ?? []) as { id: string; started_at: string }[]).map((c) => [c.id, bizDateOf(c.started_at, win.cutoffHm)])); // ★裁定490
  if (checkIds.length === 0) return { backByCast, champBottleByCast, backByCastDate, champBottleByCastDate };  // ★drink_claims は既に合流済み

  // ★便 X-13b（2026-10-08・起票候補）: .in("check_id", 全件) は閉じ伝票 ~400 件超で URL が 16 KB を超え fetch が HeadersOverflow（UND_ERR_HEADERS_OVERFLOW）で落ちる
  //   （月 458 伝票の CLUB LUNA で再現＝「会計明細: TypeError: fetch failed」）。150 件ずつに分けて読み連結する（意味・順序は不変＝Σ と cast 別の集計だけ）。
  const inChunks = async <T,>(fn: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 150): Promise<{ data: T[]; error: { message: string } | null }> => {
    const out: T[] = [];
    for (let i = 0; i < checkIds.length; i += size) { const r = await fn(checkIds.slice(i, i + size)); if (r.error) return { data: out, error: r.error }; out.push(...(r.data ?? [])); }
    return { data: out, error: null };
  };
  const [nomsR, linesR, backsR] = await Promise.all([
    inChunks((ids) => admin.from("check_nominations").select("check_id, cast_id").in("check_id", ids)),
    inChunks((ids) => admin.from("check_lines").select("check_id, kind, qty").in("check_id", ids)), // ★0152（裁定298-10）: 紹介料は給与に載せない＝紹介料用の併読を撤去
    // ★裁定113: 新3列を読む（source_mode は Σ には不要だが読み手フォールバックの検証用に取得・calc は null=0）
    inChunks((ids) => admin.from("check_cast_backs").select("check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc, source_mode, product_sales_base, calculated_back_amount").in("check_id", ids)),
  ]);
  for (const r of [nomsR, linesR, backsR]) if (r.error) throw new Error(`会計明細: ${r.error.message}`);

  for (const b of (backsR.data ?? []) as Record<string, unknown>[]) {
    const cid = b.cast_id as string;
    const cur = backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0, calc: 0 };
    cur.drink += b.drink_back as number;
    cur.champ += b.champ_back as number;
    cur.bottle += b.bottle_back as number;
    cur.pt += b.hon_pt_alloc as number;
    cur.calc += (b.calculated_back_amount as number | null) ?? 0; // ★裁定113: 凍結値の単純Σ（再計算しない）
    backByCast.set(cid, cur);
    const bd = bizByCheck.get(b.check_id as string); // ★裁定490: 同じ値を営業日ごとにも積む
    if (bd) { const x = dayBack(cid, bd); x.drink += b.drink_back as number; x.champ += b.champ_back as number; x.bottle += b.bottle_back as number; x.pt += b.hon_pt_alloc as number; x.calc += (b.calculated_back_amount as number | null) ?? 0; }
  }
  // check_id → {champ,bottle} qty
  const qtyByCheck = new Map<string, { champ: number; bottle: number }>();
  for (const l of (linesR.data ?? []) as Record<string, unknown>[]) {
    const kind = l.kind as string;
    if (kind !== "champ" && kind !== "bottle") continue;
    const cur = qtyByCheck.get(l.check_id as string) ?? { champ: 0, bottle: 0 };
    if (kind === "champ") cur.champ += l.qty as number;
    else cur.bottle += l.qty as number;
    qtyByCheck.set(l.check_id as string, cur);
  }
  for (const n of (nomsR.data ?? []) as Record<string, unknown>[]) {
    const q = qtyByCheck.get(n.check_id as string);
    if (!q) continue;
    const cid = n.cast_id as string;
    const cur = champBottleByCast.get(cid) ?? { champCnt: 0, bottleCnt: 0 };
    cur.champCnt += q.champ;
    cur.bottleCnt += q.bottle;
    champBottleByCast.set(cid, cur);
    const bd = bizByCheck.get(n.check_id as string); if (bd) { const x = dayCb(cid, bd); x.champCnt += q.champ; x.bottleCnt += q.bottle; } // ★裁定490
  }
  return { backByCast, champBottleByCast, backByCastDate, champBottleByCastDate };
}

// mig0086: 率バックの母数＝窓内の指名料行（check_lines）を cast 別に集計（率バック設計 v1 裁定iii/vi）。
//   fee_kind in ('hon_shimei','jonai_shimei') ∧ cast_id not null（0084 が凍結）・母数は line_total（サ料・丸め前）。
//   ★窓と除外の系列＝drink_claims と同じ 0047 系列: checks!inner join・started_at [startTs, endTs)・
//     neq checks.status 'void'＝close 非依存（open 伝票の指名料行も当月給与に乗る・void のみ除外）。
//     per_count 系（get_cast_sales の本数）とは帰属系統が異なる＝rate はレジで「指名料を追加」した行のみが対象（裁定vi）。
async function loadShimeiAmounts(admin: SupabaseClient, storeId: string, win: PayrollWindow) {
  const { data, error } = await admin
    .from("check_lines")
    .select("cast_id, fee_kind, line_total, checks!inner(started_at, status)")
    .eq("store_id", storeId)
    .in("fee_kind", ["hon_shimei", "jonai_shimei"])
    .not("cast_id", "is", null)
    .not("checks.status", "in", "(void,merged)") // ★C③-16（mig0138）: 統合元 merged も除外（void と同じ述語）
    .gte("checks.started_at", win.startTs)
    .lt("checks.started_at", win.endTs);
  if (error) throw new Error(`指名料行: ${error.message}`);
  const byCast = new Map<string, { hon: number; jonai: number }>();
  const byCastDate = new Map<string, Map<string, { hon: number; jonai: number }>>(); // ★裁定490: 体入の日の指名料（率バックの母数）を引くための営業日ごとの値
  for (const r of (data ?? []) as { cast_id: string; fee_kind: string; line_total: number; checks?: { started_at?: string } | { started_at?: string }[] | null }[]) {
    const cur = byCast.get(r.cast_id) ?? { hon: 0, jonai: 0 };
    if (r.fee_kind === "hon_shimei") cur.hon += r.line_total;
    else cur.jonai += r.line_total;
    byCast.set(r.cast_id, cur);
    const ck = Array.isArray(r.checks) ? r.checks[0] : r.checks;
    if (ck?.started_at) { const d = bizDateOf(ck.started_at, win.cutoffHm); const m = byCastDate.get(r.cast_id) ?? byCastDate.set(r.cast_id, new Map()).get(r.cast_id)!; const x = m.get(d) ?? m.set(d, { hon: 0, jonai: 0 }).get(d)!; if (r.fee_kind === "hon_shimei") x.hon += r.line_total; else x.jonai += r.line_total; }
  }
  return Object.assign(byCast, { byDate: byCastDate });
}

// 窓内の shifts（確定）/attendance/punches を cast 別に読み、punch-io→matchPunches で days/lateN/absentN/日次hours を得る。
// export: /api/mine/norm-progress が同一定義（final∈{ok,late}）で days を再利用（SQL 再実装しない＝定義乖離防止）。
//   cast セッションの client を渡すと RLS パターン1 で自分の行のみ＝self スコープに自然に縮む。
export async function loadPunch(admin: SupabaseClient, storeId: string, win: PayrollWindow, grace: { lateGrace?: number; earlyGrace?: number; overGrace?: number }) {
  const [shiftsR, attR, punchR, dohanR, stR] = await Promise.all([
    // ★SD-4（2026-08-21・設計書 §1）: 給与分母は confirmed のみ＝この .eq は不変。
    //   mig0101 で status が 3値化（planned→proposed→confirmed）されたが、中間 status（proposed）は
    //   キャスト確認待ちの未確定＝給与の出勤分母に数えない。ここを広げる変更は SD-4 の再裁定が要る。
    admin.from("shifts").select("id, cast_id, date, start_hm, end_hm").eq("store_id", storeId).eq("status", "confirmed").gte("date", win.periodStart).lte("date", win.periodEnd), // ★324-3（便 L-2-4）: +id（shortfall の target_shift_id）
    admin.from("attendance").select("cast_id, date, status").eq("store_id", storeId).gte("date", win.periodStart).lte("date", win.periodEnd),
    admin.from("punches").select("cast_id, punched_at, type").eq("store_id", storeId).gte("punched_at", win.startTs).lt("punched_at", win.endTs),
    // ★便 PR-1 R-4（裁定417）: 同伴の正本＝伝票（check_nominations.is_dohan・void 除く・窓は drink_claims と同じ checks!inner started_at [startTs, endTs)）→ 営業日に同伴があれば遅刻免除（applyAttendance の dohan）
    admin.from("check_nominations").select("cast_id, checks!inner(started_at, status, store_id)").eq("is_dohan", true).eq("checks.store_id", storeId).neq("checks.status", "void").gte("checks.started_at", win.startTs).lt("checks.started_at", win.endTs),
    mig0197On() ? admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle() : Promise.resolve({ data: null as { settings_json?: unknown } | null }), // ★便 E（0197 用）: punch_mode（フラグ false＝読まない）
  ]);
  for (const r of [shiftsR, attR, punchR, dohanR]) if (r.error) throw new Error(`打刻: ${r.error.message}`);
  // ★0213／0214（相談役 11/25 の D4・D5）: 丸め（変えた営業日から）と休憩を時間に当てる＝実打刻の店だけ（確定シフトどおり・打刻しない店は当てない＝シフトの無い日も）。旗 false＝読まない（adjOf は常に null＝下の今の行をそのまま通る）
  const adjSettings = (stR.data?.settings_json ?? null) as Record<string, unknown> | null;
  const adjOf = dayAdjOfSource(mig0213On() || mig0214On() ? await loadDayAdjSource(admin, storeId, win.periodStart, win.periodEnd) : EMPTY_DAY_ADJ, { payTimeBasis: payTimeBasisOf(adjSettings, win.periodStart), punchMode: punchModeOf(adjSettings) });
  const byCast = new Map<string, { shifts: ShiftRow[]; shiftIds: Map<string, string>; att: AttendanceRow[]; punches: PunchRow[] }>();
  const ensure = (cid: string) => {
    let e = byCast.get(cid);
    if (!e) { e = { shifts: [], shiftIds: new Map(), att: [], punches: [] }; byCast.set(cid, e); }
    return e;
  };
  for (const s of (shiftsR.data ?? []) as Record<string, unknown>[]) { const e = ensure(s.cast_id as string); e.shifts.push({ date: s.date as string, start_hm: s.start_hm as string, end_hm: s.end_hm as string }); e.shiftIds.set(s.date as string, s.id as string); } // ★324-3: 日→shift id（同日 2 枠は後勝ち＝1 日 1 枠が前提）
  for (const a of (attR.data ?? []) as Record<string, unknown>[]) ensure(a.cast_id as string).att.push({ date: a.date as string, status: a.status as AttendanceRow["status"] });
  for (const p of (punchR.data ?? []) as Record<string, unknown>[]) ensure(p.cast_id as string).punches.push({ punched_at: p.punched_at as string, type: p.type as "in" | "out" });
  // ★PR-1 R-4: 同伴の営業日（cast 別）＝伝票の started_at を店の cutoff で営業日に
  const dohanDatesByCast = new Map<string, Set<string>>();
  for (const r of (dohanR.data ?? []) as { cast_id: string; checks: { started_at: string } | { started_at: string }[] | null }[]) {
    const ck = Array.isArray(r.checks) ? r.checks[0] : r.checks;
    if (!ck?.started_at) continue;
    (dohanDatesByCast.get(r.cast_id) ?? dohanDatesByCast.set(r.cast_id, new Set()).get(r.cast_id)!).add(bizDateOf(ck.started_at, win.cutoffHm));
  }

  const result = new Map<string, { noShiftHours: Map<string, number>; noShiftDates: string[]; days: number; lateN: number; absentN: number; anomalyCount: number; missingOutDates: string[]; hoursByDate: Map<string, number>; shiftHoursByDate: Record<string, number>; attendanceDays: number; shortfallDays: ShortfallDay[]; /** ★時間帯の時給: 働いた区間（営業日の分 0〜47 時）＝打刻の日・シフトの区間・シフトの無い日・打刻しない店でシフトの時間にした日 */ win: { punch: Map<string, [number, number]>; shift: Map<string, [number, number]>; noShift: Map<string, [number, number]>; storeShift: Set<string>; /** ★0214: 休憩で割った区間（丸め・休憩が効いた日だけ） */ punchSegs?: Map<string, [number, number][]>; noShiftSegs?: Map<string, [number, number][]> }; /** ★0214: 閉じていない休憩のまま退勤がある日（休憩開始〜退勤を休憩にした・要対応に 1 行） */ openBreakDates: string[]; roundNote: { days: number; unit: number; mode: string } | null; /** ★起票170: 勤務の時間から引いた休憩の分の和と日数（明細の注記・0 円＝表示だけ）。引いた日が無ければキーなし */ breakNote?: { min: number; days: number } }>();
  // 受給者判定（確認1・裁定）: final∈{ok,late}（確定シフトがある日に出勤）＝raw のみ（no_shift/absent）は含めない。
  const recipientsByDate = new Map<string, string[]>();
  const todayBiz = bizDateOf(new Date().toISOString(), win.cutoffHm); // ★X-13-27: 営業日の今日（store の cutoff）
  for (const [cid, raw] of byCast) {
    const attWithDohan = attendanceWithDohanOf(raw.att, dohanDatesByCast.get(cid) ?? new Set<string>(), (date) => ({ date, status: "shukkin" as AttendanceRow["status"] })); // ★PR-1 R-4（裁定417）: 伝票の同伴＝遅刻免除
    const built = buildMatchInput({ cutoffHm: win.cutoffHm, shifts: raw.shifts, attendance: attWithDohan, punches: raw.punches });
    const m = matchPunches({ ...built, config: { close: win.closeHm, lateGraceMin: grace.lateGrace, earlyGraceMin: grace.earlyGrace, overGraceMin: grace.overGrace } });
    const hoursByDate = new Map<string, number>();
    const punchWin = new Map<string, [number, number]>(), shiftWin = new Map<string, [number, number]>(), noShiftWin = new Map<string, [number, number]>(), storeShift = new Set<string>(); // ★時間帯の時給
    for (const sh of raw.shifts) { const a = hm2minOf(sh.start_hm), b = hm2minOf(sh.end_hm); if (b > a) shiftWin.set(sh.date, [a, b]); } // 時間＝end − start と同じ読み方（end ≦ start は 0＝区間なし）
    let anomalyCount = 0;
    const missingOutDates: string[] = []; // ★N3 AV-4: 退勤の記録が無い勤務（in はあり out が無い営業日・表示のみ）
    // ★裁定342（便 P169）: 日数・遅刻・当欠は営業日の今日までの日だけ（未来日の確定シフトは数えない＝純関数 punchCountsUpToOf・旧 m.lateN／m.absentN は未来日を含んでいた）
    let { days, lateN, absentN } = punchCountsUpToOf(m.days.map((d) => ({ bizDate: d.bizDate, finalType: d.final.type })), todayBiz); // ★便 E（0197）: 打刻しない店は下で上書き（let）
    // ★0154 D2: 確定シフトの時間（日別・shift_guarantee 用）と出勤区分（shukkin／late／dohan）の回数（per_shift 用）
    //   ★裁定342: 'shift' 基準の時給の母数も今日まで（未来日の確定シフトの時間は含めない＝shiftHoursUpToOf）
    const shiftHoursAll: Record<string, number> = {};
    for (const sh of raw.shifts) shiftHoursAll[sh.date] = (shiftHoursAll[sh.date] ?? 0) + Math.max(0, (hm2minOf(sh.end_hm) - hm2minOf(sh.start_hm)) / 60);
    const shiftHoursByDate = shiftHoursUpToOf(shiftHoursAll, todayBiz);
    const attendanceDays = raw.att.filter((a) => a.status === "shukkin" || a.status === "late" || a.status === "dohan").length;
    // ★324-3（便 L-2-4）: 確定シフトがある営業日の (shift id・開始／終了・in／out の HH:MM)＝shortfallRowsOf の入力（in なし＝無断欠勤は行にせず null で渡す）
    const shiftByDate = new Map(raw.shifts.map((sh) => [sh.date, sh]));
    const shortfallDays: ShortfallDay[] = [];
    const punchSegs = new Map<string, [number, number][]>(), noShiftSegs = new Map<string, [number, number][]>(), openBreakDates: string[] = []; // ★0214
    let roundNote: { days: number; unit: number; mode: string } | null = null; // ★0213（相談役 11/25 の便 E2）: 丸めが効いた日の数と規則（明細の注記 1 行）
    const noteRound = (adj: { rounding: { unit: number; mode: string } | null } | null) => { if (adj?.rounding && adj.rounding.unit > 1) roundNote = { days: (roundNote?.days ?? 0) + 1, unit: adj.rounding.unit, mode: adj.rounding.mode }; };
    let breakNote: { min: number; days: number } | null = null; // ★起票170（便 M の M2-8）: 日の窓で引いた休憩の分（時間の計算は変えない＝窓の breakMin を足すだけ）
    const noteBreak = (w: { breakMin: number } | null) => { if (w && w.breakMin > 0) breakNote = { min: (breakNote?.min ?? 0) + w.breakMin, days: (breakNote?.days ?? 0) + 1 }; };
    for (const d of m.days) {
      const adj = adjOf(cid, d.bizDate); // ★0213／0214: 丸め・休憩の無い日は null＝今の 2 行のまま
      if (!adj) {
      hoursByDate.set(d.bizDate, dayWorkedHours(d));
      { const ia = d.raw.in.type === "ok" || d.raw.in.type === "late" ? d.raw.in.act : null, oa = d.raw.out.type === "ok" || d.raw.out.type === "early" || d.raw.out.type === "over" ? d.raw.out.out : null; if (ia && oa && hm2minOf(oa) > hm2minOf(ia)) punchWin.set(d.bizDate, [hm2minOf(ia), hm2minOf(oa)]); } // ★時間帯の時給: dayWorkedHours と同じ in／out
      } else { // ★0213／0214: 同じ in／out を日の窓（丸めてから休憩で割る）に＝時間と帯の区間が同じ窓
        const ia = d.raw.in.type === "ok" || d.raw.in.type === "late" ? d.raw.in.act : null, oa = d.raw.out.type === "ok" || d.raw.out.type === "early" || d.raw.out.type === "over" ? d.raw.out.out : null;
        const w = ia && oa ? dayWindowOf(hm2minOf(ia), hm2minOf(oa), adj) : null;
        hoursByDate.set(d.bizDate, w ? w.workMin / 60 : 0);
        if (w && w.outMin > w.inMin) { punchWin.set(d.bizDate, [w.inMin, w.outMin]); punchSegs.set(d.bizDate, w.segs); }
        if (w?.openBreak) openBreakDates.push(d.bizDate);
        if (w) noteRound(adj);
        if (w && w.workMin > 0) noteBreak(w); // ★起票170
      }
      const sh = shiftByDate.get(d.bizDate), sid = raw.shiftIds.get(d.bizDate);
      if (sh && sid) shortfallDays.push({ bizDate: d.bizDate, shiftId: sid, startHm: sh.start_hm, endHm: sh.end_hm,
        inHm: d.raw.in.type === "ok" || d.raw.in.type === "late" ? d.raw.in.act : null,
        outHm: d.raw.out.type === "ok" || d.raw.out.type === "early" || d.raw.out.type === "over" ? d.raw.out.out : null });
      if (d.final.type === "ok" || d.final.type === "late") { // 受給者判定（出勤インセンティブ）は不変＝final ok／late（打刻がある日）。★裁定342 の射程外（未来日に打刻は無い・payroll suite の fixture は未来月に打刻を置く）
        (recipientsByDate.get(d.bizDate) ?? recipientsByDate.set(d.bizDate, []).get(d.bizDate)!).push(cid);
      }
      // ★X-13-27（便 X-13d-2a）: 不整合・退勤なしは今日までの営業日だけ（未来日の確定シフトは数えない＝純関数 anomalyFlagsOf）
      const af = anomalyFlagsOf({ bizDate: d.bizDate, anomalies: d.anomalies, rawOutType: d.raw.out.type, finalType: d.final.type }, todayBiz);
      if (af.counted) anomalyCount += 1;
      if (af.missingOut) missingOutDates.push(d.bizDate); // ★N3 AV-4
    }
    // ★便 M-10（Agoora 確定 10/26 ⑧）: シフト無し出勤＝in の打刻がある営業日で確定シフトが無い日（今日まで）。時給は付かない（仕様維持）＝要対応に出して当日追加配置で後追い
    const shiftDates = new Set(raw.shifts.map((s) => s.date));
    const noShiftDates = [...new Set(raw.punches.filter((p) => p.type === "in").map((p) => bizDateOf(p.punched_at, win.cutoffHm)))].filter((d) => !shiftDates.has(d) && d <= todayBiz).sort();
    // ★裁定431 ⑥（Agoora 確定 10/26）: シフト無し出勤の日の打刻時間（その営業日の最初の in〜最後の out）＝雇用だけ時給に入れる（委託は従来どおり時給なし）
    const noShiftHours = noShiftHoursOf(raw.punches, noShiftDates, win.cutoffHm); // ★裁定501-8: 純関数に切り出した（式は同じ）
    for (const d of noShiftDates) { // ★時間帯の時給: noShiftHoursOf と同じ最初の in〜最後の out を 0〜47 時の分で
      const ps = raw.punches.filter((p) => bizDateOf(p.punched_at, win.cutoffHm) === d).map((p) => ({ t: new Date(p.punched_at).getTime(), at: p.punched_at, type: p.type })).sort((a, b) => a.t - b.t);
      const fi = ps.find((p) => p.type === "in"); const lo = [...ps].reverse().find((p) => p.type === "out" && fi && p.t > fi.t);
      const adj = fi && lo ? adjOf(cid, d) : null; // ★0213／0214: 丸め・休憩のある日だけ分（秒は切り捨て）にして窓を作る
      if (adj && fi && lo) { const w = dayWindowOf(minOfBizDay(fi.at, d), minOfBizDay(lo.at, d), adj); if (w && w.workMin > 0) { noShiftHours.set(d, w.workMin / 60); noteRound(adj); noteBreak(w); /* ★起票170 */ } else noShiftHours.delete(d); if (w && w.outMin > w.inMin) { noShiftWin.set(d, [w.inMin, w.outMin]); noShiftSegs.set(d, w.segs); } if (w?.openBreak) openBreakDates.push(d); }
      else if (fi && lo) { const a = hm2minOf(liftPunchAt(fi.at, win.cutoffHm).hm), b = a + (lo.t - fi.t) / 60_000; if (b > a) noShiftWin.set(d, [a, b]); } // ★2026-11-25（M4 ア）: 長さは noShiftHoursOf と同じミリ秒の差（分に丸めない＝秒があっても時間と一致）
    }
    // ★便 E（0197 用＝裁定455 の 2）: 打刻しない店（punch_mode='store'）＝打刻が無い日は確定シフトの時間を実働・日数／遅刻／当欠は勤怠（attendance）で決める（今日まで）。フラグ false／'punch' は従来と 1 バイト同値
    if (punchModeOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null) === "store") {
      const attBy = new Map(raw.att.map((a) => [a.date, a.status]));
      const upTo = raw.shifts.filter((s) => s.date <= todayBiz);
      const offDay = (d: string) => { const st = attBy.get(d); return st === "absent" || st === "off"; };
      const attended = storeModeAttendedDatesOf(upTo, attBy, todayBiz); // ★0197 フラグ便（裁定456 の 18）: 出勤した日＝確定シフトの日で 当欠／休み でない日
      days = attended.length; lateN = upTo.filter((s) => attBy.get(s.date) === "late").length; absentN = upTo.filter((s) => attBy.get(s.date) === "absent").length;
      for (const s of upTo) if ((hoursByDate.get(s.date) ?? 0) === 0 && !offDay(s.date)) { hoursByDate.set(s.date, Math.max(0, (hm2minOf(s.end_hm) - hm2minOf(s.start_hm)) / 60)); storeShift.add(s.date); }
      // ★0197 フラグ便（裁定456 の 18）: 出勤インセンティブの受給者判定＝確定シフトのある日を出勤扱い（当欠／休みは除く・打刻の final ok／late で既に入っている日は重複させない）
      for (const d of attended) { const list = recipientsByDate.get(d) ?? recipientsByDate.set(d, []).get(d)!; if (!list.includes(cid)) list.push(cid); }
    }
    result.set(cid, { noShiftHours, noShiftDates, days, lateN, absentN, anomalyCount, missingOutDates, hoursByDate, shiftHoursByDate, attendanceDays, shortfallDays, win: { punch: punchWin, shift: shiftWin, noShift: noShiftWin, storeShift, ...(punchSegs.size ? { punchSegs } : {}), ...(noShiftSegs.size ? { noShiftSegs } : {}) }, openBreakDates: openBreakDates.sort(), roundNote, ...((breakNote as { min: number; days: number } | null) ? { breakNote: breakNote as unknown as { min: number; days: number } } : {}) });
  }
  // pooled 端数 +1 の順序を確定させるため cast_id 昇順にソート
  for (const [d, list] of recipientsByDate) recipientsByDate.set(d, list.sort());
  return { byCast: result, recipientsByDate };
}

// F2e-1: E9 対象 receivable を cast 別・古い順で読む。
//   対象＝status='open' and deduct_from_cast=true で、当該 period P に帰属：
//     deduct_period = P  OR  (deduct_period is null and biz_date(started_at)→'YYYY-MM' = P)。
//   古い順＝coalesce(deduct_period, biz_date-period) asc, created_at asc, id asc。
//   remaining = amount − deducted_amount（open ゆえ >0）。deducted は #8 で status によりここで除外済み。
async function loadReceivables(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Receivable[]>> {
  const { data, error } = await admin
    .from("receivables")
    .select("id, cast_id, amount, deducted_amount, deduct_period, created_at, check_id, checks(started_at)")
    .eq("store_id", storeId).eq("status", "open").eq("deduct_from_cast", true);
  if (error) throw new Error(`receivables: ${error.message}`);
  const rows: Receivable[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (r.cast_id == null) continue; // cast 未紐付けは天引き対象外
    const deductPeriod = (r.deduct_period as string | null) ?? null;
    // biz_date→period（started_at を cutoff 正規化・biz-date.ts が正本＝確認2 の started_at→biz_date 基準）
    const chk = r.checks as { started_at?: string } | null;
    const bizPeriod = chk?.started_at ? bizDateOf(chk.started_at, win.cutoffHm).slice(0, 7) : null;
    const effPeriod = deductPeriod ?? bizPeriod;
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, createdAt: r.created_at as string,
    });
  }
  // 古い順（effPeriod asc, created_at asc, id asc）
  rows.sort((a, b) =>
    a.effPeriod < b.effPeriod ? -1 : a.effPeriod > b.effPeriod ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Receivable[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// F2e-2: E9 同型で前借り（advances）を cast 別・古い順で読む（receivables の写し）。
//   対象＝status='open' で当該 period P に帰属：deduct_period = P OR (null and to_char(advanced_on,'YYYY-MM') = P)。
//   古い順＝coalesce(deduct_period, advanced_on-period) asc, created_at asc, id asc。remaining=amount−deducted_amount。
//   cast_id は not null（1 advance=1 cast）。繰越あり（finalize が partial 時に deduct_period=翌 period を設定）。
async function loadAdvances(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Advance[]>> {
  const { data, error } = await admin
    .from("advances")
    .select("id, cast_id, amount, deducted_amount, deduct_period, advanced_on, created_at")
    .eq("store_id", storeId).eq("status", "open");
  if (error) throw new Error(`advances: ${error.message}`);
  const rows: Advance[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const deductPeriod = (r.deduct_period as string | null) ?? null;
    const advancedOn = r.advanced_on as string; // 'YYYY-MM-DD'（date・cutoff 非依存）
    const effPeriod = deductPeriod ?? advancedOn.slice(0, 7);
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, createdAt: r.created_at as string,
    });
  }
  rows.sort((a, b) =>
    a.effPeriod < b.effPeriod ? -1 : a.effPeriod > b.effPeriod ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Advance[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// F2e-2: 送り実費（transport）を cast 別・古い順（biz_date FIFO）で読む。繰越なし＝period は biz_date→'YYYY-MM' 固定。
//   対象＝status='open' で to_char(biz_date,'YYYY-MM') = P。古い順＝biz_date asc, created_at asc, id asc。
async function loadTransport(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, Transport[]>> {
  const { data, error } = await admin
    .from("transport")
    .select("*")   // ★裁定414（S-4 ③）: mode 列（0177）を読む＝列が無い間（適用前）も通る形
    .eq("store_id", storeId).eq("status", "open");
  if (error) throw new Error(`transport: ${error.message}`);
  const rows: Transport[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const mode = (r.mode as string | null | undefined) ?? "actual";
    if (!okuriDeductOf(mode)) continue; // ★裁定414（S-4 ③）: 店負担（store）は給与から控除しない
    const bizDate = r.biz_date as string; // 'YYYY-MM-DD'（cutoff 正規化済み・繰越なし）
    const effPeriod = bizDate.slice(0, 7);
    if (effPeriod !== win.period) continue; // 当該 period 帰属のみ
    const amount = r.amount as number;
    const deductedAmount = (r.deducted_amount as number) ?? 0;
    rows.push({
      id: r.id as string, castId: r.cast_id as string, amount, deductedAmount,
      remaining: amount - deductedAmount, effPeriod, bizDate, createdAt: r.created_at as string, mode,
    });
  }
  // 古い順（biz_date asc, created_at asc, id asc）＝送り実費の発生日 FIFO
  rows.sort((a, b) =>
    a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 :
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byCast = new Map<string, Transport[]>();
  for (const r of rows) (byCast.get(r.castId) ?? byCast.set(r.castId, []).get(r.castId)!).push(r);
  return byCast;
}

// ★裁定98-C: 平均賃金（労基法12条の骨格）＝直近3確定期（finalized/paid・当期より前・period 降順）の
//   payslips 凍結値から cast 別に算出。原則 = floor(Σgross ÷ Σ暦日数)・最低保障 = floor(Σgross ÷ Σ出勤日数 × 0.6)
//   （0.6 は 3/5 の整数演算・Σ出勤日数=0 なら原則のみ）。採用値 = max(原則, 最低保障)。
//   確定期 0 本／本人 payslip 0 枚は Map 不在（=null）＝pay.ts 側の暫定式（provisional）に委ねる。
//   暦日数は periodDaysBetween/periodCalendarDays（core:periodDays と同一写像＝裁定23 の系列）。
async function loadAvgDailyWage(admin: SupabaseClient, storeId: string, period: string): Promise<Map<string, number>> {
  const byCast = new Map<string, number>();
  const { data: runs, error: eR } = await admin
    .from("payroll_runs").select("id, period")
    .eq("store_id", storeId).in("status", ["finalized", "paid"])
    .lt("period", period).order("period", { ascending: false }).limit(3);
  if (eR) throw new Error(`payroll_runs: ${eR.message}`);
  const runRows = (runs ?? []) as { id: string; period: string }[];
  if (runRows.length === 0) return byCast;
  const calDaysByRun = new Map<string, number>();
  for (const r of runRows) calDaysByRun.set(r.id, periodCalendarDays(r.period));
  const { data: slips, error: eS } = await admin
    .from("payslips").select("run_id, cast_id, breakdown_json")
    .in("run_id", runRows.map((r) => r.id));
  if (eS) throw new Error(`payslips(平均賃金): ${eS.message}`);
  const acc = new Map<string, { gross: number; cal: number; wdays: number }>();
  for (const s of (slips ?? []) as Record<string, unknown>[]) {
    const pay = (s.breakdown_json as Record<string, unknown> | null)?.pay as Record<string, unknown> | undefined;
    if (!pay || typeof pay.gross !== "number") continue; // 凍結形が読めない行は分母にも入れない
    const cid = s.cast_id as string;
    const cur = acc.get(cid) ?? { gross: 0, cal: 0, wdays: 0 };
    cur.gross += pay.gross as number;
    cur.cal += calDaysByRun.get(s.run_id as string) ?? 0;
    cur.wdays += Array.isArray(pay.wdays) ? (pay.wdays as unknown[]).length : 0;
    acc.set(cid, cur);
  }
  for (const [cid, a] of acc) {
    if (a.cal <= 0) continue;
    const principle = Math.floor(a.gross / a.cal);
    const floor60 = a.wdays > 0 ? Math.floor((a.gross * 3) / (a.wdays * 5)) : null;
    byCast.set(cid, floor60 === null ? principle : Math.max(principle, floor60));
  }
  return byCast;
}

// #32: published の attendance_incentives を biz_date∈[periodStart,periodEnd] で読む（確認2: biz_date 基準統一）。
async function loadIncentives(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Incentive[]> {
  const { data, error } = await admin
    .from("attendance_incentives")
    .select("id, biz_date, amount_mode, amount, target_cast_ids, reason")
    .eq("store_id", storeId).eq("status", "published")
    .gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd);
  if (error) throw new Error(`attendance_incentives: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, bizDate: r.biz_date as string,
    amountMode: r.amount_mode as "per_head" | "pooled", amount: r.amount as number,
    // E8-4（mig0095）: null=全員（現行互換）。配列の交差は core 側＝ここは素通し。
    targetCastIds: (r.target_cast_ids as string[] | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  }));
}

// 期間データ一括収集 → CastRaw[]（対象 cast 列挙・裁定C）。
// ★裁定258／264: run 別調整控除（payroll_adjustments）を cast 別に読む。run 行（store×period）が無ければ空 Map。
//   admin 読取（他の集計表と同じ経路・storeId は route guard が org 内を照合済み）。行は created_at, id 順＝率行は同一 gross に掛かるため順序で金額は動かない（258-2）。
export async function loadPayrollAdjustments(admin: SupabaseClient, storeId: string, period: string): Promise<Map<string, AdjustmentRow[]>> {
  const byCast = new Map<string, AdjustmentRow[]>();
  const { data: run, error: eR } = await admin.from("payroll_runs").select("id").eq("store_id", storeId).eq("period", period).maybeSingle();
  if (eR) throw new Error(`payroll_runs(調整控除): ${eR.message}`);
  if (!run) return byCast;
  const q0 = admin
    .from("payroll_adjustments")
    .select("cast_id, mode, amount, rate_bp, before_withholding, show_detail, reason, source") // ★裁定431 ①: +source
    .eq("run_id", run.id as string);
  const { data, error } = await (rules0175On() ? q0.is("cancelled_at", null) : q0) // ★便 P175-prep P-2（裁定413 I-3・0175 v2 ★12 cancelled_at）: 取消済みは控除しない（フラグ false＝列を触らない）
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(`payroll_adjustments: ${error.message}`);
  type R = { cast_id: string; mode: "fixed" | "rate"; amount: number | null; rate_bp: number | null; before_withholding: boolean; show_detail: boolean; reason: string; source?: string | null };
  for (const r of (data ?? []) as R[]) {
    const cur = byCast.get(r.cast_id) ?? [];
    cur.push({ castId: r.cast_id, kind: r.mode, amount: r.amount, rateBp: r.rate_bp, beforeWithholding: r.before_withholding, showDetail: r.show_detail, reason: r.reason, ...(r.source ? { source: r.source } : {}) });
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}

// ★0156（裁定309-6・便 V-2）: 日払い済み（daily_pays）を cast 別に集計＝run 期間内の gross 合計・源泉既徴収額・件数。
//   ★RPC daily_pays_of_run は JWT（auth_org_id）前提＝service キーの collect からは 'forbidden' になるため、他の集計表と同じく admin で表を直読
// ★0158（裁定312・便 AA-3）: 属する期＝settle_period（null＝営業日の月）＝RPC の coalesce(settle_period, to_char(biz_date,'YYYY-MM')) = period と同じ集合。
//   支払済み期の営業日で発行した日払いは翌月へ繰り下がる（settle_period＝翌月）＝営業日の月の run には載せず、繰り下げ先の run に載せる。前借り（advances）は deduct_period のまま
//   （payroll_adjustments と同型・RLS は definer 相当のバイパス・storeId は route guard が org 内を照合済み）。式は RPC と同一（store×期間・cast 別 Σgross／Σwithholding／count）。
// ★0172（裁定349・便 P172）: 種別 kind（settlement＝日次精算／advance＝前払）を別に合計する＝settlement は課税ベースから除外・advance は支給後控除のみ（pay.ts）。
export type DailyPaidSum = { gross: number; withheld: number; n: number; settlementGross: number; advanceGross: number };
export async function loadDailyPays(admin: SupabaseClient, storeId: string, win: PayrollWindow): Promise<Map<string, DailyPaidSum>> {
  const byCast = new Map<string, DailyPaidSum>();
  const q0 = admin.from("daily_pays").select("cast_id, gross, withholding, kind")
    .eq("store_id", storeId)
    .or(`settle_period.eq.${win.period},and(settle_period.is.null,biz_date.gte.${win.periodStart},biz_date.lte.${win.periodEnd})`);
  const { data, error } = await (rules0175On() ? q0.is("cancelled_at", null) : q0); // ★便 P175-prep P-2（裁定413 I-3・0175 v2 ★12）: 取消済みの日払いは既払いに数えない（フラグ false＝列を触らない）
  if (error) throw new Error(`daily_pays: ${error.message}`);
  for (const r of (data ?? []) as { cast_id: string; gross: number; withholding: number; kind: string | null }[]) {
    const cur = byCast.get(r.cast_id) ?? { gross: 0, withheld: 0, n: 0, settlementGross: 0, advanceGross: 0 };
    cur.gross += r.gross; cur.withheld += r.withholding; cur.n += 1;
    if (r.kind === "advance") cur.advanceGross += r.gross; else cur.settlementGross += r.gross; // 既定（null・旧行）＝settlement（0172 の列既定と同じ）
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}

// ★0156（裁定309-8＝300 追補1・便 V-2）: run 別控除上書き（payroll_run_deduction_overrides）を cast 別に読む。run 行（store×period）が無ければ空 Map。
//   RPC payroll_run_deduction_overrides_of は JWT 前提＝collect（admin）は表を直読（loadPayrollAdjustments と同型）。
export async function loadDeductionOverrides(admin: SupabaseClient, storeId: string, period: string): Promise<Map<string, DeductionOverride[]>> {
  const byCast = new Map<string, DeductionOverride[]>();
  const { data: run, error: eR } = await admin.from("payroll_runs").select("id").eq("store_id", storeId).eq("period", period).maybeSingle();
  if (eR) throw new Error(`payroll_runs(控除上書き): ${eR.message}`);
  if (!run) return byCast;
  const { data, error } = await admin.from("payroll_run_deduction_overrides").select("cast_id, deduction_id, enabled, amount_override").eq("run_id", run.id as string);
  if (error) throw new Error(`payroll_run_deduction_overrides: ${error.message}`);
  for (const r of (data ?? []) as { cast_id: string; deduction_id: string; enabled: boolean; amount_override: number | null }[]) {
    const cur = byCast.get(r.cast_id) ?? [];
    cur.push({ deductionId: r.deduction_id, enabled: r.enabled, amountOverride: r.amount_override });
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}

// ★0195（裁定447 ④）: キャスト別の適用（deduction_rule_casts＝rule×cast・enabled／amount_override）を cast 別に読む（run 別の上書きと同じ形）。行が無い cast は Map に無い。
export async function loadDeductionRuleCasts(admin: SupabaseClient, storeId: string): Promise<Map<string, DeductionOverride[]>> {
  const byCast = new Map<string, DeductionOverride[]>();
  const { data, error } = await admin.from("deduction_rule_casts").select("cast_id, rule_id, enabled, amount_override").eq("store_id", storeId);
  if (error) throw new Error(`deduction_rule_casts: ${error.message}`);
  for (const r of (data ?? []) as { cast_id: string; rule_id: string; enabled: boolean; amount_override: number | null }[]) {
    const cur = byCast.get(r.cast_id) ?? [];
    cur.push({ deductionId: r.rule_id, enabled: r.enabled, amountOverride: r.amount_override });
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}
// ★0195（裁定447 差し替え版）: その期の cast_day_deductions（既定と違う日だけ行）を cast 別に読む。
export async function loadDayDeductions(admin: SupabaseClient, storeId: string, win: { periodStart: string; periodEnd: string }): Promise<Map<string, DayDeductionRow[]>> {
  const byCast = new Map<string, DayDeductionRow[]>();
  const { data, error } = await admin.from("cast_day_deductions").select("cast_id, deduction_id, biz_date, enabled").eq("store_id", storeId).gte("biz_date", win.periodStart).lte("biz_date", win.periodEnd);
  if (error) throw new Error(`cast_day_deductions: ${error.message}`);
  for (const r of (data ?? []) as { cast_id: string; deduction_id: string; biz_date: string; enabled: boolean }[]) {
    const cur = byCast.get(r.cast_id) ?? [];
    cur.push({ deductionId: r.deduction_id, bizDate: String(r.biz_date), enabled: r.enabled });
    byCast.set(r.cast_id, cur);
  }
  return byCast;
}

export async function collectPeriod(
  admin: SupabaseClient,
  managerClient: SupabaseClient,
  storeId: string,
  win: PayrollWindow,
): Promise<CollectResult> {
  // 按分 DB 権威: get_cast_sales は manager クライアントで（D7a）。
  // ★2026-11-18 夜（相談役 ③）: 店の売上の基準（sales_basis）＝'subtotal' の店だけ get_cast_sales_subtotal（0201q）。鍵の無い店は今までどおり get_cast_sales
  const { data: stSB } = await admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
  const salesRpc = salesRpcOf(salesBasisOf((stSB?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()));
  const { data: salesData, error: eS } = await managerClient.rpc(salesRpc, {
    p_store_id: storeId, p_from: win.periodStart, p_to: win.periodEnd,
  });
  if (eS) throw new Error(`${salesRpc}: ${eS.message}`);
  const salesRows = (salesData ?? []) as SalesRow[];

  const [{ plansById, slidePeriodByPlan, slideBasisByPlan, slideRankIdsByPlan, slideApplyByPlan, planNormById, normAxes, castPlanByCast, guaranteesByCast, masters, normByCast, taxByCast, depByCast, grace, trialTerms }, acct, incentives, receivablesByCast, advancesByCast, transportByCast, shimeiAmtByCast, avgWageByCast] = await Promise.all([
    loadMasters(admin, storeId, win.period, win.periodEnd, win.periodStart), // ★324（便 L-2-3）
    loadAccounting(admin, storeId, win),
    loadIncentives(admin, storeId, win),
    loadReceivables(admin, storeId, win),
    loadAdvances(admin, storeId, win),
    loadTransport(admin, storeId, win),
    loadShimeiAmounts(admin, storeId, win), // mig0086: 率バック母数
    loadAvgDailyWage(admin, storeId, win.period), // ★裁定98-C: 平均賃金（直近3確定期）
  ]);
  const { byCast: punchByCast, recipientsByDate } = await loadPunch(admin, storeId, win, grace);
  // ★時間帯の時給（旗 HOURLY_BANDS_ON＝false の間は読まない＝今と 1 バイト同じ）: プランの時給の帯（plan_rate_bands target 'hourly'・有効な行）
  const hourlyBandsByPlan = new Map<string, RateBand[]>();
  if (hourlyBandsOn()) {
    const planIds = [...new Set([...castPlanByCast.values()].map((x) => x.planId))];
    if (planIds.length) {
      const { data: hb, error: eHb } = await admin.from("plan_rate_bands").select("plan_id, target, from_min, to_min, value_amount, value_rate, priority").in("plan_id", planIds).eq("target", "hourly").eq("is_active", true);
      if (eHb) throw new Error(`plan_rate_bands: ${eHb.message}`);
      for (const b of (hb ?? []) as (RateBand & { plan_id: string })[]) (hourlyBandsByPlan.get(b.plan_id) ?? hourlyBandsByPlan.set(b.plan_id, []).get(b.plan_id)!).push({ target: b.target, from_min: b.from_min, to_min: b.to_min, value_amount: b.value_amount, value_rate: b.value_rate, priority: b.priority });
    }
  }

  // sales を cast 別に集計＋日次
  // ★裁定346（便 N1013b）: 期間合計は純関数 sumCastSales（ランキングの売上軸・/mine ノルマ進捗と同じ関数）＝値は従来の合算と同一。日次は従来どおりここで積む
  const salesByCast = new Map<string, { sales: number; hon: number; jonai: number; dohan: number; daily: Map<string, number> }>();
  for (const [cid, tot] of sumCastSales(salesRows)) salesByCast.set(cid, { ...tot, daily: new Map() });
  for (const r of salesRows) {
    const cur = salesByCast.get(r.cast_id)!;
    cur.daily.set(r.biz_date, (cur.daily.get(r.biz_date) ?? 0) + r.sales);
  }

  // 対象 cast = sales ∪ punch（is_active 不問・稼働ゼロ除外）
  const targetIds = new Set<string>([...salesByCast.keys(), ...punchByCast.keys()]);
  // ★裁定338＋追補1（0168・便 P168）: 期間累計（monthly／half）＝cast ごとに有効プランの slide_period で期間キーを決め、日次売上（按分後）と pts（castPts＝指名回数＋pt 商品）を期間ごとに累計。
  //   'next'（店設定 slide_apply）は「前の期間の累計」。期の外や半月の窓は get_cast_sales／loadAccounting を窓ごとに引く（pt は窓単位）。daily のプランは従来どおり（slideByDay なし）。
  //   プレビュー＝期の末日が今日より後なら暫定（provisional）。確定（finalize）は期末後に走る＝期間全体の累計で段確定。
  const slideTodayBiz = bizDateOf(new Date().toISOString(), win.cutoffHm);
  // ★便 P174 T-4（裁定395・0174 ★4）→★便 X13-H H-8: キャストごとの判定タイミング＝有効プランの slide_apply だけ（null＝当期の累計）。店の slide_apply は読まない（保存先を 1 か所＝プラン）
  const applyOf = (cid: string): "next" | "current" => { const cpx = castPlanByCast.get(cid); return (cpx ? slideApplyByPlan.get(cpx.planId) : undefined) ?? "current"; };
  const anyNext = [...targetIds].some((cid) => applyOf(cid) === "next");
  // ★夜間便 N3b（裁定288-1／288-6）: slide_apply='next' の店でだけ、期に含まれる各暦月の「前月の窓」を同じ式（get_cast_sales＋loadAccounting）で集計。
  //   'current'／欠損の店は fetch 0（従来と同一）。cast 別に { 営業日の暦月 → 前月の合計（sales／pts） } を持つ。
  //   ★便 P174 T-4（裁定395）: 判定タイミングはキャストのプラン（slide_apply）→店設定の順＝対象に 'next' のキャストが 1 人でもいれば集計（使うのは 'next' のキャストだけ）
  const prevTotalsByCast = new Map<string, Record<string, { sales: number; pts: number }>>();
  if (anyNext) {
    for (const month of monthsInRange(win.periodStart, win.periodEnd)) {
      const prev = prevMonthOf(month);
      const prevStart = `${prev}-01`, prevEnd = lastDayOf(prev);
      const prevWin: PayrollWindow = { ...win, period: prev, periodStart: prevStart, periodEnd: prevEnd,
        startTs: `${prevStart}T${win.cutoffHm}:00+09:00`, endTs: `${addDaysYmd(prevEnd, 1)}T${win.cutoffHm}:00+09:00` };
      const [{ data: prevSales, error: ePs }, prevAcct] = await Promise.all([
        managerClient.rpc(salesRpc, { p_store_id: storeId, p_from: prevStart, p_to: prevEnd }), /* ★2026-11-18 夜（③）: 前の期も同じ基準 */
        loadAccounting(admin, storeId, prevWin),
      ]);
      if (ePs) throw new Error(`get_cast_sales(prev ${prev}): ${ePs.message}`);
      const agg = new Map<string, { sales: number; hon: number; jonai: number; dohan: number }>();
      for (const r of (prevSales ?? []) as SalesRow[]) {
        const cur = agg.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 };
        cur.sales += r.sales; cur.hon += r.hon; cur.jonai += r.jonai; cur.dohan += r.dohan; agg.set(r.cast_id, cur);
      }
      const castIds = new Set<string>([...agg.keys(), ...prevAcct.backByCast.keys()]);
      for (const cid of castIds) {
        const a = agg.get(cid) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 };
        const pts = castPts(a, prevAcct.backByCast.get(cid)?.pt ?? 0); // 現行の当月 pts と同じ式（castPts）を前月の窓に当てる
        const rec = prevTotalsByCast.get(cid) ?? {}; rec[month] = { sales: a.sales, pts }; prevTotalsByCast.set(cid, rec);
      }
    }
  }


  const slidePeriodByCast = new Map<string, SlidePeriod>();
  for (const cid of targetIds) { const cpx = castPlanByCast.get(cid); const sp = cpx ? slidePeriodByPlan.get(cpx.planId) ?? "daily" : "daily"; if (sp !== "daily") slidePeriodByCast.set(cid, sp); }
  // ★裁定343（0170・便 W5-2b）: 判定基準（件数）＝monthly／half は期間累計の sales 枠に件数（slideBasisValueOf）・daily は営業日ごとの件数（slideDailyBasis）。sales のキャストは従来どおり（格納しない）
  const slideBasisByCast = new Map<string, SlideBasis>();
  const slideDailyBasisByCast = new Map<string, Record<string, number>>();
  for (const cid of targetIds) {
    const cpx = castPlanByCast.get(cid); const b = cpx ? slideBasisByPlan.get(cpx.planId) ?? "sales" : "sales";
    if (b === "sales") continue;
    slideBasisByCast.set(cid, b);
    if (!slidePeriodByCast.has(cid)) {
      const byDay: Record<string, number> = {};
      for (const x of salesRows) if (x.cast_id === cid) byDay[x.biz_date] = (byDay[x.biz_date] ?? 0) + slideBasisValueOf(b, x);
      slideDailyBasisByCast.set(cid, byDay);
    }
  }
  const slideTotalsByCast = new Map<string, SlideTotals>();
  if (slidePeriodByCast.size > 0) {
    type Agg = { sales: number; hon: number; jonai: number; dohan: number; pt: number };
    const needKeys = new Set<string>();
    for (const [cid0, sp] of slidePeriodByCast) for (const k of periodKeysInRange(win.periodStart, win.periodEnd, sp)) needKeys.add(applyOf(cid0) === "next" ? prevPeriodKeyOf(k) : k); // ★便 P174 T-4: キャストごと
    const totalsByKey = new Map<string, Map<string, Agg>>();
    for (const key of needKeys) {
      const r = periodRangeOfKey(key);
      const inWin = r.start >= win.periodStart && r.end <= win.periodEnd;
      let rows: SalesRow[];
      if (inWin) rows = salesRows.filter((x) => x.biz_date >= r.start && x.biz_date <= r.end);
      else { const { data, error } = await managerClient.rpc(salesRpc, { p_store_id: storeId, p_from: r.start, p_to: r.end }); if (error) throw new Error(`${salesRpc}(${key}): ${error.message}`); rows = (data ?? []) as SalesRow[]; } /* ★2026-11-18 夜（③）: 期の外・半月の窓も同じ基準 */
      const whole = inWin && r.start === win.periodStart && r.end === win.periodEnd;
      const wk: PayrollWindow = { ...win, period: key.slice(0, 7), periodStart: r.start, periodEnd: r.end, startTs: `${r.start}T${win.cutoffHm}:00+09:00`, endTs: `${addDaysYmd(r.end, 1)}T${win.cutoffHm}:00+09:00` };
      const a2 = whole ? acct : await loadAccounting(admin, storeId, wk);
      const mm = new Map<string, Agg>();
      for (const x of rows) { const cur = mm.get(x.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0, pt: 0 }; cur.sales += x.sales; cur.hon += x.hon; cur.jonai += x.jonai; cur.dohan += x.dohan; mm.set(x.cast_id, cur); }
      for (const [cid2, b] of a2.backByCast) { const cur = mm.get(cid2) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0, pt: 0 }; cur.pt = b.pt; mm.set(cid2, cur); }
      totalsByKey.set(key, mm);
    }
    for (const [cid, sp] of slidePeriodByCast) {
      const rec: SlideTotals = {};
      for (const k of periodKeysInRange(win.periodStart, win.periodEnd, sp)) {
        const src = applyOf(cid) === "next" ? prevPeriodKeyOf(k) : k; // ★便 P174 T-4
        const a = totalsByKey.get(src)?.get(cid) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0, pt: 0 };
        const b = slideBasisByCast.get(cid);
        if (b) rec[k] = { sales: slideBasisValueOf(b, a), pts: castPts(a, a.pt) }; // ★裁定343: 件数基準＝sales 枠に件数（slideInputOf の式は不変）
        else rec[k] = { sales: a.sales, pts: castPts(a, a.pt) };
      }
      slideTotalsByCast.set(cid, rec);
    }
  }
  const slideProvisionalOf = (sp: SlidePeriod, apply: "next" | "current"): boolean => apply !== "next" && periodKeysInRange(win.periodStart, win.periodEnd, sp).some((k) => periodRangeOfKey(k).end > slideTodayBiz);
  if (targetIds.size === 0) return { casts: [], masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast };

  // cast 名＋employment（is_active 不問＝退職者含む。employment は裁定98 の二層分岐キー）
  // ★裁定490（0201l の後の結線）: フラグ 0201l のときだけ体入の列（区分・在籍・作成日・本人の体入の時給・開始日・終わる日）を読む（false＝従来の select）
  const trialCols = mig0201lOn() ? ", kind, is_active, created_at, trial_wage, trial_started_on, trial_ends_on" : "";
  const { data: castRows, error: eN } = await admin.from("casts").select("id, name, employment, joined_on, left_on, rank_id" + trialCols).in("id", [...targetIds]); // ★0154 D6: 計算期間（入店日／退店日）・★裁定343: rank_id（対象ランク）
  if (eN) throw new Error(`casts: ${eN.message}`);
  const nameById = new Map<string, string>();
  const employmentById = new Map<string, "委託" | "雇用" | null>();
  const calcPeriodById = new Map<string, { start: string; end: string }>(); // ★0154 D6
  const rankIdById = new Map<string, string | null>(); // ★裁定343
  const trialById = new Map<string, { range: TrialRange | null; wage: number | null }>(); // ★裁定490: 体入の期間（無ければ null）と体入の時給（本人＞店・無ければ null）
  const masters0201l = trialTerms; // ★裁定490: 店の trial_wage／trial_back
  for (const c of (castRows ?? []) as unknown as { id: string; name: string; employment: "委託" | "雇用" | null; joined_on: string | null; left_on: string | null; rank_id: string | null; kind?: string | null; is_active?: boolean; created_at?: string; trial_wage?: number | null; trial_started_on?: string | null; trial_ends_on?: string | null }[]) {
    if (mig0201lOn()) { const tr = c; const range = trialRangeOf(tr); if (range) trialById.set(c.id, { range, wage: trialWageOf(tr.trial_wage, masters0201l.trialWage) }); }
    nameById.set(c.id, c.name);
    rankIdById.set(c.id, c.rank_id ?? null);
    employmentById.set(c.id, c.employment ?? null);
    calcPeriodById.set(c.id, calcPeriodOf(win, c.joined_on, c.left_on));
  }
  // ★0206（起票146 案・旗 MIG_0206_APPLIED＝false のあいだは読まない＝今と 1 バイト同じ）: 契約区分は期首に有効な履歴の行（無ければ期の中で最も早い行・履歴が無い人は casts.employment）
  if (mig0206On()) {
    const { data: empRows, error: eE } = await admin.from("cast_employment").select("cast_id, employment, valid_from, valid_to").in("cast_id", [...targetIds]).lte("valid_from", win.periodEnd);
    if (eE) throw new Error(`cast_employment: ${eE.message}`);
    const picked = employmentByCastOf(((castRows ?? []) as unknown as { id: string; employment: "委託" | "雇用" | null }[]), (empRows ?? []) as { cast_id: string; employment: string; valid_from: string; valid_to: string | null }[], win.periodStart, win.periodEnd);
    for (const [cid, emp] of picked) employmentById.set(cid, emp);
  }

  const casts: CastRaw[] = [];
  for (const cid of targetIds) {
    const s = salesByCast.get(cid);
    const p = punchByCast.get(cid);
    const back = acct.backByCast.get(cid) ?? { drink: 0, champ: 0, bottle: 0, pt: 0, calc: 0 };
    const cb = acct.champBottleByCast.get(cid) ?? { champCnt: 0, bottleCnt: 0 };
    const cp = castPlanByCast.get(cid);
    const plan = cp ? plansById.get(cp.planId) ?? null : null;
    // 日次 = sales 日 ∪ punch 日（hours>0 or sales>0）
    // ★裁定431 ⑥: 雇用はシフト無し出勤の日も打刻の時間で時給（委託は従来どおり 0＝当日追加配置で後追い）
    // ★裁定501-8（2026-11-16 Agoora 確定・M-10 の「委託は時給なし」を改める）: 委託も雇用と同じく、確定シフトが無い日は打刻の最初の出勤〜最後の退勤の実働で時間給（確定シフトのある日は不変・退勤が無い日は付けない）
    const empNoShift = p?.noShiftHours ?? new Map<string, number>();
    const dateSet = new Set<string>([...(s?.daily.keys() ?? []), ...(p?.hoursByDate.keys() ?? []), ...empNoShift.keys()]);
    const daily = [...dateSet].sort().map((bizDate) => ({
      bizDate,
      sales: s?.daily.get(bizDate) ?? 0,
      hours: (p?.hoursByDate.get(bizDate) ?? 0) + (empNoShift.get(bizDate) ?? 0),
    })).filter((d) => d.sales > 0 || d.hours > 0);
    // ★裁定343（0170・便 W5-2b）: 対象ランク（プランの slide_rank_ids が非空なら、そのランクのキャストだけスライド）。対象外＝プランの段を空にして base のまま（pay.ts 不変）・凍結形に印
    const rankIds = cp ? slideRankIdsByPlan.get(cp.planId) ?? [] : [];
    const basisX = cp ? slideBasisByPlan.get(cp.planId) ?? "sales" : "sales";
    const castRankId = rankIdById.get(cid) ?? null;
    const excluded = rankIds.length > 0 && !slideRankIncludedOf(rankIds, castRankId);
    const planEff = plan && excluded ? { ...plan, salesSlide: [], pointSlide: [] } : plan;
    // ★裁定490（12 点・0201l の後）: 体入の材料＝体入の時給の日（期間の中で出勤した日）とバック「なし」の除外（期間の営業日の分）。体入の時給が無い＝式を当てない（12 点の 5）＋注意（12 点の 2）
    const tr = trialById.get(cid);
    const range = tr?.range ?? null;
    const wage = tr?.wage ?? null;
    const trialRaw = range ? trialRawOf(range, wage, masters0201l.trialBack, daily, {
      sales: salesRows.filter((x) => x.cast_id === cid).map((x) => ({ bizDate: x.biz_date, sales: x.sales, hon: x.hon, jonai: x.jonai, dohan: x.dohan })),
      shimeiAmt: shimeiAmtByCast.byDate.get(cid) ?? new Map(), backs: acct.backByCastDate.get(cid) ?? new Map(), champBottle: acct.champBottleByCastDate.get(cid) ?? new Map(),
    }) : null;
    const trialWageUnset = !!range && wage === null && trialTouchesOf(range, daily);
    casts.push({
      castId: cid,
      castName: nameById.get(cid) ?? "(不明)",
      sales: s?.sales ?? 0,
      hon: s?.hon ?? 0,
      jonai: s?.jonai ?? 0,
      dohan: s?.dohan ?? 0,
      // mig0086: 率バック母数（指名料行なし=0＝rate プランでもバック0円が正・裁定vi）
      honShimeiAmt: shimeiAmtByCast.get(cid)?.hon ?? 0,
      jonaiShimeiAmt: shimeiAmtByCast.get(cid)?.jonai ?? 0,
      daily,
      productBack: { drink: back.drink, champ: back.champ, bottle: back.bottle },
      calculatedBack: back.calc, // ★裁定113
      pointProducts: back.pt,
      champCnt: cb.champCnt,
      bottleCnt: cb.bottleCnt,
      days: p?.days ?? 0,
      lateN: p?.lateN ?? 0,
      absentN: p?.absentN ?? 0,
      anomalyCount: p?.anomalyCount ?? 0,
      missingOutDates: p?.missingOutDates ?? [], // ★N3 AV-4（表示のみ・fixture は省略可）
      ...(p && p.roundNote ? { punchRoundNote: p.roundNote } : {}), // ★0213（E2）: 丸めが効いた人だけ（明細の注記）
      ...(p && p.breakNote ? { punchBreakNote: p.breakNote } : {}), // ★起票170（便 M の M2-8）: 休憩を引いた人だけ（明細の「勤務 ○ 時間（休憩 ○ 分を除く）」・0 円）
      ...(p && p.openBreakDates.length ? { openBreakDates: p.openBreakDates } : {}), // ★0214: 閉じていない休憩のまま退勤がある日（ある cast だけ・表示のみ）
      ...(p && p.noShiftDates.length ? { noShiftDates: p.noShiftDates } : {}), // ★便 M-10: シフト無し出勤（ある cast だけ＝凍結形・golden は不変）
      ...(p ? { shiftHoursByDate: p.shiftHoursByDate, attendanceDays: p.attendanceDays } : {}), // ★0154 D2
      ...(p && p.shortfallDays.length ? { shortfallDays: p.shortfallDays } : {}), // ★324-3（便 L-2-4）: 確定シフトがある日だけ
      ...(calcPeriodById.has(cid) ? { calcPeriod: calcPeriodById.get(cid) } : {}), // ★0154 D6
      plan: planEff, // ★裁定343: 対象外は段なし（base のまま）
      ...(() => { // ★時間帯の時給：プランに帯があり、個別の時給の上書き（override.base）が無い人だけ（上書きが勝つ＝帯を使わない）。体入の日は pay.ts が帯を使わない
        const bands = cp ? hourlyBandsByPlan.get(cp.planId) : undefined;
        if (!bands || bands.length === 0 || !p || (cp?.override && typeof (cp.override as { base?: unknown }).base === "number")) return {};
        const byDay: Record<string, BandSeg[]> = {}, shiftByDay: Record<string, BandSeg[]> = {}, edges: Record<string, [number | null, number | null]> = {};
        for (const d of daily) {
          if (!(d.hours > 0)) continue;
          const sw = p.win.shift.get(d.bizDate), pw = p.win.punch.get(d.bizDate), nw = p.win.noShift.get(d.bizDate);
          const shiftHoursDefined = p.shiftHoursByDate[d.bizDate] !== undefined; // ★2026-11-25（M4 ア）: pay.ts の dailyBase と同じ条件（今日までの確定シフトの時間）
          const w = bandWindowOf({ punch: pw, shift: sw, noShift: nw }, { storeShift: p.win.storeShift.has(d.bizDate), shiftBasis: masters.payTimeBasis === "shift", shiftHoursDefined });
          const segs = w && w === pw ? p.win.punchSegs?.get(d.bizDate) : w && w === nw ? p.win.noShiftSegs?.get(d.bizDate) : undefined; // ★0214: 休憩で割った区間（無ければ今の 1 区間）
          if (w) byDay[d.bizDate] = segs ? bandSegmentsOfSpans(segs, bands) : bandSegmentsOf(w[0], w[1], bands);
          if (sw && shiftHoursDefined) { shiftByDay[d.bizDate] = bandSegmentsOf(sw[0], sw[1], bands); edges[d.bizDate] = [bandAmountAt(bands, sw[0]), bandAmountAt(bands, sw[1] - 1)]; }
        }
        return Object.keys(byDay).length ? { hourlyBands: { byDay, shiftByDay, edges } } : {};
      })(),
      override: cp?.override,
      ...(slideBasisByCast.has(cid) && !excluded ? { slideBasis: slideBasisByCast.get(cid) as "hon_count" | "dohan_count", ...(slideDailyBasisByCast.has(cid) ? { slideDailyBasis: slideDailyBasisByCast.get(cid) } : {}) } : {}), // ★裁定343: 件数基準（daily は営業日ごとの件数）
      ...(rankIds.length ? { slideScope: { basis: basisX, rankIds, castRankId, excluded } } : {}), // ★裁定343: 対象ランク（非空のときだけ）
      ...(guaranteesByCast.has(cid) ? { guarantees: guaranteesByCast.get(cid) } : {}), // ★N3
      ...(applyOf(cid) === "next" ? { slideApply: "next" as const, prevMonthTotals: prevTotalsByCast.get(cid) ?? {} } : {}), // ★N3b・★便 P174 T-4（プラン→店設定）
      ...(slidePeriodByCast.has(cid) ? { slidePeriod: slidePeriodByCast.get(cid) as "monthly" | "half", slideTotals: slideTotalsByCast.get(cid) ?? {}, slideProvisional: slideProvisionalOf(slidePeriodByCast.get(cid) as SlidePeriod, applyOf(cid)) } : {}), // ★裁定338（0168）
      norm: (() => { // ★裁定347 追補2（便 N1014 A-4）: 達成ボーナスの目標＝個別（cast_norms.sales_target 非 0）＞プラン既定（norm_sales_target）＞なし＝/mine と同じ純関数（resolveNormTargetsOf）。days／dohan（遅刻・当欠の検知）は従来どおり cast_norms の値
        const n = normByCast.get(cid) ?? { days: 0, dohan: 0, salesTarget: 0, shimei: 0 };
        const planT = cp ? planNormById.get(cp.planId) ?? null : null;
        const r = resolveNormTargetsOf(planT ?? { days: null, dohan: null, sales: null, shimei: null }, { days: n.days, dohan: n.dohan, sales: n.salesTarget, shimei: n.shimei }, normAxes);
        return { days: n.days, dohan: n.dohan, salesTarget: r.value.sales ?? 0, salesTargetSource: (r.source.sales ?? null) as QuotaSource };
      })(),
      normTargets4: (() => { // ★便 X13-I I-5: 提案の目標（採用軸で解決済み）
        const n = normByCast.get(cid) ?? { days: 0, dohan: 0, salesTarget: 0, shimei: 0 };
        const planT = cp ? planNormById.get(cp.planId) ?? null : null;
        return resolveNormTargetsOf(planT ?? { days: null, dohan: null, sales: null, shimei: null }, { days: n.days, dohan: n.dohan, sales: n.salesTarget, shimei: n.shimei }, normAxes).value;
      })(),
      taxProfileMode: taxByCast.get(cid) ?? null,
      dependentsForm: depByCast.get(cid) ?? null, // ★0172（裁定349）: 雇用の甲／乙の入力（assemble が employeeTaxClassOf で区分に）
      employment: employmentById.get(cid) ?? null, // ★裁定98: 二層ガードの分岐キー
      avgDailyWage: avgWageByCast.get(cid) ?? null, // ★裁定98-C: null=暫定式（pay.ts 側）
      ...(trialRaw ? { trial: trialRaw } : {}), // ★裁定490: 体入の期間が期に掛かり体入の時給がある cast だけ（無い cast はキーを持たない＝従来と 1 バイト同値）
      ...(trialWageUnset ? { trialWageUnset: true } : {}), // ★裁定490（12 点の 2）
    });
  }
  // ★便 P175-prep P-1／P-5（裁定416／418・0175 v2）: フラグ true のときだけ cast_rate_history（時給の履歴）と CANON 文脈（comp_plans 拡張列・plan_norm_tiers・slide_decisions・availability_terms）を読んで各 cast に付ける。
  //   false のときはこのブロックに入らない＝query 0・CastRaw のキー増減 0（golden 不変）。
  //   ⑩ 売上小計の範囲＝本便は会計額（cast 別按分 sales）で渡す。pre_tax_service（税サ前・割引前）の按分集計は check_lines 直読が要るため、フラグ true の便で実装（【事後承認待ち】）。
  if (rules0175On()) {
    const st0175 = await loadRules0175Store(admin, storeId);
    const ids = casts.map((c) => c.castId);
    const [hist, meta] = await Promise.all([loadRateHistory(admin, storeId, win.periodStart, win.periodEnd), loadCastMeta0175(admin, storeId, ids)]);
    // ★裁定490 (b): 同伴の時間帯のバックは日で割れない＝集める側で体入の日の同伴を除いた額を渡す（バック「なし」で除外を持つ cast だけ・同伴伝票の開始時刻の営業日で判定）
    const excludeDohan = (castId: string, startedAt: string): boolean => { const c = casts.find((x) => x.castId === castId); const r = trialById.get(castId)?.range; return !!(c?.trial?.exclude && r && inTrialRange(r, bizDateOf(startedAt, win.cutoffHm))); };
    const ctx = await loadCanonCtx(admin, storeId, { period: win.period, periodStart: win.periodStart, periodEnd: win.periodEnd, periodDays: periodCalendarDays(win.period) }, st0175,
      casts.map((c) => { const p = punchByCast.get(c.castId); const hours = p ? [...p.hoursByDate.values()].reduce((a, b) => a + b, 0) : 0;
        return { castId: c.castId, planId: castPlanByCast.get(c.castId)?.planId ?? null, membershipId: meta.get(c.castId)?.membershipId ?? null, joinedOn: meta.get(c.castId)?.joinedOn ?? null, days: c.days, hours, salesSubtotal: c.sales }; }), { excludeDohan });
    for (const c of casts) {
      const h = hist.get(c.castId); if (h && h.length) c.rateHistory = h;
      const x = ctx.get(c.castId); if (x) c.rules0175 = x;
    }
  }
  // ★裁定432（0183 ★4）: フラグ true のときだけ区分・その期の指定額・社員の控除を読む（false＝query 0・CastRaw のキー増減 0＝golden 不変）
  if (mig0183On()) {
    const [kR, oR, dR] = await Promise.all([
      admin.from("cast_tax_profiles").select("cast_id, withholding_kind").eq("store_id", storeId),
      admin.from("payroll_withholding_overrides").select("subject_id, amount").eq("store_id", storeId).eq("period", win.period).eq("subject_kind", "cast"),
      admin.from("payroll_employee_deductions").select("subject_id, kind, name, amount, sort").eq("store_id", storeId).eq("period", win.period).eq("subject_kind", "cast").order("sort"),
    ]);
    for (const r of [kR, oR, dR]) if (r.error) throw new Error(`源泉区分の読み取り: ${r.error.message}`);
    const kind = new Map(((kR.data ?? []) as { cast_id: string; withholding_kind: string | null }[]).map((r) => [r.cast_id, r.withholding_kind]));
    const ov = new Map(((oR.data ?? []) as { subject_id: string; amount: number }[]).map((r) => [r.subject_id, r.amount]));
    const ded = new Map<string, { kind: "social_insurance" | "income_tax" | "resident_tax" | "other"; name: string | null; amount: number }[]>();
    for (const r of (dR.data ?? []) as { subject_id: string; kind: "social_insurance" | "income_tax" | "resident_tax" | "other"; name: string | null; amount: number }[]) (ded.get(r.subject_id) ?? ded.set(r.subject_id, []).get(r.subject_id)!).push({ kind: r.kind, name: r.name, amount: r.amount });
    for (const c of casts) c.w432 = { stored: kind.get(c.castId) ?? null, override: ov.get(c.castId) ?? null, deductions: ded.get(c.castId) ?? [] };
  }
  return { casts, masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast };
}
