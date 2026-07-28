"use client";

// B-5 スライスB（mig0033）: 定休日=UI 一次ブロック＋RPC 二層目 'closed day'（段26 実測）／
//   営業時間外=黄警告のみで登録可（非対称・段26-2/26-5）／未設定 dow=判定なし（後方互換）。
//   ★シフトの営業日判定は shiftHoursStatus（date 直＝cutoff 変換なし・mig0008 決定3）。
//   予約用 businessHoursStatus（cutoff 変換）をシフトに使うと深夜帯で1日ズレるため使用禁止。
//   希望の採否は「採用のみ定休日ブロック・見送りは定休日でも可」の非対称を UI に出す（裁定B-3）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin, fmtBand30, hm2min } from "@/lib/nox/shift-time";
import { shiftHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { forecastDay, type ForecastComp, type DayForecast } from "@/lib/nox/labor-forecast";
import type { CompPlan } from "@/lib/nox/pay";
import IncentivePanel from "./incentive-panel";

type Cast = { id: string; name: string; photo_updated_at: string | null };
type Wish = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Att = { cast_id: string; status: string; eta: string | null };
type Need = { dow: number; required: number };

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

// ── UI刷新v2 段S-1 ヘルパー（表示専用・DB 非改変）────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** 'YYYY-MM-DD' → その暦日の曜日（0=日）。ローカル TZ 依存を避け UTC で解く。 */
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** 充足判定（ガイド §1-4 の3色のみ）: required 0=未設定 / >=必要=充足 / 1人不足=やや不足 / 2人以上不足=不足 */
type Fill = "none" | "ok" | "warn" | "ng";
const fillOf = (assigned: number, required: number): Fill =>
  required <= 0 ? "none" : assigned >= required ? "ok" : required - assigned === 1 ? "warn" : "ng";
const FILL_LABEL: Record<Fill, string> = { none: "未設定", ok: "充足", warn: "やや不足", ng: "不足" };
const ATT_OPTIONS = [
  ["", "—"], ["shukkin", "出勤"], ["dohan", "同伴"], ["late", "遅刻"], ["off", "休み"], ["absent", "当欠"],
] as const;

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
const btnDark: React.CSSProperties = { ...t.btnGold, padding: "8px 16px" };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

// RPC エラーの日本語化（シフト系・B-5②）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "選択された日は定休日です";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59 で入力してください";
  if (msg.includes("already decided")) return "この希望は処理済みです";
  if (msg.includes("inactive cast")) return "このキャストは退店済みです";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function ShiftBoard({ storeId, casts, isManagerUp }: { storeId: string; casts: Cast[]; isManagerUp: boolean }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [attDate, setAttDate] = useState(bizToday);
  const [atts, setAtts] = useState<Att[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  // ── UI刷新v2 段S-1: サブナビ（今日/カレンダー/シフト作成）・表示月・選択日 ──
  //   すべて presentation（どの範囲を読むか・どこを見せるか）＝RPC/RLS/mig 非改変。
  // 段0R その3: タブ5本（モック .subnav 逐語）。収容は S-1 指示どおり＝
  //   today=出勤板 / calendar=月カレンダー+日詳細 / build=確定シフト登録+必要人数 /
   // queue=希望の審査（承認待ち・件数バッジ） / roster=確定シフト一覧
  const [tab, setTab] = useState<"today" | "calendar" | "build" | "queue" | "roster">("today");
  const [month, setMonth] = useState(bizToday.slice(0, 7)); // 'YYYY-MM'
  const [selDate, setSelDate] = useState(bizToday);
  // B-5②: 営業時間マスタ（行なし=未設定・判定なし。cast 0行だが本画面は staff 以上のみ到達）
  const [bhRows, setBhRows] = useState<BusinessHourRow[]>([]);
  // 新規シフトフォーム（manager）
  const [fCast, setFCast] = useState("");
  const [fDate, setFDate] = useState(bizToday);
  const [fStart, setFStart] = useState("20:00");
  const [fEnd, setFEnd] = useState("26:00");
  const [fStatus, setFStatus] = useState("planned");

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  // 段P: キャスト写真の署名 URL（private バケット＝毎回発行・1時間）。写真ありの行だけまとめて 1 リクエスト。
  //   失敗しても Map が空のままで頭文字表示に落ちるだけ＝シフト画面の機能には影響しない。
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    void (async () => {
      const orgId = await resolveOrgId(supabase);
      if (!orgId) return;
      const m = await signCastPhotos(supabase, orgId, casts);
      if (alive) setPhotoUrls(m);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casts]);

  // ── UI刷新v2 段S-2: 予想人件費（設計正本 §1〜§2・計算の正は lib/nox/labor-forecast.ts）──
  //   ★表示は manager 以上のみ。理由は2つで、どちらも現物由来:
  //     (1) cast_plan の SELECT RLS は「owner/manager ∨ cast_id=auth_cast_id()」＝
  //         staff（黒服）は 0行になる。出しても必ず「¥0・時給未設定 N人」になり誤情報にしかならない。
  //     (2) cast は (manage)/layout が /mine へ戻すため本画面に到達しないが、
  //         到達しても isManagerUp=false ゆえ3箇所とも出ない（設計§3 の「cast に見せない」を構造で担保）。
  //   ★真の防御は RLS（cast は自分の cast_plan/comp_plans しか引けない）＝ここは表示ゲート。
  const [comps, setComps] = useState<Record<string, ForecastComp>>({});
  const loadComps = useCallback(async () => {
    if (!isManagerUp) return; // staff/cast は取得もしない（0行になるが呼ばない方が意図が明確）
    // ★月内 comps は「日×cast のループ」ではなく2クエリで一括取得し、全日の forecastDay で使い回す。
    //   待遇は日付に依存しないので月が変わっても取り直す必要はない（依存は isManagerUp のみ）。
    const [cpR, planR] = await Promise.all([
      supabase.from("cast_plan").select("cast_id, plan_id, overrides_json"),
      supabase.from("comp_plans").select("id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide"),
    ]);
    const planById = new Map<string, CompPlan>();
    for (const p of (planR.data ?? []) as Record<string, unknown>[]) {
      planById.set(p.id as string, {
        id: p.id as string, name: p.name as string, base: p.base as number,
        honBack: p.hon_back as number, jonaiBack: p.jonai_back as number, dohanBack: p.dohan_back as number,
        salesSlide: (p.sales_slide ?? []) as CompPlan["salesSlide"],
        pointSlide: (p.point_slide ?? []) as CompPlan["pointSlide"],
      });
    }
    const next: Record<string, ForecastComp> = {};
    for (const cp of (cpR.data ?? []) as Record<string, unknown>[]) {
      const plan = planById.get(cp.plan_id as string);
      // プラン未割当／プランが引けない cast は載せない＝forecastDay 側で unknownComp に数えられる
      if (plan) next[cp.cast_id as string] = { plan, override: (cp.overrides_json ?? undefined) as ForecastComp["override"] };
    }
    setComps(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagerUp]);
  useEffect(() => { void loadComps(); }, [loadComps]);

  const load = useCallback(async () => {
    const { data: ws } = await supabase
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status")
      .eq("status", "pending").order("date");
    // 段S-1: 月カレンダー化に伴い取得範囲を「今日から30件」→「表示月の全日」へ変更。
    //   ★client 直 SELECT の範囲変更のみ（shifts の SELECT RLS はそのまま＝店スコープ）。
    //   今日を含む月以外を見ているときも「今日」タブの KPI が出せるよう、当月と表示月の和を取る。
    const [my, mm] = month.split("-").map(Number);
    const monthFrom = `${month}-01`;
    const monthTo = ymdOf(new Date(my, mm, 0)); // 当月末日（翌月0日）
    const from = monthFrom < bizToday ? monthFrom : bizToday;
    const to = monthTo > bizToday ? monthTo : bizToday;
    const { data: ss } = await supabase
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status")
      .gte("date", from).lte("date", to).order("date").limit(2000);
    const { data: ns } = await supabase.from("staffing_needs").select("dow, required").order("dow");
    // B-5②: 営業時間（シフトは date 直判定＝cutoff 不要なので stores.settings_json は読まない）
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
    setBhRows((bh ?? []) as BusinessHourRow[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday, month]);

  const loadAtt = useCallback(async (d: string) => {
    const { data } = await supabase.from("attendance").select("cast_id, status, eta").eq("date", d);
    setAtts((data ?? []) as Att[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAtt(attDate); }, [attDate, loadAtt]);

  async function decide(wishId: string, accept: boolean) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: accept });
    // B-5②: 採用は RPC 二層目でも closed day 拒否（raise=ロールバックで wish は pending 維持・見送りは可＝非対称）
    setMsg(error
      ? (accept && error.message.includes("closed day")
          ? "この希望日は定休日に設定されています。採用できません（見送りは可能です）"
          : rpcErrJa(error.message))
      : accept ? "採用しシフト案に追加しました" : "見送りました");
    await load();
  }

  async function addShift() {
    if (!fCast) return;
    setMsg(null);
    // B-5②: 定休日は送信もしない（ボタン無効の保険・二層目は RPC 'closed day'＝段26-4 実測）
    if (shiftHoursStatus(fDate, fStart, fEnd, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    const { error } = await supabase.rpc("shift_set", {
      p_id: null, p_cast_id: fCast, p_date: fDate, p_start_hm: fStart, p_end_hm: fEnd, p_status: fStatus,
    });
    setMsg(error ? `シフトの登録に失敗: ${rpcErrJa(error.message)}` : "シフトを登録しました");
    await load();
  }

  async function confirmShift(s: Shift) {
    setMsg(null);
    // B-5②: update 経路（date 不変でも RPC が p_date を再検証＝作成後に定休日化された場合はここで拒否される）
    const { error } = await supabase.rpc("shift_set", {
      p_id: s.id, p_cast_id: s.cast_id, p_date: s.date, p_start_hm: s.start_hm, p_end_hm: s.end_hm, p_status: "confirmed",
    });
    setMsg(error ? `確定に失敗: ${rpcErrJa(error.message)}` : "確定しました");
    await load();
  }

  async function setAtt(castId: string, status: string) {
    if (!status) return;
    setMsg(null);
    const { error } = await supabase.rpc("attendance_set", {
      p_cast_id: castId, p_date: attDate, p_status: status, p_eta: null, p_reason: null,
    });
    setMsg(error ? error.message : null);
    await loadAtt(attDate);
  }

  async function saveNeed(dow: number, required: number) {
    setMsg(null);
    const { error } = await supabase.rpc("set_staffing_need", { p_store_id: storeId, p_dow: dow, p_required: required });
    setMsg(error ? error.message : null);
    await load();
  }

  // B-5②: 新規シフトフォームの営業時間判定（date 直＝cutoff 変換なし・予約用とは別関数）
  const fShiftHours = shiftHoursStatus(fDate, fStart, fEnd, bhRows);
  const fClosedDay = fShiftHours.status === "closed";
  const closedOf = (date: string, startHm: string, endHm: string) =>
    shiftHoursStatus(date, startHm, endHm, bhRows).status === "closed";

  // ── 段S-1 派生値（すべて既存 shifts / staffing_needs の client 再形＝新規取得なし）──
  //   ★必要人数は曜日別マスタ（staffing_needs は (store_id, dow) UNIQUE）を dow で引く。
  //     日別の個別上書きは現スキーマに無い（モック注記「必要人数は既存『必要人数（曜日別）』設定を参照」と一致）。
  const requiredOf = (ymd: string) => needs.find((n) => n.dow === dowOf(ymd))?.required ?? 0;
  const shiftsOn = (ymd: string) => shifts.filter((s) => s.date === ymd);
  const dayStat = (ymd: string) => {
    const list = shiftsOn(ymd);
    const confirmed = list.filter((s) => s.status === "confirmed").length;
    const required = requiredOf(ymd);
    return { assigned: list.length, confirmed, planned: list.length - confirmed, required, fill: fillOf(list.length, required) };
  };

  // 月グリッド（前後の空白セル込み・7列）
  const [my, mm] = month.split("-").map(Number);
  const monthDays = new Date(my, mm, 0).getDate();
  const leadBlanks = new Date(Date.UTC(my, mm - 1, 1)).getUTCDay();
  const calCells: (string | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: monthDays }, (_, i) => `${month}-${pad2(i + 1)}`),
  ];
  const shiftMonth = (delta: number) => {
    const d = new Date(my, mm - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };

  // 段S-2: 日→予想人件費。★日ごとに1回だけ計算して KPI・カレンダー・日詳細で使い回す
  //   （表示のたびに再計算しない・SELECT は loadComps の2本きり）。manager 未満は空 Map＝どこにも出ない。
  const fcByDate = useMemo(() => {
    const m = new Map<string, DayForecast>();
    if (!isManagerUp) return m;
    const byDate = new Map<string, Shift[]>();
    for (const s of shifts) {
      const list = byDate.get(s.date);
      if (list) list.push(s); else byDate.set(s.date, [s]);
    }
    for (const [date, list] of byDate) {
      // status（confirmed/planned）は金額に影響しない＝両方渡す（設計§2）
      m.set(date, forecastDay(list.map((x) => ({ castId: x.cast_id, startHm: x.start_hm, endHm: x.end_hm })), comps));
    }
    return m;
  }, [shifts, comps, isManagerUp]);
  const fcOf = (ymd: string) => fcByDate.get(ymd);
  const yen = (n: number) => "¥" + n.toLocaleString();

  // 「今日」の KPI（段S-2 で予想人件費を5枚目に追加）
  const todayStat = dayStat(bizToday);
  const todayFc = fcOf(bizToday);
  const fillRate = todayStat.required > 0 ? Math.round((todayStat.assigned / todayStat.required) * 100) : null;
  const shortage = Math.max(0, todayStat.required - todayStat.assigned);

  // 日詳細＝選択日のシフトを「時間帯」でグルーピング（表示のみ・fmtBand30 で 30時間制表記）
  const selShifts = shiftsOn(selDate);
  const bandKey = (s: Shift) => `${s.start_hm}|${s.end_hm}`;
  const bands = Array.from(new Set(selShifts.map(bandKey)))
    .map((key) => {
      const [start, end] = key.split("|");
      const items = selShifts.filter((s) => bandKey(s) === key);
      return { key, start, end, items, confirmed: items.filter((s) => s.status === "confirmed").length };
    })
    .sort((a, b) => hm2min(a.start) - hm2min(b.start));
  const selStat = dayStat(selDate);
  const selFc = fcOf(selDate);

  return (
    <div>
      <h1 style={t.pheadH1}>シフト管理</h1>
      <Toast msg={msg} />

      {/* 段S-1 サブナビ（今日／カレンダー／シフト作成）＝ページ内の収容先を切り替えるだけ。
          ルート・URL・権限ゲートは不変。 */}
      <nav className="nox-subnav">
        {([["today", "今日"], ["calendar", "カレンダー"], ["build", "シフト作成"],
           ["queue", "承認待ち"], ["roster", "確定シフト"]] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
            {k === "queue" && wishes.length > 0 && (
              <span className="nox-tabcnt num">{wishes.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* 段S-1 KPI 帯（当日）。★予想人件費は S-2（Fable 5・money 慎重域）＝本段では出さない。 */}
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">出勤予定</div>
          <div className="nox-kpi2-v num">{todayStat.assigned}<small>人</small></div>
          <div className="nox-kpi2-s">必要 {todayStat.required}人</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">確定</div>
          <div className="nox-kpi2-v num">{todayStat.confirmed}<small>人</small></div>
          <div className="nox-kpi2-s">{fillRate === null ? "必要人数 未設定" : `充足率 ${fillRate}%`}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">未承認</div>
          <div className="nox-kpi2-v num">{wishes.length}<small>件</small></div>
          <div className="nox-kpi2-s">承認待ち</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">不足</div>
          <div className="nox-kpi2-v num">{shortage}<small>人</small></div>
          <div className="nox-kpi2-s">{shortage > 0 ? `あと${shortage}人必要` : "充足しています"}</div>
        </div>
        {/* 段S-2: 予想人件費（今日）＝5枚目。manager 以上のみ（staff は cast_plan が 0行・cast は本画面に来ない）。
            時給未設定の cast が居たら人数を出す＝0円で混ざっていることを隠さない（設計§2）。 */}
        {isManagerUp && todayFc && (
          <div className="nox-kpi2 money">
            <div className="nox-kpi2-l">予想人件費（今日）</div>
            <div className="nox-kpi2-v num">{yen(todayFc.total)}</div>
            <div className="nox-kpi2-s">
              {todayFc.unknownComp > 0 ? `時給未設定 ${todayFc.unknownComp}人` : "シフト×時給ベースの概算"}
            </div>
          </div>
        )}
      </div>

      {/* ── タブ「今日」＝当日運用（出勤板・出勤ボーナス）── */}
      {tab === "today" && isManagerUp && <IncentivePanel storeId={storeId} />}

      {/* ── タブ「カレンダー」＝月カレンダー＋日詳細 ── */}
      {/* 段0R その3: >900 はカレンダーと日詳細を横並び（モックの2カラム）・≤900 は縦積み。 */}
      {tab === "calendar" && (
        <div className="nox-2col">
          <section className="nox-cardtop" style={card}>
            <div className="nox-calhead">
              <button style={btnLight} onClick={() => shiftMonth(-1)} aria-label="前の月">‹</button>
              <h2 style={{ ...secTitle, margin: 0 }}>{my}年{mm}月</h2>
              <button style={btnLight} onClick={() => shiftMonth(1)} aria-label="次の月">›</button>
              <button style={{ ...btnLight, marginLeft: "auto" }}
                onClick={() => { setMonth(bizToday.slice(0, 7)); setSelDate(bizToday); }}>今日</button>
            </div>
            <div className="nox-calgrid">
              {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
              {calCells.map((ymd, i) => {
                if (!ymd) return <div key={`b${i}`} />;
                const st = dayStat(ymd);
                const fc = fcOf(ymd);
                const cls = ["nox-cald", st.fill, ymd === selDate ? "sel" : "", ymd === bizToday ? "today" : ""].filter(Boolean).join(" ");
                return (
                  <button key={ymd} className={cls} onClick={() => setSelDate(ymd)}
                    title={`${ymd}・${FILL_LABEL[st.fill]}（確定${st.confirmed}/予定${st.planned}）`}>
                    <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                    {/* 段0R その3: 状態バッジ文字（モック .st ok/warn/ng/none 逐語）。色だけでなく語で伝える。 */}
                    <span className={`nox-caldst ${st.fill}`}>{FILL_LABEL[st.fill]}</span>
                    {st.required > 0 && <span className="nox-cald-c num">{st.assigned}/{st.required}</span>}
                    {/* 段S-2: 日別の予想人件費（manager 以上・割当のある日のみ）。
                        ★≤641 は CSS で非表示＝スマホは色＋コマ数のみ・詳細は日をタップして日詳細で見る。
                        title は付けない（≤641 で見えない情報を tooltip で復活させない）。 */}
                    {isManagerUp && fc && fc.total > 0 && (
                      <span className="nox-cald-y num">{yen(fc.total)}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* 段0R その3: 凡例＝色ドット（モック .legend/.dot 逐語）。枠線ではなく塗りで示す。 */}
            <div className="nox-legend" style={{ marginTop: 10 }}>
              <span><span className="nox-dot ok" />充足</span>
              <span><span className="nox-dot warn" />やや不足(-1)</span>
              <span><span className="nox-dot ng" />不足(-2以上)</span>
              <span><span className="nox-dot none" />未設定</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              セル＝状態色＋確定/必要人数。必要人数は「シフト作成」タブの「必要人数（曜日別）」設定を参照します。
            </p>
          </section>

          <section className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
              <h2 style={{ ...secTitle, margin: 0 }}>{selDate} の割当</h2>
              <span className={`nox-stpill ${selStat.fill === "none" ? "" : selStat.fill}`}>
                {FILL_LABEL[selStat.fill]}{selStat.required > 0 ? ` ${selStat.assigned}/${selStat.required}` : ""}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>確定 {selStat.confirmed} / 予定 {selStat.planned}</span>
            </div>
            {/* 段S-2: 選択日の予想人件費（モック .moneyrow）＋★必須注記（設計§1・常時表示）。
                注記は moneyrow 直下に固定＝金額だけが独り歩きしない（BANZEN W1 §3.1 と同思想）。 */}
            {isManagerUp && selFc && (
              <>
                <div className="nox-moneyrow">
                  <span>予想人件費{selFc.unknownComp > 0 ? `（時給未設定 ${selFc.unknownComp}人を除く）` : ""}</span>
                  <b className="num">{yen(selFc.total)}</b>
                </div>
                <p className="nox-moneynote">
                  シフト時間×時給の概算です。バック・控除は含みません。実際の給与とは異なります。
                </p>
              </>
            )}
            {bands.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--v2-muted)" }}>
                この日の割当はありません。「シフト作成」タブの確定シフト登録から追加できます。
              </p>
            )}
            {/* 段0R その3: 追加導線＝選択日を登録フォームへプリセットして「シフト作成」タブへ送るだけ。
                ★新しい登録 UI は作らない（送る RPC も引数も既存の確定シフト登録のまま）。 */}
            {isManagerUp && (
              <button className="nox-addc" onClick={() => { setFDate(selDate); setTab("build"); }}>
                ＋ キャストを追加
              </button>
            )}
            {bands.map((b) => (
              <div key={b.key} className="nox-band">
                <div className="nox-bandh">
                  <span className="t num">{fmtBand30(b.start, b.end)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>確定 {b.confirmed} / 予定 {b.items.length - b.confirmed}</span>
                </div>
                {b.items.map((s) => (
                  <div key={s.id} className="nox-crow">
                    <CastAvatar name={castName(s.cast_id)} url={photoUrls.get(s.cast_id)} variant="flat" />
                    <span style={{ flex: 1, minWidth: 0 }}>{castName(s.cast_id)}</span>
                    <span className="num" style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{fmtWin(s.start_hm, s.end_hm)}</span>
                    <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`}>{s.status === "confirmed" ? "確定" : "予定"}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ── タブ「承認待ち」＝希望の審査（段0R その3 でタブを独立させた・中身と RPC は不変）── */}
      {tab === "queue" && (
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>希望（審査待ち）</h2>
        {wishes.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {wishes.map((w) => {
          // B-5②: 提出後に定休日設定された wish＝採用のみブロック・見送りは可（非対称・RPC 二層目は段26-7 実測）
          const wClosed = closedOf(w.date, w.start_hm, w.end_hm);
          return (
            <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span style={{ ...t.num, width: 90 }}>{w.date}</span>
              <span style={{ width: 110 }}>{castName(w.cast_id)}</span>
              <span style={t.num}>{fmtWin(w.start_hm, w.end_hm)}</span>
              {wClosed && (
                <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>定休日（採用不可・見送り可）</span>
              )}
              {/* 採否は manager 以上のみ（RPC 側も owner/manager 強制＝二重） */}
              {isManagerUp && (
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button
                    style={{ ...btnDark, opacity: wClosed ? 0.45 : 1 }} disabled={wClosed}
                    title={wClosed ? "この希望日は定休日に設定されています（見送りは可能）" : undefined}
                    onClick={() => decide(w.id, true)}
                  >採用</button>
                  <button style={btnLight} onClick={() => decide(w.id, false)}>見送り</button>
                </span>
              )}
            </div>
          );
        })}
      </section>
      )}

      {/* ── タブ「確定シフト」＝登録フォーム＋今後の一覧（段0R その3 でタブを独立させた・中身と RPC は不変）── */}
      {(tab === "build" || tab === "roster") && (
      <>
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>確定シフト（今後）</h2>
        {isManagerUp && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={fCast} onChange={(e) => setFCast(e.target.value)} style={input}>
                <option value="">キャスト</option>
                {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={input} />
              <input value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ ...input, width: 70 }} />
              <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
              <input value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ ...input, width: 70 }} />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={input}>
                <option value="planned">予定</option>
                <option value="confirmed">確定</option>
              </select>
              <button style={{ ...btnDark, opacity: fClosedDay ? 0.45 : 1 }} disabled={fClosedDay} onClick={addShift}>登録</button>
            </div>
            {/* B-5②: 定休日=赤（一次ブロック）／時間外=黄（警告のみ・登録可）／営業時間内・未設定=表示なし */}
            {fClosedDay && (
              <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "6px 0 0" }}>
                この日は定休日です（シフトを登録できません）
              </p>
            )}
            {fShiftHours.status === "outside" && fShiftHours.row && (
              <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "6px 0 0" }}>
                営業時間外です（営業 {fmtHoursLabel(fShiftHours.row)}）
              </p>
            )}
          </div>
        )}
        {shifts.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {shifts.map((s) => {
          // B-5②: 作成後に定休日化された日のシフト＝確定（update 経路）を事前ブロック（二層目は RPC・段26-5 実測）
          const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
          return (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span style={{ ...t.num, width: 90 }}>{s.date}</span>
              <span style={{ width: 110 }}>{castName(s.cast_id)}</span>
              <span style={t.num}>{fmtWin(s.start_hm, s.end_hm)}</span>
              <span style={{ color: s.status === "confirmed" ? "var(--ok)" : "var(--champ)" }}>
                {s.status === "confirmed" ? "確定" : "予定"}
              </span>
              {sClosed && <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>定休日</span>}
              {isManagerUp && s.status === "planned" && (
                <button
                  style={{ ...btnLight, marginLeft: "auto", opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                  title={sClosed ? "この日は定休日に設定されています（確定できません）" : undefined}
                  onClick={() => confirmShift(s)}
                >確定にする</button>
              )}
            </div>
          );
        })}
      </section>
      </>
      )}

      {/* ── タブ「今日」＝出勤板（staff も操作可＝attendance のみ開放・台帳 #24）── */}
      {tab === "today" && (
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>出勤板</h2>
        <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ ...input, marginBottom: 8 }} />
        {casts.map((c) => {
          const a = atts.find((x) => x.cast_id === c.id);
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ width: 110 }}>{c.name}</span>
              <select value={a?.status ?? ""} onChange={(e) => setAtt(c.id, e.target.value)} style={input}>
                {ATT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {a?.eta && <span style={{ ...t.num, color: "var(--sub)" }}>見込み {a.eta}</span>}
            </div>
          );
        })}
      </section>
      )}

      {/* ── タブ「シフト作成」＝必要人数（曜日別）── */}
      {tab === "build" && isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>必要人数（曜日別）</h2>
          <div style={{ display: "flex", gap: 10 }}>
            {DOW.map((label, dow) => {
              const n = needs.find((x) => x.dow === dow);
              return (
                <label key={dow} style={{ fontSize: 12, textAlign: "center", color: "var(--sub)" }}>
                  {label}
                  <input
                    type="number" min={0} defaultValue={n?.required ?? 0}
                    onBlur={(e) => saveNeed(dow, Number(e.target.value))}
                    style={{ ...input, width: 52, display: "block", marginTop: 4 }}
                  />
                </label>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)" }}>変更はフォーカスアウトで保存</p>
        </section>
      )}
    </div>
  );
}
