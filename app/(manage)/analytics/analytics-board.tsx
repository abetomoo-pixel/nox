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
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";

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

const yen = (n: number) => "¥" + n.toLocaleString();
// 段A2: 日別バーの土日ハイライト用（曜日ラベル）
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
// 段0R 第2陣: 見出しは nox-panel > h3（白）へ統一したので t.cardTitle 由来の secTitle は撤去。
const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
// E8-6: 集計経路が未提供の区画に出す製品文言（内部用語を画面に出さない＝E8-3 の教訓）
const comingP: React.CSSProperties = { fontSize: 12.5, color: "var(--v2-muted)" };
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
  stores, casts,
}: {
  stores: Store[]; casts: Cast[];
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
    <div>
      {/* 段0R 第2陣: モック .head を新シェルの nox-hero へ（/master・/home・/casts と同基準） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>分析</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            締め済み日報ベースの売上と、キャスト別の売上貢献・指名の集計。
          </p>
        </div>
      </div>

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
      </div>

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
          {/* E8-6 #5 プレースホルダ（写像は確定済み・集計経路の提供待ち） */}
          <section className="nox-panel">
            <h3>売上カテゴリ（5分類）</h3>
            <p style={comingP}>{COMING}セット・延長／ドリンク／シャンパン／ボトル／指名・その他の内訳を表示する予定です。</p>
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

      {/* E8-6 #7/#8 プレースホルダ */}
      <section className="nox-panel">
        <h3>時間帯別売上・曜日×時間帯ヒートマップ</h3>
        <p style={comingP}>{COMING}時間帯ごとの売上と、曜日×時間帯の混雑傾向を表示する予定です。</p>
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
        <h3>顧客セグメント</h3>
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
      {/* E8-6 #13 プレースホルダ */}
      <section className="nox-panel">
        <h3>リテンション（月別の再来店率）</h3>
        <p style={comingP}>{COMING}初回来店月ごとの再来店状況を表示する予定です。</p>
      </section>
      </>
      )}
    </div>
  );
}
