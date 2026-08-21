"use client";

// 分析ボード（F3b-A 塊3＋B-2 section3）。月セレクタ1つ＋店セレクタ（payroll の期間選択パターン流用）。
// ①売上貢献＝get_cast_sales（日次・group due 按分ベース）をアプリ側で cast 合算→sales 降順。
// ②指名分析＝get_cast_ranking（伝票単位カウント・rank 済み・cast_name 込み）をそのまま表示。
// ★両者は集計軸が別（金額按分 vs 件数カウント）＝hon/jonai/dohan が一致しなくても正常。
//   ラベルで「売上貢献（按分）」「指名件数」を明確に分けて混同させない。
// 期間の同値性: sales は biz_date（cutoff 起点営業日）の月初〜月末・ranking は [月初 cutoff, 翌月初 cutoff)
// ＝同じ窓（biz_date ∈ 月 ⟺ started_at ∈ その窓）。
// ③主要客リスト（B-2・mig0031）＝get_cast_customer_ranking。cast select は section3 内（最小差分）・
//   候補は選択中 store の active cast のみ（他店 cast は select に出さない＝渡すと 0行仕様だが混乱封じ）。
//   ★脱落明示: section2 と同一 store/period 駆動なので「該当 cast の総指名数（ranking 行の hon+jonai+dohan）
//   − 客リスト合計（Σ total_count）＝客なし指名 N」が成立（段24-5 実測）。N を必ず表示する。
//   store 切替で cast 選択はリセット（旧店 cast の残留＝0行表示の混乱を防ぐ）。
//
// ── E8-6 前半（非T4 9件）── 2026-08-19 ──
//   #1 4ビュー切替（サマリー/売上/キャスト/顧客）＝既存セクションの再配置＋新規は既存経路の直読のみ。
//   ★時刻粒度の集計（カテゴリ5分類・時間帯・ヒートマップ・コホート）は集計経路が未提供のため
//     プレースホルダ（製品文言）に留める。DB・RPC は不触。
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHead from "@/components/ui/page-head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import Modal from "@/components/ui/modal";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
// E8-6 後半（mig0096）: T4 集計 RPC 3本の結線。5分類の写像は category-map 純関数（裁定 E8-6-8＝DB に焼かない）
import { sumCategories, CATEGORY_ORDER, CATEGORY_LABEL, type CategoryLine } from "@/lib/nox/analytics/category-map";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";

type Store = { id: string; name: string };
type Cast = { id: string; name: string; store_id: string; is_active: boolean; photo_updated_at: string | null };
// 段A2: 締め済み日報の日別行（dashboard / month-report と同じ列・同じ売上式）
//   E8-6 #9: card_tax（手数料スナップショット）を追加取得（既存列の select 追加のみ）
type DailyRow = {
  biz_date: string; cash: number; card_gross: number; card_tax: number; uri: number; other: number;
  drink_sales: number; slips: number; guests: number;
};
// 段A2: 人件費（既存の概算＝/report month-report の式を逐語踏襲。draft は「未確定」）
type Labor = { state: "none" | "draft" | "final"; gross: number };
type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };
type RankRow = {
  rank: number; cast_id: string; cast_name: string;
  hon_count: number; jonai_count: number; dohan_count: number; is_self: boolean;
};
type CustRankRow = {
  customer_id: string; customer_name: string;
  hon_count: number; jonai_count: number; dohan_count: number; total_count: number;
};
// E8-6 #12: 顧客セグメント＝customer_list_summary の再形（/customers と同じ RPC・同じ判定語彙）
type CustSummaryRow = {
  customer_id: string; name: string; visits: number; last_visit: string | null;
  total_spend: number; churn_tier: "none" | "mid" | "high";
};
// E8-6 後半（mig0096）: T4 集計 RPC の返り行
type HourRow = {
  biz_date: string; dow: number; hour: number; sales: number;
  check_count: number; guest_count: number; stay_min_sum: number; stay_count: number;
};
type CatRow = { biz_date: string; kind: string; fee_kind: string | null; amount: number; line_count: number };
type CohortRow = { cohort_month: string; month_offset: number; customer_count: number };

const yen = (n: number) => "¥" + n.toLocaleString();
// 段A2: 日別バーの土日ハイライト用（曜日ラベル）
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
// 段0R 第2陣: 見出しは nox-panel > h3（白）へ統一したので t.cardTitle 由来の secTitle は撤去。
const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
// E8-6: 集計経路が未提供の区画に出す製品文言（内部用語を画面に出さない＝E8-3 の教訓）。
//   後半（mig0096）で主要区画は実装済み＝残りはキャスト詳細の延長率/杯数（cast 軸の集計が未提供）のみ。
const COMING = "集計機能の提供開始後に表示されます。";

function lastDayOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
/** 前月の 'YYYY-MM'（前月同期比の対象）。 */
function prevPeriodOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** period に delta ヶ月足した 'YYYY-MM'（E8-6 #2 の 3/6ヶ月レンジ用）。 */
function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** 日報1行の売上＝現金＋カードグロス＋売掛＋その他（dashboard / month-report と同式）。 */
const salesOf = (r: { cash: number; card_gross: number; uri: number; other: number }) =>
  r.cash + r.card_gross + r.uri + r.other;
