"use client";

// B-5 スライスB（mig0033）: 定休日=UI 一次ブロック＋RPC 二層目 'closed day'（段26 実測）／
//   営業時間外=黄警告のみで登録可（非対称・段26-2/26-5）／未設定 dow=判定なし（後方互換）。
//   ★シフトの営業日判定は shiftHoursStatus（date 直＝cutoff 変換なし・mig0008 決定3）。
//   予約用 businessHoursStatus（cutoff 変換）をシフトに使うと深夜帯で1日ズレるため使用禁止。
//   希望の採否は「採用のみ定休日ブロック・見送りは定休日でも可」の非対称を UI に出す（裁定B-3）。
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin, fmtBand30, hm2min, min2hm, spanMinutes } from "@/lib/nox/shift-time";
import { autoAssign, type AutoAssignResult } from "@/lib/nox/shift-autoassign";
import { shiftHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { forecastDay, type ForecastComp, type DayForecast } from "@/lib/nox/labor-forecast";
import type { CompPlan } from "@/lib/nox/pay";
import IncentivePanel from "./incentive-panel";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";

type Cast = { id: string; name: string; photo_updated_at: string | null };
type Wish = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
// ★SD V2-2（mig0101）: status 3値（planned→proposed→confirmed）＋wish_id（原型対比）＋source/period_id（自動配置）
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; created_by: string; wish_id: string | null; source: string; period_id: string | null };
type Period = { id: string; start_date: string; end_date: string; wish_deadline: string | null; status: string };
type Rules = { max_consec_days: number | null; min_month_min: number | null };
type Att = { cast_id: string; status: string; eta: string | null };
// E8-4（mig0095）: staffing_needs は時間帯バンド化＝(store_id, dow, from_min) UNIQUE。
//   from_min/to_min は 0..1440（分）・0/1440=終日（既存行は mig0095 backfill で終日バンド化済み）。
type Need = { id: string; dow: number; required: number; from_min: number; to_min: number };

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
// E8-4 #2: 日の状態＝バンドの最悪値（ng > warn > ok > none）。日単位の必要人数はピーク（max required）。
const worstFill = (fills: Fill[]): Fill =>
  fills.includes("ng") ? "ng" : fills.includes("warn") ? "warn" : fills.includes("ok") ? "ok" : "none";
const FILL_COLOR: Record<Fill, string> = { ok: "var(--ok)", warn: "var(--gold2)", ng: "var(--bad)", none: "var(--line2)" };
// ★SD V2-2: status 3値の表示語彙（planned=予定・proposed=確認待ち・confirmed=確定）。
//   4段フロー（設計書 §5）: 希望=shift_wishes(pending) → 管理者確認=planned → キャスト確認=proposed → 確定=confirmed。
const SHIFT_ST_LABEL: Record<string, string> = { planned: "予定", proposed: "確認待ち", confirmed: "確定" };
const shiftStColor = (st: string) =>
  st === "confirmed" ? "var(--ok)" : st === "proposed" ? "var(--gold2)" : "var(--champ)";
const PERIOD_ST_LABEL: Record<string, string> = { draft: "下書き", open: "募集中", closed: "締切", published: "公開済み" };

const bandLabel = (n: { from_min: number; to_min: number }) =>
  n.from_min === 0 && n.to_min === 1440 ? "終日" : `${min2hm(n.from_min)}〜${min2hm(n.to_min)}`;
type BandStat = Need & { assigned: number; fill: Fill };
// E8-4 #2: 時間帯別充足バー（今日タブ・日詳細で共用）。バー幅は assigned/required の頭打ち100%。
function BandBars({ stats }: { stats: BandStat[] }) {
  return (
    <div>
      {stats.map((b) => {
        const pct = b.required > 0 ? Math.min(100, Math.round((b.assigned / b.required) * 100)) : 0;
        return (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
            <span className="num" style={{ width: 96, flexShrink: 0, color: "var(--sub)" }}>{bandLabel(b)}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--line2)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: FILL_COLOR[b.fill] }} />
            </div>
            <span className="num" style={{ width: 52, textAlign: "right", flexShrink: 0 }}>{b.assigned}/{b.required}</span>
            <span className={`nox-stpill ${b.fill === "none" ? "" : b.fill}`}>{FILL_LABEL[b.fill]}</span>
          </div>
        );
      })}
    </div>
  );
}
// ★R1（2026-08-21・Agoora 裁定）: 出勤記録はプルダウンを廃止し**ボタン群**にする（R2 恒久規約＝
//   選択肢7以下の入力はボタン群）。並びは裁定の「出勤／遅刻／当欠」を先頭に、
//   ★同伴・休みも残す＝現行 attendance_set の値域は5つで、落とすと**記録できなくなる**
//     （同伴は売上の同伴カウントに使う実データ）。値域・RPC・引数は1文字も変えていない。
//   ★「未記録に戻す（解除）」は現行 RPC の仕様内では不可＝attendance_set は p_status が
//     null／5値以外なら 'bad status' で弾く（mig0009 行287 実測）＝**選択替えのみ**にする。
const ATT_OPTIONS = [
  ["shukkin", "出勤"], ["late", "遅刻"], ["absent", "当欠"], ["dohan", "同伴"], ["off", "休み"],
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
  // E8-4（mig0095）: 時間帯バンド系（set_staffing_need / staffing_need_remove）
  if (isBillingLocked(msg)) return BILLING_LOCKED_MSG;
  if (msg.includes("bad band")) return "時間帯の指定が不正です（00:00〜24:00・開始<終了）";
  if (msg.includes("overlap")) return "他の時間帯と重複しています（同じ開始時刻の場合は上書きされます）";
  if (msg.includes("bad required")) return "必要人数は 0 以上で入力してください";
  if (msg.includes("bad dow")) return "曜日の指定が不正です";
  if (msg.includes("not found")) return "対象の時間帯が見つかりません";
  // ★SD V2-2（mig0102）: 期間・提案・自動配置・ルール系
  if (msg.includes("bad range")) return "期間の開始は終了以前にしてください";
  if (msg.includes("bad status")) return "状態の指定が不正です";
  if (msg.includes("period in use")) return "この期間はシフトから参照されています（先に配置を消してください）";
  if (msg.includes("period published")) return "公開済みの期間には自動配置できません";
  if (msg.includes("bad rows")) return "対象にできない行が含まれています（予定のみ送れます）";
  if (msg.includes("concurrent change")) return "他の操作と競合しました（再読み込みしてやり直してください）";
  if (msg.includes("store mismatch")) return "別の店舗の希望が含まれています";
  if (msg.includes("out of period")) return "期間の外の希望が含まれています";
  if (msg.includes("bad consec")) return "連勤上限は 1 以上で入力してください";
  if (msg.includes("bad monthmin")) return "最低月間時間は 1 以上で入力してください";
  if (msg.includes("bad ids")) return "対象が選ばれていません";
  return msg;
}

