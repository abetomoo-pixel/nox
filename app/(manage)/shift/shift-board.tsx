"use client";

// B-5 スライスB（mig0033）: 定休日=UI 一次ブロック＋RPC 二層目 'closed day'（段26 実測）／
//   営業時間外=黄警告のみで登録可（非対称・段26-2/26-5）／未設定 dow=判定なし（後方互換）。
//   ★シフトの営業日判定は shiftHoursStatus（date 直＝cutoff 変換なし・mig0008 決定3）。
//   予約用 businessHoursStatus（cutoff 変換）をシフトに使うと深夜帯で1日ズレるため使用禁止。
//   希望の採否は「採用のみ定休日ブロック・見送りは定休日でも可」の非対称を UI に出す（裁定B-3）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin, fmtBand30, hm2min, min2hm } from "@/lib/nox/shift-time";
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
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; created_by: string };
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
  // E8-4（mig0095）: 時間帯バンド系（set_staffing_need / staffing_need_remove）
  if (isBillingLocked(msg)) return BILLING_LOCKED_MSG;
  if (msg.includes("bad band")) return "時間帯の指定が不正です（00:00〜24:00・開始<終了）";
  if (msg.includes("overlap")) return "他の時間帯と重複しています（同じ開始時刻の場合は上書きされます）";
  if (msg.includes("bad required")) return "必要人数は 0 以上で入力してください";
  if (msg.includes("bad dow")) return "曜日の指定が不正です";
  if (msg.includes("not found")) return "対象の時間帯が見つかりません";
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
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status, created_by")
      .gte("date", from).lte("date", to).order("date").limit(2000);
    // E8-4（mig0095）: 時間帯バンド列を取得（dow → from_min の昇順＝バンド表示順）
    const { data: ns } = await supabase.from("staffing_needs")
      .select("id, dow, required, from_min, to_min").order("dow").order("from_min");
    // B-5②: 営業時間（シフトは date 直判定＝cutoff 不要なので stores.settings_json は読まない）
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
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
      s.status === "confirmed" ? "確定" : "予定", userNames.get(s.created_by) ?? "",
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

      {/* ── タブ「今日」＝当日運用（時間帯別充足・本日のシフト一覧・出勤板・出勤ボーナス）── */}
      {/* E8-4 #2: 時間帯別充足バー（バンド未設定の日は案内のみ） */}
      {tab === "today" && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>本日の充足（時間帯別）</h2>
          {todayBands.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--v2-muted)" }}>
              この曜日の必要人数が未設定です。「シフト作成」タブの「必要人数（曜日・時間帯別）」から設定できます。
            </p>
          ) : (
            <BandBars stats={todayBands} />
          )}
        </section>
      )}
      {/* E8-4 #1: 本日のシフト一覧（開始時刻順・確定/予定ピル） */}
      {tab === "today" && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>本日のシフト（{bizToday}）</h2>
          {shiftsOn(bizToday).length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>本日のシフトはありません</p>}
          {shiftsOn(bizToday).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((s) => (
            <div key={s.id} className="nox-crow">
              <CastAvatar name={castName(s.cast_id)} url={photoUrls.get(s.cast_id)} variant="flat" />
              <span style={{ flex: 1, minWidth: 0 }}>{castName(s.cast_id)}</span>
              <span className="num" style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{fmtWin(s.start_hm, s.end_hm)}</span>
              <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`}>{s.status === "confirmed" ? "確定" : "予定"}</span>
            </div>
          ))}
        </section>
      )}
      {tab === "today" && isManagerUp && <IncentivePanel storeId={storeId} casts={casts} />}

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
            <div key={w.id} className="nox-listrow" style={{ fontSize: 13 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ ...secTitle }}>確定シフト（今後）</h2>
          {/* E8-4 #10: CSV 出力（表示中の一覧＝取得済みデータの再形のみ） */}
          {shifts.length > 0 && (
            <button style={{ ...btnLight, marginLeft: "auto", marginBottom: 9 }} onClick={exportShiftsCsv}>CSV 出力</button>
          )}
        </div>
        {/* ★DP3 P2（裁定 DP3-②）: 手動追加は**モーダル**へ（モック `planShiftDialog`）。
            ここは開くボタンだけ＝フォーム本体と `addShift`（送る RPC・引数・定休日ガード）は不変。 */}
        {isManagerUp && (
          <div style={{ marginBottom: 10 }}>
            <button style={btnDark} onClick={() => setAddModal(true)}>＋ 手動でシフトを追加</button>
          </div>
        )}
        {shifts.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {shifts.map((s) => {
          // B-5②: 作成後に定休日化された日のシフト＝確定（update 経路）を事前ブロック（二層目は RPC・段26-5 実測）
          const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
          return (
            <div key={s.id} className="nox-listrow" style={{ fontSize: 13 }}>
              <span style={{ ...t.num, width: 90 }}>{s.date}</span>
              <span style={{ width: 110 }}>{castName(s.cast_id)}</span>
              <span style={t.num}>{fmtWin(s.start_hm, s.end_hm)}</span>
              <span style={{ color: s.status === "confirmed" ? "var(--ok)" : "var(--champ)" }}>
                {s.status === "confirmed" ? "確定" : "予定"}
              </span>
              {/* E8-4 #10: 登録者列（created_by→users.name・引けない場合は —） */}
              <span style={{ fontSize: 11.5, color: "var(--v2-muted)", width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`登録者: ${userNames.get(s.created_by) ?? "—"}`}>
                {userNames.get(s.created_by) ?? "—"}
              </span>
              {sClosed && <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>定休日</span>}
              {/* ★DP3 P2（裁定 DP3-③）: 勤務時間の調整（モック `adjustDialog`）。予定・確定のどちらでも押せる
                  ＝時間の訂正は確定後にも起きる（status は据え置きなので昇格しない）。 */}
              {isManagerUp && (
                <button
                  style={{ ...btnLight, marginLeft: s.status === "planned" ? undefined : "auto", opacity: sClosed ? 0.45 : 1 }}
                  disabled={sClosed}
                  title={sClosed ? "この日は定休日に設定されています" : undefined}
                  onClick={() => { setAdjTarget(s); setAStart(s.start_hm); setAEnd(s.end_hm); }}
                >時間を調整</button>
              )}
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

      {/* ── E8-4 #9: スタッフ別マトリクス（確定シフトタブ・表示月・取得済み shifts の再形のみ）── */}
      {tab === "roster" && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>スタッフ別マトリクス（{my}年{mm}月）</h2>
          {(() => {
            const days = calCells.filter((d): d is string => d !== null);
            const rows = casts.filter((c) => shifts.some((s) => s.cast_id === c.id && s.date.startsWith(month)));
            if (rows.length === 0) {
              return <p style={{ fontSize: 13, color: "var(--sub)" }}>この月のシフトはありません</p>;
            }
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
                          const mine = shifts.filter((s) => s.cast_id === c.id && s.date === d);
                          const conf = mine.some((s) => s.status === "confirmed");
                          return (
                            <td key={d} className="num"
                              style={{ ...cellTd, color: conf ? "var(--ok)" : "var(--champ)" }}
                              title={mine.length > 0 ? `${d} ${mine.map((s) => fmtWin(s.start_hm, s.end_hm)).join(" / ")}` : undefined}>
                              {mine.length === 0 ? "" : conf ? "●" : "○"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
            ●=確定 ○=予定。表示月にシフトのあるキャストのみ。セルにカーソルを合わせると時間帯を表示します。
          </p>
        </section>
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

      {/* ── タブ「シフト作成」＝必要人数（曜日・時間帯別）── E8-4 #3（mig0095 バンド化）
          曜日ごとにバンドを列挙（終日=0〜1440・複数バンド可）。人数はフォーカスアウトで upsert 置換、
          削除は staffing_need_remove。重複バンドは RPC 'overlap' が拒否（同じ開始時刻は上書き）。 */}
      {tab === "build" && isManagerUp && (
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
                状態（{adjTarget.status === "confirmed" ? "確定" : "予定"}）は変わりません。時間だけを直します。
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