/** 'YYYY-MM-DD' の曜日（0=日）。ローカル TZ 非依存（S-1 の dowOf と同式）。 */
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
// E8-6 #15: CSV 出力（E8-4 shift の exportShiftsCsv と同流儀＝BOM 付き UTF-8・client Blob 生成）
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsBoard({
  stores, casts, isOwner,
}: {
  stores: Store[]; casts: Cast[]; isOwner: boolean;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(thisMonth);
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // section3（B-2）: cast 別指名客ランキング
  const [castSel, setCastSel] = useState("");
  const [custRank, setCustRank] = useState<CustRankRow[]>([]);
  const [custErr, setCustErr] = useState<string | null>(null);
  // ── 段A2（分析刷新・正本 nox-analytics-redesign-mock-v1.html）──
  //   ★追加取得は daily_reports（当月＋前月）と payroll_runs/payslips だけ。いずれも既存画面
  //     （dashboard / report month-report）が使っている経路で、新規 RPC も新規集計もしない。
  //   ★本ページは page.tsx で owner/manager 限定＝cast/staff は到達しない（金額ゲートは現行のまま）。
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [prevDaily, setPrevDaily] = useState<DailyRow[]>([]);
  const [labor, setLabor] = useState<Labor>({ state: "none", gross: 0 });
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  // ── E8-6 #1: 4ビュー切替（既存セクションの収容先を切り替えるだけ・取得と state は共有）──
  const [view, setView] = useState<"summary" | "sales" | "casts" | "customers">("summary");
  // E8-6 #2: 売上推移の期間4種（日別/前月重ね/3ヶ月/6ヶ月）
  const [trendMode, setTrendMode] = useState<"daily" | "overlay" | "3m" | "6m">("daily");
  const [trendMonths, setTrendMonths] = useState<{ month: string; sales: number; days: number }[]>([]);
  // E8-6 #9: 売掛の当月回収（ar_collections 直読）と未回収残高（receivables 直読・/report 売掛タブと同式）
  const [arCollected, setArCollected] = useState(0);
  const [arOpen, setArOpen] = useState(0);
  // E8-6 #10: 報酬率＝確定給与（payslips.cast_id 別 gross）÷ 按分売上（確定月のみ）
  const [castGross, setCastGross] = useState<Map<string, number>>(new Map());
  // E8-6 #11: キャスト詳細4スタットの出勤日数（attendance 直読・PRESENT= 出勤/同伴/遅刻）
  const [attDays, setAttDays] = useState<number | null>(null);
  // E8-6 #12: 顧客セグメント（customer_list_summary＝/customers と同じ RPC・顧客ビュー表示時のみ取得）
  const [custSummary, setCustSummary] = useState<CustSummaryRow[] | null>(null);
  const [custSummaryErr, setCustSummaryErr] = useState<string | null>(null);
  // ── E8-6 後半（mig0096）: T4 集計の結線 ──
  // #17: 全店合算トグル（owner のみ表示・T4 3本＝時間帯/カテゴリ/リテンションにのみ効く。
  //   日報 KPI・按分ランキング等の既存経路は p_store_id null 非対応のため選択店のまま＝裁定 E8-6-4）
  const [allStores, setAllStores] = useState(false);
  const [hourly, setHourly] = useState<HourRow[] | null>(null);
  const [catRows, setCatRows] = useState<CatRow[] | null>(null);
  const [cohort, setCohort] = useState<CohortRow[] | null>(null);
  const [t4Err, setT4Err] = useState<string | null>(null);
  // #3: 月間売上目標（store_sales_targets 直読＝RLS owner/manager・目標は常に選択店単位）
  const [target, setTarget] = useState<number | null>(null);
  const [tgtOpen, setTgtOpen] = useState(false);
  const [tgtInput, setTgtInput] = useState("");
  const [tgtMsg, setTgtMsg] = useState<string | null>(null);
  const [tgtBusy, setTgtBusy] = useState(false);

  const castName = useMemo(() => {
    const m = new Map(casts.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [casts]);

  const load = useCallback(async () => {
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    setErr(null);
    const [rS, rR] = await Promise.all([
      supabase.rpc("get_cast_sales", { p_store_id: storeId, p_from: `${period}-01`, p_to: lastDayOf(period) }),
      supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: period }),
    ]);
    if (rS.error || rR.error) {
      setErr(`読み込みに失敗: ${rS.error?.message ?? rR.error?.message}`);
      setSales([]); setRanking([]);
      return;
    }
    setSales((rS.data ?? []) as SalesRow[]);
    setRanking((rR.data ?? []) as RankRow[]);
  }, [storeId, period]);

  useEffect(() => { void load(); }, [load]);

  // 段A2: 締め済み日報（当月＋前月）と人件費。前月同期比は「同じ SELECT を前月分も引くだけ」（相談役メモ③）。
  const loadMonth = useCallback(async () => {
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    const cols = "biz_date, cash, card_gross, card_tax, uri, other, drink_sales, slips, guests";
    const prev = prevPeriodOf(period);
    const [cur, pre] = await Promise.all([
      supabase.from("daily_reports").select(cols).eq("store_id", storeId)
        .gte("biz_date", `${period}-01`).lte("biz_date", lastDayOf(period)).order("biz_date"),
      supabase.from("daily_reports").select(cols).eq("store_id", storeId)
        .gte("biz_date", `${prev}-01`).lte("biz_date", lastDayOf(prev)).order("biz_date"),
    ]);
    setDaily((cur.data ?? []) as DailyRow[]);
    setPrevDaily((pre.data ?? []) as DailyRow[]);

    // E8-6 #9: 売掛の当月回収（ar_collections・biz_date 範囲）と未回収残高（open の amount−collected_amount）。
    //   どちらも /report 売掛タブが使っている列の直読＝新規集計 RPC なし。
    const [arc, rcv] = await Promise.all([
      supabase.from("ar_collections").select("amount").eq("store_id", storeId)
        .gte("biz_date", `${period}-01`).lte("biz_date", lastDayOf(period)),
      supabase.from("receivables").select("amount, collected_amount").eq("store_id", storeId).eq("status", "open"),
    ]);
    setArCollected(((arc.data ?? []) as { amount: number }[]).reduce((a, x) => a + x.amount, 0));
    setArOpen(((rcv.data ?? []) as { amount: number; collected_amount: number }[])
      .reduce((a, x) => a + (x.amount - (x.collected_amount ?? 0)), 0));

    // 人件費＝payslips.breakdown_json.pay.gross 合計（★/report month-report の式を逐語踏襲・
    //   確定（finalized/paid）した run だけを人件費とみなし、draft は「未確定」＝S-2 の予想人件費とは別物）。
    //   E8-6 #10: cast_id も取得して cast 別 gross を残す（報酬率＝gross ÷ 按分売上・確定月のみ）。
    const { data: runs } = await supabase.from("payroll_runs")
      .select("id, status").eq("store_id", storeId).eq("period", period);
    const fin = (runs ?? []).find((r) => r.status === "finalized" || r.status === "paid");
    if (fin) {
      const { data: slips } = await supabase.from("payslips").select("cast_id, breakdown_json").eq("run_id", fin.id as string);
      let g = 0;
      const byCast = new Map<string, number>();
      for (const x of (slips ?? []) as { cast_id: string; breakdown_json: { pay?: { gross?: number } } | null }[]) {
        const v = Number(x.breakdown_json?.pay?.gross ?? 0);
        g += v;
        byCast.set(x.cast_id, (byCast.get(x.cast_id) ?? 0) + v);
      }
      setLabor({ state: "final", gross: g });
      setCastGross(byCast);
    } else {
      setLabor({ state: (runs ?? []).length ? "draft" : "none", gross: 0 });
      setCastGross(new Map());
    }
  }, [storeId, period]);
  useEffect(() => { void loadMonth(); }, [loadMonth]);

  // E8-6 #2: 3ヶ月/6ヶ月モード＝表示月を末尾とする月別合計（daily_reports の範囲 select 1本を月で束ねる）。
  const loadTrend = useCallback(async () => {
    if (trendMode !== "3m" && trendMode !== "6m") { setTrendMonths([]); return; }
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    const n = trendMode === "3m" ? 3 : 6;
    const from = addMonths(period, -(n - 1));
    const { data } = await supabase.from("daily_reports")
      .select("biz_date, cash, card_gross, uri, other").eq("store_id", storeId)
      .gte("biz_date", `${from}-01`).lte("biz_date", lastDayOf(period)).order("biz_date");
    const byMonth = new Map<string, { sales: number; days: number }>();
    for (let i = 0; i < n; i++) byMonth.set(addMonths(period, -(n - 1) + i), { sales: 0, days: 0 });
    for (const r of (data ?? []) as { biz_date: string; cash: number; card_gross: number; uri: number; other: number }[]) {
      const m = r.biz_date.slice(0, 7);
      const a = byMonth.get(m);
      if (a) { a.sales += salesOf(r); a.days += 1; }
    }
    setTrendMonths([...byMonth.entries()].map(([month, a]) => ({ month, ...a })));
  }, [trendMode, storeId, period]);
  useEffect(() => { void loadTrend(); }, [loadTrend]);

  // E8-6 #12: 顧客ビューを開いたときだけ取得（/customers と同じ RPC・p_include_dormant は明示 true）。
  const loadCustSummary = useCallback(async () => {
    if (view !== "customers" || !storeId) return;
    const supabase = createClient();
    setCustSummaryErr(null);
    const { data, error } = await supabase.rpc("customer_list_summary", {
      p_store_id: storeId, p_include_dormant: true,
    });
    if (error) { setCustSummaryErr(`読み込みに失敗: ${error.message}`); setCustSummary([]); return; }
    setCustSummary((data ?? []) as CustSummaryRow[]);
  }, [view, storeId]);
  useEffect(() => { void loadCustSummary(); }, [loadCustSummary]);

  // ── E8-6 後半: T4 集計3本＋目標の取得 ──
  //   窓＝表示月（≤31日で RPC の 92日ガード内）。コホートは表示月を末尾に 6ヶ月。
  //   scope: 全店合算（owner・null）か選択店。エラーは日本語1本にまとめて3区画共通で表示。
  const t4ErrJa = (msg: string | undefined) => {
    if (!msg) return "不明なエラー";
    if (msg.includes("bad range")) return "期間の指定が不正です";
    if (msg.includes("bad period")) return "対象月の指定が不正です";
    if (msg.includes("bad store settings")) return "店舗の営業日設定が不正です（管理者にご確認ください）";
    if (msg.includes("forbidden")) return "権限がありません";
    return msg;
  };
  const loadT4 = useCallback(async () => {
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    setT4Err(null);
    const scope = allStores && isOwner ? null : storeId;
    const [h, cRes, coRes, tg] = await Promise.all([
      supabase.rpc("store_hourly_aggregate", {
        p_store_id: scope, p_from: `${period}-01`, p_to: lastDayOf(period), p_customer_id: null,
      }),
      supabase.rpc("store_category_aggregate", {
        p_store_id: scope, p_from: `${period}-01`, p_to: lastDayOf(period),
      }),
      supabase.rpc("store_cohort_aggregate", {
        p_store_id: scope, p_from_month: addMonths(period, -5), p_months: 6,
      }),
      supabase.from("store_sales_targets").select("sales_target")
        .eq("store_id", storeId).eq("period", period).maybeSingle(),
    ]);
    if (h.error || cRes.error || coRes.error) {
      setT4Err(t4ErrJa(h.error?.message ?? cRes.error?.message ?? coRes.error?.message));
      setHourly([]); setCatRows([]); setCohort([]);
    } else {
      setHourly((h.data ?? []) as HourRow[]);
      setCatRows((cRes.data ?? []) as CatRow[]);
      setCohort((coRes.data ?? []) as CohortRow[]);
    }
    setTarget((tg.data?.sales_target as number | undefined) ?? null);
  }, [storeId, period, allStores, isOwner]);
  useEffect(() => { void loadT4(); }, [loadT4]);

  // E8-6 #3: 目標の保存/クリア（store_sales_target_set＝billing ゲート入り・null=削除）
  async function saveTarget(amount: number | null) {
    if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
      setTgtMsg("目標は 0 以上の整数（円）で入力してください");
      return;
    }
    setTgtBusy(true);
    setTgtMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("store_sales_target_set", {
      p_store_id: storeId, p_period: period, p_amount: amount,
    });
    setTgtBusy(false);
    if (error) {
      const m = error.message;
      setTgtMsg(isBillingLocked(m) ? BILLING_LOCKED_MSG
        : m.includes("bad amount") ? "目標は 0 以上で入力してください"
        : m.includes("bad period") ? "対象月の指定が不正です"
        : m.includes("forbidden") ? "権限がありません" : m);
      return;
    }
    setTgtOpen(false);
    await loadT4();
  }

  // 段P: ランキングの写真（写真ありの行だけ 1 リクエスト・失敗時は頭文字に落ちる）
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    void (async () => {
      const orgId = await resolveOrgId(supabase);
      if (!orgId) return;
      const m = await signCastPhotos(supabase, orgId, casts);
      if (alive) setPhotoUrls(m);
    })();
    return () => { alive = false; };
  }, [casts]);

  // section3: cast 選択時のみ取得（store/period は section1/2 と同じ state 駆動＝窓が常に一致）
  //   E8-6 #11: 出勤日数（attendance の PRESENT count）も同じタイミングで1クエリ。
  const loadCustRank = useCallback(async () => {
    if (!castSel) { setCustRank([]); setCustErr(null); setAttDays(null); return; }
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    setCustErr(null);
    const [{ data, error }, att] = await Promise.all([
      supabase.rpc("get_cast_customer_ranking", { p_store_id: storeId, p_period: period, p_cast_id: castSel }),
      supabase.from("attendance").select("status").eq("cast_id", castSel)
        .gte("date", `${period}-01`).lte("date", lastDayOf(period)),
    ]);
    if (error) { setCustErr(`読み込みに失敗: ${error.message}`); setCustRank([]); }
    else setCustRank((data ?? []) as CustRankRow[]);
    const PRESENT = new Set(["shukkin", "dohan", "late"]);
    setAttDays(((att.data ?? []) as { status: string }[]).filter((a) => PRESENT.has(a.status)).length);
  }, [storeId, period, castSel]);

  useEffect(() => { void loadCustRank(); }, [loadCustRank]);

  // cast select 候補 = 選択中 store の active cast のみ（他店 cast は出さない・渡すと 0行仕様）
  const castOptions = useMemo(
    () => casts.filter((c) => c.is_active && c.store_id === storeId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [casts, storeId],
  );

  // ★脱落明示: section2（同一 store/period）の該当 cast 総指名数 − 客リスト合計 = 客なし指名 N
  const selRankRow = ranking.find((r) => r.cast_id === castSel);
  const selTotalNom = selRankRow ? selRankRow.hon_count + selRankRow.jonai_count + selRankRow.dohan_count : 0;
  const custSum = custRank.reduce((a, r) => a + r.total_count, 0);
  const dropCount = selTotalNom - custSum;

  // 売上貢献: 日次を cast 単位に月次合算 → sales 降順（同額は名前昇順で決定的に）
  const salesRanking = useMemo(() => {
    const m = new Map<string, { sales: number; hon: number; jonai: number; dohan: number }>();
    for (const r of sales) {
      const a = m.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 };
      a.sales += r.sales; a.hon += r.hon; a.jonai += r.jonai; a.dohan += r.dohan;
      m.set(r.cast_id, a);
    }
    return [...m.entries()]
      .map(([castId, a]) => ({ castId, name: castName(castId), ...a }))
      .sort((x, y) => y.sales - x.sales || x.name.localeCompare(y.name));
  }, [sales, castName]);
  // E8-6 #10: 構成%の分母＝按分売上の総和（同じ集計軸の中でだけ%を出す＝日報売上と混ぜない）
  const salesRankTotal = salesRanking.reduce((a, r) => a + r.sales, 0);

  // ── 段A2 派生値（すべて daily の再形＝新規取得なし）──
  const sum = (rows: DailyRow[], f: (r: DailyRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const curSales = sum(daily, salesOf);
  const curSlips = sum(daily, (r) => r.slips ?? 0);
  // 「前月同期」＝前月の先頭から当月と同じ締め済み日数ぶん（営業日数を揃えて比べる）
  const prevSame = prevDaily.slice(0, daily.length);
  const prevSales = sum(prevSame, salesOf);
  const prevSlips = sum(prevSame, (r) => r.slips ?? 0);
  const per = (s: number, n: number) => (n > 0 ? Math.round(s / n) : 0);
  const laborRate = labor.state === "final" && curSales > 0 ? Math.round((labor.gross / curSales) * 1000) / 10 : null;
  // 日別バー（締め済みの日だけ＝日報が無い日は棒を出さない）
  const barMax = Math.max(1, ...daily.map(salesOf));
  const peak = daily.reduce<DailyRow | null>((best, r) => (!best || salesOf(r) > salesOf(best) ? r : best), null);
  const avgPerDay = daily.length > 0 ? Math.round(curSales / daily.length) : 0;
  // 支払構成（既存列そのまま）。E8-6 #4: ドーナツ＋構成比%は同じ payMix の再形（色は E8-2 日報ドーナツと同順）
  const payMix = [
    { k: "現金", v: sum(daily, (r) => r.cash), color: "var(--gold)" },
    { k: "カード（グロス）", v: sum(daily, (r) => r.card_gross), color: "var(--gold2)" },
    { k: "売掛", v: sum(daily, (r) => r.uri), color: "var(--ok)" },
    { k: "その他", v: sum(daily, (r) => r.other), color: "var(--sub)" },
  ];
  const payTotal = payMix.reduce((a, x) => a + x.v, 0);
  // ★売上内訳: daily_reports が持つのは drink_sales だけ＝モックの4分類
  //   （セット・時間料金／指名料／ドリンク・ボトル／サービス料）は現スキーマから作れない。
  //   明細 kind 別の集計は新規集計になるので作らず、既存列で言える2分類に留める（下の注記で明示）。
  //   ★E8-6: 5分類の写像は lib/nox/analytics/category-map.ts に確定済み＝集計経路の提供後に結線する。
  const drinkSales = sum(daily, (r) => r.drink_sales ?? 0);
  const breakdown = [
    { k: "ドリンク・ボトル", v: drinkSales },
    { k: "その他（セット・指名料・サービス料 等）", v: Math.max(0, curSales - drinkSales) },
  ];
  const cmp = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  // E8-6 #9: カード手数料（締め時レートのスナップショット合計）とネット見込み
  const cardGross = sum(daily, (r) => r.card_gross);
  const cardTax = sum(daily, (r) => r.card_tax ?? 0);
  // E8-6 #2: 前月重ねの日ペア（日番号で対応付け＝前月に同日が無ければ 0 扱いで並べる）
  const overlayMax = Math.max(1, ...daily.map(salesOf), ...prevDaily.map(salesOf));
  const trendMonthMax = Math.max(1, ...trendMonths.map((m) => m.sales));

  // ── E8-6 後半: T4 派生値（すべて取得済み rows の client 再形）──
  // #5: kind×fee_kind 生Σ → 5分類（写像は category-map 純関数＝E8-2 日報と同値・段53(7) で結線検証済み）
  const catSums = useMemo(() => {
    const lines: CategoryLine[] = (catRows ?? []).map((r) => ({ kind: r.kind, fee_kind: r.fee_kind, amount: Number(r.amount) }));
    return sumCategories(lines);
  }, [catRows]);
  // #8: 時間帯別売上（月内 Σ・JST 時計時刻）— 非ゼロ時間のみ・営業実態の範囲で並べる
  const hourBars = useMemo(() => {
    const m = new Map<number, { sales: number; checks: number }>();
    for (const r of hourly ?? []) {
      const a = m.get(r.hour) ?? { sales: 0, checks: 0 };
      a.sales += Number(r.sales); a.checks += r.check_count;
      m.set(r.hour, a);
    }
    return [...m.entries()].map(([hour, a]) => ({ hour, ...a })).sort((x, y) => x.hour - y.hour);
  }, [hourly]);
  const hourMax = Math.max(1, ...hourBars.map((h) => h.sales));
  // #7: 曜日×時間帯ヒートマップ（dow は RPC が biz_date から算出済み・0=日）
  const heat = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of hourly ?? []) {
      const k = `${r.dow}-${r.hour}`;
      m.set(k, (m.get(k) ?? 0) + Number(r.sales));
    }
    return m;
  }, [hourly]);
  const heatMax = Math.max(1, ...heat.values());
  // 平均滞在（月）＝closed_at を持つ伝票の (closed−started) 分和 ÷ 件数（RPC の stay 列）
  const staySum = (hourly ?? []).reduce((a, r) => a + Number(r.stay_min_sum), 0);
  const stayCnt = (hourly ?? []).reduce((a, r) => a + r.stay_count, 0);
  const avgStay = stayCnt > 0 ? Math.round(staySum / stayCnt) : null;
  // #13: コホート表（行=初来店月・列=offset 0..5・%は offset0 が分母）
  const cohortTable = useMemo(() => {
    const months = [...new Set((cohort ?? []).map((r) => r.cohort_month))].sort();
    return months.map((m) => {
      const cells = Array.from({ length: 6 }, (_, o) => (cohort ?? []).find((r) => r.cohort_month === m && r.month_offset === o)?.customer_count ?? 0);
      return { month: m, cells, base: cells[0] };
    });
  }, [cohort]);
  // #3: 目標進捗（分母=目標・分子=締め済み売上 curSales＝KPI 1枚目と同材料）
  const targetPct = target && target > 0 ? Math.round((curSales / target) * 1000) / 10 : null;

  // E8-6 #15: CSV 出力（表示中データの再形のみ・金額の再計算をしない）
  function exportMonthlyCsv() {
    downloadCsv(`nox_report_${period}.csv`, [
      ["営業日", "曜日", "売上", "現金", "カードグロス", "カード手数料", "売掛", "その他", "ドリンク", "組数", "客数"],
      ...daily.map((r) => [r.biz_date, DOW[dowOf(r.biz_date)], salesOf(r), r.cash, r.card_gross, r.card_tax ?? 0, r.uri, r.other, r.drink_sales ?? 0, r.slips ?? 0, r.guests ?? 0]),
    ]);
  }
  function exportRankingCsv() {
    downloadCsv(`nox_ranking_${period}.csv`, [
      ["順位", "名前", "売上（按分）", "構成%", "本指名", "場内", "同伴", "報酬率%"],
      ...salesRanking.map((r, i) => [
        i + 1, r.name, r.sales,
        salesRankTotal > 0 ? (Math.round((r.sales / salesRankTotal) * 1000) / 10).toFixed(1) : "",
        r.hon, r.jonai, r.dohan,
        labor.state === "final" && r.sales > 0 && castGross.has(r.castId)
          ? (Math.round(((castGross.get(r.castId) ?? 0) / r.sales) * 1000) / 10).toFixed(1) : "",
      ]),
    ]);
  }

  // E8-6 #11: キャスト詳細4スタット（選択 cast・出せる2つ＝按分客単価/出勤・残り2つは集計経路待ち）
  const selSalesRow = salesRanking.find((r) => r.castId === castSel);
  const selNomCount = selSalesRow ? selSalesRow.hon + selSalesRow.jonai + selSalesRow.dohan : 0;

  // E8-6 #12: セグメント判定＝/customers と同じ語彙（新規 visits≤1・churn は RPC の churn_tier をそのまま）
  const segs = useMemo(() => {
    const rows = custSummary ?? [];
    const isNew = (r: CustSummaryRow) => r.visits <= 1 && r.churn_tier === "none";
    return [
      { k: "新規（来店1回以下）", rows: rows.filter(isNew) },
      { k: "リピート", rows: rows.filter((r) => !isNew(r) && r.churn_tier === "none") },
      { k: "離反リスク 中（30日〜）", rows: rows.filter((r) => r.churn_tier === "mid") },
      { k: "離反リスク 高（60日〜）", rows: rows.filter((r) => r.churn_tier === "high") },
    ];
  }, [custSummary]);

  return (
    <div className="nox-mv1 nox-mv1-sm">
      {/* 段0R 第2陣: モック .head を新シェルの nox-hero へ（/master・/home・/casts と同基準） */}
      <PageHead eyebrow="BUSINESS INSIGHTS" title="売上・店舗分析"
        desc="確定した日報をもとに、売上・キャスト・顧客の変化と改善点を可視化します。" />

      {/* 段0R 第2陣: モック .toolbar＝セグメントを左・期間表示を右端（.period）に。 */}
      <div className="nox-ctoolbar">
        <div className="nox-seg">
          {([["today", "今月"], ["prev", "先月"]] as const).map(([k, label]) => {
            const target = k === "today" ? thisMonth : prevPeriodOf(thisMonth);
            return (
              <button key={k} className={period === target ? "on" : ""} onClick={() => { setPeriod(target); setCastSel(""); }}>
                {label}
              </button>
            );
          })}
        </div>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="対象月（YYYY-MM）" className="nox-input" style={{ width: "auto" }} />
        {stores.length > 1 && (
          <select
            value={storeId}
            onChange={(e) => { setStoreId(e.target.value); setCastSel(""); }}  // 店切替で cast 選択リセット
            aria-label="店舗"
            className="nox-input"
            style={{ width: "auto" }}
          >
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {/* E8-6 #17: 全店合算（owner のみ・時間帯/カテゴリ/リテンションの3区画にのみ効く） */}
        {isOwner && stores.length > 1 && (
          <label style={{ fontSize: 12, color: "var(--sub)", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={allStores} onChange={(e) => setAllStores(e.target.checked)} />
            {/* ★DP2-② 裁定（2026-08-21）: 見出し3語の製品文言化に合わせて語彙を揃えた
                （旧「リテンション」がこの行にだけ残り画面内で食い違っていた）。 */}
            全店舗で集計（時間帯別・カテゴリ別・再来店）
          </label>
        )}
        <span className="num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--sub)" }}>
          {period}・締め済み {daily.length}日分
        </span>
      </div>

      {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}

      {/* 段A2: KPI 帯4枚＝すべて締め済み daily_reports の再形（全ビュー共通で常時表示・材料も式も不変）。 */}
      <div className="nox-kpis">
        <div className="nox-kpi">
          <div className="lbl">売上（締め済み）</div>
          <div className="val num">{yen(curSales)}</div>
          <div className="sub">
            前月同期 {yen(prevSales)}{cmp(curSales, prevSales) !== null ? `（${cmp(curSales, prevSales)! >= 0 ? "+" : ""}${cmp(curSales, prevSales)}%）` : ""}
          </div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">組数</div>
          <div className="val num">{curSlips}<small>組</small></div>
          <div className="sub">前月同期 {prevSlips}組</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">組単価</div>
          <div className="val num">{yen(per(curSales, curSlips))}</div>
          <div className="sub">前月同期 {yen(per(prevSales, prevSlips))}</div>
        </div>
        <div className="nox-kpi">
          <div className="lbl">人件費率（概算）</div>
          <div className="val num">{laborRate == null ? "—" : `${laborRate}%`}</div>
          <div className="sub">
            {labor.state === "final" ? `給与確定 ${yen(labor.gross)} ÷ 売上` : labor.state === "draft" ? "給与が未確定" : "給与データなし"}
          </div>
        </div>
        {/* E8-6 #3: 月間目標の進捗＝5枚目（分子は KPI 1枚目と同じ締め済み売上・目標は選択店単位） */}
        <div className="nox-kpi">
          <div className="lbl">月間目標</div>
          <div className="val num">{target === null ? "未設定" : `${targetPct}%`}</div>
          <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="num">{target === null ? "目標を設定すると進捗を表示" : `目標 ${yen(target)}`}</span>
            <button
              style={{ ...t.btnGhost, ...t.btnSm, padding: "1px 8px", fontSize: 10.5 }}
              onClick={() => { setTgtInput(target === null ? "" : String(target)); setTgtMsg(null); setTgtOpen(true); }}
            >設定</button>
          </div>
          {target !== null && target > 0 && (
            <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: "var(--line2)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, targetPct ?? 0)}%`, height: "100%", background: (targetPct ?? 0) >= 100 ? "var(--ok)" : "var(--gold)" }} />
            </div>
          )}
        </div>
      </div>

      {t4Err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{t4Err}</p>}

      {/* ── E8-6 #1: 4ビュー切替（モック view-tabs 準拠・既存セクションの再配置のみ）── */}
      <nav className="nox-subnav">
        {([["summary", "サマリー"], ["sales", "売上"], ["casts", "キャスト"], ["customers", "顧客"]] as const).map(([k, label]) => (
          <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
        ))}
      </nav>

      {/* ══ ビュー「サマリー」＝日別売上バー＋売上内訳（従来の要約面） ══ */}
      {view === "summary" && (
      <div className="nox-acols">
        <div>
          <section className="nox-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ marginRight: "auto" }}>日別売上（締め済み・{period}）</h3>
              {/* E8-6 #15: 月次レポート CSV（表示中の daily の再形のみ） */}
              {daily.length > 0 && (
                <button style={{ ...t.btnGhost, ...t.btnSm }} onClick={exportMonthlyCsv}>CSV 出力</button>
              )}
            </div>
            {daily.length === 0
              ? <p style={noneP}>この月の締め済み日報がありません。</p>
              : (
                <>
                  <div className="nox-barwrap">
                    <div className="nox-bars">
                      {daily.map((r) => {
                        const v = salesOf(r);
                        const d = Number(r.biz_date.slice(8));
                        const dow = dowOf(r.biz_date);
                        const weekend = dow === 0 || dow === 6;
                        return (
                          <div
                            key={r.biz_date}
                            className={`nox-bar ${weekend ? "hi" : ""}`}
                            style={{ height: `${Math.max(4, Math.round((v / barMax) * 100))}%` }}
                            title={`${r.biz_date}（${DOW[dow]}）・${yen(v)}・${r.slips ?? 0}組`}
                          >
                            {(d === 1 || d % 7 === 0 || weekend) && (
                              <span className="bl num">{d}{weekend ? DOW[dow] : ""}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="nox-barfoot">
                    <span>最高 {peak ? `${yen(salesOf(peak))}（${peak.biz_date.slice(5).replace("-", "/")}）` : "—"}</span>
                    <span>平均 {yen(avgPerDay)}/日（締め済み {daily.length}日分）</span>
                  </div>
                </>
              )}
          </section>
        </div>
        <div>
          <section className="nox-panel">
            <h3>売上内訳（{period}）</h3>
            {daily.length === 0
              ? <p style={noneP}>この月の締め済み日報がありません。</p>
              : breakdown.map((x) => (
                  <div key={x.k} className="nox-srow">
                    <span>{x.k}</span>
                    <span className="v num">{yen(x.v)}</span>
                  </div>
                ))}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※日報が持つ内訳はドリンク・ボトルのみのため、それ以外は「その他」にまとめています。
            </p>
          </section>
          {/* E8-6 #5（mig0096 結線）: kind×fee_kind 生Σ → category-map 純関数で5分類（E8-2 日報と同じ写像）。
              ★材料は明細（サービス料・丸め前）＝日報売上（丸め後・サ料込）とは一致しない＝注記で明示。 */}
          <section className="nox-panel">
            <h3>売上カテゴリ（5分類・{period}{allStores && isOwner ? "・全店舗" : ""}）</h3>
            {catRows === null && <p style={noneP}>読み込み中…</p>}
            {catRows !== null && catSums.total === 0 && <p style={noneP}>この月の会計済み伝票がありません。</p>}
            {catRows !== null && catSums.total > 0 && (
              <>
                {CATEGORY_ORDER.map((k) => {
                  const v = catSums.cats[k];
                  const pct = catSums.total > 0 ? Math.round((v / catSums.total) * 1000) / 10 : 0;
                  const catMax = Math.max(1, ...CATEGORY_ORDER.map((x) => catSums.cats[x]));
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0", fontSize: 12.5 }}>
                      <span style={{ width: 92, flexShrink: 0, color: "var(--sub)" }}>{CATEGORY_LABEL[k]}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--line2)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((v / catMax) * 100)}%`, height: "100%", background: "var(--gold)" }} />
                      </div>
                      <span className="num" style={{ width: 130, textAlign: "right", flexShrink: 0 }}>{yen(v)}（{pct}%）</span>
                    </div>
                  );
                })}
                <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
                  ※会計済み伝票の明細合計（サービス料・丸め前）＝締め済み日報の売上とは一致しません。
                  値引き {yen(catSums.discount)} は別掲（5分類に含めていません）。
                  指名・その他のうち指名料は 本{yen(catSums.nomFee.hon)}・場内{yen(catSums.nomFee.jonai)}・同伴{yen(catSums.nomFee.dohan)}。
                </p>
              </>
            )}
          </section>
        </div>
      </div>
      )}

      {/* ══ ビュー「売上」＝売上推移（期間4種）＋決済構成ドーナツ＋決済別実績＋時間帯（準備中） ══ */}
      {view === "sales" && (
      <>
      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ marginRight: "auto" }}>売上推移（{period}）</h3>
          {/* E8-6 #2: 期間4種＝日別／前月重ね／3ヶ月／6ヶ月（daily_reports 直読の範囲・式は salesOf のまま） */}
          <div className="nox-seg">
            {([["daily", "日別"], ["overlay", "前月比較"], ["3m", "3ヶ月"], ["6m", "6ヶ月"]] as const).map(([k, label]) => (
              <button key={k} className={trendMode === k ? "on" : ""} onClick={() => setTrendMode(k)}>{label}</button>
            ))}
          </div>
        </div>
        {trendMode === "daily" && (daily.length === 0
          ? <p style={noneP}>この月の締め済み日報がありません。</p>
          : (
            <div className="nox-barwrap">
              <div className="nox-bars">
                {daily.map((r) => {
                  const v = salesOf(r);
                  const d = Number(r.biz_date.slice(8));
                  const dow = dowOf(r.biz_date);
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <div key={r.biz_date} className={`nox-bar ${weekend ? "hi" : ""}`}
                      style={{ height: `${Math.max(4, Math.round((v / barMax) * 100))}%` }}
                      title={`${r.biz_date}（${DOW[dow]}）・${yen(v)}・${r.slips ?? 0}組`}>
                      {(d === 1 || d % 7 === 0 || weekend) && <span className="bl num">{d}{weekend ? DOW[dow] : ""}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        {trendMode === "overlay" && (daily.length === 0
          ? <p style={noneP}>この月の締め済み日報がありません。</p>
          : (
            <>
              {/* 前月重ね＝日番号で対応付けた2本組バー（当月=金・前月=muted）。高さは両月共通の最大値基準 */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 150, overflowX: "auto", padding: "4px 2px" }}>
                {daily.map((r) => {
                  const d = Number(r.biz_date.slice(8));
                  const pv = prevDaily.find((p) => Number(p.biz_date.slice(8)) === d);
                  const v = salesOf(r);
                  const p = pv ? salesOf(pv) : 0;
                  return (
                    <div key={r.biz_date} style={{ display: "flex", alignItems: "flex-end", gap: 1, flexShrink: 0 }}
                      title={`${d}日 当月 ${yen(v)} ／ 前月 ${pv ? yen(p) : "—"}`}>
                      <div style={{ width: 7, borderRadius: "2px 2px 0 0", background: "var(--line2)", height: Math.max(2, Math.round((p / overlayMax) * 140)) }} />
                      <div style={{ width: 7, borderRadius: "2px 2px 0 0", background: "var(--gold)", height: Math.max(2, Math.round((v / overlayMax) * 140)) }} />
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0" }}>
                金＝当月・グレー＝前月の同じ日付（前月に締めが無い日は前月側 0）。
              </p>
            </>
          ))}
        {(trendMode === "3m" || trendMode === "6m") && (
          trendMonths.every((m) => m.days === 0)
            ? <p style={noneP}>この期間の締め済み日報がありません。</p>
            : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 160, padding: "4px 2px" }}>
                {trendMonths.map((m) => (
                  <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                    title={`${m.month}・${yen(m.sales)}・締め済み ${m.days}日分`}>
                    <span className="num" style={{ fontSize: 11 }}>{yen(m.sales)}</span>
                    <div style={{ width: 42, borderRadius: "3px 3px 0 0", background: m.month === period ? "var(--gold)" : "var(--line2)", height: Math.max(3, Math.round((m.sales / trendMonthMax) * 118)) }} />
                    <span className="num" style={{ fontSize: 11, color: "var(--sub)" }}>{m.month.slice(2).replace("-", "/")}</span>
                  </div>
                ))}
              </div>
            )
        )}
      </section>

      <div className="nox-acols">
        <div>
          {/* E8-6 #4: 決済構成＝ドーナツ＋構成比%（E8-2 日報ドーナツと同じ SVG stroke-dasharray 手法・材料は payMix のまま） */}
          <section className="nox-panel">
            <h3>決済構成（{period}）</h3>
            {payTotal === 0
              ? <p style={noneP}>この月の締め済み日報がありません。</p>
              : (
                <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <svg width="110" height="110" viewBox="0 0 42 42" role="img" aria-label="決済構成">
                    <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--card2)" strokeWidth="6" />
                    {(() => {
                      let acc = 0;
                      return payMix.filter((x) => x.v > 0).map((x) => {
                        const pct = (x.v / payTotal) * 100;
                        const el = (
                          <circle key={x.k} cx="21" cy="21" r="15.9155" fill="none" stroke={x.color} strokeWidth="6"
                            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={String(25 - acc)} />
                        );
                        acc += pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {payMix.map((x) => (
                      <div key={x.k} className="nox-srow">
                        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: x.color, marginRight: 6 }} />{x.k}</span>
                        <span className="v num">{yen(x.v)}{payTotal > 0 ? `（${Math.round((x.v / payTotal) * 1000) / 10}%）` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※締め済み日報の集計。カードは手数料前のグロス、売掛は当月発生分です。
            </p>
          </section>
        </div>
        <div>
          {/* E8-6 #9: 決済別実績＝カード手数料（日報の凍結列）と売掛の発生/回収/残高（receivables/ar_collections 直読） */}
          <section className="nox-panel">
            <h3>決済別実績（{period}）</h3>
            <div className="nox-srow"><span>カード グロス</span><span className="v num">{yen(cardGross)}</span></div>
            <div className="nox-srow"><span>カード手数料（締め時レート）</span><span className="v num">{yen(cardTax)}</span></div>
            <div className="nox-srow"><span>カード入金見込み（ネット）</span><span className="v num">{yen(cardGross - cardTax)}</span></div>
            <div className="nox-srow"><span>売掛 当月発生</span><span className="v num">{yen(sum(daily, (r) => r.uri))}</span></div>
            <div className="nox-srow"><span>売掛 当月回収</span><span className="v num">{yen(arCollected)}</span></div>
            <div className="nox-srow"><span>売掛 未回収残高（全期間）</span><span className="v num">{yen(arOpen)}</span></div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※手数料は各営業日の締め時レートのスナップショット合計。回収は入金記録（当月）・残高は給与天引き分を除いた未回収の合計です。
            </p>
          </section>
        </div>
      </div>

      {/* E8-6 #8（mig0096 結線）: 時間帯別売上バー（JST 時計時刻・月内Σ・非ゼロ時間のみ） */}
      <section className="nox-panel">
        <h3>時間帯別売上（{period}{allStores && isOwner ? "・全店舗" : ""}）</h3>
        {hourly === null && <p style={noneP}>読み込み中…</p>}
        {hourly !== null && hourBars.length === 0 && <p style={noneP}>この月の会計済み伝票がありません。</p>}
        {hourly !== null && hourBars.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, overflowX: "auto", padding: "4px 2px" }}>
              {hourBars.map((h) => (
                <div key={h.hour} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}
                  title={`${h.hour}時台・${yen(h.sales)}・${h.checks}組`}>
                  <div style={{ width: 26, borderRadius: "3px 3px 0 0", background: "var(--gold)", height: Math.max(3, Math.round((h.sales / hourMax) * 100)) }} />
                  <span className="num" style={{ fontSize: 10.5, color: "var(--sub)" }}>{h.hour}時</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0" }}>
              ※開卓時刻（時計時刻）ベースの卓合計（サ料込・丸め後）。
              平均滞在 {avgStay === null ? "—" : `${avgStay}分`}（会計済み {stayCnt}組）。
            </p>
          </>
        )}
      </section>

      {/* E8-6 #7（mig0096 結線）: 曜日×時間帯ヒートマップ＝7×24 の 168 グリッド client 展開 */}
      <section className="nox-panel">
        {/* ★DP2 T5（裁定 DP0-2）: 内部用語「ヒートマップ」を製品文言へ。
            表そのもの（7×24 の色濃淡）は不変＝見出しの語彙だけを変える。 */}
        <h3>曜日別・時間帯別の売上（{period}{allStores && isOwner ? "・全店舗" : ""}）</h3>
        {hourly === null && <p style={noneP}>読み込み中…</p>}
        {hourly !== null && heat.size === 0 && <p style={noneP}>この月の会計済み伝票がありません。</p>}
        {hourly !== null && heat.size > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "26px repeat(24, 22px)", gap: 2, alignItems: "center" }}>
                <span />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="num" style={{ fontSize: 9.5, color: "var(--sub)", textAlign: "center" }}>{h}</span>
                ))}
                {DOW.map((label, d) => (
                  <>
                    <span key={`l${d}`} style={{ fontSize: 11, color: d === 0 ? "var(--bad)" : d === 6 ? "var(--champ)" : "var(--sub)" }}>{label}</span>
                    {Array.from({ length: 24 }, (_, h) => {
                      const v = heat.get(`${d}-${h}`) ?? 0;
                      const alpha = v > 0 ? 0.15 + 0.85 * (v / heatMax) : 0;
                      return (
                        <div key={`${d}-${h}`}
                          title={v > 0 ? `${label}曜 ${h}時台・${yen(v)}` : undefined}
                          style={{ width: 22, height: 18, borderRadius: 3,
                            background: v > 0 ? `rgba(201, 162, 74, ${alpha})` : "var(--card2)",
                            border: "1px solid var(--line)" }} />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※濃いほど売上が大きい時間帯（開卓時刻ベース・曜日は営業日の曜日＝深夜帯は前営業日側）。
            </p>
          </>
        )}
      </section>
      </>
      )}

      {/* ══ ビュー「キャスト」＝売上貢献（列拡張）＋指名件数＋キャスト詳細＋主要客リスト ══ */}
      {view === "casts" && (
      <>
      <section className="nox-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ marginRight: "auto" }}>売上貢献ランキング（{period}・按分ベース）</h3>
          {/* E8-6 #15: ランキング CSV */}
          {salesRanking.length > 0 && (
            <button style={{ ...t.btnGhost, ...t.btnSm }} onClick={exportRankingCsv}>CSV 出力</button>
          )}
        </div>
        {salesRanking.length === 0 && <p style={noneP}>該当なし（対象月に帰属売上のある伝票がありません）</p>}
        {/* E8-6 #10: 構成%（分母＝按分売上の総和）と報酬率（確定給与 gross ÷ 按分売上・確定月のみ）を追加。
            ★粗利（原価突合）とリピート率（月またぎの伝票走査）は集計経路が無いため保留（根拠列: product_costs / checks.customer_id）。 */}
        {salesRanking.map((r, i) => {
          const share = salesRankTotal > 0 ? Math.round((r.sales / salesRankTotal) * 1000) / 10 : null;
          const g = castGross.get(r.castId);
          const rate = labor.state === "final" && g !== undefined && r.sales > 0
            ? Math.round((g / r.sales) * 1000) / 10 : null;
          return (
            <div key={r.castId} className="nox-rk2">
              <span className={`nox-medal ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}`}>{i + 1}</span>
              <CastAvatar name={r.name} url={photoUrls.get(r.castId)} variant="flat" />
              <span>{r.name}</span>
              <span className="cnt num">
                本{r.hon}・場内{r.jonai}・同伴{r.dohan}
                {share !== null ? `・構成${share}%` : ""}{rate !== null ? `・報酬率${rate}%` : ""}
              </span>
              <span className="amt num">{yen(r.sales)}</span>
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          ※卓合計（サ料込・丸め後）を在席指名の重みで按分した金額ベース。構成%は按分売上内の割合。
          報酬率＝確定給与（源泉前）÷ 按分売上で、給与確定月のみ表示します。
        </p>
      </section>

      <section className="nox-panel">
        <h3>指名件数ランキング（{period}）</h3>
        {ranking.length === 0 && <p style={noneP}>該当なし（アクティブなキャストがいません）</p>}
        {ranking.length > 0 && (
          <table className="nox-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>名前</th>
                <th className="num">本指名</th>
                <th className="num">場内</th>
                <th className="num">同伴</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.cast_id}>
                  <td><span className={`nox-medal ${r.rank === 1 ? "g1" : r.rank === 2 ? "g2" : r.rank === 3 ? "g3" : "gx"}`}>{r.rank}</span></td>
                  <td>{r.cast_name}</td>
                  <td className="num">{r.hon_count}</td>
                  <td className="num">{r.jonai_count}</td>
                  <td className="num">{r.dohan_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          ※伝票単位の指名回数（金額とは別軸＝売上貢献の件数と一致しないことがあります）。
        </p>
      </section>

      <section className="nox-panel">
        <h3>主要客リスト（{period}・キャスト別指名客）</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={t.fieldLabel}>
            キャスト
            <br />
            <select value={castSel} onChange={(e) => setCastSel(e.target.value)} className="nox-input" style={{ width: "auto", marginTop: 5 }}>
              <option value="">選択してください</option>
              {castOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {/* E8-6 #11: 選択キャストの4スタット（客単価=按分売上÷指名伝票数・出勤=attendance PRESENT。
            延長率・杯数は明細の時刻・行帰属の集計経路が要るため準備中（発明しない）。 */}
        {castSel && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>客単価（按分）</div>
              <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>
                {selSalesRow && selNomCount > 0 ? yen(Math.round(selSalesRow.sales / selNomCount)) : "—"}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>按分売上 ÷ 指名伝票数</div>
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>出勤</div>
              <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>{attDays === null ? "—" : `${attDays}日`}</div>
              <div style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>出勤・同伴・遅刻の日数</div>
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>延長率</div>
              <div style={{ fontSize: 12, color: "var(--v2-muted)", marginTop: 4 }}>{COMING}</div>
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>ドリンク杯数</div>
              <div style={{ fontSize: 12, color: "var(--v2-muted)", marginTop: 4 }}>{COMING}</div>
            </div>
          </div>
        )}
        {custErr && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{custErr}</p>}
        {!castSel && <p style={noneP}>キャストを選択すると、その月に指名した客の一覧（回数順）を表示します。</p>}
        {castSel && !custErr && custRank.length === 0 && (
          <p style={noneP}>該当なし（この月に客に紐付いた指名がありません）</p>
        )}
        {castSel && custRank.length > 0 && (
          <table className="nox-table">
            <thead>
              <tr>
                <th>客名</th>
                <th className="num">本指名</th>
                <th className="num">場内</th>
                <th className="num">同伴</th>
                <th className="num">合計</th>
              </tr>
            </thead>
            <tbody>
              {custRank.map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.customer_name}</td>
                  <td className="num">{r.hon_count}</td>
                  <td className="num">{r.jonai_count}</td>
                  <td className="num">{r.dohan_count}</td>
                  <td className="num" style={{ color: "var(--champ)", fontWeight: 700 }}>{r.total_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {castSel && !custErr && (
          <p style={{ fontSize: 11, color: dropCount > 0 ? "var(--gold2)" : "var(--sub)", margin: "8px 0 0" }}>
            {dropCount > 0
              ? `※客なし指名 ${dropCount} 件は対象外（客未紐付けの伝票＝指名件数ランキングとの差分）。`
              : selTotalNom > 0
                ? "※全指名が客に紐付いています。"
                : "※この月の指名はありません。"}
          </p>
        )}
      </section>
      </>
      )}

      {/* ══ ビュー「顧客」＝セグメント4分類（/customers と同じ判定）＋リテンション（準備中） ══ */}
      {view === "customers" && (
      <>
      <section className="nox-panel">
        {/* ★DP2 T5（裁定 DP0-2）: 内部用語「セグメント」を製品文言へ。
            配下のラベル（新規／リピート／離反リスク 中・高）は元から和文＝不触。 */}
        <h3>客層の内訳</h3>
        {custSummaryErr && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{custSummaryErr}</p>}
        {custSummary === null && !custSummaryErr && <p style={noneP}>読み込み中…</p>}
        {custSummary !== null && !custSummaryErr && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {segs.map((s) => (
                <div key={s.k} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: "var(--sub)" }}>{s.k}</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{s.rows.length}<small style={{ fontSize: 11 }}>人</small></div>
                  <div className="num" style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>
                    累計 {yen(s.rows.reduce((a, r) => a + (r.total_spend ?? 0), 0))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※判定は顧客一覧と同じ（新規＝来店1回以下・離反リスク＝最終来店からの経過日数）。
              個別の対応は <Link href="/customers" style={{ color: "var(--gold2)" }}>顧客管理</Link> から。
            </p>
          </>
        )}
      </section>
      {/* E8-6 #13（mig0096 結線）: コホートリテンション表＝直近6ヶ月の初来店月×経過月。
          初来店月は全履歴で確定（窓外に履歴のある客は新規に数えない＝段53(9) 実測） */}
      <section className="nox-panel">
        {/* ★DP2 T5（裁定 DP0-2）: 内部用語「リテンション」を製品文言へ。
            括弧内は元から和文の言い換えだったので、見出し語をその言い換えに寄せる。 */}
        <h3>初来店の月ごとの再来店（直近6ヶ月{allStores && isOwner ? "・全店舗" : ""}）</h3>
        {cohort === null && <p style={noneP}>読み込み中…</p>}
        {cohort !== null && cohortTable.length === 0 && (
          <p style={noneP}>この期間に初来店した客がいません（顧客が紐付いた会計済み伝票が対象）。</p>
        )}
        {cohort !== null && cohortTable.length > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="nox-table">
                <thead>
                  <tr>
                    <th>初来店月</th>
                    <th className="num">人数</th>
                    {Array.from({ length: 5 }, (_, i) => <th key={i} className="num">＋{i + 1}ヶ月</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohortTable.map((r) => (
                    <tr key={r.month}>
                      <td className="num">{r.month}</td>
                      <td className="num">{r.base}人</td>
                      {r.cells.slice(1).map((v, i) => (
                        <td key={i} className="num" style={{ color: v > 0 ? "var(--ok)" : "var(--v2-muted)" }}>
                          {r.base > 0 && v > 0 ? `${v}人（${Math.round((v / r.base) * 100)}%）` : v > 0 ? `${v}人` : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※各行＝その月に初来店した客の数と、n ヶ月後にも来店した人数（%は初来店人数比）。
              顧客が紐付いていない伝票は対象外。初来店月は全期間の履歴で判定します。
            </p>
          </>
        )}
      </section>
      </>
      )}

      {/* E8-6 #3: 目標設定モーダル（store_sales_target_set・空欄で保存=クリア） */}
      {tgtOpen && (
        <Modal onClose={() => setTgtOpen(false)}>
          <h3 style={{ margin: "0 0 10px" }}>月間売上目標（{stores.find((s) => s.id === storeId)?.name ?? ""}・{period}）</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number" min={0} value={tgtInput} onChange={(e) => setTgtInput(e.target.value)}
              placeholder="例 8000000" className="nox-input" style={{ width: 160 }} aria-label="月間売上目標（円）"
            />
            <span style={{ fontSize: 12, color: "var(--sub)" }}>円</span>
            <button style={{ ...t.btnGold, padding: "8px 16px", opacity: tgtBusy ? 0.6 : 1 }} disabled={tgtBusy}
              onClick={() => void saveTarget(tgtInput.trim() === "" ? null : Number(tgtInput))}>
              {tgtInput.trim() === "" ? "クリア（目標なしに戻す）" : "保存"}
            </button>
            <button style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setTgtOpen(false)}>閉じる</button>
          </div>
          {tgtMsg && <p style={{ fontSize: 12, color: "var(--bad)", fontWeight: 700, margin: "8px 0 0" }}>{tgtMsg}</p>}
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
            進捗の分子は締め済み日報の売上（KPI と同じ）。空欄で保存すると目標を外します。
          </p>
        </Modal>
      )}
    </div>
  );
}