export default function ShiftBoard({ storeId, casts, isManagerUp }: { storeId: string; casts: Cast[]; isManagerUp: boolean }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  // ★SD V2-2: 表示月の wishes 全 status（原型対比・4段フロー）／period／配置ルール
  const [wishAll, setWishAll] = useState<Wish[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  // ★SD V2-2: 計画フォーム（pEditId 1つで新規/編集を兼用＝seats-board と同じ流儀）
  const [pEditId, setPEditId] = useState<string | null>(null);
  const [pStart, setPStart] = useState("");
  const [pEnd, setPEnd] = useState("");
  const [pDeadline, setPDeadline] = useState("");
  const [pStatus, setPStatus] = useState("draft");
  // ★SD V2-2: 自動配置（プレビュー→適用→取消を同画面併置＝DP3 申し送りの undoAuto 導線）
  const [selPeriodId, setSelPeriodId] = useState("");
  // ★DP-R S9: 配置ビューの表示切替（モック .plan-tools > .seg = 月カレンダー / スタッフ別）
  const [planView, setPlanView] = useState<"cal" | "staff">("cal");
  // ★R4（Agoora 裁定）: 確定シフトタブ＝**人ベースの月カレンダー**を既定にし、
  //   現行の一覧は「表で見る」トグルで残置する（表示のみ・RPC 非改変）。
  const [rosterView, setRosterView] = useState<"cal" | "table">("cal");
  const [preview, setPreview] = useState<{ periodId: string; result: AutoAssignResult } | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  // ★SD V2-2: 配置ルール入力（空欄=無制限。月間は「時間」で入力し保存時に分へ）
  const [rConsec, setRConsec] = useState("");
  const [rMonthH, setRMonthH] = useState("");
  // ★R1: 出勤記録は「本日のシフト」表に統合した＝対象日は常に営業日の今日。
  //   （旧「出勤板」にあった日付ピッカーは無くなる＝過去日の出勤記録の修正は本画面からは行えない。
  //    実務上は当日運用のため今日固定で足りる。過去日の修正が要るなら別途裁定＝勝手に別画面を作らない。）
  const attDate = bizToday;
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
  // ★DP3 P2（2026-08-21・裁定 DP3-②）: 手動シフト追加をモーダルへ（モック `planShiftDialog`）。
  const [addModal, setAddModal] = useState(false);
  // ★DP3 P2（裁定 DP3-③）: 勤務時間の調整モーダル（モック `adjustDialog`）。
  //   ★「元の希望との対比」は**入れない**＝`shifts` が希望の原型（wish_id）を保持していないため
  //     出せない（対比は d＝シフト深部レーンで消化・裁定 DP3-③）。
  //   ★メモ欄（モック `adjustNote`）も入れない＝`shifts` にメモ列が無い（同上）。
  const [adjTarget, setAdjTarget] = useState<Shift | null>(null);
  const [aStart, setAStart] = useState("");
  const [aEnd, setAEnd] = useState("");
  // E8-4 #10: shifts.created_by → users.name（確定シフト一覧の登録者列・CSV）
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  // E8-4 #3: バンド追加フォーム（時間帯は HH:MM テキスト＝24:00 を許すため type=time にしない）
  const [nDow, setNDow] = useState(0);
  const [nAllDay, setNAllDay] = useState(false);
  const [nFrom, setNFrom] = useState("20:00");
  const [nTo, setNTo] = useState("24:00");
  const [nReq, setNReq] = useState(3);

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
    // E8-4 #10: created_by を追加取得（確定シフト一覧の「登録者」列・下で users 名を1クエリ解決）
    const { data: ss } = await supabase
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status, created_by, wish_id, source, period_id")
      .gte("date", from).lte("date", to).order("date").limit(2000);
    // ★SD V2-2: 表示月の wishes 全 status（原型対比 wish_id→shift_wishes ＋ 4段フローの希望件数）。
    //   queue 用の pending 全期間クエリとは別物（範囲・status とも異なる）。RLS は同じ店スコープ。
    const { data: wAll } = await supabase
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status")
      .gte("date", from).lte("date", to).limit(2000);
    // ★SD V2-2: 表示月に重なる period ＋ 店の配置ルール（cast は RLS で 0行＝isManagerUp でしか描かない）
    const { data: ps2 } = await supabase
      .from("shift_periods").select("id, start_date, end_date, wish_deadline, status")
      .lte("start_date", to).gte("end_date", from).order("start_date");
    const { data: rl } = await supabase
      .from("shift_rules").select("max_consec_days, min_month_min").eq("store_id", storeId).maybeSingle();
    // E8-4（mig0095）: 時間帯バンド列を取得（dow → from_min の昇順＝バンド表示順）
    const { data: ns } = await supabase.from("staffing_needs")
      .select("id, dow, required, from_min, to_min").order("dow").order("from_min");
    // B-5②: 営業時間（シフトは date 直判定＝cutoff 不要なので stores.settings_json は読まない）
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
    setWishAll((wAll ?? []) as Wish[]);
    setPeriods((ps2 ?? []) as Period[]);
    setRules((rl ?? null) as Rules | null);
    setBhRows((bh ?? []) as BusinessHourRow[]);
    // E8-4 #10: 登録者名の解決（E8-2 #8 の closed_by→users.name と同じ1クエリ流儀・失敗時は「—」に落ちるだけ）
    const uids = Array.from(new Set(((ss ?? []) as Shift[]).map((s) => s.created_by).filter(Boolean)));
    if (uids.length > 0) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      setUserNames(new Map(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])));
    } else {
      setUserNames(new Map());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday, month]);

  const loadAtt = useCallback(async (d: string) => {
    const { data } = await supabase.from("attendance").select("cast_id, status, eta").eq("date", d);
    setAtts((data ?? []) as Att[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);
  // ★SD V2-2: 配置ルールの現在値を入力欄へ反映（null=空欄=無制限・月間は分→h）
  useEffect(() => {
    setRConsec(rules?.max_consec_days != null ? String(rules.max_consec_days) : "");
    setRMonthH(rules?.min_month_min != null ? String(Math.round(rules.min_month_min / 60)) : "");
  }, [rules]);
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

  // ★DP3 P2（裁定 DP3-③）: 勤務時間の調整。**新しい RPC は作らない**＝既存 `shift_set` の update 経路
  //   （`confirmShift` と同じ6引数・同じ順序）に、開始/終了だけ差し替えた値を渡す。
  //   ★status は**現在値を据え置く**（調整で予定→確定へ勝手に昇格させない）。
  //   ★定休日の事前ブロックも `addShift` と同じ規則（二層目は RPC 'closed day'）。
  async function adjustShift() {
    if (!adjTarget) return;
    setMsg(null);
    if (shiftHoursStatus(adjTarget.date, aStart, aEnd, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    const { error } = await supabase.rpc("shift_set", {
      p_id: adjTarget.id, p_cast_id: adjTarget.cast_id, p_date: adjTarget.date, p_start_hm: aStart, p_end_hm: aEnd, p_status: adjTarget.status,
    });
    setMsg(error ? `勤務時間の調整に失敗: ${rpcErrJa(error.message)}` : "勤務時間を調整しました");
    if (!error) setAdjTarget(null);
    await load();
  }

  // ★SD V2-2: 定休日判定（shift_is_closed_day＝mig0033 と同式: dow の is_closed・coalesce false）。
  //   純関数 autoAssign へ渡す＝DB を見ない契約（bhRows は取得済み state）。
  const isClosedDate = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return bhRows.find((r) => r.dow === dow)?.is_closed ?? false;
  };

  // ★SD V2-2: period CRUD（shift_period_set / shift_period_remove＝V1 検証済みの引数形と一字一致）。
  async function savePeriod() {
    if (!pStart || !pEnd) { setMsg("計画期間の開始と終了を入力してください"); return; }
    setMsg(null);
    const { error } = await supabase.rpc("shift_period_set", {
      p_id: pEditId, p_store_id: storeId, p_start_date: pStart, p_end_date: pEnd,
      p_wish_deadline: pDeadline || null, p_status: pStatus,
    });
    setMsg(error ? `計画の保存に失敗: ${rpcErrJa(error.message)}` : pEditId ? "計画を更新しました" : "計画を作成しました");
    if (!error) { setPEditId(null); setPStart(""); setPEnd(""); setPDeadline(""); setPStatus("draft"); }
    await load();
  }
  async function removePeriod(id: string) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_period_remove", { p_id: id });
    setMsg(error ? `計画の削除に失敗: ${rpcErrJa(error.message)}` : "計画を削除しました");
    if (selPeriodId === id) { setSelPeriodId(""); setPreview(null); }
    await load();
  }

  // ★DP-R S7: モック planbar の「下書き保存 / スタッフに公開して確定」＝period の status 遷移のみ。
  //   期間・締切は据え置きで shift_period_set を再送する（新 RPC は要らない＝設計書 §3 と同じ筋）。
  async function setPeriodStatus(pe: Period, st: string) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_period_set", {
      p_id: pe.id, p_store_id: storeId, p_start_date: pe.start_date, p_end_date: pe.end_date,
      p_wish_deadline: pe.wish_deadline, p_status: st,
    });
    setMsg(error ? `計画の状態変更に失敗: ${rpcErrJa(error.message)}`
      : st === "published" ? "スタッフに公開しました" : `計画を「${PERIOD_ST_LABEL[st] ?? st}」にしました`);
    await load();
  }

  // ★SD V2-2: 自動配置プレビュー＝純関数 autoAssign をクライアントで実行（DB 書込なし）。
  //   入力は period 範囲で都度 select（表示月 state は月を跨ぐ period で欠けるため）。
  //   monthMinutes は期間内 existing の cast 別 spanMinutes 合計＝「existing 込みで呼び出し側が算出」の契約どおり。
  async function runPreview() {
    const period = periods.find((x) => x.id === selPeriodId);
    if (!period) { setMsg("計画期間を選択してください"); return; }
    setAutoBusy(true); setMsg(null);
    const [wRes, sRes] = await Promise.all([
      supabase.from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status")
        .eq("status", "pending").gte("date", period.start_date).lte("date", period.end_date).limit(2000),
      supabase.from("shifts").select("id, cast_id, date, start_hm, end_hm, status, created_by, wish_id, source, period_id")
        .gte("date", period.start_date).lte("date", period.end_date).limit(2000),
    ]);
    const wishesIn = (wRes.data ?? []) as Wish[];
    const existing = (sRes.data ?? []) as Shift[];
    const monthMinutes: Record<string, number> = {};
    for (const e of existing) monthMinutes[e.cast_id] = (monthMinutes[e.cast_id] ?? 0) + spanMinutes(e.start_hm, e.end_hm);
    const result = autoAssign({
      startDate: period.start_date, endDate: period.end_date,
      needs: needs.map((n) => ({ dow: n.dow, fromMin: n.from_min, toMin: n.to_min, required: n.required })),
      wishes: wishesIn.map((w) => ({ id: w.id, castId: w.cast_id, date: w.date, startHm: w.start_hm, endHm: w.end_hm })),
      existing: existing.map((e) => ({ castId: e.cast_id, date: e.date, startHm: e.start_hm, endHm: e.end_hm })),
      monthMinutes,
      rules: rules ? { maxConsecDays: rules.max_consec_days, minMonthMin: rules.min_month_min } : null,
      isClosedDay: isClosedDate,
    });
    setPreview({ periodId: period.id, result });
    setAutoBusy(false);
  }
  // 適用＝shift_auto_apply（wish_ids 一括 accept・入替型＝SD-8。V1 検証済みの引数形と一字一致）
  async function applyAuto() {
    if (!preview) return;
    setAutoBusy(true); setMsg(null);
    const { data: n, error } = await supabase.rpc("shift_auto_apply", {
      p_period_id: preview.periodId, p_wish_ids: preview.result.assignWishIds,
    });
    setMsg(error ? `自動配置の適用に失敗: ${rpcErrJa(error.message)}` : `${n}件を配置しました（たたき台＝手動で調整できます）`);
    if (!error) setPreview(null);
    setAutoBusy(false);
    await load();
  }
  // 取消＝shift_auto_clear（auto∧planned のみ削除・wish pending 復元＝手動分は保持）
  async function clearAuto() {
    if (!selPeriodId) return;
    setAutoBusy(true); setMsg(null);
    const { data: n, error } = await supabase.rpc("shift_auto_clear", { p_period_id: selPeriodId });
    setMsg(error ? `取り消しに失敗: ${rpcErrJa(error.message)}` : `自動配置を取り消しました（${n}件・手動分は保持）`);
    setAutoBusy(false);
    await load();
  }

  // ★SD V2-2: 配置ルール（shift_rules_set・空欄=null=無制限。月間は h 入力→分で保存）。
  async function saveRules() {
    setMsg(null);
    const { error } = await supabase.rpc("shift_rules_set", {
      p_store_id: storeId,
      p_max_consec_days: rConsec.trim() === "" ? null : Number(rConsec),
      p_min_month_min: rMonthH.trim() === "" ? null : Math.round(Number(rMonthH) * 60),
    });
    setMsg(error ? `配置ルールの保存に失敗: ${rpcErrJa(error.message)}` : "配置ルールを保存しました");
    await load();
  }

  // ★SD V2-2: 一括/行単位の「キャスト確認へ」＝shift_propose（V1 検証済みの引数形と一字一致）。
  async function proposeShifts(ids: string[]) {
    if (ids.length === 0) return;
    setMsg(null);
    const { data: n, error } = await supabase.rpc("shift_propose", { p_shift_ids: ids });
    setMsg(error ? `確認依頼に失敗: ${rpcErrJa(error.message)}` : `${n}件をキャスト確認へ送りました`);
    await load();
  }

  // ★SD V2-2: 差し戻し（proposed→planned）＝設計書 §3「shift_set の status 再送で可（新 RPC 不要）」。
  //   時刻・日付は現在値を据え置き、status だけ planned で再送する。
  async function demoteShift(s: Shift) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_set", {
      p_id: s.id, p_cast_id: s.cast_id, p_date: s.date, p_start_hm: s.start_hm, p_end_hm: s.end_hm, p_status: "planned",
    });
    setMsg(error ? `差し戻しに失敗: ${rpcErrJa(error.message)}` : "予定に差し戻しました");
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

  // E8-4 #3（mig0095）: 5引数＝時間帯バンドの upsert（同 store/dow/from_min は置換・交差は RPC 'overlap' 拒否）
  async function saveNeed(dow: number, required: number, fromMin: number, toMin: number, okMsg?: string) {
    setMsg(null);
    const { error } = await supabase.rpc("set_staffing_need", {
      p_store_id: storeId, p_dow: dow, p_required: required, p_from_min: fromMin, p_to_min: toMin,
    });
    setMsg(error ? rpcErrJa(error.message) : okMsg ?? null);
    await load();
    return !error;
  }

  // E8-4 #3（mig0095）: バンド削除（staffing_need_remove・(store_id, dow, from_min) で特定）
  async function removeNeed(dow: number, fromMin: number, label: string) {
    if (!confirm(`${DOW[dow]}曜の「${label}」の必要人数設定を削除しますか？`)) return;
    setMsg(null);
    const { error } = await supabase.rpc("staffing_need_remove", { p_store_id: storeId, p_dow: dow, p_from_min: fromMin });
    setMsg(error ? rpcErrJa(error.message) : "時間帯を削除しました");
    await load();
  }

  // E8-4 #3: バンド追加（終日=0〜1440・時刻は HH:MM。検証の正は RPC＝ここは NaN の素通り防止のみ）
  async function addNeed() {
    const from = nAllDay ? 0 : hm2min(nFrom);
    const to = nAllDay ? 1440 : hm2min(nTo);
    if (!/^\d{1,2}:\d{2}$/.test(nAllDay ? "0:00" : nFrom) || !/^\d{1,2}:\d{2}$/.test(nAllDay ? "0:00" : nTo)) {
      setMsg("時間は HH:MM 形式で入力してください（例 20:00〜24:00）");
      return;
    }
    const ok = await saveNeed(nDow, nReq, from, to, "時間帯を追加しました");
    if (ok) setNAllDay(false);
  }

  // E8-4 #10: 表示中の確定シフト一覧を CSV 出力（client 生成・BOM 付き UTF-8＝Excel 文字化け対策）。
  //   列は画面と同じ＋登録者（created_by→users.name）。金額列なし＝閲覧できる人がそのまま持ち出せる範囲のみ。
  function exportShiftsCsv() {
    const head = ["日付", "曜日", "キャスト", "開始", "終了", "状態", "登録者"];
    const lines = shifts.map((s) => [
      s.date, DOW[dowOf(s.date)], castName(s.cast_id), s.start_hm, s.end_hm,
      SHIFT_ST_LABEL[s.status] ?? s.status, userNames.get(s.created_by) ?? "", // ★SD V2-2: 3値化
    ]);
    const csv = [head, ...lines]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nox_shifts_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // B-5②: 新規シフトフォームの営業時間判定（date 直＝cutoff 変換なし・予約用とは別関数）
  const fShiftHours = shiftHoursStatus(fDate, fStart, fEnd, bhRows);
  const fClosedDay = fShiftHours.status === "closed";
  const closedOf = (date: string, startHm: string, endHm: string) =>
    shiftHoursStatus(date, startHm, endHm, bhRows).status === "closed";

  // ── 段S-1 派生値（すべて既存 shifts / staffing_needs の client 再形＝新規取得なし）──
  //   E8-4 #2（mig0095）: 必要人数は曜日×時間帯バンド。バンド充足＝「当該時間帯に交差するシフト数 ÷ required」。
  //   交差は半開区間 [hm2min(start), hm2min(end)) × [from_min, to_min)＝RPC の overlap 判定と同式。
  //   シフト終了は 47:59 まで（30時間制）だがバンド上限 1440 との交差はそのまま成立する。
  const shiftsOn = (ymd: string) => shifts.filter((s) => s.date === ymd);
  const bandStatsOf = (ymd: string): BandStat[] => {
    const list = shiftsOn(ymd);
    return needs.filter((n) => n.dow === dowOf(ymd)).map((n) => {
      const assigned = list.filter((s) => hm2min(s.start_hm) < n.to_min && n.from_min < hm2min(s.end_hm)).length;
      return { ...n, assigned, fill: fillOf(assigned, n.required) };
    });
  };
  // 日単位の状態＝バンドの最悪値。required はピーク（max）・shortage は最悪バンドの不足数（合算だと
  // 同じキャストの跨ぎ勤務を二重計上するため合算しない）。
  const dayStat = (ymd: string) => {
    const list = shiftsOn(ymd);
    const confirmed = list.filter((s) => s.status === "confirmed").length;
    const bs = bandStatsOf(ymd);
    const required = bs.reduce((m, b) => Math.max(m, b.required), 0);
    const shortage = bs.reduce((m, b) => Math.max(m, Math.max(0, b.required - b.assigned)), 0);
    return { assigned: list.length, confirmed, planned: list.length - confirmed, required, shortage, fill: worstFill(bs.map((b) => b.fill)) };
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
  const shortage = todayStat.shortage; // E8-4 #2: 最悪バンドの不足数（バンド化に追随）
  const todayBands = bandStatsOf(bizToday);

  // E8-4 #4: 予想人件費の月次ロールアップ＝fcByDate（既算出）の表示月合算のみ。
  //   labor-forecast の計算・golden には非干渉（forecastDay の出力を足すだけ）。
  const monthFcTotal = Array.from(fcByDate.entries())
    .filter(([d]) => d.startsWith(month)).reduce((a, [, f]) => a + f.total, 0);
  const monthFcHasUnknown = Array.from(fcByDate.entries())
    .some(([d, f]) => d.startsWith(month) && f.unknownComp > 0);

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
  const selBands = bandStatsOf(selDate); // E8-4 #2: 日詳細にも時間帯別充足バー

  return (
    // ★R3 第1弾: タイポ・余白のモック実値写し（globals.css の .nox-mv1 ブロック）。
    //   この画面と /notices だけに効く＝共有クラスの素の定義は変えていない。
    <div className="nox-mv1">
      <PageHead eyebrow="SHIFT MANAGEMENT" title="シフト管理"
        desc="申請、承認、出勤状況と人員充足をまとめて管理します。" />
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

      {/* ── タブ「今日」＝当日運用 ──
          ★DP-R S1/S2/S3（教訓26＝構造照合）でモック nox-shift-management の today パネルへ追随:
            S1 KPI 帯は**この面の中**（モックは .kpis を today パネル内に持つ）＝他タブへ引きずらない。
            S2 並びは「本日のシフト（左）／時間帯別の充足＋出勤ボーナス（右 stack）」の2カラム（モック .grid
                = minmax(560px,1.25fr) minmax(330px,.75fr) ≒ 既存 .nox-2col。新クラスは作らない）。
            S3 本日のシフトは**表**（スタッフ／申請時間／確定時間／状態／操作 の5列＝モック .shifthead 逐語）。
          ★「申請時間」は shifts.wish_id → shift_wishes の希望時刻（SD-1 の原型対比）。
            wish 由来でない手動登録行は実体が無いので「—」＝空欄で嘘をつかない。 */}
      {tab === "today" && (
      <>
      {/* 段S-1 KPI 帯（当日）。★予想人件費は S-2（Fable 5・money 慎重域）。 */}
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

      <div className="nox-2col">
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <div>
              <h2 style={{ ...secTitle, margin: 0 }}>本日のシフト（{bizToday}）</h2>
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
                申請時間・確定時間・出勤記録をこの表で確認します。シフトに無い飛び入り出勤は「＋ 追加」から先にシフトを足してください。
              </p>
            </div>
            {isManagerUp && (
              <button className="nox-addc" style={{ marginLeft: "auto" }}
                onClick={() => { setFDate(bizToday); setTab("build"); }}>＋ 追加</button>
            )}
          </div>
          {shiftsOn(bizToday).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--sub)" }}>本日のシフトはありません</p>
          ) : (
            <div className="nox-tablewrap">
              <table className="nox-table">
                <thead>
                  <tr><th>スタッフ</th><th>申請時間</th><th>確定時間</th><th>出勤記録</th><th>状態</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {shiftsOn(bizToday).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((s) => {
                    const w = s.wish_id ? wishAll.find((x) => x.id === s.wish_id) : undefined;
                    const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
                    return (
                      <tr key={s.id}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            <CastAvatar name={castName(s.cast_id)} url={photoUrls.get(s.cast_id)} variant="flat" />
                            {castName(s.cast_id)}
                          </span>
                        </td>
                        <td className="num" style={{ color: "var(--v2-muted)" }}>
                          {w ? fmtWin(w.start_hm, w.end_hm) : "—"}
                        </td>
                        <td className="num">{fmtWin(s.start_hm, s.end_hm)}</td>
                        {/* ★R1: 出勤記録＝旧「出勤板」の統合先。プルダウンではなくボタン群
                            （既存 .nox-seg の文法＝選択中は金枠）。押すと attendance_set をそのまま呼ぶ。 */}
                        <td>
                          {isManagerUp ? (
                            <div className="nox-seg" style={{ display: "inline-flex" }}>
                              {ATT_OPTIONS.map(([v, l]) => {
                                const on = (atts.find((x) => x.cast_id === s.cast_id)?.status ?? "") === v;
                                return (
                                  <button key={v} className={on ? "on" : ""} aria-pressed={on}
                                    title={on ? "記録済み（取り消しはできません・選び直してください）" : `${l}として記録`}
                                    onClick={() => { if (!on) void setAtt(s.cast_id, v); }}>{l}</button>
                                );
                              })}
                            </div>
                          ) : (
                            <span style={{ color: "var(--v2-muted)" }}>
                              {ATT_OPTIONS.find(([v]) => v === (atts.find((x) => x.cast_id === s.cast_id)?.status ?? ""))?.[1] ?? "—"}
                            </span>
                          )}
                          {atts.find((x) => x.cast_id === s.cast_id)?.eta && (
                            <span className="num" style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>
                              見込み {atts.find((x) => x.cast_id === s.cast_id)?.eta}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`}
                            style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                            {SHIFT_ST_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td>
                          {isManagerUp && (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button style={{ ...btnLight, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                                onClick={() => { setAdjTarget(s); setAStart(s.start_hm); setAEnd(s.end_hm); }}>調整</button>
                              {s.status === "planned" && (
                                <button style={{ ...btnLight, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                                  onClick={() => void proposeShifts([s.id])}>確認へ</button>
                              )}
                              {s.status !== "confirmed" && (
                                <button style={{ ...btnDark, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                                  onClick={() => confirmShift(s)}>確定</button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 右カラム（モック .stack）＝時間帯別の充足 ＋ 出勤ボーナス */}
        <div style={{ display: "grid", gap: 14 }}>
          {/* E8-4 #2: 時間帯別充足バー（バンド未設定の日は案内のみ） */}
          <section className="nox-cardtop" style={card}>
            <h2 style={secTitle}>時間帯別の充足</h2>
            {todayBands.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--v2-muted)" }}>
                この曜日の必要人数が未設定です。「シフト作成」タブの「必要人数（曜日・時間帯別）」から設定できます。
              </p>
            ) : (
              <BandBars stats={todayBands} />
            )}
          </section>
          {isManagerUp && <IncentivePanel storeId={storeId} casts={casts} />}
        </div>
      </div>
      </>
      )}

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
            {/* ★DP-R S5: モックの month-summary 帯（確定人時／予想人件費／人員不足日／未処理希望）。
                すべて**取得済み state の再形**＝新規クエリなし。予想人件費は既存 fcByDate の月合算
                （E8-4 #4 と同値）で manager 以上のみ。時給未設定が混じる月は「概算」と併記する。 */}
            {(() => {
              const inMonth = shifts.filter((x) => x.date.slice(0, 7) === month);
              const confMin = inMonth.filter((x) => x.status === "confirmed")
                .reduce((acc, x) => acc + spanMinutes(x.start_hm, x.end_hm), 0);
              const shortDays = calCells.filter((ymd): ymd is string => !!ymd)
                .filter((ymd) => { const st = dayStat(ymd); return st.required > 0 && st.assigned < st.required; }).length;
              const pend = wishAll.filter((w) => w.status === "pending").length;
              return (
                <div className="nox-repsum" style={{ marginTop: 10 }}>
                  <div className="nox-rs"><div className="l">確定人時</div><div className="v num">{Math.round(confMin / 60)}<small>h</small></div></div>
                  <div className="nox-rs">
                    <div className="l">予想人件費</div>
                    <div className="v num">{isManagerUp ? yen(monthFcTotal) : "—"}</div>
                  </div>
                  <div className="nox-rs"><div className="l">人員不足日</div><div className="v num">{shortDays}<small>日</small></div></div>
                  <div className="nox-rs"><div className="l">未処理希望</div><div className="v num">{pend}<small>件</small></div></div>
                </div>
              );
            })()}
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
              セル＝状態色＋確定/必要人数（時間帯バンドのピーク値）。必要人数は「シフト作成」タブの
              「必要人数（曜日・時間帯別）」設定を参照します。
            </p>
            {/* E8-4 #4: 予想人件費の月次ロールアップ（fcByDate の表示月合算＝新規計算なし・manager 以上） */}
            {isManagerUp && monthFcTotal > 0 && (
              <>
                <div className="nox-moneyrow" style={{ marginTop: 10 }}>
                  <span>予想人件費（{my}年{mm}月合計{monthFcHasUnknown ? "・時給未設定の日あり" : ""}）</span>
                  <b className="num">{yen(monthFcTotal)}</b>
                </div>
                <p className="nox-moneynote">
                  表示月の全日のシフト時間×時給の概算合計です。バック・控除は含みません。実際の給与とは異なります。
                </p>
              </>
            )}
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
            {/* E8-4 #2: 選択日の時間帯別充足バー（バンド設定のある曜日のみ） */}
            {selBands.length > 0 && (
              <div style={{ margin: "6px 0 8px" }}>
                <BandBars stats={selBands} />
              </div>
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
                    <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`} style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>{SHIFT_ST_LABEL[s.status] ?? s.status}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ── タブ「承認待ち」＝希望の審査（段0R その3 でタブを独立させた・中身と RPC は不変）── */}
      {/* ── タブ「承認待ち」＝希望の審査 ──
          ★DP-R S10/S11（教訓26）でモックの pendingPanel へ追随:
            S10 4段フロー（.workflow）は**この面**に置く（V2-2 でシフト作成タブに置いたのを移設）。
                モックの4段 = 1キャスト希望 → 2管理者確認・時間調整 → 3キャスト確認 → 4シフト確定。
            S11 一覧は**表**（スタッフ／勤務日／希望・提案時間／現在の段階／操作 の5列＝モック逐語）。
          ★「未処理」の実体は3段ぶん = pending の希望 ＋ planned のシフト（管理者の確認待ち）
            ＋ proposed のシフト（キャストの確認待ち）。段4（確定）はここには出ない＝確定シフトタブ。
          ★モックの「時間調整」は**希望の段では出さない**（教訓25）: NOX は採用して shifts 行が
            できて初めて shift_set で時刻を直せる＝希望のままでは調整先の行が無い。 */}
      {tab === "queue" && (
      <section className="nox-cardtop" style={card}>
        {(() => {
          const planned = shifts.filter((x) => x.status === "planned");
          const proposed = shifts.filter((x) => x.status === "proposed");
          const steps: Array<[string, string, number]> = [
            ["1", "キャスト希望", wishes.length],
            ["2", "管理者確認・時間調整", planned.length],
            ["3", "キャスト確認", proposed.length],
            ["4", "シフト確定", shifts.filter((x) => x.status === "confirmed").length],
          ];
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                <div>
                  <h2 style={{ ...secTitle, margin: 0 }}>承認待ちシフト</h2>
                  <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
                    希望を承認するか、時間を調整してキャストへ確認を依頼します
                  </p>
                </div>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {/* V2-2 の一括 propose はこの面へ移設（行の「キャスト確認へ」と同じ操作の一括版）。
                      モックには無いが、実装済みの機能を構造追随のために落とさない。 */}
                  {isManagerUp && planned.length > 0 && (
                    <button style={btnLight} title="段2（管理者確認）の全件をキャスト確認へ送ります"
                      onClick={() => void proposeShifts(planned.map((x) => x.id))}>
                      {planned.length}件まとめてキャスト確認へ
                    </button>
                  )}
                  <span className="nox-stpill">{wishes.length + planned.length + proposed.length}件</span>
                </span>
              </div>
              {/* 4段フロー（モック .workflow / .flowstep / .flowarrow）＝件数は取得済み state の再形 */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", flexWrap: "wrap", marginBottom: 12 }}>
                {steps.map(([n, label, cnt], idx) => (
                  <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                      fontSize: 10.5, color: cnt > 0 ? "var(--v2-text)" : "var(--v2-muted)" }}>
                      <i style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center",
                        fontStyle: "normal", fontSize: 9, border: "1px solid var(--line)",
                        color: cnt > 0 ? "var(--champ)" : "var(--v2-muted)" }}>{n}</i>
                      {label}
                      <span className="num" style={{ fontWeight: 800 }}>{cnt}</span>
                    </span>
                    {idx < steps.length - 1 && <span style={{ color: "var(--v2-muted)" }}>→</span>}
                  </span>
                ))}
              </div>
            </>
          );
        })()}
        {(() => {
          type Row = { key: string; castId: string; date: string; wishHm: string | null; nowHm: string | null;
            stage: string; kind: "wish" | "planned" | "proposed"; wish?: Wish; shift?: Shift };
          const rows: Row[] = [
            ...wishes.map((w) => ({ key: `w${w.id}`, castId: w.cast_id, date: w.date,
              wishHm: fmtWin(w.start_hm, w.end_hm), nowHm: null, stage: "キャスト希望", kind: "wish" as const, wish: w })),
            ...shifts.filter((x) => x.status === "planned" || x.status === "proposed").map((x) => {
              const w = x.wish_id ? wishAll.find((y) => y.id === x.wish_id) : undefined;
              return { key: `s${x.id}`, castId: x.cast_id, date: x.date,
                wishHm: w ? fmtWin(w.start_hm, w.end_hm) : null, nowHm: fmtWin(x.start_hm, x.end_hm),
                stage: x.status === "planned" ? "管理者確認" : "キャスト確認待ち",
                kind: x.status as "planned" | "proposed", shift: x };
            }),
          ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
          if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>未処理のシフト希望はありません。</p>;
          return (
            <div className="nox-tablewrap">
              <table className="nox-table">
                <thead>
                  <tr><th>スタッフ</th><th>勤務日</th><th>希望／提案時間</th><th>現在の段階</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const closed = r.wish
                      ? closedOf(r.wish.date, r.wish.start_hm, r.wish.end_hm)
                      : closedOf(r.shift!.date, r.shift!.start_hm, r.shift!.end_hm);
                    return (
                      <tr key={r.key}>
                        <td>{castName(r.castId)}</td>
                        <td className="num">{r.date}</td>
                        <td>
                          {r.wishHm && <span className="num" style={{ color: r.nowHm ? "var(--v2-muted)" : undefined }}>希望 {r.wishHm}</span>}
                          {r.nowHm && (
                            <span className="num" style={{ display: "block", marginTop: 2 }}>
                              {r.wishHm ? "提案 " : ""}{r.nowHm}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="nox-stpill" style={r.kind === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                            {r.stage}
                          </span>
                          {closed && <span style={{ display: "block", fontSize: 10.5, color: "var(--bad)", fontWeight: 700, marginTop: 2 }}>定休日</span>}
                        </td>
                        <td>
                          {isManagerUp && r.kind === "wish" && (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button style={{ ...btnDark, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                title={closed ? "この希望日は定休日に設定されています（見送りは可能）" : undefined}
                                onClick={() => decide(r.wish!.id, true)}>希望通り承認</button>
                              <button style={btnLight} onClick={() => decide(r.wish!.id, false)}>見送り</button>
                            </span>
                          )}
                          {isManagerUp && r.kind === "planned" && (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => { setAdjTarget(r.shift!); setAStart(r.shift!.start_hm); setAEnd(r.shift!.end_hm); }}>時間調整</button>
                              <button style={{ ...btnDark, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => void proposeShifts([r.shift!.id])}>キャスト確認へ</button>
                            </span>
                          )}
                          {isManagerUp && r.kind === "proposed" && (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => { setAdjTarget(r.shift!); setAStart(r.shift!.start_hm); setAEnd(r.shift!.end_hm); }}>再調整</button>
                              <button style={btnLight} onClick={() => void demoteShift(r.shift!)}>差し戻す</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>
      )}

      {/* ── タブ「確定シフト」＝登録フォーム＋今後の一覧（段0R その3 でタブを独立させた・中身と RPC は不変）── */}
      {/* ── ★SD V2-2（設計書 §5）: 計画バー＋4段フロー＋自動配置＋配置ルール（build タブ・manager 以上）──
          教訓25＝表示と状態は同コミット: 4段の中2段（proposed）は mig0101 の status 3値化で実体を持った。 */}
      {/* ── タブ「シフト作成」＝計画・配置 ──
          ★DP-R S7/S8/S9/S13（教訓26）でモックの create パネルへ追随:
            S7 計画バー（planbar = 見出し＋計画期間/希望締切＋状態バッジ＋「下書き保存」「スタッフに公開して確定」）
               ＋ warnbanner（未処理希望の告知＋承認待ちへの導線）＋ plan-kpis 4枚
               （配置済み／予定勤務時間／予想人件費／人員不足日＝モック逐語の4項目）。
            S8 レイアウトは**2カラム**（モック .planner-grid = minmax(570px,1.25fr) minmax(300px,.75fr)
               ≒ 既存 .nox-2col）。左=配置を組む／右=必要人数＋配置ルール。
            S9 「配置を組む」に**月カレンダー ⇄ スタッフ別**の表示切替（モック .plan-tools > .seg）。
               自動/手修正の色分けは shifts.source（auto / manual）を実データで塗る。
            S13 必要人数は右カラム（従来はタブ最下部）。
          ★モックに在るが実体が無いものは描かない（教訓25）: ポジション軸（裁定③・SD-6）／
            配置ルールの「優先順位」seg（shift_rules は max_consec_days・min_month_min の2列のみ）／
            「AI最適化」の語（実体は説明可能な貪欲法＝裁定④の2鍵）。 */}
      {tab === "build" && isManagerUp && (
      <>
      {(() => {
        const cur = periods.find((x) => x.id === selPeriodId) ?? periods[0] ?? null;
        const inMonth = shifts.filter((x) => x.date.slice(0, 7) === month);
        const planMin = inMonth.reduce((acc, x) => acc + spanMinutes(x.start_hm, x.end_hm), 0);
        const shortDays = calCells.filter((ymd): ymd is string => !!ymd)
          .filter((ymd) => { const st = dayStat(ymd); return st.required > 0 && st.assigned < st.required; }).length;
        return (
          <section className="nox-cardtop" style={card}>
            {/* planbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <h2 style={{ ...secTitle, margin: 0 }}>{my}年{mm}月 シフト計画</h2>
                <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "2px 0 0" }}>
                  {cur
                    ? <>計画期間 <span className="num">{cur.start_date}〜{cur.end_date}</span> ・ 希望締切 <span className="num">{cur.wish_deadline ?? "—"}</span></>
                    : "計画期間はまだありません（下のフォームで作成できます）"}
                </p>
              </div>
              {cur && <span className={`nox-stpill ${cur.status === "published" ? "ok" : ""}`}>{PERIOD_ST_LABEL[cur.status] ?? cur.status}</span>}
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <button style={{ ...btnLight, opacity: cur ? 1 : 0.45 }} disabled={!cur}
                  title={cur ? "この計画を下書きに戻します" : "先に計画期間を作成してください"}
                  onClick={() => cur && void setPeriodStatus(cur, "draft")}>下書き保存</button>
                <button style={{ ...btnDark, opacity: cur ? 1 : 0.45 }} disabled={!cur}
                  title={cur ? "この計画をスタッフへ公開します（以後この期間には自動配置できません）" : "先に計画期間を作成してください"}
                  onClick={() => cur && void setPeriodStatus(cur, "published")}>スタッフに公開して確定</button>
              </span>
            </div>
            {/* warnbanner（未処理の希望がある月だけ出す） */}
            {wishes.length > 0 && (
              <div className="nox-alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <span>未処理の希望が <b className="num">{wishes.length}件</b> あります。先に承認・時間調整すると自動配置へ反映されます。</span>
                <button style={btnLight} onClick={() => setTab("queue")}>希望を処理</button>
              </div>
            )}
            {/* plan-kpis 4枚（モック逐語の4項目・すべて取得済み state の再形） */}
            <div className="nox-repsum">
              <div className="nox-rs"><div className="l">配置済み</div><div className="v num">{inMonth.length}<small>件</small></div></div>
              <div className="nox-rs"><div className="l">予定勤務時間</div><div className="v num">{Math.round(planMin / 60)}<small>h</small></div></div>
              <div className="nox-rs"><div className="l">予想人件費</div><div className="v num">{yen(monthFcTotal)}</div></div>
              <div className="nox-rs"><div className="l">人員不足日</div><div className="v num">{shortDays}<small>日</small></div></div>
            </div>

        {periods.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>この月の計画はまだありません。下のフォームで作成できます。</p>
        )}
        {periods.map((p) => (
          <div key={p.id} className="nox-listrow" style={{ fontSize: 13 }}>
            <span className="num">{p.start_date} 〜 {p.end_date}</span>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>希望締切 <span className="num">{p.wish_deadline ?? "—"}</span></span>
            <span className={`nox-stpill ${p.status === "published" ? "ok" : ""}`}>{PERIOD_ST_LABEL[p.status] ?? p.status}</span>
            <button style={{ ...btnLight, marginLeft: "auto" }}
              onClick={() => { setPEditId(p.id); setPStart(p.start_date); setPEnd(p.end_date); setPDeadline(p.wish_deadline ?? ""); setPStatus(p.status); }}>編集</button>
            <button style={btnLight} title="シフトから参照されている期間は削除できません"
              onClick={() => void removePeriod(p.id)}>削除</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>{pEditId ? "編集中" : "新規"}</span>
          <label style={{ fontSize: 12 }}>開始 <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} style={input} /></label>
          <label style={{ fontSize: 12 }}>終了 <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} style={input} /></label>
          <label style={{ fontSize: 12 }}>希望締切 <input type="date" value={pDeadline} onChange={(e) => setPDeadline(e.target.value)} style={input} /></label>
          <select value={pStatus} onChange={(e) => setPStatus(e.target.value)} style={input}>
            {Object.entries(PERIOD_ST_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button style={btnDark} onClick={() => void savePeriod()}>{pEditId ? "更新" : "作成"}</button>
          {pEditId && (
            <button style={btnLight} onClick={() => { setPEditId(null); setPStart(""); setPEnd(""); setPDeadline(""); setPStatus("draft"); }}>やめる</button>
          )}
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
          締切は表示用の目安です（提出のブロックはしません）。公開済みの期間には自動配置できません。
        </p>
          </section>
        );
      })()}

      <div className="nox-2col">
        {/* 左＝配置を組む（モック「配置を組む」カード） */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h2 style={{ ...secTitle, margin: 0 }}>配置を組む</h2>
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "2px 0 0" }}>
                自動配置はたたき台です。1件ずつ手で直せます（<span style={{ color: "var(--blue)" }}>自動</span> /{" "}
                <span style={{ color: "var(--gold2)" }}>手修正</span>）
              </p>
            </div>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
              <div className="nox-seg">
                <button className={planView === "cal" ? "on" : ""} onClick={() => setPlanView("cal")}>月カレンダー</button>
                <button className={planView === "staff" ? "on" : ""} onClick={() => setPlanView("staff")}>スタッフ別</button>
              </div>
              <button style={btnLight} onClick={() => setAddModal(true)}>＋ 手動で追加</button>
            </span>
          </div>

          {planView === "cal" ? (
            <>
              <div className="nox-calgrid">
                {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                {calCells.map((ymd, i) => {
                  if (!ymd) return <div key={`pb${i}`} />;
                  const st = dayStat(ymd);
                  const day = shifts.filter((x) => x.date === ymd);
                  const auto = day.filter((x) => x.source === "auto").length;
                  const man = day.length - auto;
                  const cls = ["nox-cald", st.fill, ymd === selDate ? "sel" : "", ymd === bizToday ? "today" : ""].filter(Boolean).join(" ");
                  return (
                    <button key={ymd} className={cls} onClick={() => setSelDate(ymd)}
                      title={`${ymd}・自動${auto}件 / 手修正${man}件`}>
                      <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                      {st.required > 0 && <span className="nox-cald-c num">{st.assigned}/{st.required}</span>}
                      {day.length > 0 && (
                        <span className="num" style={{ fontSize: 8.5 }}>
                          {auto > 0 && <span style={{ color: "var(--blue)" }}>自{auto}</span>}
                          {auto > 0 && man > 0 && " "}
                          {man > 0 && <span style={{ color: "var(--gold2)" }}>手{man}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* 選択日の内訳（モック .plan-day-detail / .plan-person） */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <p style={{ fontSize: 11.5, fontWeight: 800, margin: "0 0 6px" }}>
                  <span className="num">{selDate}</span> の配置
                </p>
                {shiftsOn(selDate).length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>この日の配置はありません</p>
                ) : shiftsOn(selDate).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((x) => (
                  <div key={x.id} className="nox-listrow" style={{ fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{castName(x.cast_id)}</span>
                    <span className="num">{fmtWin(x.start_hm, x.end_hm)}</span>
                    <span style={{ fontSize: 10, color: x.source === "auto" ? "var(--blue)" : "var(--gold2)" }}>
                      {x.source === "auto" ? "自動" : "手修正"}
                    </span>
                    <span className={`nox-stpill ${x.status === "confirmed" ? "ok" : ""}`}
                      style={x.status === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                      {SHIFT_ST_LABEL[x.status] ?? x.status}
                    </span>
                    <button style={btnLight}
                      onClick={() => { setAdjTarget(x); setAStart(x.start_hm); setAEnd(x.end_hm); }}>調整</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* スタッフ別マトリクス（E8-4 #9・DP-R S9 で確定シフトタブからここへ移設） */
            (() => {
              const days = calCells.filter((d): d is string => d !== null);
              const rows = casts.filter((c) => shifts.some((x) => x.cast_id === c.id && x.date.startsWith(month)));
              if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>この月のシフトはありません</p>;
              const cellTd: React.CSSProperties = {
                border: "1px solid var(--line)", padding: "3px 4px", textAlign: "center", minWidth: 22,
              };
              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ ...cellTd, textAlign: "left", minWidth: 90, color: "var(--sub)" }}>キャスト</th>
                        {days.map((d) => (
                          <th key={d} className="num" style={{ ...cellTd, color: dowOf(d) === 0 ? "var(--bad)" : dowOf(d) === 6 ? "var(--champ)" : "var(--sub)" }}>
                            {Number(d.slice(8))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td style={{ ...cellTd, textAlign: "left", whiteSpace: "nowrap" }}>{c.name}</td>
                          {days.map((d) => {
                            const mine = shifts.filter((x) => x.cast_id === c.id && x.date === d);
                            const top = mine.some((x) => x.status === "confirmed") ? "confirmed"
                              : mine.some((x) => x.status === "proposed") ? "proposed"
                              : mine.length > 0 ? "planned" : null;
                            const isAuto = mine.length > 0 && mine.every((x) => x.source === "auto");
                            return (
                              <td key={d} className="num"
                                style={{ ...cellTd, color: top ? shiftStColor(top) : undefined,
                                  borderColor: mine.length === 0 ? undefined : isAuto ? "rgba(116,166,216,.35)" : "rgba(201,162,74,.4)" }}
                                title={mine.length > 0 ? `${d} ${mine.map((x) => `${fmtWin(x.start_hm, x.end_hm)}(${SHIFT_ST_LABEL[x.status]}・${x.source === "auto" ? "自動" : "手修正"})`).join(" / ")}` : undefined}>
                                {top === "confirmed" ? "●" : top === "proposed" ? "◐" : top === "planned" ? "○" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
            ●=確定 ◐=確認待ち ○=予定。枠色は <span style={{ color: "var(--blue)" }}>自動</span> /{" "}
            <span style={{ color: "var(--gold2)" }}>手修正</span>。セルにカーソルを合わせると時間帯が出ます。
          </p>

          {/* 自動配置（たたき台）＝モックでは同カード頭のボタンから開くダイアログ。
              ここでは同じカード内に置く＝プレビュー→適用→取消が一続きで見える。 */}
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>

        <h2 style={secTitle}>自動配置（たたき台）</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px", lineHeight: 1.7 }}>
          未処理の希望から、必要人数・配置ルールに沿って下書きの配置を作ります。
          出た配置はたたき台です（1件ずつ手で調整でき、まとめて取り消せます）。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <select value={selPeriodId} onChange={(e) => { setSelPeriodId(e.target.value); setPreview(null); }} style={input}>
            <option value="">計画期間を選択</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.start_date}〜{p.end_date}（{PERIOD_ST_LABEL[p.status] ?? p.status}）</option>
            ))}
          </select>
          <button style={{ ...btnDark, opacity: !selPeriodId || autoBusy ? 0.45 : 1 }} disabled={!selPeriodId || autoBusy}
            onClick={() => void runPreview()}>プレビュー</button>
          <button style={{ ...btnLight, opacity: !selPeriodId || autoBusy ? 0.45 : 1 }} disabled={!selPeriodId || autoBusy}
            title="この期間の自動配置（予定のまま残っている分）をすべて削除し、希望を承認待ちへ戻します。手動分は残ります。"
            onClick={() => void clearAuto()}>自動配置を取り消す</button>
        </div>
        {preview && (
          <div className="nox-inset" style={{ padding: "10px 14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 6px", color: "var(--v2-text)" }}>
              割当案 <span className="num">{preview.result.assignWishIds.length}</span> 件
              ・不足 <span className="num">{preview.result.shortages.reduce((a, x) => a + x.short, 0)}</span> 名分
              ・入らなかった希望 <span className="num">{preview.result.unassignedWishes.length}</span> 件
            </p>
            {preview.result.assignWishIds.length > 0 && (
              <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                {preview.result.assignWishIds.map((wid) => {
                  const w = wishAll.find((x) => x.id === wid) ?? wishes.find((x) => x.id === wid);
                  return w ? (
                    <li key={wid}><span className="num">{w.date}</span> {castName(w.cast_id)} <span className="num">{fmtWin(w.start_hm, w.end_hm)}</span></li>
                  ) : <li key={wid} className="num">{wid.slice(0, 8)}</li>;
                })}
              </ul>
            )}
            {preview.result.shortages.length > 0 && (
              <p style={{ fontSize: 11.5, color: "var(--bad)", margin: "0 0 6px", lineHeight: 1.7 }}>
                不足: {preview.result.shortages.map((x) => `${x.date} ${x.band} あと${x.short}名`).join(" ／ ")}
              </p>
            )}
            {preview.result.warnings.length > 0 && (
              <p style={{ fontSize: 11.5, color: "var(--gold2)", margin: "0 0 6px", lineHeight: 1.7 }}>
                {preview.result.warnings.map((x) => `${castName(x.castId)}: ${x.detail}`).join(" ／ ")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btnDark, opacity: autoBusy || preview.result.assignWishIds.length === 0 ? 0.45 : 1 }}
                disabled={autoBusy || preview.result.assignWishIds.length === 0}
                onClick={() => void applyAuto()}>この内容で配置する</button>
              <button style={btnLight} disabled={autoBusy} onClick={() => setPreview(null)}>閉じる</button>
            </div>
          </div>
        )}
          </div>
        </section>

        {/* 右＝必要人数＋配置ルール（モック planner-grid の右カラム） */}
        <div style={{ display: "grid", gap: 14 }}>
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>必要人数（曜日・時間帯別）</h2>
          {DOW.map((label, dow) => {
            const bs = needs.filter((n) => n.dow === dow);
            return (
              <div key={dow} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                <span style={{ width: 20, color: dow === 0 ? "var(--bad)" : dow === 6 ? "var(--champ)" : "var(--sub)", fontWeight: 700 }}>{label}</span>
                {bs.length === 0 && <span style={{ color: "var(--v2-muted)" }}>未設定</span>}
                {bs.map((n) => (
                  <span key={`${n.id}:${n.required}:${n.to_min}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 8, padding: "3px 8px" }}>
                    <span className="num" style={{ color: "var(--sub)" }}>{bandLabel(n)}</span>
                    <input
                      type="number" min={0} defaultValue={n.required}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== n.required) void saveNeed(dow, v, n.from_min, n.to_min);
                      }}
                      style={{ ...input, width: 52, padding: "4px 6px" }}
                    />
                    <span style={{ color: "var(--sub)" }}>名</span>
                    <button
                      style={{ ...btnLight, padding: "2px 8px" }} aria-label={`${label}曜 ${bandLabel(n)} を削除`}
                      onClick={() => removeNeed(dow, n.from_min, bandLabel(n))}
                    >×</button>
                  </span>
                ))}
              </div>
            );
          })}
          {/* バンド追加フォーム（検証の正は RPC＝bad band / overlap を日本語で返す） */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <select value={nDow} onChange={(e) => setNDow(Number(e.target.value))} style={input}>
              {DOW.map((l, d) => <option key={d} value={d}>{l}曜</option>)}
            </select>
            <label style={{ fontSize: 12.5, color: "var(--sub)", display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={nAllDay} onChange={(e) => setNAllDay(e.target.checked)} />終日
            </label>
            {!nAllDay && (
              <>
                <input value={nFrom} onChange={(e) => setNFrom(e.target.value)} style={{ ...input, width: 64 }} placeholder="20:00" />
                <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
                <input value={nTo} onChange={(e) => setNTo(e.target.value)} style={{ ...input, width: 64 }} placeholder="24:00" />
              </>
            )}
            <span style={{ fontSize: 12.5, color: "var(--sub)" }}>必要</span>
            <input type="number" min={0} value={nReq} onChange={(e) => setNReq(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 60 }} />
            <span style={{ fontSize: 12.5, color: "var(--sub)" }}>名</span>
            <button style={btnDark} onClick={addNeed}>追加</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
            人数の変更はフォーカスアウトで保存。時間は 00:00〜24:00（例 20:00〜24:00）。
            同じ曜日で時間帯が重なる設定はできません（同じ開始時刻は上書き）。
          </p>
        </section>
          <section className="nox-cardtop" style={card}>

        <h2 style={secTitle}>配置ルール（自動配置で守る条件）</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12 }}>連勤上限
            <input type="number" min={1} value={rConsec} placeholder="無制限"
              onChange={(e) => setRConsec(e.target.value)} style={{ ...input, width: 70, marginLeft: 6 }} /> 日
          </label>
          <label style={{ fontSize: 12 }}>最低月間時間
            <input type="number" min={1} value={rMonthH} placeholder="なし"
              onChange={(e) => setRMonthH(e.target.value)} style={{ ...input, width: 70, marginLeft: 6 }} /> 時間
          </label>
          <button style={btnDark} onClick={() => void saveRules()}>保存</button>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
          空欄＝制限なし。連勤上限を超える配置は作りません。最低月間時間に達していない人を優先して埋めます。
          手動で調整した配置は、再度自動配置しても保持されます。
        </p>
          </section>
        </div>
      </div>
      </>
      )}

      {/* ── タブ「確定シフト」＝今後の一覧 ──
          ★DP-R S12（教訓26）でモックの confirmedPanel へ追随: **表**（スタッフ／勤務日／確定時間／
            確定者／状態 の5列＝モック逐語）＋CSV出力。build タブからは外した（モックの create パネルに
            確定一覧は無い）。★スタッフ別マトリクスは S9 によりシフト作成タブの「配置を組む」へ移設。
          ★操作列はモックに無いが「時間を調整」だけ残す＝時刻の訂正は**確定後にも起きる**
            （裁定 DP3-③・status は据え置きなので昇格しない）。予定/確認待ちの操作は承認待ちタブ側。 */}
      {tab === "roster" && (
      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>確定シフト</h2>
            {/* ★R4: 役割分担を画面が自己説明する（カレンダータブ＝充足管理／このタブ＝誰がいつ） */}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
              <b>誰がいつ入るか</b>を見る画面です（人数の過不足は「カレンダー」タブで見ます）。
            </p>
          </div>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
            <div className="nox-seg">
              <button className={rosterView === "cal" ? "on" : ""} onClick={() => setRosterView("cal")}>カレンダー</button>
              <button className={rosterView === "table" ? "on" : ""} onClick={() => setRosterView("table")}>表で見る</button>
            </div>
            {shifts.length > 0 && <button style={btnLight} onClick={exportShiftsCsv}>CSV出力</button>}
          </span>
        </div>

        {/* ★R4: 人ベース月カレンダー。★confirmed だけを描く＝「確定シフト」の名に嘘をつかせない
            （予定・確認待ちはこの面に混ぜない＝教訓25）。まだ確定していない分は
            「承認待ち」タブに件数つきで出ているので、取りこぼしにはならない。 */}
        {rosterView === "cal" && (() => {
          const confirmedOn = (ymd: string) =>
            shifts.filter((x) => x.date === ymd && x.status === "confirmed")
              .slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm));
          const sel = confirmedOn(selDate);
          return (
            <>
              <div className="nox-calhead">
                <button style={btnLight} onClick={() => shiftMonth(-1)} aria-label="前の月">‹</button>
                <h3 style={{ margin: 0, fontSize: 14 }}>{my}年{mm}月</h3>
                <button style={btnLight} onClick={() => shiftMonth(1)} aria-label="次の月">›</button>
                <button style={{ ...btnLight, marginLeft: "auto" }}
                  onClick={() => { setMonth(bizToday.slice(0, 7)); setSelDate(bizToday); }}>今日</button>
              </div>
              <div className="nox-calgrid">
                {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                {calCells.map((ymd, i) => {
                  if (!ymd) return <div key={`rb${i}`} />;
                  const list = confirmedOn(ymd);
                  const cls = ["nox-cald", list.length > 0 ? "ok" : "", ymd === selDate ? "sel" : "", ymd === bizToday ? "today" : ""].filter(Boolean).join(" ");
                  return (
                    <button key={ymd} className={cls} style={{ minHeight: 92, alignItems: "stretch" }}
                      onClick={() => setSelDate(ymd)}
                      title={list.length === 0 ? `${ymd}・確定なし` : `${ymd}・${list.map((x) => `${castName(x.cast_id)} ${fmtWin(x.start_hm, x.end_hm)}`).join(" / ")}`}>
                      <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                      {/* 先頭3名の名前チップ（例: れいな 20:00-）＋残りは「他N名」に折り畳む */}
                      {list.slice(0, 3).map((x) => (
                        <span key={x.id} style={{
                          display: "block", fontSize: 9.5, lineHeight: 1.5, textAlign: "left",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ok)",
                        }}>
                          {castName(x.cast_id)} <span className="num">{x.start_hm}-</span>
                        </span>
                      ))}
                      {list.length > 3 && (
                        <span style={{ display: "block", fontSize: 9, color: "var(--v2-muted)", textAlign: "left" }}>
                          他{list.length - 3}名
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 日タップで全員展開＋時間調整への導線 */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <p style={{ fontSize: 11.5, fontWeight: 800, margin: "0 0 6px" }}>
                  <span className="num">{selDate}</span> の確定
                  <span className="num" style={{ marginLeft: 6, color: "var(--v2-muted)" }}>{sel.length}名</span>
                </p>
                {sel.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>この日の確定シフトはありません。</p>
                ) : sel.map((x) => {
                  const xClosed = closedOf(x.date, x.start_hm, x.end_hm);
                  const w = x.wish_id ? wishAll.find((y) => y.id === x.wish_id) : undefined;
                  return (
                    <div key={x.id} className="nox-listrow" style={{ fontSize: 12.5 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {castName(x.cast_id)}
                        {w && (w.start_hm !== x.start_hm || w.end_hm !== x.end_hm) && (
                          <span className="num" style={{ display: "block", fontSize: 10, color: "var(--v2-muted)" }}>
                            希望 {fmtWin(w.start_hm, w.end_hm)}
                          </span>
                        )}
                      </span>
                      <span className="num">{fmtWin(x.start_hm, x.end_hm)}</span>
                      <span style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>{userNames.get(x.created_by) ?? "—"}</span>
                      {isManagerUp && (
                        <button style={{ ...btnLight, opacity: xClosed ? 0.45 : 1 }} disabled={xClosed}
                          title={xClosed ? "この日は定休日に設定されています" : undefined}
                          onClick={() => { setAdjTarget(x); setAStart(x.start_hm); setAEnd(x.end_hm); }}>時間を調整</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
                このカレンダーには<b>確定だけ</b>を出しています（予定・確認待ちは「承認待ち」タブ）。
                セルは先頭3名まで、残りは日をタップすると全員出ます。
              </p>
            </>
          );
        })()}

        {rosterView === "table" && (shifts.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>
        ) : (
          <div className="nox-tablewrap">
            <table className="nox-table">
              <thead>
                <tr><th>スタッフ</th><th>勤務日</th><th>確定時間</th><th>確定者</th><th>状態</th><th>操作</th></tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  // B-5②: 作成後に定休日化された日のシフト＝更新経路を事前ブロック（二層目は RPC・段26-5 実測）
                  const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
                  const w = s.wish_id ? wishAll.find((x) => x.id === s.wish_id) : undefined;
                  return (
                    <tr key={s.id}>
                      <td>{castName(s.cast_id)}</td>
                      <td className="num">{s.date}</td>
                      <td>
                        <span className="num">{fmtWin(s.start_hm, s.end_hm)}</span>
                        {/* ★SD-1 原型対比: 希望から時刻を変えた行だけ「希望 …」を小さく併記 */}
                        {w && (w.start_hm !== s.start_hm || w.end_hm !== s.end_hm) && (
                          <span className="num" style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}
                            title="キャストの希望から時間を調整済み">希望 {fmtWin(w.start_hm, w.end_hm)}</span>
                        )}
                      </td>
                      <td style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{userNames.get(s.created_by) ?? "—"}</td>
                      <td>
                        <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`}
                          style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                          {SHIFT_ST_LABEL[s.status] ?? s.status}
                        </span>
                        {sClosed && <span style={{ display: "block", fontSize: 10.5, color: "var(--bad)", fontWeight: 700, marginTop: 2 }}>定休日</span>}
                      </td>
                      <td>
                        {isManagerUp && (
                          <button style={{ ...btnLight, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                            title={sClosed ? "この日は定休日に設定されています" : undefined}
                            onClick={() => { setAdjTarget(s); setAStart(s.start_hm); setAEnd(s.end_hm); }}>時間を調整</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      )}



      {/* ── ★DP3 P2（裁定 DP3-②）: 手動シフト追加モーダル（モック `planShiftDialog`・
             modalhead＋modalbody＋formgrid＋actions）。★フィールド集合・検証・送る RPC と引数は
             移設前の逐語＝`addShift` は1文字も変えていない。 ── */}
      {addModal && isManagerUp && (
        <Modal onClose={() => setAddModal(false)} maxWidth={520} scroll>
          <div className="nox-modalhead">
            <h3 style={{ ...secTitle, margin: 0 }}>手動でシフトを追加</h3>
            <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => setAddModal(false)}>×</button>
          </div>
          <div className="nox-modalbody">
            <div className="nox-field2">
              <div className="nox-field">
                <span className="lab">キャスト<span className="req">*</span></span>
                <select value={fCast} onChange={(e) => setFCast(e.target.value)} style={{ ...input, width: "100%" }}>
                  <option value="">キャスト</option>
                  {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="nox-field">
                <span className="lab">日付</span>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ ...input, width: "100%" }} />
              </div>
              <div className="nox-field">
                <span className="lab">開始</span>
                <input value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ ...input, width: "100%" }} />
                <span className="hint">24時以降は 25:00 のように書けます。</span>
              </div>
              <div className="nox-field">
                <span className="lab">終了</span>
                <input value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ ...input, width: "100%" }} />
              </div>
              <div className="nox-field full">
                <span className="lab">状態</span>
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ ...input, width: "100%" }}>
                  <option value="planned">予定</option>
                  <option value="proposed">確認待ち</option>
                  <option value="confirmed">確定</option>
                </select>
              </div>
            </div>
            {fClosedDay && (
              <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "10px 0 0" }}>
                この日は定休日です（シフトを登録できません）
              </p>
            )}
            {fShiftHours.status === "outside" && fShiftHours.row && (
              <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "10px 0 0" }}>
                営業時間外です（営業 {fmtHoursLabel(fShiftHours.row)}）
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 17 }}>
              <button style={btnLight} onClick={() => setAddModal(false)}>やめる</button>
              <button style={{ ...btnDark, opacity: fClosedDay || !fCast ? 0.45 : 1 }} disabled={fClosedDay || !fCast}
                onClick={() => void addShift()}>登録</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ★DP3 P2（裁定 DP3-③）: 勤務時間の調整モーダル（モック `adjustDialog`）。
             ★「元の希望との対比」と「メモ」は入れない＝`shifts` が wish_id もメモ列も持たないため
               （d＝シフト深部レーンで消化）。ここは既存 `shift_set` の update 経路を呼ぶだけ。 ── */}
      {adjTarget && isManagerUp && (() => {
        const aHours = shiftHoursStatus(adjTarget.date, aStart, aEnd, bhRows);
        return (
          <Modal onClose={() => setAdjTarget(null)} maxWidth={460}>
            <div className="nox-modalhead">
              <h3 style={{ ...secTitle, margin: 0 }}>勤務時間を調整</h3>
              <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => setAdjTarget(null)}>×</button>
            </div>
            <div className="nox-modalbody">
              <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>キャスト</span><span style={{ color: "var(--v2-text)", fontWeight: 700 }}>{castName(adjTarget.cast_id)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>日付</span><span className="num">{adjTarget.date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)" }}>
                  <span>現在</span><span className="num">{fmtWin(adjTarget.start_hm, adjTarget.end_hm)}</span>
                </div>
              </div>
              <div className="nox-field2">
                <div className="nox-field">
                  <span className="lab">開始</span>
                  <input value={aStart} onChange={(e) => setAStart(e.target.value)} style={{ ...input, width: "100%" }} />
                </div>
                <div className="nox-field">
                  <span className="lab">終了</span>
                  <input value={aEnd} onChange={(e) => setAEnd(e.target.value)} style={{ ...input, width: "100%" }} />
                  <span className="hint">24時以降は 25:00 のように書けます。</span>
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
                状態（{SHIFT_ST_LABEL[adjTarget.status] ?? adjTarget.status}）は変わりません。時間だけを直します。
              </p>
              {aHours.status === "closed" && (
                <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "6px 0 0" }}>
                  この日は定休日です（調整できません）
                </p>
              )}
              {aHours.status === "outside" && aHours.row && (
                <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "6px 0 0" }}>
                  営業時間外です（営業 {fmtHoursLabel(aHours.row)}）
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 17 }}>
                <button style={btnLight} onClick={() => setAdjTarget(null)}>やめる</button>
                <button style={{ ...btnDark, opacity: aHours.status === "closed" ? 0.45 : 1 }}
                  disabled={aHours.status === "closed"} onClick={() => void adjustShift()}>保存</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
