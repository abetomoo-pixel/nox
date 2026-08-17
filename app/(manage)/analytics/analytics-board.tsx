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
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";

type Store = { id: string; name: string };
type Cast = { id: string; name: string; store_id: string; is_active: boolean; photo_updated_at: string | null };
// 段A2: 締め済み日報の日別行（dashboard / month-report と同じ列・同じ売上式）
type DailyRow = {
  biz_date: string; cash: number; card_gross: number; uri: number; other: number;
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

const yen = (n: number) => "¥" + n.toLocaleString();
// 段A2: 日別バーの土日ハイライト用（曜日ラベル）
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
// 段0R 第2陣: 見出しは nox-panel > h3（白）へ統一したので t.cardTitle 由来の secTitle は撤去。
const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };

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
/** 日報1行の売上＝現金＋カードグロス＋売掛＋その他（dashboard / month-report と同式）。 */
const salesOf = (r: { cash: number; card_gross: number; uri: number; other: number }) =>
  r.cash + r.card_gross + r.uri + r.other;
/** 'YYYY-MM-DD' の曜日（0=日）。ローカル TZ 非依存（S-1 の dowOf と同式）。 */
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

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
    const cols = "biz_date, cash, card_gross, uri, other, drink_sales, slips, guests";
    const prev = prevPeriodOf(period);
    const [cur, pre] = await Promise.all([
      supabase.from("daily_reports").select(cols).eq("store_id", storeId)
        .gte("biz_date", `${period}-01`).lte("biz_date", lastDayOf(period)).order("biz_date"),
      supabase.from("daily_reports").select(cols).eq("store_id", storeId)
        .gte("biz_date", `${prev}-01`).lte("biz_date", lastDayOf(prev)).order("biz_date"),
    ]);
    setDaily((cur.data ?? []) as DailyRow[]);
    setPrevDaily((pre.data ?? []) as DailyRow[]);

    // 人件費＝payslips.breakdown_json.pay.gross 合計（★/report month-report の式を逐語踏襲・
    //   確定（finalized/paid）した run だけを人件費とみなし、draft は「未確定」＝S-2 の予想人件費とは別物）。
    const { data: runs } = await supabase.from("payroll_runs")
      .select("id, status").eq("store_id", storeId).eq("period", period);
    const fin = (runs ?? []).find((r) => r.status === "finalized" || r.status === "paid");
    if (fin) {
      const { data: slips } = await supabase.from("payslips").select("breakdown_json").eq("run_id", fin.id as string);
      const g = (slips ?? []).reduce((a, x) => {
        const bj = x.breakdown_json as { pay?: { gross?: number } } | null;
        return a + Number(bj?.pay?.gross ?? 0);
      }, 0);
      setLabor({ state: "final", gross: g });
    } else setLabor({ state: (runs ?? []).length ? "draft" : "none", gross: 0 });
  }, [storeId, period]);
  useEffect(() => { void loadMonth(); }, [loadMonth]);

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
  const loadCustRank = useCallback(async () => {
    if (!castSel) { setCustRank([]); setCustErr(null); return; }
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    setCustErr(null);
    const { data, error } = await supabase.rpc("get_cast_customer_ranking", {
      p_store_id: storeId, p_period: period, p_cast_id: castSel,
    });
    if (error) { setCustErr(`読み込みに失敗: ${error.message}`); setCustRank([]); return; }
    setCustRank((data ?? []) as CustRankRow[]);
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
  // 支払構成（既存列そのまま）
  const payMix = [
    { k: "現金", v: sum(daily, (r) => r.cash) },
    { k: "カード（グロス）", v: sum(daily, (r) => r.card_gross) },
    { k: "売掛", v: sum(daily, (r) => r.uri) },
    { k: "その他", v: sum(daily, (r) => r.other) },
  ];
  // ★売上内訳: daily_reports が持つのは drink_sales だけ＝モックの4分類
  //   （セット・時間料金／指名料／ドリンク・ボトル／サービス料）は現スキーマから作れない。
  //   明細 kind 別の集計は新規集計になるので作らず、既存列で言える2分類に留める（下の注記で明示）。
  const drinkSales = sum(daily, (r) => r.drink_sales ?? 0);
  const breakdown = [
    { k: "ドリンク・ボトル", v: drinkSales },
    { k: "その他（セット・指名料・サービス料 等）", v: Math.max(0, curSales - drinkSales) },
  ];
  const cmp = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

  // ★E4 群1: 表は E3 の共通部品 `.nox-table`（＋数値列は `.num`）へ移した。
  //   ローカルの thNum/tdNum（t.th/t.td の派生 inline）は不要になったため削除。

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

      {/* 段0R 第2陣: モック .toolbar＝セグメントを左・期間表示を右端（.period）に。
          ★従来カードの中にあった 店舗select・対象月input・セグメントを1行へ並べ替えただけで、
            period state も storeId state も送る引数も1文字も変えていない。 */}
      <div className="nox-ctoolbar">
        {/* 段A2: 期間セグメント（今月/先月）＝既存の period state を切り替えるだけ。
            任意月を選べる既存の月入力はそのまま残す（機能を減らさない）。 */}
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
        {/* ★E4 群1: t.input の inline → E3 部品 .nox-input（幅だけ auto に上書き） */}
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
        {/* モック .period＝右端の期間表示。★既に下段バーの footer で出している daily.length の再掲のみ。 */}
        <span className="num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--sub)" }}>
          {period}・締め済み {daily.length}日分
        </span>
      </div>

      {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}

      {/* 段A2: KPI 帯4枚＝すべて締め済み daily_reports の再形（売上式は dashboard / month-report と同一）。
          前月同期は「同じ SELECT を前月分も引いて、当月と同じ締め済み日数ぶんで比べる」だけ＝新規 RPC なし。 */}
      {/* 段0R 第2陣: S-1 由来の nox-kpirow/nox-kpi2 から aaa 基準の共通骨格 nox-kpis/nox-kpi へ
          載せ替え（lbl/val/sub＝モック .kpi の lbl/val/cmp 相当）。★4枚の材料も式も内容も不変。 */}
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
          {/* ★既存の概算（/report 月報）と同じ定義＝確定給与の源泉前 gross ÷ 売上。
              給与が未確定の月は率を出さない（S-2 の「予想人件費」とは別物・そちらは触っていない）。 */}
          <div className="sub">
            {labor.state === "final" ? `給与確定 ${yen(labor.gross)} ÷ 売上` : labor.state === "draft" ? "給与が未確定" : "給与データなし"}
          </div>
        </div>
      </div>

      {/* 段0R 第2陣: モック .cols＝左 1.2fr（日別売上バー＋支払構成）／右 1fr（売上貢献ランキング＋売上内訳）。
          900+ で横並び・≤900 は縦積み（.nox-acols）。モックに無い 指名件数ランキング／主要客リストは
          情報を減らさないため 2カラムの下にフル幅で残置する。 */}
      <div className="nox-acols">
        <div>

      {/* 段A2: 日別売上（締め済み）＝CSS バーのみ。★チャートライブラリは導入しない。 */}
      <section className="nox-panel">
        <h3>日別売上（締め済み・{period}）</h3>
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
                    // 高さは最大日を 100% とした相対（値は既存の日別売上そのもの）
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

      {/* 段A2: 支払構成／売上内訳＝締め済み日報の既存列そのまま（新規集計ゼロ） */}
      <section className="nox-panel">
        <h3>支払構成（{period}）</h3>
        {daily.length === 0
          ? <p style={noneP}>この月の締め済み日報がありません。</p>
          : payMix.map((x) => (
              <div key={x.k} className="nox-srow">
                <span>{x.k}</span>
                <span className="v num">{yen(x.v)}</span>
              </div>
            ))}
        <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
          ※締め済み日報の集計。カードは手数料前のグロス、売掛は当月発生分です。
        </p>
      </section>

        </div>
        <div>

      {/* 段0R 第2陣: モックでは右カラムが 売上貢献ランキング → 売上内訳 の順（並べ替えのみ） */}
      <section className="nox-panel">
        <h3>売上貢献ランキング（{period}・按分ベース）</h3>
        {salesRanking.length === 0 && <p style={noneP}>該当なし（対象月に帰属売上のある伝票がありません）</p>}
        {/* 段A2: テーブル→メダル＋写真チップの行へ（表示列は従来と同じ＝売上・本・場内・同伴）。
            金額は「読む情報」ゆえ白（金3役の原則）。 */}
        {salesRanking.map((r, i) => (
          <div key={r.castId} className="nox-rk2">
            <span className={`nox-medal ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}`}>{i + 1}</span>
            <CastAvatar name={r.name} url={photoUrls.get(r.castId)} variant="flat" />
            <span>{r.name}</span>
            <span className="cnt num">本{r.hon}・場内{r.jonai}・同伴{r.dohan}</span>
            <span className="amt num">{yen(r.sales)}</span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          ※卓合計（サ料込・丸め後）を在席指名の重みで按分した金額ベース。件数列は当該 cast が指名に載った伝票数。
        </p>
      </section>

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
        {/* ★モックはセット・時間料金／指名料／ドリンク・ボトル／サービス料 の4分類だが、
            締め済み日報が持つ内訳列は drink_sales のみ。4分類は明細 kind 別の新規集計が要るため作らず、
            既存列で確実に言える2分類に留めている（発明しない）。 */}
        <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
          ※日報が持つ内訳はドリンク・ボトルのみのため、それ以外は「その他」にまとめています。
        </p>
      </section>

        </div>
      </div>

      {/* ここから下＝モックに無い既存セクション（情報を減らさないためフル幅で残置） */}
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
                  {/* 段E: 順位メダル（top3=金銀銅・既存 rank のみ・新情報なし） */}
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
                  {/* 合計列だけ強調（champ・太字）＝部品の .num に色だけ足す */}
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
    </div>
  );
}
