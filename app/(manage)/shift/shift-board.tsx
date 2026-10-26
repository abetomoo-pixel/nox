"use client";

// B-5 スライスB（mig0033）: 定休日=UI 一次ブロック＋RPC 二層目 'closed day'（段26 実測）／
//   営業時間外=黄警告のみで登録可（非対称・段26-2/26-5）／未設定 dow=判定なし（後方互換）。
//   ★シフトの営業日判定は shiftHoursStatus（date 直＝cutoff 変換なし・mig0008 決定3）。
//   予約用 businessHoursStatus（cutoff 変換）をシフトに使うと深夜帯で1日ズレるため使用禁止。
//   希望の採否は「採用のみ定休日ブロック・見送りは定休日でも可」の非対称を UI に出す（裁定B-3）。
import { dayStateLabelOf } from "@/lib/nox/mine/day-state"; // ★便 GV-C C-14（GV-60）: 日の状態の語と色（/mine と同じ）
import { SHIFT_REQUEST_MODE_LABEL } from "@/lib/nox/store/mine-settings"; // ★裁定337（0167）: 配置ビューの印
import { PROXY_CONFIRM_LABEL, WISH_STATE_LABEL, wishStateTextOf } from "@/lib/nox/shift/wish-state"; // ★裁定345: 4 段の語・「代行確定」
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveReload } from "@/lib/nox/ui/use-live-reload"; // ★便 GV-C C-12: focus／visibility／60 秒で再読込
import SegSelect from "@/components/ui/seg-select";
import { ResponsiveTable } from "@/components/ui/responsive-kit"; // ★裁定382（GV-B W-1）
import CastPicker from "@/components/nox/cast-picker";
import ShiftAddForm from "./shift-add-form";
// ★裁定245-3: 一括確定の 62 件分割（純関数 chunkOf・shift_confirm_bulk の上限 0126）
import { chunkOf } from "@/lib/nox/shift/gap";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf, bizDateRange, addDays } from "@/lib/nox/biz-date";
import { fmtWin, fmtBand30, hm2min, min2hm, spanMinutes } from "@/lib/nox/shift-time";
import { lateMinutesOf } from "@/lib/nox/shift/late"; // ★裁定268: 遅刻分数（KPI 未着判定と行表示の単一式）
import { SHIFT_VIEWS, VIEW_TABS, searchOfTab, stepOfTab, tabFromSearch, tabOfView, viewOfTab, type ShiftTab } from "@/lib/nox/shift/tabs"; // ★裁定406（便 SH-UI-b）: 上段 3 タブ＋手順 4 段・URL（?tab=make&step=3&period=） // ★裁定274（R15）: 3 タブの写像
import { matchPunches, LATE_GRACE_MIN_DEFAULT } from "@/lib/nox/punch-match"; // ★裁定257 R20-a: 遅刻判定は給与側と同じ純関数
import { buildMatchInput, type PunchRow } from "@/lib/nox/punch-io";
// ★便 AT2（2026-09-24）: 今日タブの出退勤表示＝純関数（退勤ボタンの出し分け・時刻文字列・最初の in／最後の out）
import { firstInLastOut, okuriButtonOf, outButtonOf, outDialogNeeded, punchTimeLabel, punchInAfterAtt, attRowModeOf, arrivedChipOf, todayRowViewOf } from "@/lib/nox/shift/today-row";
import { dohanSeatsOf, dohanMarkTextOf, lateExemptByDohanOf } from "@/lib/nox/shift/dohan-mark"; // ★便 PR-1 R-4（裁定417）: 同伴の正本＝伝票（今日タブの同伴ボタンは撤去） // ★裁定357（GV-5・便 N1014 A-6）: 送りは退勤後も営業日内は可・退勤ダイアログ 2 択
import { opsProfileOf } from "@/lib/nox/store/ops-profile"; // ★0164（便 W5-2b）: punch_methods.proxy
import { PunchCorrectionForm } from "@/components/nox/punch-correction-modal"; // ★0154 D1: 出退勤の修正（owner／manager＝申請＝確定）・★裁定310: 「調整」モーダルのタブ①に埋め込む（本体のみ）
import PunchDecideModal from "@/components/nox/punch-decide-modal"; // ★裁定297-1: cast の申請（pending）の承認／却下（理由必須）
import SettlementModal from "@/components/nox/settlement-modal"; // ★0154 D4: 精算調整（委託・裁定293 追補1）
import { detectTargetOf, type SettlementTarget } from "@/lib/nox/payroll/settlement";
import { KIND_LABEL, correctionSummaryOf, disputedOf, pendingOf, requestedLabelOf, termOf, type CorrectionRow, type PunchKind } from "@/lib/nox/shift/punch-correction";
import { mdDowOf } from "@/lib/nox/shift/staff-place";
// ★便 AU2／AU3（2026-09-24・週末バックログ 2／3）: 計画期間の進行段・期間ごとの帯と地色・確定シフトの「未確定」印・月セルの名前合成（純関数）
import { PERIOD_STAGES, effectiveStageOf, isUnpublishedDay, periodBandText, periodStageOf, stageIndexOf } from "@/lib/nox/shift/period-stage";
import { PERIOD_LEGEND, periodCellClassOf, periodCellStageOf, unprocessedWishIdsOf, wishRowsOf } from "@/lib/nox/shift/period-cell"; // ★便 SH-UI-b2 B2-1（★便 SH-UI-c2 C2-19: セルの class は CalCell へ）
import { CalCell, CalLegend } from "@/components/nox/shift-cal-cell"; // ★便 SH-UI-c2 C2-19: 日セルと凡例（③④・確定シフトタブで共通）
import { fillOf as calFillOf, noPlacingTextOf, periodMonthLabelOf, queueHeadTextOf, queueTotalTextOf, shortDaysInPeriodsOf } from "@/lib/nox/shift/cal-cell"; // ★便 SH-UI-c2 C2-17／C2-18／C2-19／B2-3: 日セルの地色＝期間の状態・提出一覧の行から希望を処理
import { cellNamesOf } from "@/lib/nox/shift/cell-names";
// ★0125（裁定112-A）: 自動配置 UI は撤去（autoAssign import ごと）。RPC/器（shift_auto_apply 等）は残置。
import { shiftHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";
import * as t from "@/lib/nox/ui/theme";
import Toast, { Message } from "@/components/ui/toast";
import MonthNav, { useYmQuery } from "@/components/nox/month-nav"; // ★裁定306-1／306-6: 年月見出し＋前月／翌月／今月（確定タブの部品を切り出して共用）・?ym 同期
import { recruitNoteOf } from "@/lib/nox/ui/month-nav"; // ★306-2 募集期間の注記・306-10 は staff-shift-manage
import { nextPeriodDefaults, overlappingPeriods, mdOf } from "@/lib/nox/shift/period"; // ★便 T（2026-09-18）: 期間の既定日付・重なり判定（純関数）
import Modal from "@/components/ui/modal";
import { notifyCast } from "@/lib/nox/people/notify"; // ★便 ON-3（0176 ★5 (d)・裁定413）: 確定シフトの追加／外し・送り返し・催促の通知（cast_notifications＋LINE）
import { notifRefOf, remindNoticeDefaultOf, remindWishBody, shiftAddedBody, shiftChangedBody, shiftProposedBody, shiftRemovedBody } from "@/lib/nox/people/notify-text";
import { PERIOD_NEEDS_NOTE, emptyPeriodNeedsForm, periodNeedRequiredOf, periodNeedRowsOf, periodNeedsChipOf, periodNeedsErrorOf, periodNeedsFormOf, type PeriodNeedRow, type PeriodNeedsForm } from "@/lib/nox/shift/period-needs"; // ★便 ON-3（0176 ★5 (a)）: 期間ごとの必要人数
import { declineTextOf } from "@/lib/nox/shift/decline"; // ★便 ON-3（0176 ★5 (c)・裁定406）: 辞退の印
import HmInput from "@/components/ui/hm-input"; // ★裁定318（便 X-9-2）: 時刻入力の共通部品（blur で HH:MM に正規化）
import { HM_FORMAT_ERR, hmRangeErrorOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import OkuriOutDialog from "@/components/nox/okuri-out-dialog";
import PenaltyDialog, { type PenaltyTarget } from "@/components/nox/penalty-dialog";
import { ACK_BUTTON, ackLineOf, castReportOf, castReportLineOf, contactHistoryHeadOf, contactHistoryLineOf, keepReportArgsOf, reportAckStateOf, reportChipTextOf, type ContactLike } from "@/lib/nox/shift/cast-report"; // ★便 ON-3（0176 ★3 I-4）: 確認済み・履歴 // ★便 X13-H H-17: 本人の遅刻・当欠の連絡 // ★便 X13-H H-16（裁定410）: 遅刻・当欠の罰金（委託のみ） // ★裁定317（便 X-9-3）: 退勤の「送り」金額ダイアログ
import { okuriDefaultAmountOf, type OkuriDefault } from "@/lib/nox/shift/okuri-default";
import { okuriAsks, okuriModeOf, okuriOutTextOf, okuriRecordedTextOf, type OkuriMode } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）: 送りの 4 方式
import StaffShiftBoard from "./staff-shift-board"; // ★C層② 面 b/c（スタッフ）
import CastAvatar from "@/components/ui/cast-avatar";
import DayAddPanel from "./day-add-panel";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { forecastDay, type ForecastComp, type DayForecast } from "@/lib/nox/labor-forecast";
import type { CompPlan } from "@/lib/nox/pay";
import IncentivePanel from "./incentive-panel";
import { BILLING_LOCKED_MSG, isBillingLocked } from "@/lib/billing/messages";

import { rpcErrJa as rpcErrJaCommon } from "@/lib/nox/ui/rpc-err"; // ★N2-2（2026-09-18）: 生の RPC 語の日本語化（写像に無い語は「処理できませんでした（コード: …）」）
import { daysInMonthOf, monthLastDayOf } from "@/lib/nox/month"; // ★便 X13-H H-9: 暦月の日付は 1 か所で（「-31」固定・翌月 0 日を撤去）
type Cast = { id: string; name: string; photo_updated_at: string | null; employment?: string | null; shift_request_mode?: "shift" | "off_only" | null }; // ★0154 D1: employment（用語の出し分け）・★裁定337（0167）: 個別の方式（null＝店の既定）
type Wish = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; kind?: string; created_at?: string }; // ★裁定406: 提出一覧＝種別（出勤／休み）と提出日
// ★SD V2-2（mig0101）: status 3値（planned→proposed→confirmed）＋wish_id（原型対比）＋source/period_id（自動配置）
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string; created_by: string; wish_id: string | null; source: string; period_id: string | null; declined_at?: string | null; decline_reason?: string | null }; // ★便 ON-3: 辞退（0176）
type Period = { id: string; start_date: string; end_date: string; wish_deadline: string | null; status: string };
// ★0125（裁定112-A）: Rules 型は配置ルールカード撤去に伴い削除（shift_rules 器は残置）。
// ★SC-8 ⑥: date を持つ（面4 が7日ぶんを読むため）。今日タブ本体は date === bizToday で絞って使う。
type Att = { id?: string; cast_id: string; date: string; status: string; eta: string | null; reason?: string | null; source?: string | null; updated_at?: string | null; ack_at?: string | null }; // ★便 ON-3（I-4）: id・ack_at // ★便 X13-H H-17: 連絡の理由・送り元・時刻
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
// ★裁定345（便 N1013b）: 語は lib/nox/shift/wish-state.ts の 4 段（planned／proposed＝採用・確認待ち・confirmed＝採用・確定）＝/mine と同じ純関数
const SHIFT_ST_LABEL: Record<string, string> = { planned: WISH_STATE_LABEL.accepted_wait, proposed: WISH_STATE_LABEL.accepted_wait, confirmed: WISH_STATE_LABEL.accepted_fixed };
const shiftStColor = (st: string) =>
  st === "confirmed" ? "var(--ok)" : st === "proposed" ? "var(--gold2)" : "var(--champ)";
// ★裁定135（v4.1 H9）: draft の表示語を「下書き」→「作成中」（モック逐語）。open/closed/published はモックに無い＝据え置き。
const PERIOD_ST_LABEL: Record<string, string> = { draft: "作成中", open: "募集中", closed: "締切", published: "公開済み" };
// ★便 T-5（裁定259）: 状態は 4 値＝素の select ではなく picker
const PERIOD_ST_OPTIONS = Object.entries(PERIOD_ST_LABEL) as ReadonlyArray<readonly [string, string]>; // ★306-7: 状態は SegSelect（4 択）に統一＝picker を使わない

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
  ["shukkin", "出勤"], ["late", "遅刻"], ["absent", "当欠"], ["off", "休み"],   // ★便 PR-1 R-4（裁定417）: 「同伴」を撤去＝同伴は伝票（check_nominations.is_dohan）が正本・0175 v2 で attendance の値域からも外す
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

// ★B4-c 裁定224（H39）: 変更履歴の行（audit_logs・owner 限定 RLS＝manager 以下は描かない）
type AuditRow = { id: string; action: string; target: string | null; actor_user_id: string | null; at: string; after_json: Record<string, unknown> | null };
const SHIFT_ACTION_LABEL: Record<string, string> = {
  shift_set: "時間変更・追加", shift_remove: "取消", shift_confirm_bulk: "確定", shift_cast_confirm: "キャスト確認",
  shift_propose: "確認依頼", shift_wish_decide: "希望の採否", shift_bulk_set_daily: "一括配置", shift_bulk_set: "一括配置",
  shift_auto_apply: "自動配置", shift_auto_clear: "自動配置の解除", shift_period_set: "期間設定", shift_period_remove: "期間削除",
  shift_wish_submit: "希望提出", shift_wish_withdraw: "希望取下げ",
};

export default function ShiftBoard({ storeId, casts, isManagerUp, isOwner = false, role = "", cutoff, castConfirm: castConfirmLegacy = false, bonusOn = true, penaltiesOn = true }: { storeId: string; casts: Cast[]; isManagerUp: boolean; isOwner?: boolean; role?: string; cutoff: string; castConfirm?: boolean; bonusOn?: boolean; penaltiesOn?: boolean }) { // ★GV-3（便 N1013b B-8）: penaltiesOn＝店の制度「精算調整・控除」（sys_penalties）＝OFF の店は今日タブの「減額」を出さない
  void castConfirmLegacy; // ★裁定380（GV-B W-9）: 店設定 shift_cast_confirm は UI から廃止＝値は読んでも使わない（自動確定時間は 0172 の店設定キーへ）
  const castConfirm = true; // ★裁定380: 3 本道（希望どおり採用＝即確定／調整して確定／調整して送り返す＝キャスト確認待ち）。送り返し（proposed）の語は常に「キャスト確認待ち」
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  // ★便 ON-3（0176）: 期間ごとの必要人数（shift_period_needs）・連絡の履歴（attendance_contacts）・期間フォームの必要人数 7 欄・催促／一括お知らせ
  const [periodNeeds, setPeriodNeeds] = useState<PeriodNeedRow[]>([]);
  const [contacts, setContacts] = useState<(ContactLike & { cast_id: string; biz_date: string })[]>([]);
  const [pNeeds, setPNeeds] = useState<PeriodNeedsForm>(emptyPeriodNeedsForm());
  const [busyRemind, setBusyRemind] = useState<string | null>(null);
  const [remindTarget, setRemindTarget] = useState<{ period: Period; castIds: string[]; title: string; body: string } | null>(null);
  // ★SD V2-2: 表示月の wishes 全 status（原型対比・4段フロー）／period／配置ルール
  const [wishAll, setWishAll] = useState<Wish[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  // ★便 T-1: 既定日付と重なり判定は「表示月」ではなく店の全期間で見る（periods は表示月に重なる分だけ）
  const [periodsAll, setPeriodsAll] = useState<(Period & { store_id: string })[]>([]);
  // ★0125（裁定112-A）: 配置ルールカード撤去に伴い rules state も撤去（shift_rules 器は残置）。
  // ★SD V2-2: 計画フォーム（pEditId 1つで新規/編集を兼用＝seats-board と同じ流儀）
  const [pEditId, setPEditId] = useState<string | null>(null);
  const [pStart, setPStart] = useState("");
  const [pEnd, setPEnd] = useState("");
  const [pDeadline, setPDeadline] = useState("");
  const [pStatus, setPStatus] = useState("open"); // ★裁定406: 既定＝募集中（「作成して募集を始める」・作成中にしたいときは SegSelect）
  // ★便 T（2026-09-18）: 期間フォームの結果はカード内に出す（T-2＝ページ最上部の共有枠 msg には出さない）・作成した期間の強調（T-4）・
  //   既定日付は「手で触るまで」既存期間から埋める（T-1・pTouched）
  const [pMsg, setPMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pNewId, setPNewId] = useState<string | null>(null);
  const [pTouched, setPTouched] = useState(false);
  // ★0125（裁定112-A）: 自動配置 UI 撤去に伴い selPeriodId も撤去（planbar は periods[0] を現行計画とする）
  // ★DP-R S9: 配置ビューの表示切替（モック .plan-tools > .seg = 月カレンダー / スタッフ別）
  const [planView, setPlanView] = useState<"cal" | "staff">("cal");
  // ★R4（Agoora 裁定）: 確定シフトタブ＝**人ベースの月カレンダー**を既定にし、
  //   現行の一覧は「表で見る」トグルで残置する（表示のみ・RPC 非改変）。
  const [rosterView, setRosterView] = useState<"cal" | "table">("cal");
  // ★裁定253 R9（2026-09-14）: 確定シフト下部の変更履歴＝初期は閉じる（見出しクリックで開閉・件数は閉じていても見出しに出す）
  const [histOpen, setHistOpen] = useState(false);
  // ★C層② H3（設計書 v1 §4・横断 §4）: 対象切替「キャスト／スタッフ」＝flag_enabled('staff_shift', 自店) が true のときだけ出す。
  //   off＝切替そのものが無い（現行のまま）。B4 で入れた cast の面は不触。読取 1（RPC・STABLE）。
  const [staffFlag, setStaffFlag] = useState(false);
  const [target, setTarget] = useState<"cast" | "staff">("cast");
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.rpc("flag_enabled", { p_key: "staff_shift", p_store_id: storeId });
      if (alive) setStaffFlag(data === true);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  // ★B4-c 裁定224（H39）: 表示月のシフト系 audit_logs（owner のみ読取 1・RLS は owner 限定のまま）
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  // ★B4-b 裁定219（H20）: 承認待ち表の並び＝日付順（既定・現行）／人ごと（モック 119-127 行）
  const [queueGroup, setQueueGroup] = useState<"date" | "cast">("cast"); // ★裁定380: 既定＝キャスト別
  // ★便 SH-UI-c2 C2-17 ①: 「承認待ちシフト」は既定で畳む（1 行の見出し）。開閉は端末に記憶（localStorage nox.shift.queueOpen）
  const [queueOpen, setQueueOpen] = useState(false);
  useEffect(() => { try { setQueueOpen(localStorage.getItem("nox.shift.queueOpen") === "1"); } catch { /* 記憶なし＝畳む */ } }, []);
  const toggleQueue = () => setQueueOpen((v) => { const nv = !v; try { localStorage.setItem("nox.shift.queueOpen", nv ? "1" : "0"); } catch { /* 記憶できない端末 */ } return nv; });
  const [qClosed, setQClosed] = useState<Set<string>>(new Set()); // ★裁定380: 折りたたんだキャスト
  // ★裁定380: 希望の調整モーダル（採用→shift_set で時間→確定 or 送り返し＝shift_propose。RPC は既存 3 本・新設 0）
  const [adjWish, setAdjWish] = useState<Wish | null>(null);
  const [wStart, setWStart] = useState("");
  const [wEnd, setWEnd] = useState("");
  const [wBusy, setWBusy] = useState(false);
  // ★SC-7（裁定52'）: 確定シフトタブの日詳細をモーダルへ。
  //   ★selDate はそのまま使う（カレンダーの選択状態＝sel ハイライトと日詳細の対象は同じ日でよい）。
  //     モーダル用に持つのは「どの面のを開いているか」の1本だけ＝日付を二重管理しない。
  //   ★二重モーダル対策（C-12）: 「時間を調整」を押したら**日詳細を閉じてから**調整モーダルを開く。
  //     z-index は増やさない（重ねないので増やす必要がない）。
  //   ★SC-8 ③-0（教訓33）: boolean ではなく**面識別子**を持つ。boolean だと「どの面のモーダルか」を
  //     tab 判定で外から補うことになり、条件を1つ落とすと2面ぶんが同時に描画される（実装中に実測）。
  //     state が1値しか取れない形にすれば、排他は型で保証される（"" = 閉じている）。
  //   ★SC-8 ⑦: "today" を union から落とした＝今日タブの日詳細モーダル（面4）を撤去し、
  //     7日ストリップを本体の日付セレクタにしたため、開く口が無くなった（死に値を残さない）。
  const [dayModal, setDayModal] = useState<"" | "roster" | "calendar" | "build">("");
  // ★裁定121: 日詳細モーダル内の追加バッファ（DayAddPanel）が未保存なら、閉じる操作は破棄確認を挟む。
  //   割当／配置の2面共通。閉じる口（×・overlay・他モーダルへの遷移）はすべて closeDay を通す。
  const [dayDirty, setDayDirty] = useState(false);
  const closeDay = (): boolean => {
    if (dayDirty && !window.confirm("追加中のキャストがあります。保存せずに閉じますか？（入力内容は破棄されます）")) return false;
    setDayModal(""); setDayDirty(false);
    return true;
  };
  // ★0125（裁定112-A）: preview/autoBusy/rConsec/rMonthH（自動配置・配置ルール入力）は UI 撤去に伴い削除。
  // ★SC-8 ⑦: 今日タブが向いている日。7日ストリップ（今日〜今日+6）で選び直せる。
  //   ★selDate とは**別 state**＝面1〜面3（仮シフト／確定シフト／配置ビュー）の月カレンダーと
  //     混ぜない（あちらの月移動でこの面の対象日が動くのを防ぐ）。
  const [todayDate, setTodayDate] = useState(bizToday);
  // ★R1 の裁定を SC-8 ⑦ で更新。出勤記録まわりの日付は3点に分かれる:
  //   1) 読み取り＝**今日〜今日+6日の7日**（ストリップで選んだ日の状態を出すため）。
  //   2) 書き込み＝**今日のみ**（attendance_set は RPC 側に未来日ガードが無く、明日以降の
  //      「出勤」を記録できてしまうため UI で止める＝canRecord）。
  //   3) 過去日の修正＝**別途裁定**（ストリップは過去日を出さない・旧「出勤板」の日付ピッカーは
  //      戻していない。必要になったら勝手に別画面を作らず裁定を取る）。
  const attDate = bizToday;
  const [atts, setAtts] = useState<Att[]>([]);
  const [dohanSeats, setDohanSeats] = useState<Map<string, string[]>>(new Map()); // ★便 PR-1 R-4（裁定417）: 表示日の営業日に同伴の名簿行がある伝票（cast → 席名）
  // ★B4-a 裁定222（H32）: 表示日の punches（自店・営業日範囲）→ cast ごとの最終 'in' 時刻（HH:MM）。読取 1・表示専用。
  const [punchIn, setPunchIn] = useState<Map<string, string>>(new Map());
  // ★裁定257 R20-a: 表示日の打刻行（in／out とも）＝matchPunches の入力。R20-b: 退勤（punch_proxy）後の再読込トリガ
  const [punchRows, setPunchRows] = useState<(PunchRow & { cast_id: string })[]>([]);
  // ★AT2: cast ごとの最初の in／最後の out（punch-match S1 と同じ採用規則・表示専用）
  const [punchIO, setPunchIO] = useState<Map<string, { inHm: string | null; outHm: string | null }>>(new Map());
  const [punchTick, setPunchTick] = useState(0);
  // ★0154 D1: 修正モーダルの対象（cast・区分・直す打刻）と、店側 warn 用の「異議あり」行（approved ∧ disputed・RLS＝自店 owner/manager）
  // ★裁定310（2026-09-28・便 X-2）: 旧 corr（行の「出勤を修正／退勤を修正」→別モーダル）は廃止＝「調整」モーダルのタブ①に一本化（adjTab／adjCorrKind）
  const [punchRef, setPunchRef] = useState<Map<string, { inId: string | null; inIso: string | null; outId: string | null; outIso: string | null }>>(new Map());
  const [disputed, setDisputed] = useState<(CorrectionRow & { id: string })[]>([]);
  // ★裁定297-1: 未決裁（pending）の一覧と決裁モーダルの対象（承認／却下）
  const [pending, setPending] = useState<(CorrectionRow & { id: string })[]>([]);
  const [decideRow, setDecideRow] = useState<{ row: CorrectionRow & { id: string }; approve: boolean } | null>(null);
  // ★0154 D4: 精算調整モーダルの対象（委託の遅刻／当欠／早退が検知された行）
  const [settle, setSettle] = useState<{ castId: string; shiftId: string; target: SettlementTarget } | null>(null);
  // ★裁定257 R20-a: penalty_config.late_grace_min（client は SELECT のみ・comp-sections と同じ経路・取れなければ既定 10）
  const [lateGraceMin, setLateGraceMin] = useState<number>(LATE_GRACE_MIN_DEFAULT);
  const [msg, setMsg] = useState<string | null>(null);
  // ── UI刷新v2 段S-1: サブナビ（今日/カレンダー/シフト作成）・表示月・選択日 ──
  //   すべて presentation（どの範囲を読むか・どこを見せるか）＝RPC/RLS/mig 非改変。
  // 段0R その3: タブ5本（モック .subnav 逐語）。収容は S-1 指示どおり＝
  //   today=出勤板 / calendar=月カレンダー+日詳細 / build=確定シフト登録+必要人数 /
   // queue=希望の審査（承認待ち・件数バッジ） / roster=確定シフト一覧
  const [tab, setTab] = useState<ShiftTab>("today"); // ★裁定406: 7 キー（旧 5＋submit／publish）。初期値は URL（?tab=make&step=n）から mount 後に
  const [focusPeriodId, setFocusPeriodId] = useState<string | null>(null); // ★裁定406: 手順②〜④・確定シフトで選んでいる期間（URL の period）
  const urlTabPending = useRef<ShiftTab | null>(null); // URL から読んだキーが state に反映されるまで URL に書かない（dev StrictMode の二重 effect で ?tab=today に戻る事故の防止）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tab")) { const t0 = tabFromSearch(window.location.search); urlTabPending.current = t0; setTab(t0); }
    if (sp.get("period")) setFocusPeriodId(sp.get("period"));
  }, []);
  useEffect(() => { // URL に写す（他のクエリは保持・GV-63 と同じ方針＝history.replaceState）
    if (typeof window === "undefined") return;
    if (urlTabPending.current && tab !== urlTabPending.current) return;
    urlTabPending.current = null;
    const next = searchOfTab(window.location.search, tab, focusPeriodId);
    if (next !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${next}`);
  }, [tab, focusPeriodId]);
  // ★便 T-3（裁定281-4）: タブ切替で共有メッセージとカード内メッセージを消す（残留の解消＝1 箇所）
  useEffect(() => { setMsg(null); setPMsg(null); }, [tab]);
  // ★便 T-1: 新規フォームの既定＝既存期間の最終日の翌日から同じ長さ（無ければ半月）・締切は開始の前日。手で触ったら上書きしない
  useEffect(() => {
    if (pEditId || pTouched) return;
    const d = nextPeriodDefaults(periodsAll, bizToday);
    setPStart(d.start); setPEnd(d.end); setPDeadline(d.deadline);
  }, [periodsAll, pEditId, pTouched, bizToday]);
  const [month, setMonth] = useState(bizToday.slice(0, 7)); // 'YYYY-MM'
  const [selDate, setSelDate] = useState(bizToday);
  // B-5②: 営業時間マスタ（行なし=未設定・判定なし。cast 0行だが本画面は staff 以上のみ到達）
  const [bhRows, setBhRows] = useState<BusinessHourRow[]>([]);
  // ★便 NR-1 B（裁定428 候補・2026-10-26）: 定休日（store_business_hours.is_closed）の曜日集合。カレンダー＝地色グレー「定休日」・必要人数 0 固定・不足日と予想人件費から除外・
  //   新規配置／希望は従来どおり UI＋RPC 'closed day' でブロック・既にある行は赤バッジ「定休日」（店長が消す／残すを選ぶ＝自動削除なし）
  const closedDows = new Set(bhRows.filter((r) => r.is_closed).map((r) => r.dow));
  const isClosedDay = (ymd: string) => closedDows.has(dowOf(ymd));
  // 新規シフトフォーム（manager）
  // ★SC-1（裁定42）: 手動追加フォームは ShiftAddForm へ切り出した。
  //   親が持つのは「どの面から・どの日付・どの状態で開くか」だけ（フォームの6 state は子の内部）。
  const [addDate, setAddDate] = useState(bizToday);
  const [addStatus, setAddStatus] = useState("planned");
  // ★DP3 P2（2026-08-21・裁定 DP3-②）: 手動シフト追加をモーダルへ（モック `planShiftDialog`）。
  const [addModal, setAddModal] = useState(false);
  // ★裁定108: 手動追加は2段＝①CastPicker（addPicker）→②キャスト固定フォーム（addCast を確定して addModal）。
  //   表の行「＋」は①を飛ばして直開き（その行のキャストで固定）。RPC 呼び形は不変（shift_set 6引数）。
  // ★0125（裁定112）: addPicker（2段ピッカー）は廃止＝モーダル左ペインの CastPicker へ統合。
  const [addCast, setAddCast] = useState<Cast | null>(null);
  // ★DP3 P2（裁定 DP3-③）: 勤務時間の調整モーダル（モック `adjustDialog`）。
  //   ★「元の希望との対比」はこのモーダルには**入れない**（裁定 DP3-③ のスコープ判断＝
  //     対比は d＝シフト深部レーンで消化）。
  //     ★理由の訂正（2026-08-28 実測）: 以前ここには「`shifts` が wish_id を保持していないため
  //       出せない」と書いていたが**誤り**。mig0101 で `shifts.wish_id` ＋
  //       `shifts_wish_id_fkey → shift_wishes(id)` が入っており、本ファイル自身が一覧側で
  //       `s.wish_id → wishAll` を引いて「申請時間」を出している。
  //       ＝**出せるが、このモーダルには置かない**が正しい（docs/dp/survey_6-4.md）。
  //   ★メモ欄（モック `adjustNote`）は**そもそも出せない**＝`shifts` にも `shift_wishes` にも
  //     メモ列が無い（実測: shifts 14列 / shift_wishes 12列）。こちらの理由は従来どおり有効。
  const [adjTarget, setAdjTarget] = useState<Shift | null>(null);
  // ★裁定310（2026-09-28・便 X-2）: 「調整」モーダルはタブ 2 つ＝①出退勤（打刻・既定）②確定シフトの時間。①は表示日（todayDate）の打刻が読めている行だけ
  //   （他ビューから開いた別日の行は②のみ）。①の修正＝既存 punch_correction_request（PunchCorrectionForm・理由必須・承認導線は現行）。
  const [adjTab, setAdjTab] = useState<"punch" | "shift">("punch");
  const [adjCorrKind, setAdjCorrKind] = useState<PunchKind | null>(null);
  useEffect(() => {
    if (adjTarget) { setAdjTab(adjTarget.date === todayDate ? "punch" : "shift"); setAdjCorrKind(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjTarget]);
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
  //         staff（スタッフ）は 0行になる。出しても必ず「¥0・時給未設定 N人」になり誤情報にしかならない。
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
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status, kind, created_at")
      .eq("status", "pending").order("date");
    // 段S-1: 月カレンダー化に伴い取得範囲を「今日から30件」→「表示月の全日」へ変更。
    //   ★client 直 SELECT の範囲変更のみ（shifts の SELECT RLS はそのまま＝店スコープ）。
    //   今日を含む月以外を見ているときも「今日」タブの KPI が出せるよう、当月と表示月の和を取る。
    const monthFrom = `${month}-01`;
    const monthTo = monthLastDayOf(month); // 当月末日（★便 X13-H H-9）
    // ★SC-7（裁定54）: to を「今日+6日」まで伸ばす。
    //   直近7日ストリップ（裁定50'）が月末を跨ぐと、翌月分の shifts が範囲外になり
    //   assigned=0 のまま「不足」と誤表示するため（required は曜日ベースで範囲に依らない）。
    //   ★from は現状維持＝過去方向には広げない（要らないデータを取らない）。
    //   ★確定シフトタブの表に翌月分が数行混ざるのは**意図した変化**＝見出し「確定シフト（今後）」と整合する
    //     （従来は月末に「今後」を名乗りながら翌月が見えなかった）。
    const stripEnd = addDays(bizToday, 6);
    const from = monthFrom < bizToday ? monthFrom : bizToday;
    const toBase = monthTo > bizToday ? monthTo : bizToday;
    const to = toBase > stripEnd ? toBase : stripEnd;
    // E8-4 #10: created_by を追加取得（確定シフト一覧の「登録者」列・下で users 名を1クエリ解決）
    const { data: ss } = await supabase
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status, created_by, wish_id, source, period_id, declined_at, decline_reason")
      .gte("date", from).lte("date", to).order("date").limit(2000);
    // ★SD V2-2: 表示月の wishes 全 status（原型対比 wish_id→shift_wishes ＋ 4段フローの希望件数）。
    //   queue 用の pending 全期間クエリとは別物（範囲・status とも異なる）。RLS は同じ店スコープ。
    const { data: wAll } = await supabase
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status, kind, created_at")
      .gte("date", from).lte("date", to).limit(2000);
    // ★SD V2-2: 表示月に重なる period ＋ 店の配置ルール（cast は RLS で 0行＝isManagerUp でしか描かない）
    const { data: ps2 } = await supabase
      .from("shift_periods").select("id, start_date, end_date, wish_deadline, status")
      .lte("start_date", to).gte("end_date", from).order("start_date");
    // ★便 T-1: 店の全期間（RLS＝店スコープ・owner は全店＝store_id で絞る）＝新規の既定日付と重なり判定の材料
    const { data: psAll } = await supabase
      .from("shift_periods").select("id, store_id, start_date, end_date, wish_deadline, status")
      .order("start_date").limit(500);
    setPeriodsAll(((psAll ?? []) as (Period & { store_id: string })[]).filter((p) => p.store_id === storeId));
    // ★0125（裁定112-A）: shift_rules の読取は撤去（配置ルールカード撤去・器は残置）。
    // E8-4（mig0095）: 時間帯バンド列を取得（dow → from_min の昇順＝バンド表示順）
    const { data: ns } = await supabase.from("staffing_needs")
      .select("id, dow, required, from_min, to_min").order("dow").order("from_min");
    // B-5②: 営業時間（シフトは date 直判定＝cutoff 不要なので stores.settings_json は読まない）
    // ★便 ON-3（0176 ★5 (a)）: 期間ごとの必要人数（RLS＝店スコープ・owner は store_id で絞る）
    const { data: pn } = await supabase.from("shift_period_needs").select("period_id, dow, required").eq("store_id", storeId);
    setPeriodNeeds((pn ?? []) as PeriodNeedRow[]);
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
    setWishAll((wAll ?? []) as Wish[]);
    setPeriods((ps2 ?? []) as Period[]);
    setBhRows((bh ?? []) as BusinessHourRow[]);
    // E8-4 #10: 登録者名の解決（E8-2 #8 の closed_by→users.name と同じ1クエリ流儀・失敗時は「—」に落ちるだけ）
    const uids = Array.from(new Set(((ss ?? []) as Shift[]).map((s) => s.created_by).filter(Boolean)));
    // ★B4-c 裁定224（H39）: owner のときだけ表示月のシフト系 action を読む（manager 以下は 0 行にすらしない＝要素非描画）。
    //   actor は下の users 1 クエリへ相乗り（新規クエリは audit_logs の 1 本だけ）。
    let audits: AuditRow[] = [];
    if (isOwner) {
      const { data: al } = await supabase.from("audit_logs")
        .select("id, action, target, actor_user_id, at, after_json")
        .eq("store_id", storeId).like("action", "shift%")
        .gte("at", `${monthFrom}T00:00:00+09:00`).lt("at", `${addDays(monthTo, 1)}T00:00:00+09:00`)
        .order("at", { ascending: false }).limit(60);
      audits = (al ?? []) as AuditRow[];
      for (const a of audits) if (a.actor_user_id && !uids.includes(a.actor_user_id)) uids.push(a.actor_user_id);
    }
    setAuditRows(audits);
    if (uids.length > 0) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", uids);
      setUserNames(new Map(((us ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])));
    } else {
      setUserNames(new Map());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday, month]);

  // ★SC-8 ⑥: 単日 eq から範囲 gte/lte へ（引数 d を起点に7日＝裁定54 の stripEnd と同式）。
  //   date を select に足したので、今日タブ本体は date === bizToday で絞って従来どおり使う。
  const loadAtt = useCallback(async (d: string) => {
    const { data } = await supabase.from("attendance").select("id, cast_id, date, status, eta, reason, source, updated_at, ack_at") // ★便 ON-3（I-4）: +id／ack_at
      .gte("date", d).lte("date", addDays(d, 6));
    setAtts((data ?? []) as Att[]);
    // ★便 ON-3（0176 ★3 I-4）: 同日の複数連絡の履歴（本人／店）
    const { data: cs } = await supabase.from("attendance_contacts").select("cast_id, biz_date, kind, eta, reason, source, created_at")
      .gte("biz_date", d).lte("biz_date", addDays(d, 6)).order("created_at");
    setContacts((cs ?? []) as (ContactLike & { cast_id: string; biz_date: string })[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveReload(load); // ★便 GV-C C-12
  useEffect(() => { void loadAtt(attDate); }, [attDate, loadAtt]);
  // ★便 PR-1 R-4（裁定417）: 同伴の正本＝伝票。表示日の営業日 [cutoff, 翌 cutoff) に同伴（is_dohan）の名簿行がある伝票（void 除く）→ cast → 席名。伝票で外せば印も消える
  const loadDohan = useCallback(async (d: string) => {
    const startIso = new Date(`${d}T${cutoff}:00+09:00`).toISOString(), endIso = new Date(`${addDays(d, 1)}T${cutoff}:00+09:00`).toISOString();
    const { data } = await supabase.from("check_nominations").select("cast_id, ended_at, checks!inner(started_at, status, store_id, seats(name))")
      .eq("is_dohan", true).eq("checks.store_id", storeId).neq("checks.status", "void").gte("checks.started_at", startIso).lt("checks.started_at", endIso);
    type Row = { cast_id: string; ended_at: string | null; checks: { status: string; seats: { name: string } | { name: string }[] | null } | { status: string; seats: { name: string } | { name: string }[] | null }[] | null };
    setDohanSeats(dohanSeatsOf(((data ?? []) as Row[]).map((r) => { const ck = Array.isArray(r.checks) ? r.checks[0] : r.checks; const st = ck ? (Array.isArray(ck.seats) ? ck.seats[0] : ck.seats) : null; return { cast_id: r.cast_id, seat_name: st?.name ?? null, ended_at: r.ended_at, check_status: ck?.status ?? null }; })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoff, storeId]);
  useEffect(() => { void loadDohan(attDate); }, [attDate, loadDohan]);
  useLiveReload(() => { void loadDohan(attDate); }); // 伝票側の変更（同伴 ON／OFF）に追随

  async function decide(wishId: string, accept: boolean) {
    setMsg(null);
    const { data: sid, error } = await supabase.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: accept });
    // ★裁定345: shift_cast_confirm OFF の店は「採用＝確定」＝採用で生成された shift（planned）をその場で shift_confirm_bulk（1 件）。RPC 不触・audit は既存 2 本
    let fixErr: string | null = null;
    if (!error && accept && typeof sid === "string") { // ★裁定380: 希望どおり採用＝即確定（店設定に依らない）
      const { error: e2 } = await supabase.rpc("shift_confirm_bulk", { p_shift_ids: [sid] });
      if (e2) fixErr = bulkErrJa(e2.message);
      else { const w = wishes.find((x) => x.id === wishId); if (w) void notifyCast(supabase, { castId: w.cast_id, kind: "shift_added", body: shiftAddedBody(w.date, w.start_hm, w.end_hm), ref: notifRefOf("shifts", sid) }); } // ★便 ON-3
    }
    // B-5②: 採用は RPC 二層目でも closed day 拒否（raise=ロールバックで wish は pending 維持・見送りは可＝非対称）
    setMsg(error
      ? (accept && error.message.includes("closed day")
          ? "この希望日は定休日に設定されています。採用できません（見送りは可能です）"
          : rpcErrJa(error.message))
      : accept ? (fixErr ? `採用しましたが確定に失敗: ${fixErr}` : "希望どおり採用し確定しました") : "見送りました");
    await load();
  }
  // ★N4（対応表 H19・B層＝器あり UI なし）: 希望の一括承認＝**新 RPC は作らない**。表示中の pending 希望を
  //   1件ずつ shift_wish_decide(accept) で順に発行するループ（定休日の希望は RPC が 'closed day' で拒否するため
  //   事前に除外＝行の「希望通り承認」と同じ disabled 規則）。途中失敗は件数で報告し、残りは続行する。
  async function approveAllWishes(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`表示中の希望 ${ids.length}件を希望どおり一括採用（即確定）しますか？`)) return; // ★裁定380
    setMsg(null);
    let ok = 0; const errs: string[] = []; const sids: string[] = [];
    for (const id of ids) {
      const { data: sid, error } = await supabase.rpc("shift_wish_decide", { p_wish_id: id, p_accept: true });
      if (error) errs.push(rpcErrJa(error.message)); else { ok++; if (typeof sid === "string") sids.push(sid); }
    }
    let fixed = 0; let fixErr: string | null = null;
    for (const chunk of chunkOf(sids, 62)) {
      const { data: n, error } = await supabase.rpc("shift_confirm_bulk", { p_shift_ids: chunk });
      if (error) { fixErr = bulkErrJa(error.message); break; }
      fixed += Number(n ?? chunk.length);
    }
    if (!fixErr) for (const w of wishes.filter((x) => ids.includes(x.id))) await notifyCast(supabase, { castId: w.cast_id, kind: "shift_added", body: shiftAddedBody(w.date, w.start_hm, w.end_hm), ref: notifRefOf("shift_periods", w.id) }); // ★便 ON-3: 一括採用＝1 人ずつ通知
    setMsg(errs.length === 0 && !fixErr ? `${ok}件を希望どおり採用し確定しました`
      : `${ok}件を採用（確定 ${fixed}件）${errs.length > 0 ? `・${errs.length}件は失敗（${errs[0]}）` : ""}${fixErr ? `・確定に失敗: ${fixErr}` : ""}`); // ★裁定380
    await load();
  }
  // ★便 ON-3（0176 ★3 I-4）: 連絡を確認済みに（attendance_ack＝owner／自店 manager／staff・二重は no-op）
  async function ackReport(attId: string) {
    setMsg(null);
    const { error } = await supabase.rpc("attendance_ack", { p_attendance_id: attId });
    if (error) setMsg(rpcErrJaCommon(error.message));
    await loadAtt(attDate);
  }
  const contactsOf = (castId: string, date: string) => contacts.filter((c) => c.cast_id === castId && c.biz_date === date);
  // ★便 ON-3（0176 ★5 (d)・C2-13）: 催促＝本人へ通知（kind other）＋LINE（連携済みなら）
  async function remindOne(castId: string, pe: Period) {
    setBusyRemind(castId); setMsg(null);
    const r = await notifyCast(supabase, { castId, kind: "other", body: remindWishBody(pe), ref: notifRefOf("shift_periods", pe.id) });
    setBusyRemind(null);
    setMsg(r.ok ? `${castName(castId)} に催促を送りました${r.line === "sent" ? "（LINE にも）" : ""}` : `催促に失敗: ${rpcErrJaCommon(r.err ?? "")}`);
  }
  // ★便 ON-3（0176 ★5 (e)）: 未提出者への一括お知らせ＝notice_create_targets（宛先つき・掲載期限＝希望締切）＋LINE（連携済みの人にだけ・route が未連携は 204）
  async function sendRemindAll() {
    if (!remindTarget) return;
    setBusyRemind("all"); setMsg(null);
    const { error } = await supabase.rpc("notice_create_targets", { p_title: remindTarget.title, p_body: remindTarget.body, p_cast_ids: remindTarget.castIds, p_until: remindTarget.period.wish_deadline });
    if (error) { setBusyRemind(null); setMsg(`お知らせの送信に失敗: ${rpcErrJaCommon(error.message)}`); return; }
    let line = 0;
    for (const id of remindTarget.castIds) { try { const res = await fetch("/api/line/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ castId: id, text: `${remindTarget.title}\n${remindTarget.body}`, kind: "other" }) }); if (res.ok && res.status !== 204) line++; } catch { /* LINE は任意 */ } }
    setBusyRemind(null); setRemindTarget(null);
    setMsg(`未提出の ${remindTarget.castIds.length} 人にお知らせを送りました${line > 0 ? `（LINE ${line} 人）` : ""}`);
  }

  // ★N4（対応表 H30・B層）: shift_remove（0103 裁定D）の UI 結線＝計画中／確認待ちの行を個別削除。
  //   confirmed で出勤記録がある日は RPC が 'has attendance' で拒否。wish 由来の行は wish が pending に戻る（RPC 側）。
  async function removeShift(s: Shift) {
    if (!confirm(`${castName(s.cast_id)} ${s.date} ${fmtWin(s.start_hm, s.end_hm)} のシフトを削除しますか？${s.wish_id ? "（元の希望は「キャスト希望」に戻ります）" : ""}`)) return;
    setMsg(null);
    const { error } = await supabase.rpc("shift_remove", { p_id: s.id });
    if (!error && s.status === "confirmed") void notifyCast(supabase, { castId: s.cast_id, kind: "shift_removed", body: shiftRemovedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf("shifts", s.id) }); // ★便 ON-3（0176 ★5 (d)）: 確定シフトの外し＝本人へ通知
    setMsg(error
      ? (error.message.includes("has attendance") ? "出勤記録がある日のシフトは削除できません" : `削除に失敗: ${rpcErrJa(error.message)}`)
      : s.wish_id ? "シフトを削除し、希望をキャスト希望へ戻しました" : "シフトを削除しました");
    await load();
  }


  async function confirmShift(s: Shift) {
    setMsg(null);
    // B-5②: update 経路（date 不変でも RPC が p_date を再検証＝作成後に定休日化された場合はここで拒否される）
    const { error } = await supabase.rpc("shift_set", {
      p_id: s.id, p_cast_id: s.cast_id, p_date: s.date, p_start_hm: s.start_hm, p_end_hm: s.end_hm, p_status: "confirmed",
    });
    if (!error) void notifyCast(supabase, { castId: s.cast_id, kind: "shift_added", body: shiftAddedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf("shifts", s.id) }); // ★便 ON-3: 確定＝本人へ通知
    setMsg(error ? `${PROXY_CONFIRM_LABEL}に失敗: ${rpcErrJa(error.message)}` : `${PROXY_CONFIRM_LABEL}しました`); // ★裁定345: 「承認」→「代行確定」
    await load();
  }

  // ★DP3 P2（裁定 DP3-③）: 勤務時間の調整。**新しい RPC は作らない**＝既存 `shift_set` の update 経路
  //   （`confirmShift` と同じ6引数・同じ順序）に、開始/終了だけ差し替えた値を渡す。
  //   ★status は**現在値を据え置く**（調整で予定→確定へ勝手に昇格させない）。
  //   ★定休日の事前ブロックも `addShift` と同じ規則（二層目は RPC 'closed day'）。
  async function adjustShift(next: "keep" | "confirm" | "sendback" = "keep") { // ★裁定380: keep＝確定済みの時間だけ／confirm＝調整して確定／sendback＝調整して送り返す（planned→shift_propose）
    if (!adjTarget) return;
    setMsg(null);
    // ★裁定318（便 X-9-2）: 検証は正規化後（開始 0〜23 時・終了 0〜47 時）
    const st = normalizeHHMM(aStart, 23), en = normalizeHHMM(aEnd);
    if (!st || !en) { setMsg(HM_FORMAT_ERR); return; }
    if (shiftHoursStatus(adjTarget.date, st, en, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    const { error } = await supabase.rpc("shift_set", {
      p_id: adjTarget.id, p_cast_id: adjTarget.cast_id, p_date: adjTarget.date, p_start_hm: st, p_end_hm: en,
      p_status: next === "confirm" ? "confirmed" : next === "sendback" ? "planned" : adjTarget.status,
    });
    let e3: string | null = null;
    if (!error && next === "sendback") { const { error: eP } = await supabase.rpc("shift_propose", { p_shift_ids: [adjTarget.id] }); if (eP) e3 = rpcErrJa(eP.message); }
    if (!error && !e3) { // ★便 ON-3（0176 ★5 (d)）: 確定＝追加・送り返し＝確認のお願い・確定済みの時間変更＝変更
      const k = next === "confirm" ? "shift_added" : next === "sendback" ? "shift_proposed" : adjTarget.status === "confirmed" && (adjTarget.start_hm !== st || adjTarget.end_hm !== en) ? "shift_changed" : null;
      if (k) void notifyCast(supabase, { castId: adjTarget.cast_id, kind: k, body: k === "shift_changed" ? shiftChangedBody(adjTarget.date, { start: adjTarget.start_hm, end: adjTarget.end_hm }, { start: st, end: en }) : k === "shift_proposed" ? shiftProposedBody(adjTarget.date, st, en) : shiftAddedBody(adjTarget.date, st, en), ref: notifRefOf("shifts", adjTarget.id) });
    }
    setMsg(error ? `勤務時間の調整に失敗: ${rpcErrJa(error.message)}` : e3 ? `調整しましたが送り返しに失敗: ${e3}`
      : next === "confirm" ? "調整して確定しました" : next === "sendback" ? "調整してキャストへ送り返しました（確認待ち）" : "勤務時間を調整しました");
    if (!error && !e3) setAdjTarget(null);
    await load();
  }
  // ★裁定380（GV-B W-9）: 希望の調整＝採用（shift_wish_decide）→生成 shift の時間を shift_set →「調整して確定」は confirmed／「調整して送り返す」は planned→shift_propose（キャスト確認待ち）
  async function adjustWish(sendBack: boolean) {
    if (!adjWish || wBusy) return;
    setMsg(null);
    const st = normalizeHHMM(wStart, 23), en = normalizeHHMM(wEnd);
    if (!st || !en) { setMsg(HM_FORMAT_ERR); return; }
    if (shiftHoursStatus(adjWish.date, st, en, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    setWBusy(true);
    const { data: sid, error } = await supabase.rpc("shift_wish_decide", { p_wish_id: adjWish.id, p_accept: true });
    if (error || typeof sid !== "string") {
      setWBusy(false);
      setMsg(error ? (error.message.includes("closed day") ? "この希望日は定休日に設定されています。採用できません（見送りは可能です）" : rpcErrJa(error.message)) : "採用に失敗しました");
      await load(); return;
    }
    const { error: e2 } = await supabase.rpc("shift_set", { p_id: sid, p_cast_id: adjWish.cast_id, p_date: adjWish.date, p_start_hm: st, p_end_hm: en, p_status: sendBack ? "planned" : "confirmed" });
    let e3: string | null = null;
    if (!e2 && sendBack) { const { error: eP } = await supabase.rpc("shift_propose", { p_shift_ids: [sid] }); if (eP) e3 = rpcErrJa(eP.message); }
    if (!e2 && !e3) void notifyCast(supabase, { castId: adjWish.cast_id, kind: sendBack ? "shift_proposed" : "shift_added", body: sendBack ? shiftProposedBody(adjWish.date, st, en) : shiftAddedBody(adjWish.date, st, en), ref: notifRefOf("shifts", sid) }); // ★便 ON-3
    setWBusy(false);
    setMsg(e2 ? `採用しましたが時間の調整に失敗: ${rpcErrJa(e2.message)}` : e3 ? `調整しましたが送り返しに失敗: ${e3}` : sendBack ? "調整してキャストへ送り返しました（確認待ち）" : "調整して確定しました");
    if (!e2 && !e3) setAdjWish(null);
    await load();
  }

  // ★0125（裁定112-A）: isClosedDate（autoAssign へ渡していた定休日判定）は自動配置 UI 撤去で削除。

  // ★便 T-1: 既存期間との重なり（編集中の期間自身は除く）＝DB の shift_periods_no_overlap（閉区間）を client で先回り
  const pOverlap = overlappingPeriods(periodsAll.filter((p) => p.id !== pEditId), pStart, pEnd);
  const pOverlapText = pOverlap.length > 0
    ? `既存の期間(${pOverlap.map((p) => `${mdOf(p.start_date)}〜${mdOf(p.end_date)}`).join("・")})と重なっています` : null;
  // ★便 T-2: 期間用のエラー写像（時間帯用 rpcErrJa の 'overlap' 文言を流用しない）
  const periodErrJa = (m: string | undefined): string => {
    if (m && m.includes("overlap")) return pOverlapText ?? "既存の期間と重なっています";
    return rpcErrJa(m);
  };
  const resetPeriodForm = () => { setPEditId(null); setPStart(""); setPEnd(""); setPDeadline(""); setPStatus("open"); setPTouched(false); setPNeeds(emptyPeriodNeedsForm()); }; // ★裁定406: 既定＝募集中
  // ★SD V2-2: period CRUD（shift_period_set / shift_period_remove＝V1 検証済みの引数形と一字一致）。
  //   ★便 T-2／T-4: 成否はカード内（pMsg）＝共有 msg には出さない。成功時は作成した期間を一覧で強調（pNewId）。
  async function savePeriod() {
    setPMsg(null);
    if (!pStart || !pEnd) { setPMsg({ kind: "error", text: "計画期間の開始と終了を入力してください" }); return; }
    if (pOverlapText) { setPMsg({ kind: "error", text: pOverlapText }); return; }
    { const eNeeds = periodNeedsErrorOf(pNeeds); if (eNeeds) { setPMsg({ kind: "error", text: eNeeds }); return; } } // ★便 ON-3
    const { data, error } = await supabase.rpc("shift_period_set", {
      p_id: pEditId, p_store_id: storeId, p_start_date: pStart, p_end_date: pEnd,
      p_wish_deadline: pDeadline || null, p_status: pStatus,
    });
    if (error) { setPMsg({ kind: "error", text: error.message.includes("overlap") ? periodErrJa(error.message) : `計画の保存に失敗: ${periodErrJa(error.message)}` }); return; }
    // ★便 ON-3（0176 ★5 (a)）: 期間ごとの必要人数＝値がある／前にあったときだけ全置換（空欄だけで前も無ければ呼ばない）
    const pid = typeof data === "string" ? data : pEditId;
    if (pid) {
      const rows = periodNeedRowsOf(pNeeds);
      if (rows.length > 0 || periodNeeds.some((r) => r.period_id === pid)) {
        const { error: eN } = await supabase.rpc("shift_period_needs_set", { p_period_id: pid, p_rows: rows });
        if (eN) { setPMsg({ kind: "error", text: `期間は保存しましたが必要人数の保存に失敗: ${rpcErrJa(eN.message)}` }); await load(); return; }
      }
    }
    const stLabel = PERIOD_ST_LABEL[pStatus] ?? pStatus;
    // ★夜間便 N5-4（裁定287-2）: 募集中で保存したときはキャスト側に案内が出る旨を足す（shift_open_periods_mine が status='open' を返す）
    setPMsg({ kind: "success", text: (pEditId ? `期間を更新しました(${stLabel})` : `期間を作成しました(${stLabel})`) + (pStatus === "open" ? "。キャストのマイページに希望提出の案内が表示されます" : "") });
    setPNewId(typeof data === "string" ? data : pEditId);
    resetPeriodForm();
    await load();
  }
  async function removePeriod(id: string) {
    setPMsg(null);
    const { error } = await supabase.rpc("shift_period_remove", { p_id: id });
    setPMsg(error ? { kind: "error", text: `計画の削除に失敗: ${rpcErrJa(error.message)}` } : { kind: "success", text: "計画を削除しました" });
    if (pNewId === id) setPNewId(null);
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
      : st === "published" ? "キャストに公開しました（マイページに確定シフトが出ます）" : `計画を「${PERIOD_ST_LABEL[st] ?? st}」にしました`); // ★裁定253 R12(e)
    await load();
  }

  // ★0125（裁定112-A）: 自動配置（runPreview/applyAuto/clearAuto）と配置ルール保存（saveRules）は
  //   UI ごと撤去。RPC（shift_auto_apply/shift_auto_clear/shift_rules_set）と純関数 autoAssign・
  //   shift_rules 器は残置＝器の削除可否は launch 後の別起票で再評価（設計書 §5）。

  // ★SD V2-2: 一括/行単位の「キャスト確認へ」＝shift_propose（V1 検証済みの引数形と一字一致）。
  async function proposeShifts(ids: string[]) {
    if (ids.length === 0) return;
    setMsg(null);
    const { data: n, error } = await supabase.rpc("shift_propose", { p_shift_ids: ids });
    if (!error) for (const s of shifts.filter((x) => ids.includes(x.id))) await notifyCast(supabase, { castId: s.cast_id, kind: "shift_proposed", body: shiftProposedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf("shifts", s.id) }); // ★便 ON-3（0176 ★5 (d)）: 送り返し＝確認のお願い
    setMsg(error ? `確認依頼に失敗: ${rpcErrJa(error.message)}` : `${n}件をキャスト確認へ送りました`);
    await load();
  }

  // ★0126（裁定114）: 承認待ちタブの一括確定＝shift_confirm_bulk（planned/proposed→confirmed・RPC 上限62）。
  //   ★裁定245-3（2026-09-11）: client で 62 件ずつ分割して順に呼ぶ（事前の 62 件超ブロックは撤去）。途中失敗は
  //   「n／m 件確定・残りは再試行」で停止し、確定済み分は戻さない（RPC は塊ごとに原子的＝失敗した塊は無変更）。
  const bulkErrJa = (m: string) => (m.includes("bad rows") || m.includes("concurrent change") ? "他の操作と競合しました。最新状態を確認してください" : rpcErrJa(m));
  async function confirmBulkShifts(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`送り返したまま放置された ${ids.length}件をまとめて${PROXY_CONFIRM_LABEL}しますか？`)) return; // ★裁定345／380
    setMsg(null);
    let done = 0;
    for (const chunk of chunkOf(ids, 62)) {
      const { data: n, error } = await supabase.rpc("shift_confirm_bulk", { p_shift_ids: chunk });
      if (error) { setMsg(`${done}／${ids.length}件${PROXY_CONFIRM_LABEL}・残りは再試行してください（${bulkErrJa(error.message)}）`); await load(); return; }
      done += Number(n ?? chunk.length);
    }
    for (const s of shifts.filter((x) => ids.includes(x.id))) await notifyCast(supabase, { castId: s.cast_id, kind: "shift_added", body: shiftAddedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf("shifts", s.id) }); // ★便 ON-3
    setMsg(`${done}件を${PROXY_CONFIRM_LABEL}しました`); // ★裁定345
    await load();
  }
  // ★裁定245-2: 承認待ちの行「確定」＝shift_confirm_bulk を 1 件で（planned／proposed とも・キャスト確認の有無に依らない）
  async function confirmOne(id: string) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_confirm_bulk", { p_shift_ids: [id] });
    if (!error) { const s = shifts.find((x) => x.id === id); if (s) void notifyCast(supabase, { castId: s.cast_id, kind: "shift_added", body: shiftAddedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf("shifts", s.id) }); } // ★便 ON-3
    setMsg(error ? `${PROXY_CONFIRM_LABEL}に失敗: ${bulkErrJa(error.message)}` : `${PROXY_CONFIRM_LABEL}しました`); // ★裁定345
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
    const keep = keepReportArgsOf(attOf(castId, attDate), status);
    const { error } = await supabase.rpc("attendance_set", {
      p_cast_id: castId, p_date: attDate, p_status: status, ...keep, // ★便 X13-H H-17: 本人の連絡（見込み・理由）を残して記録
    });
    // ★便 ON-3（0176 ★3 I-4）: 店が遅刻／当欠を記録＝履歴に 1 行（source 'store'・失敗しても記録は止めない）
    if (!error && (status === "late" || status === "absent")) { const { error: eC } = await supabase.rpc("attendance_contact_log", { p_cast_id: castId, p_biz_date: attDate, p_kind: status, p_eta: keep.p_eta, p_reason: keep.p_reason }); if (eC) console.error(`attendance_contact_log: ${eC.message}`); }
    setMsg(error ? rpcErrJaCommon(error.message) : null);
    await loadAtt(attDate);
    // ★便 X13-H H-16（裁定410）: 遅刻／当欠を記録したら、委託キャストにだけ罰金ダイアログ（雇用・早退・キオスク・/mine には出さない・精算調整 OFF の店は出さない）
    if (!error && (status === "late" || status === "absent") && penaltiesOn && attDate === todayDate && casts.find((c) => c.id === castId)?.employment !== "雇用") {
      const sh = shifts.find((x) => x.cast_id === castId && x.date === attDate) ?? null;
      setPenaltyDlg({ castId, target: status, shiftId: sh ? sh.id : null });
    }
    // ★便 AY1（2026-09-24・裁定291 追補1 A-3）: 出勤区分（出勤・遅刻・同伴）を記録できたら in 打刻も残す（punch_proxy 'in'＝時刻は RPC の now()）。
    //   同営業日に in が既にあれば呼ばない（punch_proxy は盲目記録＝in-in を拒まないため UI で止める）・休み／当欠は呼ばない・区分の変更で増やさない。
    //   失敗しても attendance は戻さない（区分の記録は成立・打刻だけ失敗＝裁定281 の型で同じ枠に警告）。
    if (!error && proxyPunchOn && punchInAfterAtt({ status, hasIn: !!punchIO.get(castId)?.inHm })) { // ★0164（便 W5-2b）: 代行 OFF の店は in 打刻を残さない（区分の記録だけ）
      const { error: pe } = await supabase.rpc("punch_proxy", { p_cast_id: castId, p_type: "in", p_note: null });
      if (pe) setMsg(`出勤区分は記録しました。出勤の打刻に失敗: ${rpcErrJa(pe.message)}`);
      setPunchTick((v) => v + 1);
    }
  }

  // E8-4 #3（mig0095）: 5引数＝時間帯バンドの upsert（同 store/dow/from_min は置換・交差は RPC 'overlap' 拒否）
  async function saveNeed(dow: number, required: number, fromMin: number, toMin: number, okMsg?: string) {
    setMsg(null);
    if (closedDows.has(dow) && required > 0) { setMsg("定休日の曜日は必要人数を 0 のままにします（営業時間の設定で定休日を外すと入力できます）"); return false; } // ★便 NR-1 B②
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
    // ★裁定318（便 X-9-2）: 検証は正規化後（HHMM／HH:MM／H:MM／HH）
    const nf = nAllDay ? "00:00" : normalizeHHMM(nFrom), nt = nAllDay ? "24:00" : normalizeHHMM(nTo);
    if (!nf || !nt) { setMsg(HM_FORMAT_ERR); return; }
    const from = nAllDay ? 0 : hm2min(nf);
    const to = nAllDay ? 1440 : hm2min(nt);
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
  const closedOf = (date: string, startHm: string, endHm: string) =>
    shiftHoursStatus(date, startHm, endHm, bhRows).status === "closed";

  // ── 段S-1 派生値（すべて既存 shifts / staffing_needs の client 再形＝新規取得なし）──
  //   E8-4 #2（mig0095）: 必要人数は曜日×時間帯バンド。バンド充足＝「当該時間帯に交差するシフト数 ÷ required」。
  //   交差は半開区間 [hm2min(start), hm2min(end)) × [from_min, to_min)＝RPC の overlap 判定と同式。
  //   シフト終了は 47:59 まで（30時間制）だがバンド上限 1440 との交差はそのまま成立する。
  // ★SC-7（裁定53'）: 過去日（営業日の今日より前）。日セルを減光して未来日の赤を前に出す。
  //   ★色は「消さない」＝過ぎた日の不足も履歴として読める（彩度だけ落とす＝CSS 側 .nox-cald.past）。
  const isPast = (ymd: string) => ymd < bizToday;
  // ★D-15（不具合修正）: 月移動で選択日が表示月の外に出たら、日詳細は空状態に戻す。
  //   （従来は selDate が前月のまま残り、見えているカレンダーと中身が食い違っていた）
  //   ★SC-8 ③: 3面とも日詳細がモーダルになり、表示条件に selInMonth を入れて「月外なら開かない」
  //     形へ揃った。月外用の空状態の文言は出す場所が無くなったので定数ごと削除した。
  const selInMonth = selDate.startsWith(month);

  // ★SC-7（裁定51'）: 帯が「終日1本のみ」＝時間帯別の粒度が元データに無い状態。
  //   このとき帯グラフは常に「終日 N/M」の1行しか出せず、**何時が足りないかは分からない**
  //   （表示を厚くしても解決しない＝案2 不採用の理由）。正直に「未設定」と言って設定面へ送る。
  const onlyAllDay = (bs: BandStat[]) => bs.length === 1 && bs[0].from_min === 0 && bs[0].to_min === 1440;
  // 必要人数セクションへ移動（タブを切り替えてから同 id 要素へスクロール）。
  //   ★products-board の highlightId と同じ流儀（scrollIntoView・smooth/center）。
  //   タブ切替は state 更新＝描画後にしかスクロールできないため、次フレームで実行する。
  const gotoNeeds = () => {
    // ★SC-8 ③-0: タブを跨ぐ前に日詳細を閉じる（開いたまま別の面へ行く経路を構造的に潰す）。
    setDayModal("");
    setTab("calendar"); // ★0125（裁定112-A）: 必要人数カードは仮シフトタブへ移設＝行き先追随
    requestAnimationFrame(() => {
      document.getElementById("shift-needs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const shiftsOn = (ymd: string) => shifts.filter((s) => s.date === ymd);
  const bandStatsOf = (ymd: string): BandStat[] => {
    const list = shiftsOn(ymd);
    // ★便 ON-3（0176 ★5 (a)）: その日を含む期間に曜日の行があれば、その人数を終日 1 バンドとして店の staffing_needs より優先
    const pr = periodNeedRequiredOf(ymd, periodsAll, periodNeeds);
    if (pr !== null) return [{ id: "period", dow: dowOf(ymd), required: pr, from_min: 0, to_min: 1440, assigned: list.length, fill: fillOf(list.length, pr) }];
    return needs.filter((n) => n.dow === dowOf(ymd)).map((n) => {
      const assigned = list.filter((s) => hm2min(s.start_hm) < n.to_min && n.from_min < hm2min(s.end_hm)).length;
      return { ...n, assigned, fill: fillOf(assigned, n.required) };
    });
  };
  // 日単位の状態＝バンドの最悪値。required はピーク（max）・shortage は最悪バンドの不足数（合算だと
  // 同じキャストの跨ぎ勤務を二重計上するため合算しない）。
  //
  // ★SC-2（裁定44）: **充足の母数は全 status**（planned/proposed/confirmed を数える）＝`assigned` は
  //   list.length のまま（bandStatsOf も status で絞っていない）＝ここは元から満たしており不変。
  //   変えたのは**内訳**で、旧 `planned = 全件 − confirmed`（proposed を planned に合算していた）を
  //   **confirmed / proposed / planned の3値**に割った（合計だけ見せて中身を隠さない）。
  // ★`over` = 余剰コマ数（assigned − required の正の分）。required が 0（未設定）の日は余剰にしない
  //   ＝必要人数を決めていない日に「余っている」と言えないため。
  // ★`fill`（fillOf/worstFill の4値 none/ok/warn/ng）は**1文字も変えていない**＝既存の色分けと
  //   「人員不足日」の集計はそのまま動く。余剰は fill とは別の軸として持つ（裁定B＝灰で示す）。
  // ★裁定245-6: シフト追加モーダルへ渡す日別配置数（全 status・本体 shifts の再形＝新規取得なし）
  const assignedByDate: Record<string, number> = {};
  for (const s of shifts) assignedByDate[s.date] = (assignedByDate[s.date] ?? 0) + 1;
  const dayStat = (ymd: string) => {
    const list = shiftsOn(ymd);
    const confirmed = list.filter((s) => s.status === "confirmed").length;
    const proposed = list.filter((s) => s.status === "proposed").length;
    if (isClosedDay(ymd)) return { assigned: list.length, confirmed, proposed, planned: list.length - confirmed - proposed, required: 0, shortage: 0, over: 0, fill: "none" as const }; // ★便 NR-1 B①: 定休日＝必要 0・不足なし
    const bs = bandStatsOf(ymd);
    const required = bs.reduce((m, b) => Math.max(m, b.required), 0);
    const shortage = bs.reduce((m, b) => Math.max(m, Math.max(0, b.required - b.assigned)), 0);
    const over = required > 0 ? Math.max(0, list.length - required) : 0;
    return {
      assigned: list.length, confirmed, proposed, planned: list.length - confirmed - proposed,
      required, shortage, over, fill: worstFill(bs.map((b) => b.fill)),
    };
  };

  // 月グリッド（前後の空白セル込み・7列）
  const [my, mm] = month.split("-").map(Number);
  const monthDays = daysInMonthOf(month);
  const leadBlanks = new Date(Date.UTC(my, mm - 1, 1)).getUTCDay();
  const calCells: (string | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: monthDays }, (_, i) => `${month}-${pad2(i + 1)}`),
  ];
  // ★306-1／306-2: 月 state は URL クエリ ?ym=YYYY-MM と同期（前月／翌月／今月は MonthNav・shiftMonth は撤去）
  useYmQuery(month, setMonth);

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
      if (closedDows.has(dowOf(date))) continue; // ★便 NR-1 B①: 定休日の行は予想人件費に入れない
      // status（confirmed/planned）は金額に影響しない＝両方渡す（設計§2）
      m.set(date, forecastDay(list.map((x) => ({ castId: x.cast_id, startHm: x.start_hm, endHm: x.end_hm })), comps));
    }
    return m;
  }, [shifts, comps, isManagerUp, bhRows]); // eslint-disable-line react-hooks/exhaustive-deps -- closedDows は bhRows から毎描画で作る（★便 NR-1）
  const fcOf = (ymd: string) => fcByDate.get(ymd);
  const yen = (n: number) => "¥" + n.toLocaleString();

  // 「今日」の KPI（段S-2 で予想人件費を5枚目に追加）
  // ★SC-7（裁定50'）: 今日タブ上部の直近7日ストリップ。**今日を含む未来7日**（過去日は出さない）。
  //   ★データは既存の dayStat / fcOf で足りる（裁定54 で load() の to を今日+6日まで伸ばしたため、
  //     月末を跨いでも assigned が欠けない）。新しい取得は増やしていない。
  const stripDays = Array.from({ length: 7 }, (_, i) => addDays(bizToday, i));

  // ★SC-8 ⑦: 以下4本の基準日は bizToday ではなく **todayDate**（ストリップの選択日）。
  //   名前は据え置き（今日タブ専用の派生値という意味で today 接頭辞を残す）。
  //   ★「未承認」だけは wishes.length＝全期間の pending 件数で、日付軸を持たないため追従させない。
  const todayStat = dayStat(todayDate);
  const todayFc = fcOf(todayDate);
  const fillRate = todayStat.required > 0 ? Math.round((todayStat.assigned / todayStat.required) * 100) : null;
  const shortage = todayStat.shortage; // E8-4 #2: 最悪バンドの不足数（バンド化に追随）
  const todayBands = bandStatsOf(todayDate);
  // ★SC-8 ⑦: タブ名は選択日に追従（key "today" は据え置き＝裁定44）。
  // ★便 AU2-2（2026-09-24）: 「作る」タブ上部＝計画期間の進行の帯（4 段・現在段を強調・期間と締切を併記）。月内に複数期間があれば期間ごとの帯（地色＝既存トークン 4 色の循環）と凡例。
  //   セルの地色＝その日が属する期間（選択中の日は .sel の地色を優先＝表示を変えない側）。RPC なし・取得済み periods の再形。
  // ★便 SH-UI-b2 B2-1（裁定406）: 日セルの地色＝その日が属する期間の状態（募集中＝青／配置中＝黄／公開済み＝緑／期間なし＝灰＋「期間なし」の字）・境目は左右 1px（.pb-l／.pb-r）
  const periodNoneOf = (ymd: string) => periodCellStageOf(periodsAll, ymd, bizToday) === "none";
  // 期間なしの日を押す＝①の新規作成フォームへ開始日を入れて遷移
  const openNewPeriodAt = (ymd: string) => { resetPeriodForm(); setPStart(ymd); setPTouched(true); setPMsg(null); setDayModal(""); setTab("build"); };
  const [openSubmitCast, setOpenSubmitCast] = useState<string | null>(null); // ★B2-3: 提出一覧で開いているキャスト
  // ★裁定406（便 SH-UI-b）: 手順ごとの期間＝実効段（締切を過ぎた募集中は配置中）・提出状況・不足日。DB 変更 0（状態の遷移は shift_period_set の p_status）
  const ymdAddOf = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const stageOfP = (p: Period) => effectiveStageOf(p, bizToday);
  const recruitingPeriods = periodsAll.filter((p) => stageOfP(p) === "open");
  const placingPeriods = periodsAll.filter((p) => stageOfP(p) === "closed");
  const publishedPeriods = periodsAll.filter((p) => p.status === "published");
  const focusOf = (list: Period[]) => list.find((p) => p.id === focusPeriodId) ?? list[0] ?? null;
  const periodDaysOf = (p: Period) => { const out: string[] = []; for (let d = p.start_date; d <= p.end_date && out.length < 62; d = ymdAddOf(d, 1)) out.push(d); return out; };
  const shortDaysOf = (p: Period) => periodDaysOf(p).filter((ymd) => ymd.slice(0, 7) === month && (() => { const st = dayStat(ymd); return st.required > 0 && st.assigned < st.required; })());
  const submissionOf = (p: Period) => {
    const ws = wishAll.filter((w) => w.date >= p.start_date && w.date <= p.end_date && w.status !== "withdrawn");
    const by = new Map<string, Wish[]>(); for (const w of ws) (by.get(w.cast_id) ?? by.set(w.cast_id, []).get(w.cast_id)!).push(w);
    const ids = casts.map((c) => c.id);
    return {
      done: ids.filter((id) => by.has(id)).map((id) => { const list = by.get(id) ?? []; return { id, name: castName(id), work: list.filter((w) => (w.kind ?? "work") === "work").length, off: list.filter((w) => w.kind === "off").length, last: list.map((w) => w.created_at ?? "").sort().pop() ?? "" }; }),
      not: ids.filter((id) => !by.has(id)).map((id) => ({ id, name: castName(id) })),
    };
  };
  const daysUntil = (ymd: string | null) => (ymd ? Math.max(0, Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${bizToday}T00:00:00Z`)) / 86400000)) : null);
  const openPeriodInStep = (p: Period, to: ShiftTab) => { setFocusPeriodId(p.id); setMonth(p.start_date.slice(0, 7)); setSelDate(p.start_date); setDayModal(""); setTab(to); };
  const stageChip = (p: Period) => <span className={`nox-stpill nox-stage-${stageOfP(p)}`} data-period-stage={stageOfP(p)}>{periodStageOf(stageOfP(p))}</span>;
  const periodTabs = (list: Period[], to: ShiftTab, label: string) => (
    <div className="nox-ptabs" role="group" aria-label={label} data-period-tabs={to}>
      {list.map((p) => (
        <button key={p.id} type="button" className={focusOf(list)?.id === p.id ? "on" : ""} aria-pressed={focusOf(list)?.id === p.id} onClick={() => openPeriodInStep(p, to)}>
          <b className="num">{periodBandText(p)}</b><small>{stageChip(p)}{to === "queue" || to === "publish" ? ` 不足 ${shortDaysOf(p).length} 日` : to === "submit" ? ` 提出 ${submissionOf(p).done.length}/${casts.length}` : ""}</small>
        </button>
      ))}
      {list.length === 0 && (to === "queue" && noPlacingTextOf(recruitingPeriods)
        ? <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }} data-shift-no-placing="1">{noPlacingTextOf(recruitingPeriods)}<button type="button" className="nox-link" style={{ marginLeft: 8, fontSize: 12.5 }} onClick={() => { setDayModal(""); setTab("submit"); }}>②提出一覧で今すぐ締め切る ›</button></p> /* ★便 SH-UI-c2 C2-17 ⑤ */
        : <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>該当する期間はありません。</p>)}
    </div>
  );
  const periodBandsJsx = periods.length > 0 ? (
    <div className="nox-inset" style={{ padding: "8px 12px", marginBottom: 10 }}>
      {(() => {
        const p0 = periods[0]; const idx = stageIndexOf(p0.status);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--sub)" }}>進行</span>
            {PERIOD_STAGES.map((s, i) => (
              <span key={s} className="nox-stpill" style={i === idx ? { color: "var(--champ)", borderColor: "var(--gold)", background: "var(--goldface2)" } : i < idx ? { color: "var(--ok)" } : undefined}>{periodStageOf(s)}</span>
            ))}
            <span className="num" style={{ fontSize: 11, color: "var(--sub)", marginLeft: 4 }}>{periodBandText(p0)}</span>
          </div>
        );
      })()}
      {/* ★便 SH-UI-b2 B2-1: 凡例＝4 つ（色だけに頼らず語を出す・390px でも見える） */}
      <div className="nox-plegend" data-period-legend="1" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        {PERIOD_LEGEND.map(([k, label]) => <span key={k} className={`nox-plegend-it ${periodCellClassOf(k)}`} data-period-legend-item={k}><i /> {label}</span>)}
      </div>
    </div>
  ) : null;
  const tdLabel = todayDate === bizToday ? "今日"
    : todayDate === addDays(bizToday, 1) ? "明日"
    : todayDate === addDays(bizToday, 2) ? "明後日"
    : `${Number(todayDate.slice(8))}日`;

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
  // ★SC-8 ⑥: atts が7日ぶんになったので (cast, 日) で引く。今日タブ本体は ymd=bizToday 固定で呼ぶ＝従来と同値。
  const attOf = (castId: string, ymd: string) => atts.find((x) => x.cast_id === castId && x.date === ymd);
  // ★B4-a 裁定222: 表示日の打刻（最終 'in'）。書込なし・book は attendance のまま。
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const { startIso, endIso } = bizDateRange(todayDate, cutoff);
      const { data } = await supabase.from("punches").select("id, cast_id, type, punched_at")
        .eq("store_id", storeId).gte("punched_at", startIso).lt("punched_at", endIso).order("punched_at");
      const m = new Map<string, string>();
      const rows = (data ?? []) as { id: string; cast_id: string; type: "in" | "out"; punched_at: string }[];
      setPunchIO(firstInLastOut(rows)); // ★AT2
      // ★0154 D1: 修正モーダルに渡す打刻の id／時刻（最初の in・最後の out＝punch-match S1 と同じ採用規則）
      const ref = new Map<string, { inId: string | null; inIso: string | null; outId: string | null; outIso: string | null }>();
      for (const p of rows) {
        const e = ref.get(p.cast_id) ?? { inId: null, inIso: null, outId: null, outIso: null };
        if (p.type === "in") { if (e.inId === null) { e.inId = p.id; e.inIso = p.punched_at; } } else { e.outId = p.id; e.outIso = p.punched_at; }
        ref.set(p.cast_id, e);
      }
      setPunchRef(ref);
      // ★0154 D1: 異議あり（approved ∧ disputed）＝店側 warn。表が無い環境（手貼り前）は空のまま
      if (isManagerUp) {
        // ★裁定297-1: 未決裁（pending）も同じ 1 クエリで取る（or フィルタ＝fetch +0）。分岐は純関数 disputedOf／pendingOf
        const { data: dr, error: de } = await supabase.from("punch_corrections").select("id, cast_id, punch_id, biz_date, kind, before_at, after_at, reason, decision, decide_reason, ack, ack_at, requested_at, decided_at")
          .eq("store_id", storeId).or("decision.eq.pending,and(decision.eq.approved,ack.eq.disputed)").order("biz_date", { ascending: false }).limit(100);
        const crows = de ? [] : ((dr ?? []) as (CorrectionRow & { id: string })[]);
        if (alive) { setDisputed(disputedOf(crows)); setPending(pendingOf(crows)); }
      }
      for (const p of rows) {
        if (p.type === "in") m.set(p.cast_id, new Date(p.punched_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
        else m.delete(p.cast_id); // 'out' が後なら「打刻中」ではない＝表示しない
      }
      if (alive) { setPunchIn(m); setPunchRows(rows); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, todayDate, cutoff, punchTick]);
  // ★裁定257 R20-a: late_grace_min を店から読む（RLS 越しの SELECT のみ・行なし／失敗は既定 10 分）
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("penalty_config").select("late_grace_min").eq("store_id", storeId).maybeSingle();
      const v = data?.late_grace_min;
      if (alive) setLateGraceMin(typeof v === "number" && v >= 0 ? v : LATE_GRACE_MIN_DEFAULT);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  // ★0156（裁定309-9・便 V-5）: 店の送り方式（settings_json.okuri_mode）＝'actual' の店だけ退勤に「送り」チェックを出す（+1・RLS 越しの stores 読取）
  const [okuriActual, setOkuriActual] = useState(false); // ★裁定414: 名前は従来のまま＝意味は「送りの導線を出す店」（'none' 以外）
  const [okuriMode, setOkuriMode] = useState<OkuriMode>("flat");
  const [proxyPunchOn, setProxyPunchOn] = useState(true); // ★0164（便 W5-2b）: 店設定 punch_methods.proxy（代行の退勤ボタン・出勤区分後の in 打刻の出し分け）
  // ★裁定317（便 X-9-3）: 「送り」→金額ダイアログ→確定で退勤打刻（p_okuri=true）＋transport_issue_bulk 1 件（idem＝punch id）。旧チェックボックス（okuriMark）は廃止
  const [okuriBase, setOkuriBase] = useState<unknown>(null);
  const [okuriDlg, setOkuriDlg] = useState<{ castId: string; def: OkuriDefault; mode: "outAndIssue" | "issueOnly"; fromOut: boolean } | null>(null); // ★裁定357: mode＝退勤＋送り／送りのみ・fromOut＝「退勤」から開いた（2 択）
  const [okuriIssued, setOkuriIssued] = useState<Set<string>>(new Set()); // ★裁定357: 当日発行済みの cast（transport・cancelled 以外）＝1 クエリ
  const [okuriBusy, setOkuriBusy] = useState(false);
  const [reportsOnly, setReportsOnly] = useState(false); // ★便 X13-H H-17 ②: 連絡のある行だけ
  const [penaltyDlg, setPenaltyDlg] = useState<{ castId: string; target: PenaltyTarget; shiftId: string | null } | null>(null); // ★便 X13-H H-16
  const [okuriErr, setOkuriErr] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("stores").select("settings_json, punch_methods").eq("id", storeId).maybeSingle(); // ★0164（便 W5-2b）: punch_methods（代行の出し分け）
      const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
      if (alive) { const om = okuriModeOf(sj); setOkuriMode(om); setOkuriActual(okuriAsks(om)); setOkuriBase(sj.okuri_base_amount ?? null); setProxyPunchOn(opsProfileOf(data as Record<string, unknown> | null).punch_methods.proxy); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  // ★裁定357（便 N1014 A-6）: 当日の送り発行済み（transport.date＝今日・cancelled 以外）＝cast の集合（1 クエリ・N+1 なし）。punchTick で再読込
  useEffect(() => {
    if (!storeId || !okuriActual) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("transport").select("cast_id").eq("store_id", storeId).eq("biz_date", todayDate).neq("status", "cancelled"); // ★便 N1014 live 修正: 列は biz_date（date は無い＝クエリが黙って空→「送り済」が出なかった）
      if (alive) setOkuriIssued(new Set(((data ?? []) as { cast_id: string }[]).map((r) => r.cast_id)));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, okuriActual, todayDate, punchTick]);
  // ★裁定257 R20-b: 退勤＝punch_proxy(source='manager'・owner 全店／manager 自店・inactive cast 拒否・audit は RPC 側)。in 側は出さない（attendance の 5 択が入口）
  async function proxyOut(castId: string) {
    setMsg(null);
    // ★0156（裁定309-9）→★裁定317: 「退勤」＝送りなし。okuri_mode='actual' の店は p_okuri=false を明示・'flat' の店は 3 引数のまま（RPC の既定＝null）
    const { error } = await supabase.rpc("punch_proxy", okuriActual
      ? { p_cast_id: castId, p_type: "out", p_note: null, p_okuri: false }
      : { p_cast_id: castId, p_type: "out", p_note: null });
    setMsg(error ? `退勤の記録に失敗: ${rpcErrJa(error.message)}` : `${castName(castId)} の退勤を記録しました`);
    setPunchTick((v) => v + 1);
  }
  // ★裁定357: 「退勤」押下＝実費の店で当日の送りが未発行ならダイアログ（送りを発行して退勤（既定）／退勤のみ）。実費以外の店はダイアログなし＝そのまま退勤
  async function outPressed(castId: string) {
    if (outDialogNeeded({ okuriActual, issuedToday: okuriIssued.has(castId) })) { await openOkuri(castId, "outAndIssue", true); return; }
    await proxyOut(castId);
  }
  // ★裁定317（便 X-9-3）: 「送り」押下＝金額ダイアログ。既定＝店設定 okuri_base_amount → 同 cast の直近 transport 額 → 空欄（必須）
  async function openOkuri(castId: string, mode: "outAndIssue" | "issueOnly" = "outAndIssue", fromOut = false) {
    setOkuriErr(null);
    let last: number | null = null;
    if (okuriDefaultAmountOf(okuriBase, null).amount === null) {
      const { data } = await supabase.from("transport").select("amount").eq("cast_id", castId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1);
      last = ((data ?? []) as { amount: number }[])[0]?.amount ?? null;
    }
    setOkuriDlg({ castId, def: okuriDefaultAmountOf(okuriBase, last), mode, fromOut });
  }
  // 確定＝退勤打刻（p_okuri=true）→ 戻りの punch id を冪等キーにして transport_issue_bulk（1 件）。打刻成功・発行失敗は「送りは未発行」＝締め前モーダルに残る
  async function confirmOkuri(amount: number) {
    if (!okuriDlg || okuriBusy) return;
    const castId = okuriDlg.castId;
    setOkuriBusy(true); setOkuriErr(null); setMsg(null);
    // ★裁定357: 退勤後（issueOnly）＝打刻せず送りだけ発行。冪等キー＝その cast の最後の out 打刻 id（punchRows）
    if (okuriDlg.mode === "issueOnly") {
      const outRow = punchRows.filter((r) => r.cast_id === castId && r.type === "out").sort((a, b) => (a.punched_at < b.punched_at ? 1 : -1))[0];
      const { error: eI } = await supabase.rpc("transport_issue_bulk", { p_store_id: storeId, p_items: [{ cast_id: castId, amount, date: todayDate }], p_idem_key: (outRow as { id?: string } | undefined)?.id ?? crypto.randomUUID() });
      setOkuriBusy(false);
      if (eI) { setOkuriErr(`送りの記録に失敗: ${rpcErrJa(eI.message)}`); return; }
      setOkuriDlg(null);
      setMsg(`${castName(castId)}：${okuriRecordedTextOf(okuriMode, amount)}（退勤は記録済み）`); // ★裁定414: 「記録」＋方式の 1 文
      setPunchTick((v) => v + 1);
      return;
    }
    const { data: punchId, error } = await supabase.rpc("punch_proxy", { p_cast_id: castId, p_type: "out", p_note: null, p_okuri: true });
    if (error || !punchId) {
      setOkuriBusy(false);
      setOkuriErr(`退勤の記録に失敗: ${rpcErrJa(error?.message ?? "no punch id")}`);
      return;
    }
    const { error: eT } = await supabase.rpc("transport_issue_bulk", {
      p_store_id: storeId, p_items: [{ cast_id: castId, amount, date: todayDate }], p_idem_key: punchId as string,
    });
    setOkuriBusy(false);
    setOkuriDlg(null);
    setMsg(eT
      ? `${castName(castId)} の退勤は記録しました。送りの記録に失敗したため、送りは未記録です（${rpcErrJa(eT.message)}）。日報の締めの前に記録できます`
      : `${castName(castId)} の退勤を記録しました。${okuriRecordedTextOf(okuriMode, amount)}`); // ★裁定414: 「記録」＋方式の 1 文
    setPunchTick((v) => v + 1);
  }
  // ★B4-a 裁定221（H31）: カウンタ＝二重計上なし。休み（off）はどれにも数えない。
  // ★裁定257 R20-a（2026-09-15）: 「遅刻・未着」を 2 つに分け、判定を給与側と同じ punch-match.ts（matchPunches）に揃える。
  //   遅刻＝in 打刻あり ∧ in − start > late_grace_min（final.type 'late'）または attendance.status='late'／
  //   未着＝打刻なし ∧ now ≥ start + late_grace_min／出勤済み＝shukkin・dohan または final 'ok'／欠勤＝absent。
  //   閾値は penalty_config.late_grace_min（既定 10）。開始時刻＝表示日の暦日 00:00 JST＋start_hm（30 時間制のまま）。
  const todayCounts = (() => {
    const list = shiftsOn(todayDate);
    const nowMs = Date.now();
    const base = Date.parse(`${todayDate}T00:00:00+09:00`);
    let arrived = 0, late = 0, missing = 0, absent = 0;
    for (const s of list) {
      const st = attOf(s.cast_id, todayDate)?.status;
      if (st === "shukkin" || st === "dohan") { arrived += 1; continue; }
      if (st === "absent") { absent += 1; continue; }
      if (st === "off") continue; // 休み＝数えない
      const mine = punchRows.filter((p) => p.cast_id === s.cast_id).map((p) => ({ punched_at: p.punched_at, type: p.type }));
      const r = matchPunches({
        ...buildMatchInput({ punches: mine, shifts: [{ date: todayDate, start_hm: s.start_hm, end_hm: s.end_hm }],
          attendance: st === "late" ? [{ date: todayDate, status: "late" }] : [], cutoffHm: cutoff }),
        config: { lateGraceMin, close: s.end_hm },
      });
      const fin = r.days.find((d) => d.bizDate === todayDate)?.final;
      if (fin?.type === "late") late += 1;
      else if (fin?.type === "ok") arrived += 1;
      else if (lateMinutesOf(s.start_hm, min2hm(Math.max(0, Math.floor((nowMs - base) / 60_000))), lateGraceMin) !== null) missing += 1; // 打刻なし ∧ 猶予経過（★裁定268: 行の「(+N 分)」と同じ関数・同じ閾値＝式を 2 箇所に持たない。now は表示日 00:00 起点の 30 時間制 HH:MM）
    }
    return { planned: list.length, arrived, late, missing, absent };
  })();

  // ★裁定253 R12（2026-09-14）: 「未確定 n 件 → 確定する」導線。n＝表示月の proposed（castConfirm=false）または planned＋proposed（true）。
  //   押すと承認待ちタブへ切り替えるだけ（直接の一括確定はしない＝確認の場を経由させる）。0 件なら出さない。manager 以上のみ。
  const unconfirmedN = shifts.filter((x) => x.date.slice(0, 7) === month && (x.status === "proposed" || (castConfirm && x.status === "planned"))).length;
  // ★便 SH-UI-c2 C2-18 ⑤／C2-19 ④: スタッフ別マトリクス（① から ③ へ移設）。セル＝開始時刻（状態の色）・記号と出所（自動／手）の表示は出さない
  const staffMatrixJsx = (() => {
    const days = calCells.filter((d): d is string => d !== null);
    const rows = casts.filter((c) => shifts.some((x) => x.cast_id === c.id && x.date.startsWith(month)));
    if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>この月のシフトはありません</p>;
    const cellTd: React.CSSProperties = { border: "1px solid var(--line)", padding: "3px 4px", textAlign: "center", minWidth: 22 };
    return (
      <div style={{ overflowX: "auto" }} data-shift-staff-matrix="1">
        <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...cellTd, textAlign: "left", minWidth: 90, color: "var(--sub)" }}>キャスト</th>
              {days.map((d) => <th key={d} className="num" title={isClosedDay(d) ? "定休日" : undefined} data-staff-closed={isClosedDay(d) ? "1" : undefined} style={{ ...cellTd, ...(isClosedDay(d) ? { background: "var(--cal-closed-bg)" } : {}), color: dowOf(d) === 0 ? "var(--bad)" : dowOf(d) === 6 ? "var(--champ)" : "var(--sub)" }}>{Number(d.slice(8))}</th>)}{/* ★便 NR-1 B①: 定休日の列はグレー */}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ ...cellTd, textAlign: "left", whiteSpace: "nowrap" }}>{c.name}
                  {c.shift_request_mode && <span className="nox-stpill" style={{ marginLeft: 6, fontSize: 10, padding: "0 6px" }} title="このキャストだけの方式（キャスト詳細で設定）">{SHIFT_REQUEST_MODE_LABEL[c.shift_request_mode]}</span>}
                </td>
                {days.map((d) => {
                  const mine = shifts.filter((x) => x.cast_id === c.id && x.date === d);
                  const top = mine.some((x) => x.status === "confirmed") ? "confirmed" : mine.some((x) => x.status === "proposed") ? "proposed" : mine.length > 0 ? "planned" : null;
                  const first = mine.slice().sort((a, b) => a.start_hm.localeCompare(b.start_hm))[0];
                  return (
                    <td key={d} className="num" data-staff-closed={isClosedDay(d) ? "1" : undefined} style={{ ...cellTd, ...(isClosedDay(d) ? { background: "var(--cal-closed-bg)" } : {}), color: isClosedDay(d) && first ? "var(--bad)" : top ? shiftStColor(top) : undefined, fontWeight: top === "confirmed" ? 800 : 500 }}
                      title={mine.length > 0 ? `${d} ${mine.map((x) => `${fmtWin(x.start_hm, x.end_hm)}（${SHIFT_ST_LABEL[x.status]}）`).join("・")}` : undefined}>
                      {first ? first.start_hm : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}>セルは開始時刻（確定＝太字・確認待ち／予定＝状態の色）。カーソルを合わせると時間帯と状態が出ます。</p>
      </div>
    );
  })();
  const confirmCta = isManagerUp && unconfirmedN > 0 ? (
    <div className="nox-actions nox-noprint" style={{ marginTop: 10, marginBottom: 10 }}>
      <button type="button" style={btnDark} title={`承認待ちで内容を確認してから${PROXY_CONFIRM_LABEL}します`}
        onClick={() => { setDayModal(""); setTab("queue"); }}>{PROXY_CONFIRM_LABEL}する（{unconfirmedN} 件）</button>{/* ★裁定345 */}
    </div>
  ) : null;

  return (
    // ★R3 第1弾: タイポ・余白のモック実値写し（globals.css の .nox-mv1 ブロック）。
    //   この画面と /notices だけに効く＝共有クラスの素の定義は変えていない。
    <div className={tab === "roster" ? "nox-mv1 nox-printpage" : "nox-mv1"}>{/* ★B4-c 裁定223（H37）: 確定シフトタブだけ印刷隔離（.nox-print 以外は印刷時に落ちる） */}
      <PageHead eyebrow="SHIFT MANAGEMENT" title="シフト管理"
        desc="申請、承認、出勤状況と人員充足をまとめて管理します。" />
      <Toast msg={msg} />
      {remindTarget && (/* ★便 ON-3（0176 ★5 (e)）: 未提出者への一括お知らせ＝notice_create_targets（宛先＝未提出のキャスト・掲載期限＝希望締切）＋LINE（連携済みの人だけ） */
        <Modal onClose={() => busyRemind !== "all" && setRemindTarget(null)} maxWidth={460}>
          <h2 style={t.cardTitle}>未提出の {remindTarget.castIds.length} 人にお知らせを送る</h2>
          <div style={{ display: "grid", gap: 8 }} data-remind-modal="1">
            <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>件名</span>
              <input value={remindTarget.title} maxLength={80} onChange={(e) => setRemindTarget((r) => (r ? { ...r, title: e.target.value } : r))} style={{ ...t.input, width: "100%" }} data-remind-title="1" /></label>
            <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>本文</span>
              <textarea value={remindTarget.body} maxLength={4000} rows={4} onChange={(e) => setRemindTarget((r) => (r ? { ...r, body: e.target.value } : r))} style={{ ...t.input, width: "100%", minHeight: 96 }} data-remind-body="1" /></label>
            <p style={{ ...t.sub, margin: 0 }}>宛先＝未提出の {remindTarget.castIds.length} 人（マイページ「お知らせ」に届きます。LINE 連携済みの人には LINE にも）。掲載期限＝希望締切{remindTarget.period.wish_deadline ? `（${remindTarget.period.wish_deadline}）` : "なし"}。</p>
            <button type="button" style={t.btnPrimary56} disabled={busyRemind === "all" || !remindTarget.title.trim() || !remindTarget.body.trim()} data-remind-send="1" onClick={() => void sendRemindAll()}>{busyRemind === "all" ? "送信中…" : "送る"}</button>
            <div style={t.btnRow48}><button type="button" style={t.btnSecondary48} disabled={busyRemind === "all"} onClick={() => setRemindTarget(null)}>キャンセル</button></div>
          </div>
        </Modal>
      )}
      {/* ★0154 D4: 精算調整モーダル（委託のみ・成功＝同じ枠に success） */}
      {settle && (
        <SettlementModal storeId={storeId} castId={settle.castId} castName={castName(settle.castId)} biz={todayDate} shiftId={settle.shiftId} target={settle.target}
          onClose={() => setSettle(null)} onDone={(text) => setMsg(text)} />
      )}
      {/* ★便 X13-H H-16（裁定410）: 遅刻・当欠の罰金（委託のみ・送りと同じ形） */}
      {penaltyDlg && (
        <PenaltyDialog storeId={storeId} castId={penaltyDlg.castId} castName={castName(penaltyDlg.castId)} biz={todayDate} shiftId={penaltyDlg.shiftId} target={penaltyDlg.target}
          onClose={() => setPenaltyDlg(null)} onDone={(text) => setMsg(text)} />
      )}
      {/* ★裁定317（便 X-9-3）: 退勤の「送り」金額ダイアログ */}
      {okuriDlg && (
        <OkuriOutDialog castName={castName(okuriDlg.castId)} def={okuriDlg.def} busy={okuriBusy} error={okuriErr} mode={okuriDlg.mode} okuriMode={okuriMode} /* ★裁定414: 説明文＝方式の 1 文 */
          onOutOnly={okuriDlg.fromOut ? () => { const cid = okuriDlg.castId; setOkuriDlg(null); void proxyOut(cid); } : undefined} /* ★裁定357: 2 択の「退勤のみ」 */
          onConfirm={(amount) => void confirmOkuri(amount)} onClose={() => setOkuriDlg(null)} />
      )}
      {/* ★裁定297-1: 決裁モーダル（成功＝punches／申請一覧の再読込＋同じ枠に success） */}
      {decideRow && (
        <PunchDecideModal row={decideRow.row} castName={castName(decideRow.row.cast_id)} approve={decideRow.approve}
          onClose={() => setDecideRow(null)} onDone={(text) => { setMsg(text); setPunchTick((v) => v + 1); }} />
      )}

      {/* 段S-1 サブナビ＝ページ内の収容先を切り替えるだけ。ルート・URL・権限ゲートは不変。
          ★SC-2（裁定44）: 並びを「今日 → 承認待ち → シフト作成 → 仮シフト → 確定シフト」へ。
            仕事の順（今日を見る → 希望を捌く → 組む → 過不足を見る → 誰がいつかを見る）に合わせた。
            ★tab の key（today/queue/build/calendar/roster）は**変えていない**＝分岐はキー文字列で
              行っており、配列の並び順に依存する参照はゼロ（前セッションで実測）。
          ★「カレンダー」→「仮シフト」に改名（充足管理の面という位置づけを名前で示す）。
            内部識別子 "calendar" は据え置き。 */}
      {/* ★C層② H3: 対象切替（モック v4.1 73-79 行「確定シフト｜スタッフ」）。flag off では描かない。 */}
      {staffFlag && (
        <div className="nox-seg" style={{ display: "inline-flex", marginBottom: 8 }}>
          {([["cast", "キャスト"], ["staff", "スタッフ"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={target === k ? "on" : ""} onClick={() => { setDayModal(""); setTarget(k); }}>{label}</button>
          ))}
        </div>
      )}
      {staffFlag && target === "staff" ? (
        <StaffShiftBoard storeId={storeId} role={role} cutoff={cutoff} />
      ) : (<>
      {/* ★裁定274（R15・2026-09-18）: 5 タブ→3 タブ（今日／作る＝[作成|仮シフト]／確定＝[承認待ち|確定シフト]）。
          旧 5 キー（today／queue／build／calendar／roster）は state・setTab・各パネルの分岐とも据え置き＝lib/nox/shift/tabs.ts で写像
          （他所からの setTab("queue") 等の深リンクは不変）。語は 3 語固定（公開／承認／確定）。 */}
      <nav className="nox-subnav">
        {SHIFT_VIEWS.map(([v, label]) => (
          <button key={v} className={viewOfTab(tab) === v ? "on" : ""} onClick={() => { setDayModal(""); setTab(tabOfView(v, tab)); }}>
            {/* ★SC-8 ⑦: today だけラベルを選択日に追従させる（key は "today" のまま＝裁定44）。 */}
            {v === "today" ? tdLabel : label}
            {/* ★v4.1 H2: 件数は丸数字（①〜⑳・モック「承認待ち ④」逐語）。21 件以上は素の数字にフォールバック。承認待ちは「確定」タブの中＝バッジはそこに */}
            {v === "make" && wishes.length > 0 && (
              <span className="nox-tabcnt num">{wishes.length <= 20 ? String.fromCodePoint(0x2460 + wishes.length - 1) : wishes.length}</span>
            )}
          </button>
        ))}
      </nav>
      {/* ★裁定406（便 SH-UI-b）: 「シフト作成」＝手順 4 段（①期間を作る ②提出一覧 ③シフト配置 ④公開シフト）。旧 calendar（仮シフト）は ③ の中。今日・確定シフトは手順を出さない */}
      {viewOfTab(tab) === "make" && (
        <ol className="nox-steps" aria-label="手順" data-shift-steps="1">
          {VIEW_TABS.make.map(([k, label], i) => (
            <li key={k}>
              <button type="button" className={stepOfTab(tab) === i + 1 ? "on" : ""} aria-current={stepOfTab(tab) === i + 1 ? "step" : undefined} data-shift-step={i + 1} onClick={() => { setDayModal(""); setTab(k); }}>
                <span className="num">{i + 1}</span><span>{label}</span>{k === "queue" && wishes.length > 0 ? <span className="nox-tabcnt num">{wishes.length}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
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
      {/* ★SC-7（裁定50'）: 直近7日ストリップ。今日タブの中身は**切り替えない**＝
          カードを押したら「仮シフト」タブの該当日へ飛ばす（充足を見る面はあちらと決めたため）。
          ★attDate・KPI帯・出勤記録・出勤ボーナス・予想人件費の計算経路には一切触っていない。 */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 13 }}>
        {stripDays.map((ymd) => {
          const st = dayStat(ymd);
          const fc = fcOf(ymd);
          const isToday = ymd === bizToday;
          const isSel = ymd === todayDate;
          const short = st.required > 0 && st.assigned < st.required;
          const d = new Date(`${ymd}T00:00:00Z`);
          return (
            <button
              key={ymd}
              onClick={() => {
                // ★SC-8 ⑦: モーダルを開かず、**今日タブ本体の対象日を切り替える**日付セレクタにした。
                //   setTab / setMonth / setSelDate は呼ばない＝面1〜面3 とは state を分けている。
                setTodayDate(ymd);
              }}
              title={`${ymd}・確定${st.confirmed}/確認待ち${st.proposed}/予定${st.planned}`}
              style={{
                flex: "0 0 auto", minWidth: 86, textAlign: "left", cursor: "pointer",
                fontFamily: "inherit", padding: "8px 10px", borderRadius: 9,
                // ★SC-8 ⑦: 金は**選択中**に割り当てる（globals.css「金の3役①＝選択状態」）。
                //   今日であることはラベル文字「今日」で示す＝2軸を色で奪い合わせない。
                border: isSel ? "1px solid var(--gold)" : "1px solid var(--line)",
                background: isSel ? "var(--goldface2)" : "var(--card2)",
                color: "var(--ink)",
              }}
            >
              <span style={{ display: "block", fontSize: 10, color: "var(--v2-muted)" }}>
                {isToday ? "今日" : `${DOW[d.getUTCDay()]}`}
              </span>
              <span className="num" style={{ display: "block", fontSize: 15, fontWeight: 700 }}>
                {Number(ymd.slice(8))}
                <small style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: "var(--v2-muted)" }}>日</small>
              </span>
              <span className="num" style={{ display: "block", fontSize: 11, color: "var(--v2-muted)" }}>
                {st.required > 0 ? `${st.assigned}/${st.required}` : `${st.assigned}人`}
              </span>
              {short && (
                <span className="num" style={{ display: "block", fontSize: 10, color: "var(--bad)", fontWeight: 700 }}>
                  あと{st.required - st.assigned}人
                </span>
              )}
              {isManagerUp && fc && fc.total > 0 && (
                <span className="num" style={{ display: "block", fontSize: 9.5, color: "var(--v2-muted)" }}>{yen(fc.total)}</span>
              )}
            </button>
          );
        })}
      </div>

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
          <div className="nox-kpi2-l">{WISH_STATE_LABEL.pending}</div>{/* ★裁定345: 旧「未承認」 */}
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
            <div className="nox-kpi2-l">予想人件費（{tdLabel}）</div>
            <div className="nox-kpi2-v num">{yen(todayFc.total)}</div>
            <div className="nox-kpi2-s">
              {todayFc.unknownComp > 0 ? `時給未設定 ${todayFc.unknownComp}人` : "シフト×時給ベースの概算"}
            </div>
          </div>
        )}
      </div>

      <div className="nox-2col nox-2col--today">{/* ★裁定358（GV-6・便 GV-A）: 右カラムは ≥1280 だけ横並び・900〜1279 は表の下 */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <div>
              <h2 style={{ ...secTitle, margin: 0 }}>{tdLabel}のシフト（<span className="num">{mdDowOf(todayDate)}</span>）</h2>{/* ★AT2-3: M/D(曜) */}
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
                申請時間・確定時間・出勤記録をこの表で確認します。シフトに無い飛び入り出勤は「＋ 当日追加配置」から先にシフトを足してください。
              </p>
            </div>
            {/* ★SC-1（裁定42）: タブ遷移をやめ、この面でフォームを開く。
                ★既定 status は confirmed＝当日その場で足すのは「もう入る人」（予定ではない）。
                  shift_set は insert 経路で p_status をそのまま格納する（planned 固定ではない）と live 実測済み。 */}
            {isManagerUp && (
              <button className="nox-addc" style={{ marginLeft: "auto" }}
                onClick={() => {
                  // ★SC-8 ⑦: 既定 status は日で分ける（面4 と同式）。裁定42「当日その場で足すのは
                  //   もう入る人」は今日にだけ当てはまり、先の日は「これから組む段」＝planned。
                  setAddDate(todayDate);
                  setAddStatus(todayDate === bizToday ? "confirmed" : "planned");
                  setAddCast(null); setAddModal(true); // ★0125: v6 モーダル直開き（左ペインでキャスト選択）
                }}>＋ 当日追加配置</button>
            )}
          </div>
          {/* ★裁定297-1（2026-09-25・裁定295-1）: cast の修正申請（pending）＝店の決裁。承認／却下とも理由必須（decide_reason）・RPC は既存 punch_correction_decide（新 RPC 0）・cast には出ない（isManagerUp） */}
          {isManagerUp && pending.length > 0 && (
            <Message kind="warn" style={{ marginBottom: 10 }}>
              出退勤の修正申請に未決裁が {pending.length} 件あります。
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
                {pending.map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    {castName(r.cast_id)}: {correctionSummaryOf(r)}（{r.reason}・申請 {requestedLabelOf(r.requested_at)}）
                    <span style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
                      <button type="button" className="nox-btn" style={{ padding: "2px 8px", fontSize: 11.5 }} onClick={() => setDecideRow({ row: r, approve: true })}>承認</button>
                      <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: 4, color: "var(--bad)", border: "1px solid var(--bad)" }} onClick={() => setDecideRow({ row: r, approve: false })}>却下</button>
                    </span>{/* 実行＝青塗り／Danger＝red 枠（裁定242） */}
                  </li>
                ))}
              </ul>
            </Message>
          )}
          {/* ★0154 D1（裁定294-4）: 本人が「異議あり」にした修正＝店側 warn（一覧つき・裁定281 の型） */}
          {isManagerUp && disputed.length > 0 && (
            <Message kind="warn" style={{ marginBottom: 10 }}>
              出退勤の修正に「異議あり」が {disputed.length} 件あります。
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
                {disputed.map((r) => <li key={r.id}>{castName(r.cast_id)}: {correctionSummaryOf(r)}（{r.reason}）</li>)}
              </ul>
            </Message>
          )}
          {/* ★B4-a 裁定220/221（H31）: モック v4.1 171 行「出勤予定／出勤済み／遅刻・未着／欠勤」＝上の KPI 帯は残し、ここに 4 カウンタを足す。 */}
          {shiftsOn(todayDate).length > 0 && (
            <div className="nox-inset" style={{ padding: "8px 12px", marginBottom: 10, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "6px 12px" }}>
              {([
                ["出勤予定", todayCounts.planned, undefined],
                ["出勤済み", todayCounts.arrived, "var(--ok)"],
                ["遅刻", todayCounts.late, todayCounts.late > 0 ? "var(--bad)" : undefined], // ★裁定257 R20-a: 遅刻／未着を分けて表示（閾値＝penalty_config）
                ["未着", todayCounts.missing, todayCounts.missing > 0 ? "var(--bad)" : undefined],
                ["欠勤", todayCounts.absent, todayCounts.absent > 0 ? "var(--bad)" : undefined],
              ] as const).map(([l, v, color]) => (
                <span key={l} style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--sub)", fontSize: 11 }}>{l}</span><br />
                  <b className="num" style={{ fontSize: 14, color: color ?? "var(--ink)" }}>{v}<small style={{ fontWeight: 400, fontSize: 10, marginLeft: 2 }}>人</small></b>
                </span>
              ))}
            </div>
          )}
          {(() => { const n = shiftsOn(todayDate).filter((s) => castReportOf(attOf(s.cast_id, todayDate))).length; const un = shiftsOn(todayDate).filter((s) => reportAckStateOf(attOf(s.cast_id, todayDate)) === "unacked").length; return n > 0 || reportsOnly ? (/* ★便 X13-H H-17 ②: 連絡 n 件（確認済みの列は 0176＝本人の連絡は全部「未確認」） */
            <div style={{ margin: "0 0 8px" }}>
              <button type="button" className={`nox-chip${reportsOnly ? " on" : ""}`} data-report-chip={n} aria-pressed={reportsOnly} style={{ minHeight: 40, padding: "0 14px", fontWeight: 800, color: un > 0 ? "var(--bad)" : undefined }} data-report-unacked={un}
                onClick={() => setReportsOnly((v) => !v)}>{reportChipTextOf(n, un)}{reportsOnly ? "・絞り込み中" : ""}</button>{/* ★便 ON-3（I-4）: 未確認＝ack_at の無い本人連絡 */}
            </div>
          ) : null; })()}
          {shiftsOn(todayDate).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--sub)" }}>本日のシフトはありません</p>
          ) : (
            <div className="nox-tablewrap stickyfirst nox-todaywrap">{/* ★裁定371（GV-22・便 GV-A）: <1280 は 3 段カード（globals.css .nox-todaywrap）。★AT2-3: 名前列を左固定（横スクロールしても行の見出しが残る＝M18 と同じ修飾子） */}
              <table className="nox-table cardrows">{/* ★X-13-17（便 X-13d-1）: ≤899 は 1 人 1 カード（氏名／申請・確定／出勤記録／状態／操作を縦積み・横スクロール廃止）・PC は表のまま */}
                <thead>
                  <tr><th>スタッフ</th><th>申請時間</th><th>確定時間</th><th>出勤記録</th><th>状態</th>{isManagerUp && <th>操作</th>}</tr>{/* ★裁定313／X-8-3: 操作列は owner／manager だけ（staff は列ごと未描画） */}
                </thead>
                <tbody>
                  {shiftsOn(todayDate).filter((s) => !reportsOnly || !!castReportOf(attOf(s.cast_id, todayDate))).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((s) => {
                    const w = s.wish_id ? wishAll.find((x) => x.id === s.wish_id) : undefined;
                    const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
                    // ★SC-8 ⑦（未来日ガード）: 出勤記録の書き込みは todayDate === bizToday のときだけ。
                    const canRecord = isManagerUp && todayDate === bizToday;
                    return (
                      <tr key={s.id}>
                        <td className="c-name" style={{ whiteSpace: "nowrap" }}>{/* ★AT2-3: sticky 列は折り返さない */}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            <CastAvatar name={castName(s.cast_id)} url={photoUrls.get(s.cast_id)} variant="flat" />
                            {castName(s.cast_id)}
                          </span>
                        
                          {(() => { const rp = castReportOf(attOf(s.cast_id, todayDate)); return rp ? (/* ★便 X13-H H-17 ①: 本人の連絡（未確認＝目立つ色）＋記録の 2 ボタン（既存の記録→委託は罰金ダイアログ） */
                            <div data-cast-report={rp.kind} style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "var(--bad)", lineHeight: 1.5, whiteSpace: "normal", maxWidth: 260 }}>
                              {castReportLineOf(rp)}
                              {(() => { /* ★便 ON-3（0176 ★3 I-4）: 確認済み（attendance_ack）・同日の複数連絡の履歴（attendance_contacts） */
                                const a = attOf(s.cast_id, todayDate); const ack = ackLineOf(a?.ack_at); const hist = contactsOf(s.cast_id, todayDate); const hh = contactHistoryHeadOf(hist.length);
                                return (<>
                                  {ack && <span data-report-ack="1" style={{ display: "block", color: "var(--ok)", fontWeight: 600 }}>{ack}</span>}
                                  {hh && <details style={{ fontWeight: 400, color: "var(--sub)" }} data-report-history={hist.length}><summary style={{ cursor: "pointer" }}>{hh}</summary>{hist.map((c, i) => <span key={i} style={{ display: "block" }}>{contactHistoryLineOf(c)}</span>)}</details>}
                                  {isManagerUp && !a?.ack_at && a?.id && <button type="button" className="nox-rowbtn" data-report-ack-btn="1" style={{ marginTop: 4 }} onClick={() => void ackReport(a.id!)}>{ACK_BUTTON}</button>}
                                </>);
                              })()}
                              {canRecord && (
                                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                  <button type="button" className="nox-rowbtn" data-report-rec="late" onClick={() => void setAtt(s.cast_id, "late")}>遅刻として記録</button>
                                  <button type="button" className="nox-rowbtn" data-report-rec="absent" onClick={() => void setAtt(s.cast_id, "absent")}>当欠として記録</button>
                                </span>
                              )}
                            </div>
                          ) : null; })()}</td>
                        <td className="num c-req" data-label="申請" data-empty={w ? undefined : "1"} style={{ color: "var(--v2-muted)" }}>{/* ★371: カードでは値がある時だけ */}
                          {w ? fmtWin(w.start_hm, w.end_hm) : "—"}
                        </td>
                        <td className="num c-conf" data-label="確定">{fmtWin(s.start_hm, s.end_hm)}</td>
                        {/* ★R1: 出勤記録＝旧「出勤板」の統合先。プルダウンではなくボタン群
                            （既存 .nox-seg の文法＝選択中は金枠）。押すと attendance_set をそのまま呼ぶ。
                            ★SC-8 ⑦: 書き込みは**今日だけ**＝attendance_set は RPC 側に未来日ガードが
                            無く（検証は null / 値域5値 / eta 形式 / org・ロールのみ）、明日以降の
                            「出勤」を記録できてしまうため UI で止める。先の日はラベル表示のみ。 */}
                        <td className="wide">
                          {/* ★裁定313（2026-09-29・便 X-8-2）: 1 段構成＝セグメント＋打刻時刻（小字）＋送り（actual 店）＋「退勤」を同段（.nox-attrow・≤899px は 2 行折り返し）。
                              行内のテキストリンクは 0（「精算調整を登録」は操作列「減額」へ・「出勤を修正／退勤を修正」は裁定310 で「時刻修正」へ）。
                              ★便 AT2-2: 出退勤時刻＝punches だけから作る（偽の時刻を作らない）・裁定268 の「(+N 分)」は最初の in。
                              ★便 AT2-1: 退勤（punch_proxy 'out'）は出勤区分の行で in 打刻ありのときだけ押せる（orphan_out を作らない＝裁定257 R20-b）＝判定は outButtonOf のまま。
                              ★0156（裁定309-9）: actual 店のみ「送り」チェック（既定なし）→ punch_proxy の p_okuri */}
                          {(() => {
                            const io = punchIO.get(s.cast_id);
                            const att = attOf(s.cast_id, todayDate);
                            const label = punchTimeLabel(io?.inHm, io?.outHm);
                            const n = io?.inHm ? lateMinutesOf(s.start_hm, io.inHm, lateGraceMin) : null;
                            const ob0 = outButtonOf({ canRecord, attStatus: att?.status, hasIn: !!io?.inHm, hasOut: !!io?.outHm });
                            const ob = proxyPunchOn ? ob0 : { ...ob0, show: false }; // ★0164（便 W5-2b）: 店設定 punch_methods.proxy が OFF なら代行の退勤ボタンを出さない（RPC は拒否しない）
                            const outOn = ob.show && ob.enabled;
                            const view = todayRowViewOf({ attStatus: att?.status, hasIn: !!io?.inHm, hasOut: !!io?.outHm }); // ★便 X13-G W-11
                            return (
                              <div className="nox-attrow" data-att-mode={attRowModeOf({ hasIn: !!io?.inHm, hasOut: !!io?.outHm })} data-att-view={view}>
                                {/* ★裁定383（GV-B W-13）→★便 X13-G W-11: 出勤前＝「出勤」（主ボタン）＋遅刻／当欠／同伴／休み（送り・退勤なし）／出勤後＝チップ＋同伴＋送り・退勤／当欠・休み＝チップのみ／退勤後＝チップ＋送り（退勤なし） */}
                                {(view === "arrived" || view === "done") && (() => {
                                  const mode = attRowModeOf({ hasIn: !!io?.inHm, hasOut: !!io?.outHm });
                                  const dseats = dohanSeats.get(s.cast_id); // ★便 PR-1 R-4（裁定417）: 同伴＝伝票が正本（今日タブの同伴ボタンは撤去・伝票で外せば印も消える）
                                  const ex = lateExemptByDohanOf(n, !!dseats);   // 同伴の営業日は遅刻扱いなし（出勤記録は実時刻のまま）
                                  const chip = arrivedChipOf({ inHm: io?.inHm, outHm: io?.outHm, lateMin: ex.late ? n : 0 });
                                  return (
                                    <span className="nox-attchips" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span className={`nox-stpill ${chip.late ? "warn" : "ok"}`} data-att-chip={mode}>{chip.label}</span>
                                      {dseats && <span className="nox-stpill" data-dohan-chip="1" title={ex.note ?? "伝票の同伴（伝票で外すと消えます）"}>{dohanMarkTextOf(dseats)}</span>}
                                      {ex.note && <span className="sub" data-dohan-exempt="1" style={{ fontSize: 11 }}>{ex.note}</span>}
                                      {att?.eta ? <span className="num sub">見込み {att.eta}</span> : null}
                                    </span>
                                  );
                                })()}
                                {view === "absent" && (
                                  <span className="nox-stpill ng" data-att-chip="absent">{ATT_OPTIONS.find(([v]) => v === att?.status)?.[1] ?? "—"}</span>
                                )}
                                {view === "pre" && (canRecord ? (
                                  <div className="nox-attpre" data-att-seg="1">
                                    {(() => { const on = att?.status === "shukkin"; return (
                                      <button type="button" className={`nox-attpre-main${on ? " on" : ""}`} aria-pressed={on} data-att-main="1"
                                        title={on ? "記録済み（キオスクの打刻待ち）" : "出勤として記録"} onClick={() => { if (!on) void setAtt(s.cast_id, "shukkin"); }}>出勤</button>
                                    ); })()}
                                    <div className="nox-attpre-sub">
                                      {ATT_OPTIONS.filter(([v]) => v !== "shukkin").map(([v, l]) => {
                                        const on = (att?.status ?? "") === v;
                                        return (
                                          <button key={v} type="button" className={on ? "on" : ""} aria-pressed={on}
                                            title={on ? "記録済み（取り消しはできません・選び直してください）" : `${l}として記録`}
                                            onClick={() => { if (!on) void setAtt(s.cast_id, v); }}>{l}</button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--v2-muted)" }}>
                                    {ATT_OPTIONS.find(([v]) => v === (att?.status ?? ""))?.[1] ?? "—"}
                                  </span>
                                ))}
                                {view === "pre" && (label || att?.eta) && (
                                  <span className="num sub">
                                    {label}{label && n !== null ? <span style={{ marginLeft: 4, opacity: 0.75 }}>(+{n} 分)</span> : null}
                                    {att?.eta ? <span style={{ marginLeft: label ? 6 : 0 }}>見込み {att.eta}</span> : null}
                                  </span>
                                )}
                                {canRecord && (view === "arrived" || view === "done") && (
                                  <span className="out">
                                    {/* ★裁定317／357: 「送り」＝okuriButtonOf（退勤後も営業日内は発行可＝退勤後は送りだけ）。退勤前＝退勤＋送り／退勤後＝送りだけ発行 */}
                                    {(() => { const okb = okuriButtonOf({ canRecord, okuriActual, attStatus: att?.status, hasIn: !!io?.inHm, issuedToday: okuriIssued.has(s.cast_id) }); return okb.show ? (
                                      <button type="button" style={{ ...btnLight, padding: "4px 12px", fontSize: 12, opacity: okb.enabled ? 1 : 0.5 }} data-okuri-issued={okuriIssued.has(s.cast_id) ? "1" : undefined}
                                        disabled={!okb.enabled} title={okb.title}
                                        onClick={() => void openOkuri(s.cast_id, io?.outHm ? "issueOnly" : "outAndIssue")}>送り{okuriIssued.has(s.cast_id) ? "済" : ""}</button>
                                    ) : null; })()}
                                    {view === "arrived" && (
                                    <button type="button" style={{ ...btnDark, padding: "4px 12px", fontSize: 12, opacity: outOn ? 1 : 0.5 }}
                                      disabled={!outOn} title={ob.show ? ob.title : "出勤（出勤・遅刻・同伴）を記録すると押せます"}
                                      onClick={() => void outPressed(s.cast_id)}>退勤</button>
                                    )}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="c-state" data-label="状態" style={{ whiteSpace: "nowrap" }}>{/* ★AT2-3: 「確定」の印を折り返し・見切れさせない */}
                          <span className={`nox-stpill ${s.status === "confirmed" ? "ok" : ""}`}
                            style={s.status === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                            {SHIFT_ST_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        {/* ★裁定313（便 X-8-2／X-8-3）: 操作列＝「時刻修正」（裁定310 のモーダル）「減額」（精算調整の登録＝SettlementModal）。owner／manager だけ列ごと描画。
                            減額は委託キャストで遅刻／当欠／早退が検知された行だけ活性（0154 D4 の条件のまま・理由は title）。未確定の行だけ「確認へ」「承認」を足す */}
                        {isManagerUp && (
                        <td className="ops">
                          {(() => {
                            const io = punchIO.get(s.cast_id);
                            const isItaku = casts.find((c) => c.id === s.cast_id)?.employment !== "雇用";
                            const tgt = canRecord && isItaku
                              ? detectTargetOf({ attStatus: attOf(s.cast_id, todayDate)?.status, lateMin: io?.inHm ? lateMinutesOf(s.start_hm, io.inHm, lateGraceMin) : 0, outHm: io?.outHm, endHm: s.end_hm })
                              : null;
                            const why = !canRecord ? "減額の登録は当日の分だけできます"
                              : !isItaku ? "雇用キャストの減給は給与画面から登録します"
                              : !tgt ? "遅刻・当欠・早退が検知された行だけ登録できます" : undefined;
                            return (
                              <span className="nox-rowops" data-att-done={io?.outHm ? "1" : undefined}>
                                <button type="button" className="nox-rowbtn" data-adj-btn="1" style={{ opacity: sClosed ? 0.45 : 1 }} disabled={sClosed} /* ★便 X13-G W-11 ⑥: 枠ボタン 44px */
                                  onClick={() => { setAdjTarget(s); setAStart(s.start_hm); setAEnd(s.end_hm); }}>時刻修正</button>
                                {!io?.outHm && penaltiesOn && (/* ★GV-3: sys_penalties OFF の店は減額の口を出さない。★裁定383: 退勤後は「時刻修正」だけ */
                                <button style={{ ...btnLight, opacity: tgt ? 1 : 0.45 }} disabled={!tgt} title={why}
                                  onClick={() => { if (tgt) setSettle({ castId: s.cast_id, shiftId: s.id, target: tgt }); }}>減額</button>
                                )}
                                {!io?.outHm && castConfirm && s.status === "planned" && (
                                  <button style={{ ...btnLight, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                                    onClick={() => void proposeShifts([s.id])}>確認へ</button>
                                )}
                                {!io?.outHm && s.status !== "confirmed" && (
                                  <button style={{ ...btnDark, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                                    onClick={() => confirmShift(s)}>{PROXY_CONFIRM_LABEL}</button>
                                )}
                              </span>
                            );
                          })()}
                        </td>
                        )}
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
                この曜日の必要人数が未設定です。「仮シフト」タブの「必要人数（曜日・時間帯別）」から設定できます。
              </p>
            ) : (
              <>
                <BandBars stats={todayBands} />
                {/* ★SC-7（裁定51'）: 終日1本しか無いなら「何時が足りないか」は出せない。
                    出せないことを言い、設定できる面へ送る（教訓25＝分からないものを分かったように見せない）。 */}
                {onlyAllDay(todayBands) && (
                  <div className="nox-inset" style={{ padding: "9px 12px", marginTop: 10 }}>
                    <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: 0, lineHeight: 1.7 }}>
                      <b>時間帯別の内訳は未設定です。</b>
                      いまは1日ぶんの人数だけを見ています（何時が足りないかは分かりません）。
                      時間帯ごとに必要人数を登録すると、この欄が時間帯別に分かれます。
                    </p>
                    <button style={{ ...btnLight, marginTop: 8 }} onClick={gotoNeeds}>時間帯を設定する</button>
                  </div>
                )}
              </>
            )}
          </section>
          {/* ★SC-8 ⑦: ストリップの選択日を初期値として渡す（一方向＝パネル内ピッカーは残す）。 */}
          {isManagerUp && bonusOn && <IncentivePanel storeId={storeId} casts={casts} initialDate={todayDate} cutoff={cutoff} />}{/* ★便 GV-C C-5（R-5）: sys_bonus */}
        </div>
      </div>
      </>
      )}

      {/* ── タブ「カレンダー」＝月カレンダー＋日詳細 ── */}
      {/* 段0R その3: >900 はカレンダーと日詳細を横並び（モックの2カラム）・≤900 は縦積み。 */}
      {/* ★裁定406（便 SH-UI-b）② 提出一覧＝募集中の期間（複数可）・締切まで／提出済み／未提出・未提出の名前・提出済みの表・「今すぐ締め切って ③ へ」。締切日を過ぎた期間は自動で③（表示の実効段） */}
      {tab === "submit" && isManagerUp && (() => { const p = focusOf(recruitingPeriods); const sub = p ? submissionOf(p) : null; const left = p ? daysUntil(p.wish_deadline) : null; return (
        <section className="nox-cardtop" style={card} data-shift-submit="1">
          <h2 style={{ ...secTitle, margin: "0 0 4px" }}>② 提出一覧</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>募集中の期間ごとに、キャストの提出状況を見ます。締切日になると自動で ③ シフト配置に移ります（締切後に届いた希望も ③ の承認リストに入ります）。</p>
          {periodTabs(recruitingPeriods, "submit", "募集中の期間")}
          {p && sub && (<>
            <div className="nox-cta" style={{ margin: "10px 0" }}>
              <button type="button" style={t.btnPrimary56} data-shift-close-recruit="1" onClick={async () => { await setPeriodStatus(p, "closed"); openPeriodInStep(p, "queue"); }}>今すぐ締め切って ③ シフト配置へ</button>
            </div>
            <div className="nox-kpis3">
              <div className="nox-rs"><div className="l">締切まで</div><div className="v num">{left === null ? "—" : `${left} 日`}</div></div>
              <div className="nox-rs"><div className="l">提出済み</div><div className="v num">{sub.done.length}<small>人</small></div></div>
              <div className="nox-rs"><div className="l">未提出</div><div className="v num" style={{ color: sub.not.length ? "var(--bad)" : undefined }}>{sub.not.length}<small>人</small></div></div>
            </div>
            <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>未提出</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-shift-not-submitted="1">{sub.not.length === 0 ? <span style={{ fontSize: 12.5, color: "var(--sub)" }}>全員提出済みです。</span> : sub.not.map((c) => <span key={c.id} className="nox-stpill" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{c.name}<button type="button" style={{ ...btnLight, ...t.btnSm }} disabled={busyRemind === c.id} title="本人に「シフト希望の提出をお願いします」の通知を送ります（LINE 連携済みなら LINE にも）" data-submit-remind={c.id} onClick={() => void remindOne(c.id, p)}>{busyRemind === c.id ? "送信中…" : "催促"}</button></span>)}</div>{/* ★B2-3 → ★便 ON-3（0176 ★5 (d)）: 催促＝cast_notification_create（kind other）＋LINE */}
            {isManagerUp && sub.not.length > 0 && (
              <div className="nox-actions" style={{ display: "flex", justifyContent: "center", margin: "8px 0 0" }}>
                <button type="button" style={btnLight} data-remind-all={sub.not.length} onClick={() => { const d = remindNoticeDefaultOf(p); setRemindTarget({ period: p, castIds: sub.not.map((c) => c.id), title: d.title, body: d.body }); }}>未提出の {sub.not.length} 人にお知らせを送る</button>{/* ★便 ON-3（0176 ★5 (e)）: notice_create_targets（宛先つきお知らせ） */}
              </div>
            )}
            <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>提出済み</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="nox-table" style={{ width: "100%" }}><thead><tr><th style={t.th}>キャスト</th><th style={t.th}>提出内容</th><th style={t.th}>最終提出</th></tr></thead>
                <tbody>{sub.done.map((c) => { const open = openSubmitCast === c.id; const rows = open ? wishRowsOf(wishAll, shifts, c.id, p) : []; const todo = unprocessedWishIdsOf(rows).filter((id) => { const w = rows.find((r) => r.wish.id === id)!.wish; return !closedOf(w.date, w.start_hm, w.end_hm); }); return (
                  <Fragment key={c.id}>
                    <tr data-shift-submitted={c.id} className={open ? "on" : ""} style={{ cursor: "pointer" }} onClick={() => setOpenSubmitCast(open ? null : c.id)} aria-expanded={open}>
                      <td style={t.td}><span className="nox-link" style={{ fontWeight: 700 }}>{open ? "▾ " : "▸ "}{c.name}</span></td>
                      <td style={t.td}>{c.work ? `出勤希望 ${c.work} 日` : ""}{c.work && c.off ? "・" : ""}{c.off ? `休み ${c.off} 日` : ""}</td>
                      <td className="num" style={t.td}>{c.last ? c.last.slice(5, 10).replace("-", "/") : "—"}</td>
                    </tr>
                    {open && (
                      <tr data-shift-submit-detail={c.id}><td colSpan={3} style={{ ...t.td, padding: "8px 6px 12px" }}>{/* ★便 SH-UI-b2 B2-3: そのキャスト・その期間の希望一覧＝③シフト配置と同じ RPC・同じ 4 状態（裁定380／345／406）。締切前でも処理できる */}
                        <div className="nox-cta" style={{ marginBottom: 8 }}>
                          <button type="button" style={{ ...btnDark, opacity: todo.length ? 1 : 0.45 }} disabled={!isManagerUp || todo.length === 0} data-submit-bulk={c.id}
                            onClick={() => { void approveAllWishes(todo); }}>未処理を一括確定（{todo.length} 件）</button>
                        </div>
                        <div className="nox-wishrows" data-submit-rows={c.id}>
                          {rows.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>この期間の希望はありません。</p>}
                          {rows.map((r) => (
                            <div key={r.wish.id} className="nox-wishrow" data-wish-state={r.state}>
                              <span className="num">{mdDowOf(r.wish.date)}</span>
                              <span className="num">{(r.wish.kind ?? "work") === "off" ? "休み希望" : `${r.wish.start_hm}–${r.wish.end_hm}`}</span>
                              <span className={`nox-stpill ${r.state === "確定" ? "ok" : r.state === "見送り" ? "ng" : r.state === "調整中" ? "warn" : ""}`}>{r.state}</span>
                              <span className="nox-wishrow-acts">
                                {r.state === "未処理" && isManagerUp && (r.wish.kind ?? "work") === "work" && (<>
                                  <button type="button" style={{ ...btnDark, ...t.btnSm }} disabled={closedOf(r.wish.date, r.wish.start_hm, r.wish.end_hm)} title={closedOf(r.wish.date, r.wish.start_hm, r.wish.end_hm) ? "定休日のため採用できません（見送りは可）" : "希望どおり採用して確定"} onClick={() => void decide(r.wish.id, true)}>確定</button>
                                  <button type="button" style={{ ...btnLight, ...t.btnSm }} onClick={() => { setAdjWish(r.wish); setWStart(r.wish.start_hm); setWEnd(r.wish.end_hm); }}>調整</button>
                                  <button type="button" style={{ ...btnLight, ...t.btnSm }} onClick={() => void decide(r.wish.id, false)}>見送り</button>
                                </>)}
                                {r.state === "未処理" && isManagerUp && (r.wish.kind ?? "work") === "off" && (
                                  <button type="button" style={{ ...btnLight, ...t.btnSm }} onClick={() => void decide(r.wish.id, false)}>見送り</button>
                                )}
                                {r.state === "調整中" && r.shift && isManagerUp && (
                                  <button type="button" style={{ ...btnLight, ...t.btnSm }} onClick={() => { setAdjTarget(r.shift!); setAStart(r.shift!.start_hm); setAEnd(r.shift!.end_hm); }}>再調整</button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ); })}{sub.done.length === 0 && <tr><td colSpan={3} style={{ ...t.td, color: "var(--sub)" }}>まだ提出はありません。</td></tr>}</tbody></table>
            </div>
          </>)}
        </section>
      ); })()}
      {/* ★裁定406 ③ の頭＝配置中の期間の切替＋「④ 公開シフトへ」（承認リストと月カレンダーは従来の queue／calendar パネル） */}
      {(tab === "queue" || tab === "calendar") && isManagerUp && (
        <section className="nox-cardtop" style={card} data-shift-place-head="1">
          <h2 style={{ ...secTitle, margin: "0 0 4px" }}>③ シフト配置</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>上で希望を処理し（承認／調整＝差し戻し（本人確認）か確定／見送り）、下のカレンダーで足りない日に人を置きます。自動配置はありません。</p>
          {periodTabs(placingPeriods, "queue", "配置中の期間")}
          <div className="nox-cta" style={{ marginTop: 10 }}><button type="button" style={t.btnPrimary56} data-shift-go-publish="1" onClick={() => { const p = focusOf(placingPeriods); if (p) openPeriodInStep(p, "publish"); else { setDayModal(""); setTab("publish"); } }}>④ 公開シフトへ</button></div>
        </section>
      )}
      {tab === "queue" && (
      <section className="nox-cardtop" style={card}>
        {(() => {
          const planned = shifts.filter((x) => x.status === "planned");
          const proposed = shifts.filter((x) => x.status === "proposed");
          // ★便 SH-UI-c2 C2-17 ④（相談役案）: 集計の「希望どおり」＝未処理の希望のうち定休日でない件数（＝一括採用の対象＝N が同じ数になる）・「要調整」＝定休日の希望（そのままでは採用できない）。
          //   旧＝planned／proposed の時刻一致（採用後の調整の有無）を数えていたため、一括採用の N（未処理の希望）と食い違っていた（8≠7）。
          const ids = wishes.filter((w) => !closedOf(w.date, w.start_hm, w.end_hm)).map((w) => w.id);
          const adjustN = wishes.length - ids.length;
          const applicants = new Set(wishes.map((w) => w.cast_id)).size;
          const waiting = planned.length + proposed.length; // 確認待ち（調整中＋送り返し）
          const head = queueHeadTextOf({ pending: wishes.length, asIs: ids.length, adjust: adjustN, waiting });
          const any = wishes.length + waiting > 0;
          // ★裁定345／380: 3 段＝審査中（キャスト希望）→採用・確認待ち（調整中＝planned／送り返し＝proposed）→採用・確定
          const steps: Array<[string, string, number]> = [
            ["1", `${WISH_STATE_LABEL.pending}（キャスト希望）`, wishes.length],
            ["2", `${WISH_STATE_LABEL.accepted_wait}（調整中 ${planned.length}・送り返し ${proposed.length}）`, waiting],
            ["3", WISH_STATE_LABEL.accepted_fixed, shifts.filter((x) => x.status === "confirmed").length],
          ];
          return (
            <>
              {/* ★便 SH-UI-c2 C2-17 ①②④: 1 行の見出し（押すと開く・端末に記憶）・説明は「？」・右端は合計 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" data-queue-toggle="1" aria-expanded={queueOpen && any} disabled={!any} onClick={toggleQueue}
                  style={{ all: "unset", cursor: any ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>
                  <span data-queue-head-text="1">{head}</span>{any && <span aria-hidden style={{ color: "var(--sub)" }}>{queueOpen ? "▾" : "▸"}</span>}
                </button>
                <details className="nox-help" style={{ fontSize: 11, color: "var(--sub)" }} data-queue-help="1">
                  <summary style={{ cursor: "pointer", display: "inline-block", width: 20, height: 20, lineHeight: "20px", textAlign: "center", borderRadius: 999, border: "1px solid var(--line2)", fontWeight: 800 }} aria-label="承認待ちの説明">？</summary>
                  <p style={{ margin: "6px 0 0", lineHeight: 1.7 }}>希望どおり採用＝即確定。時間を変えるときは「調整」から、確定するか、キャストへ送り返して確認を待つかを選びます（送り返したまま放置された分だけ「{PROXY_CONFIRM_LABEL}」の対象）。</p>
                </details>
                {any && <span className="nox-stpill" style={{ marginLeft: "auto" }} data-queue-total="1">{queueTotalTextOf(wishes.length, waiting)}</span>}
              </div>
              {queueOpen && any && (
                <>
                  {/* ★便 SH-UI-c2 C2-17 ③: 開いたときの並び＝集計 4 つ → 主ボタン（中央・1 本）→ 副ボタン（0 件は非表示）→ 3 段 → 日付順／人ごと → 一覧 */}
                  <div className="nox-inset" style={{ padding: "8px 12px", margin: "10px 0", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px 12px" }} data-queue-kpi="1">
                    {([["未処理", wishes.length, "件"], ["申請者", applicants, "人"], ["希望どおり", ids.length, "件"], ["要調整", adjustN, "件"]] as const).map(([l, v, u]) => (
                      <span key={l} style={{ fontSize: 12 }} data-queue-kpi-item={l}>
                        <span style={{ color: "var(--sub)", fontSize: 11 }}>{l}</span><br />
                        <b className="num" style={{ fontSize: 14, color: l === "要調整" && v > 0 ? "var(--gold2)" : "var(--ink)" }} data-queue-kpi-value={v}>{v}<small style={{ fontWeight: 400, fontSize: 10, marginLeft: 2 }}>{u}</small></b>
                      </span>
                    ))}
                  </div>
                  {isManagerUp && ids.length > 0 && (
                    <div className="nox-cta" style={{ margin: "0 0 8px" }}>
                      <button type="button" style={t.btnPrimary56} title="表示中の希望（定休日を除く）をまとめて希望どおり採用し、その場で確定します" data-wish-bulk="1" onClick={() => void approveAllWishes(ids)}>
                        希望どおり一括採用（{ids.length}件）
                      </button>
                    </div>
                  )}
                  {isManagerUp && (planned.length > 0 || proposed.length > 0) && (
                    <div className="nox-actions" style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }} data-queue-sub="1">
                      {planned.length > 0 && <button style={btnLight} title="調整中（planned）の全件をキャストへ送り返します（確認待ち）" data-queue-sendback={planned.length} onClick={() => void proposeShifts(planned.map((x) => x.id))}>調整中を送り返す（{planned.length}）</button>}
                      {proposed.length > 0 && <button style={btnLight} title={`送り返したまま放置された分をまとめて${PROXY_CONFIRM_LABEL}します（62件ずつ順に送ります）`} data-queue-proxy={proposed.length} onClick={() => void confirmBulkShifts(proposed.map((x) => x.id))}>放置分を{PROXY_CONFIRM_LABEL}（{proposed.length}）</button>}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", flexWrap: "wrap", marginBottom: 12 }}>
                    {steps.map(([n, label, cnt], idx) => (
                      <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 10.5, color: cnt > 0 ? "var(--v2-text)" : "var(--v2-muted)" }}>
                          <i style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontStyle: "normal", fontSize: 9, border: "1px solid var(--line)", color: cnt > 0 ? "var(--champ)" : "var(--v2-muted)" }}>{n}</i>
                          {label}
                          <span className="num" style={{ fontWeight: 800 }}>{cnt}</span>
                        </span>
                        {idx < steps.length - 1 && <span style={{ color: "var(--v2-muted)" }}>→</span>}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
        {queueOpen && (() => {
          type Row = { key: string; castId: string; date: string; wishHm: string | null; nowHm: string | null;
            stage: string; kind: "wish" | "planned" | "proposed"; wish?: Wish; shift?: Shift };
          const rows: Row[] = [
            ...wishes.map((w) => ({ key: `w${w.id}`, castId: w.cast_id, date: w.date,
              wishHm: fmtWin(w.start_hm, w.end_hm), nowHm: null, stage: `${WISH_STATE_LABEL.pending}（キャスト希望）`, kind: "wish" as const, wish: w })), // ★裁定345
            ...shifts.filter((x) => x.status === "planned" || x.status === "proposed").map((x) => {
              const w = x.wish_id ? wishAll.find((y) => y.id === x.wish_id) : undefined;
              return { key: `s${x.id}`, castId: x.cast_id, date: x.date,
                wishHm: w ? fmtWin(w.start_hm, w.end_hm) : null, nowHm: fmtWin(x.start_hm, x.end_hm),
                stage: wishStateTextOf("accepted", x.status as "planned" | "proposed", castConfirm), // ★裁定345: 「採用・確認待ち（管理者確認／キャスト確認待ち／店の確定待ち）」＝/mine と同じ純関数（旧 245-1 の語は廃止）
                kind: x.status as "planned" | "proposed", shift: x };
            }),
          ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
          // ★B4-b 裁定219（H20）: 人ごと＝名前順→日付順（既定は現行の日付順・値と操作は不変）
          if (queueGroup === "cast") rows.sort((a, b) => castName(a.castId).localeCompare(castName(b.castId), "ja") || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          const countOf = (castId: string) => rows.filter((r) => r.castId === castId).length;
          if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--sub)" }}>未処理のシフト希望はありません。</p>;
          return (
            <div className="nox-tablewrap">
              <div className="nox-seg" style={{ display: "inline-flex", marginBottom: 8 }}>
                {([["date", "日付順"], ["cast", "人ごと"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={queueGroup === k ? "on" : ""} onClick={() => setQueueGroup(k)}>{label}</button>
                ))}
              </div>
              <ResponsiveTable>{/* ★裁定382（GV-B W-1）: 承認待ち＝<600 は 1 行 1 カード */}
              <table className="nox-table cardrows nox-rtable">
                <thead>
                  <tr><th>スタッフ</th><th>勤務日</th><th>希望／提案時間</th><th>現在の段階</th><th>操作</th></tr>{/* ★X-8-11: ≤899px は行をカード化（.nox-table.cardrows・1 段目 名前・日・時間・段階／2 段目 操作を 2 分割全幅） */}
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const closed = r.wish
                      ? closedOf(r.wish.date, r.wish.start_hm, r.wish.end_hm)
                      : closedOf(r.shift!.date, r.shift!.start_hm, r.shift!.end_hm);
                    // ★B4-b 裁定219: 人ごと表示ではキャストの先頭行に見出し行（名前・件数）を差す
                    const head = queueGroup === "cast" && (i === 0 || rows[i - 1].castId !== r.castId);
                    const collapsed = queueGroup === "cast" && qClosed.has(r.castId); // ★裁定380: キャスト別折りたたみ
                    return (
                      <Fragment key={r.key}>
                      {head && (
                        <tr>
                          <td colSpan={5} className="grp" style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", background: "var(--card2)", padding: 0 }}>
                            <button type="button" data-queue-cast={r.castId} aria-expanded={!collapsed} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, padding: "0 10px", boxSizing: "border-box" }}
                              onClick={() => setQClosed((prev) => { const n = new Set(prev); if (n.has(r.castId)) n.delete(r.castId); else n.add(r.castId); return n; })}>
                              <span aria-hidden style={{ color: "var(--sub)" }}>{collapsed ? "▸" : "▾"}</span>
                              {castName(r.castId)} <span className="num" style={{ fontWeight: 400, color: "var(--sub)" }}>（{countOf(r.castId)}件）</span>
                            </button>
                          </td>
                        </tr>
                      )}
                      {!collapsed && (<tr>
                        <td>{castName(r.castId)}</td>
                        <td className="num">{r.date}</td>
                        <td>
                          {/* ★裁定137（v4.1 H21）: 差分はモック逐語「本人希望 → 管理側」の横並び（値と出所は不変） */}
                          {r.wishHm && <span className="num" style={{ color: r.nowHm ? "var(--v2-muted)" : undefined }}>本人希望 {r.wishHm}</span>}
                          {r.nowHm && (
                            <span className="num" style={{ marginLeft: r.wishHm ? 6 : 0 }}>
                              {r.wishHm ? <><span style={{ color: "var(--v2-muted)" }}>→</span> 管理側 </> : ""}{r.nowHm}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="nox-stpill" style={r.kind === "proposed" ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                            {r.stage}
                          </span>
                          {closed && <span style={{ display: "block", fontSize: 10.5, color: "var(--bad)", fontWeight: 700, marginTop: 2 }}>定休日</span>}
                          {r.shift && declineTextOf(r.shift) && <span data-queue-declined="1" style={{ display: "block", fontSize: 10.5, color: "var(--gold2)", fontWeight: 700, marginTop: 2 }}>{declineTextOf(r.shift)}</span>}{/* ★便 ON-3（0176 ★5 (c)・裁定406）: 本人が辞退＝planned に戻っている */}
                        </td>
                        <td className="ops">
                          {isManagerUp && r.kind === "wish" && (
                            <span className="nox-rowops">
                              <button style={{ ...btnDark, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                title={closed ? "この希望日は定休日に設定されています（見送りは可能）" : undefined}
                                onClick={() => decide(r.wish!.id, true)}>希望どおり採用</button>
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed} data-wish-adjust-btn="1"
                                onClick={() => { setAdjWish(r.wish!); setWStart(r.wish!.start_hm); setWEnd(r.wish!.end_hm); }}>調整</button>{/* ★裁定380: 調整して確定／送り返す */}
                              <button style={btnLight} onClick={() => decide(r.wish!.id, false)}>見送り</button>
                            </span>
                          )}
                          {isManagerUp && r.kind === "planned" && (
                            <span className="nox-rowops">
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => { setAdjTarget(r.shift!); setAStart(r.shift!.start_hm); setAEnd(r.shift!.end_hm); }}>調整</button>{/* ★裁定380: 調整して確定／送り返す（代行確定は送り返し放置分のみ＝planned には出さない） */}
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => void proposeShifts([r.shift!.id])}>送り返す</button>
                              {/* ★N4（H30）: shift_remove の UI 結線（計画中の行を削除・wish 由来は希望へ戻る） */}
                              <button style={{ ...btnLight, color: "var(--bad)" }} onClick={() => void removeShift(r.shift!)}>削除</button>
                            </span>
                          )}
                          {isManagerUp && r.kind === "proposed" && (
                            <span className="nox-rowops">
                              <button style={{ ...btnLight, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => { setAdjTarget(r.shift!); setAStart(r.shift!.start_hm); setAEnd(r.shift!.end_hm); }}>再調整</button>
                              <button style={btnLight} onClick={() => void demoteShift(r.shift!)}>差し戻す</button>
                              {/* ★裁定245-2: 行の確定（実行＝青塗り）＝shift_confirm_bulk を 1 件で */}
                              <button style={{ ...btnDark, opacity: closed ? 0.45 : 1 }} disabled={closed}
                                onClick={() => void confirmOne(r.shift!.id)}>{PROXY_CONFIRM_LABEL}</button>
                              <button style={{ ...btnLight, color: "var(--bad)" }} onClick={() => void removeShift(r.shift!)}>削除</button>
                            </span>
                          )}
                        </td>
                      </tr>)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </ResponsiveTable>
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
               （旧）出所（auto／manual）の色分けは ★便 SH-UI-c2 C2-19 ④ で撤去。
            S13 必要人数は右カラム（従来はタブ最下部）。
          ★モックに在るが実体が無いものは描かない（教訓25）: ポジション軸（裁定③・SD-6）／
            配置ルールの「優先順位」seg（shift_rules は max_consec_days・min_month_min の2列のみ）／
            「AI最適化」の語（実体は説明可能な貪欲法＝裁定④の2鍵）。 */}
      {/* ★裁定406（便 SH-UI-b）④ 公開シフト＝配置中の期間の切替・「キャストに公開する」（shift_period_set published）・不足日の一覧（③ で配置する）。下に月カレンダー */}
      {tab === "publish" && isManagerUp && (() => { const p = focusOf(placingPeriods.length ? placingPeriods : publishedPeriods); const sh = p ? shortDaysOf(p) : []; return (
        <section className="nox-cardtop" style={card} data-shift-publish="1">
          <h2 style={{ ...secTitle, margin: "0 0 4px" }}>④ 公開シフト{p && <span className="num" style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: "var(--sub)" }} data-shift-publish-month="1">{periodMonthLabelOf(p.start_date, p.end_date)}</span>}</h2>{/* ★便 SH-UI-c2 C2-18 ④: 月名は期間の実日付から */}
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>公開するとキャストのマイページに確定シフトが出ます。不足のままでも公開できます。公開後の追加・外しは「確定シフト」から。</p>
          {periodTabs(placingPeriods.length ? placingPeriods : publishedPeriods, "publish", placingPeriods.length ? "配置中の期間" : "公開済みの期間")}
          {!placingPeriods.length && publishedPeriods.length > 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>配置中の期間はありません（公開済みの期間を表示しています）。</p>}
          {p && (<>
            <div className="nox-cta" style={{ margin: "10px 0" }}>
              <button type="button" style={{ ...t.btnPrimary56, opacity: p.status === "published" ? 0.5 : 1 }} disabled={p.status === "published"} data-shift-publish-btn="1"
                onClick={async () => { await setPeriodStatus(p, "published"); openPeriodInStep(p, "roster"); }}>{p.status === "published" ? "公開済み" : "キャストに公開する"}</button>
            </div>
            {/* ★便 SH-UI-c2 C2-18 ②: 「作成中に戻す」は ④ に（① の見出しカードから移設・公開ボタンは ④ だけ） */}
            <div className="nox-actions" style={{ display: "flex", justifyContent: "center", margin: "0 0 8px" }}>
              <button type="button" style={btnLight} data-shift-to-draft="1" title="この期間を作成中に戻します（募集・配置をやり直すとき）" onClick={() => void setPeriodStatus(p, "draft")}>作成中に戻す</button>
            </div>
            <h3 style={{ fontSize: 13, margin: "8px 0 6px" }}>不足日 <span className="num" style={{ color: sh.length ? "var(--bad)" : "var(--sub)" }}>{sh.length} 日</span><span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 6 }}>（表示月 {month} の範囲）</span></h3>
            <div style={{ display: "grid", gap: 6 }} data-shift-short-days="1">
              {sh.map((ymd) => { const st = dayStat(ymd); return (
                <div key={ymd} className="nox-shortday"><span className="num">{ymd.slice(5).replace("-", "/")}（{"日月火水木金土"[new Date(`${ymd}T00:00:00Z`).getUTCDay()]}）　{st.assigned}/{st.required}　<b style={{ color: "var(--bad)" }}>あと {st.required - st.assigned}</b></span>
                  <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { setSelDate(ymd); setMonth(ymd.slice(0, 7)); setDayModal(""); setTab("queue"); }}>③ で配置する</button></div>
              ); })}
              {sh.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>不足の日はありません。</p>}
            </div>
          </>)}
        </section>
      ); })()}
      {(tab === "calendar" || tab === "queue" || tab === "publish") && (
        <div>
          <section className="nox-cardtop" style={card} data-shift-place-cal="1">
            {/* ★便 SH-UI-c2 C2-18 ⑤: 「配置を組む」（月カレンダー ⇄ スタッフ別・＋ キャスト別にまとめて追加）は ① から ③ へ */}
            {isManagerUp && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }} data-shift-plantools="1">
                <div>
                  <h3 style={{ ...secTitle, margin: 0, fontSize: 14 }}>配置を組む</h3>
                  <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "2px 0 0" }}>日のセルを押すとその日の配置。キャストからまとめて足すときは「＋ キャスト別にまとめて追加」。</p>
                </div>
                <span className="nox-plantools">
                  <div className="nox-seg">
                    <button className={planView === "cal" ? "on" : ""} onClick={() => setPlanView("cal")}>月カレンダー</button>
                    <button className={planView === "staff" ? "on" : ""} onClick={() => setPlanView("staff")}>スタッフ別</button>
                  </div>
                  <button style={btnDark} onClick={() => { setAddDate(month === bizToday.slice(0, 7) ? bizToday : `${month}-01`); setAddStatus("planned"); setAddCast(null); setAddModal(true); }}>＋ キャスト別にまとめて追加</button>
                </span>
              </div>
            )}
            {/* ★306-6: 年月見出し・‹ ›・今月＝共用部品 MonthNav（見出しは sticky＝306-1） */}
            <MonthNav ym={month} today={bizToday} heading="h2" sticky onChange={setMonth} onToday={() => { setMonth(bizToday.slice(0, 7)); setSelDate(bizToday); }} note={recruitNoteOf(periodsAll, month)} />{/* ★便 SH-UI-c2 C2-18 ⑤: 募集期間の注記（① から移設） */}
            {/* ★DP-R S5: モックの month-summary 帯（確定人時／予想人件費／人員不足日／未処理希望）。
                すべて**取得済み state の再形**＝新規クエリなし。予想人件費は既存 fcByDate の月合算
                （E8-4 #4 と同値）で manager 以上のみ。時給未設定が混じる月は「概算」と併記する。 */}
            {(() => {
              const inMonth = shifts.filter((x) => x.date.slice(0, 7) === month);
              const confMin = inMonth.filter((x) => x.status === "confirmed")
                .reduce((acc, x) => acc + spanMinutes(x.start_hm, x.end_hm), 0);
              // ★SC-7（裁定53'）: 今日以降だけを数える（過ぎた日の不足は手遅れ＝打つ手がない）。
              //   ラベルも「人員不足日（今後）」に変え、何を数えた数字なのかを名前で示す。
              // ★便 SH-UI-c2 C2-19 ⑥: 不足日＝期間のある日だけ数える（期間なしは除外）
              const shortDays = shortDaysInPeriodsOf(calCells.filter((ymd): ymd is string => !!ymd), (ymd) => periodCellStageOf(periodsAll, ymd, bizToday), dayStat, isPast);
              const pend = wishAll.filter((w) => w.status === "pending").length;
              return (
                <div className="nox-repsum" style={{ marginTop: 10 }}>
                  <div className="nox-rs"><div className="l">確定人時</div><div className="v num">{Math.round(confMin / 60)}<small>h</small></div></div>
                  <div className="nox-rs">
                    <div className="l">予想人件費</div>
                    <div className="v num">{isManagerUp ? yen(monthFcTotal) : "—"}</div>
                  </div>
                  <div className="nox-rs" data-shift-short-days-kpi={shortDays}><div className="l">不足日 <small style={{ fontWeight: 400 }}>期間のある日のうち</small></div><div className="v num">{shortDays}<small>日</small></div></div>
                  <div className="nox-rs"><div className="l">未処理希望</div><div className="v num">{pend}<small>件</small></div></div>
                </div>
              );
            })()}
            {confirmCta}{/* ★裁定253 R12: 仮シフト＝KPI 4 枚の下 */}
            {periodBandsJsx}{/* ★AU2-2 仮シフト */}
            {/* ★便 SH-UI-c2 C2-19（B2-1 を上書き）: 凡例＝カレンダー上部に 2 列（進行状況 5／充足状況 4・390px は 2 段）・セル＝地色は充足・右上バッジは進行・中央「確定/必要」「あと N 名」（CalCell） */}
            {planView === "cal" ? (<>
            <CalLegend style={{ margin: "8px 0" }} />
            <div className="nox-calgrid">
              {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
              {calCells.map((ymd, i) => {
                if (!ymd) return <div key={`b${i}`} />;
                const st = dayStat(ymd);
                const fc = fcOf(ymd);
                const stage = periodCellStageOf(periodsAll, ymd, bizToday);
                return (
                  <CalCell key={ymd} ymd={ymd} stat={st} stage={stage} past={isPast(ymd)} sel={ymd === selDate} today={ymd === bizToday} closed={isClosedDay(ymd)} /* ★便 NR-1 B① */
                    onClick={() => { if (periodNoneOf(ymd) && isManagerUp) { openNewPeriodAt(ymd); return; } setSelDate(ymd); setDayModal("calendar"); }} /* ★B2-1: 期間なしの日＝①の新規作成へ・★C2-19 ⑦: その日の配置ダイアログはそのまま */
                    title={`${ymd}・${FILL_LABEL[st.fill]}（確定${st.confirmed}/確認待ち${st.proposed}/予定${st.planned}）${st.over > 0 ? `・余剰${st.over}` : ""}`}
                    yen={isManagerUp && fc && fc.total > 0 ? yen(fc.total) : null}
                    extra={st.over > 0 ? <span className="num" style={{ fontSize: 8.5, opacity: 0.8 }}>余剰+{st.over}</span> : null} />
                );
              })}
            </div>
            </>) : staffMatrixJsx}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              セル＝地色は必要人数の充足・右上は期間の進行・中央は確定/必要人数（時間帯バンドのピーク値）。必要人数は下の「必要人数（曜日・時間帯別）」設定を参照します。
              {/* ★SC-8（裁定57）: 日詳細をモーダルへ統一＝押したその場で開く。 */}
              <b>日を押すとその日の割当が開きます。</b>
            </p>            {/* 段0R その3: 凡例＝色ドット（モック .legend/.dot 逐語）。枠線ではなく塗りで示す。 */}
            <div className="nox-legend" style={{ marginTop: 10 }}>
              <span><span className="nox-dot ok" />充足</span>
              <span><span className="nox-dot warn" />やや不足(-1)</span>
              <span><span className="nox-dot ng" />不足(-2以上)</span>
              <span><span className="nox-dot none" />未設定</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              セル＝状態色＋確定/必要人数（時間帯バンドのピーク値）。必要人数は下の
              「必要人数（曜日・時間帯別）」設定を参照します。
              {/* ★SC-8（裁定57）: 日詳細をモーダルへ統一＝押したその場で開く。 */}
              <b>日を押すとその日の割当が開きます。</b>
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

        {/* ★0125（裁定112-A）: 必要人数カードを build タブ右カラムからここ（仮シフト）へ移設＝
            セル状態色・ピーク表示と同居（見る場所と設定する場所の一致）。中身は移設前の逐語。 */}
        {isManagerUp && (
        <section id="shift-needs" className="nox-cardtop" style={{ ...card, marginTop: 14 }}>
          <h2 style={secTitle}>必要人数（曜日・時間帯別）</h2>
          {/* ★SC-7（裁定51'）: 既定の「終日」ON は変えない（既存の操作を壊さない）。
              代わりに、終日のままだと何が見られないかを1行で言う。 */}
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "-6px 0 10px", lineHeight: 1.7 }}>
            終日のままだと時間帯別の充足は見られません。
            「終日」のチェックを外して 20:00〜24:00 のように登録すると、時間帯ごとの過不足が出ます。
          </p>
          {DOW.map((label, dow) => {
            const bs = needs.filter((n) => n.dow === dow);
            const closedDow = closedDows.has(dow); // ★便 NR-1 B②: 定休日の曜日＝0 固定・入力不可
            return (
              <div key={dow} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                <span style={{ width: 20, color: dow === 0 ? "var(--bad)" : dow === 6 ? "var(--champ)" : "var(--sub)", fontWeight: 700 }}>{label}</span>
                {closedDow && <span data-need-closed={dow} style={{ color: "var(--sub)" }}>定休日（必要人数 0・入力不可）</span>}
                {!closedDow && bs.length === 0 && <span style={{ color: "var(--v2-muted)" }}>未設定</span>}
                {!closedDow && bs.map((n) => (
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
                <HmInput value={nFrom} onChange={setNFrom} ariaLabel="開始" style={{ ...input, width: 64 }} placeholder="20:00" />
                <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
                <HmInput value={nTo} onChange={setNTo} ariaLabel="終了" style={{ ...input, width: 64 }} placeholder="24:00" />
              </>
            )}
            <span style={{ fontSize: 12.5, color: "var(--sub)" }}>必要</span>
            <input type="number" min={0} value={nReq} onChange={(e) => setNReq(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 60 }} />
            <span style={{ fontSize: 12.5, color: "var(--sub)" }}>名</span>
            <button style={{ ...btnDark, opacity: !nAllDay && (hmRangeErrorOf(nFrom) !== null || hmRangeErrorOf(nTo) !== null) ? 0.45 : 1 }}
              disabled={!nAllDay && (hmRangeErrorOf(nFrom) !== null || hmRangeErrorOf(nTo) !== null)} onClick={addNeed}>追加</button>{/* ★318 追補: 範囲外は非活性 */}
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
            人数の変更はフォーカスアウトで保存。時間は 00:00〜24:00（例 20:00〜24:00）。
            同じ曜日で時間帯が重なる設定はできません（同じ開始時刻は上書き）。
          </p>
        </section>
        )}

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
      {tab === "build" && isManagerUp && (
      <>
      {(() => {
        const cur = periods[0] ?? null; // ★0125: 自動配置の期間選択撤去＝表示月の先頭 period を現行計画とする
        const inMonth = shifts.filter((x) => x.date.slice(0, 7) === month);
        const planMin = inMonth.reduce((acc, x) => acc + spanMinutes(x.start_hm, x.end_hm), 0);
        // ★SC-7（裁定53'）: 上の月サマリと同じ式（今日以降）＝同じ画面内で数字が食い違わないようにする。
        const shortDays = calCells.filter((ymd): ymd is string => !!ymd)
          .filter((ymd) => !isPast(ymd))
          .filter((ymd) => { const st = dayStat(ymd); return st.required > 0 && st.assigned < st.required; }).length;
        return (
          <section className="nox-cardtop" style={card} data-shift-period-card="1">
            {/* ★便 SH-UI-c2 C2-18 ①②（裁定406 の役割分担に戻す）: ① に残すのは期間の一覧（状態バッジ・編集・削除）・新規作成／編集フォーム・「必要人数を設定」・凡例。
                上段の見出しカード（月名・公開済み・確定シフトへ・作成中に戻す・④公開シフトへ）・代行確定・集計 4 つは外した＝代行確定と集計は ③、公開／作成中に戻すは ④。 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <h2 style={{ ...secTitle, margin: 0 }}>① 期間を作る</h2>
                <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "2px 0 0" }}>{cur ? <>計画期間 <span className="num">{cur.start_date}〜{cur.end_date}</span> ・ 希望締切 <span className="num">{cur.wish_deadline ?? "—"}</span></> : "計画期間はまだありません（下のフォームで作成できます）"}</p>
              </div>
              <span className="nox-planops">
                <button style={btnLight} title="この下の「必要人数（曜日・時間帯別）」へ移動します" onClick={() => gotoNeeds()}>必要人数を設定</button>
              </span>
            </div>
            {void planMin}{void shortDays}
        {periodBandsJsx}{/* ★AU2-2 */}
        {periods.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>この月の計画はまだありません。下のフォームで作成できます。</p>
        )}
        {/* ★便 T-4: 一覧は表示月に重なる期間＝作成した期間が別の月でも 1 行足して強調する（削除もここから） */}
        {[...periods, ...(pNewId && !periods.some((p) => p.id === pNewId) ? periodsAll.filter((p) => p.id === pNewId) : [])].map((p) => (
          <div key={p.id} className="nox-periodcard" style={p.id === pNewId ? { outline: "1px solid var(--gold)", outlineOffset: -1, borderRadius: 8 } : undefined}>{/* ★306-7: ≤899px は「開始〜終了」「希望締切・状態」の縦 2 段・「編集」「削除」は横書きの小ボタンを右端に横並び */}
            <div className="pc-main">
              <span className="num">{p.start_date} 〜 {p.end_date}</span>
              <span className="pc-sub">
                <span style={{ fontSize: 12, color: "var(--sub)" }}>希望締切 <span className="num">{p.wish_deadline ?? "—"}</span></span>
                <span className={`nox-stpill ${p.status === "published" ? "ok" : ""}`}>{PERIOD_ST_LABEL[p.status] ?? p.status}</span>
                {periodNeedsChipOf(periodNeeds, p.id) && <span className="nox-stpill" data-period-needs-chip="1">{periodNeedsChipOf(periodNeeds, p.id)}</span>}{/* ★便 ON-3（0176 ★5 (a)） */}
              </span>
            </div>
            <div className="pc-acts">
              {/* ★便 SH-UI-c2 C2-18 ③: 状態ごとの小さな導線（募集中→②提出一覧・配置中→③で配置・公開済み→④で見る） */}
              {stageOfP(p) === "open" && <button type="button" className="nox-link" style={{ fontSize: 12 }} data-period-link="submit" onClick={() => openPeriodInStep(p, "submit")}>②提出一覧で見る ›</button>}
              {stageOfP(p) === "closed" && <button type="button" className="nox-link" style={{ fontSize: 12 }} data-period-link="queue" onClick={() => openPeriodInStep(p, "queue")}>③で配置 ›</button>}
              {p.status === "published" && <button type="button" className="nox-link" style={{ fontSize: 12 }} data-period-link="publish" onClick={() => openPeriodInStep(p, "publish")}>④で見る ›</button>}
              <button style={btnLight}
                onClick={() => { setPMsg(null); setPTouched(true); setPEditId(p.id); setPStart(p.start_date); setPEnd(p.end_date); setPDeadline(p.wish_deadline ?? ""); setPStatus(p.status); setPNeeds(periodNeedsFormOf(periodNeeds, p.id)); }}>編集</button>
              <button style={btnLight} title="シフトから参照されている期間は削除できません"
                onClick={() => void removePeriod(p.id)}>削除</button>
            </div>
          </div>
        ))}
        <div className="nox-periodform" style={{ marginTop: 10 }}>{/* ★306-7: 新規フォーム＝開始／終了 1 行・希望締切／状態 1 行・「作成」は最下段右端。状態は SegSelect（4 択）＝picker を使わない */}
          <div className="pf-row">
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{pEditId ? "編集中" : "新規"}</span>
            <label style={{ fontSize: 12 }}>開始 <input type="date" value={pStart} onChange={(e) => { setPTouched(true); setPStart(e.target.value); }} style={input} /></label>
            <label style={{ fontSize: 12 }}>終了 <input type="date" value={pEnd} onChange={(e) => { setPTouched(true); setPEnd(e.target.value); }} style={input} /></label>
          </div>
          <div className="pf-row">
            <label style={{ fontSize: 12 }}>希望締切 <input type="date" value={pDeadline} onChange={(e) => { setPTouched(true); setPDeadline(e.target.value); }} style={input} /></label>
            <SegSelect value={pStatus} onChange={(v) => setPStatus(v)} options={PERIOD_ST_OPTIONS} ariaLabel="状態" />
          </div>
          {/* ★便 ON-3（0176 ★5 (a)）: この期間だけの必要人数（曜日別・空欄＝店の既定）＝shift_period_needs_set（保存と同時に全置換） */}
          <div className="pf-row" data-period-needs="1" style={{ flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--sub)", flexBasis: "100%" }}>必要人数（この期間だけ・空欄＝店の既定）</span>
            {DOW.map((d, i) => (
              <label key={d} style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}>{d}
                <input inputMode="numeric" value={pNeeds[i] ?? ""} onChange={(e) => { const v = e.target.value; setPNeeds((f) => f.map((x, k) => (k === i ? v : x))); }} style={{ ...input, width: 44, padding: "6px 6px", textAlign: "center" }} placeholder="—" aria-label={`${d}曜の必要人数`} data-period-need-dow={i} />
              </label>
            ))}
            <span style={{ fontSize: 10.5, color: "var(--v2-muted)", flexBasis: "100%" }}>{PERIOD_NEEDS_NOTE}</span>
          </div>
          <div className="pf-acts nox-cta">{/* ★裁定406: 主ボタンは中央 */}
            {pEditId && (
              <button style={btnLight} onClick={() => { setPMsg(null); resetPeriodForm(); }}>やめる</button>
            )}
            <button style={{ ...btnDark, opacity: pOverlapText || !pStart || !pEnd ? 0.45 : 1 }} disabled={!!pOverlapText || !pStart || !pEnd} onClick={() => void savePeriod()}>{pEditId ? "変更を保存" : pStatus === "open" ? "作成して募集を始める" : "作成"}</button>{/* ★裁定406 */}
          </div>
        </div>
        {/* ★便 T-1／T-2: 重なりの案内はボタンの直下（同じカード内）・成否も同じ場所（共有枠には出さない） */}
        {pOverlapText && <Message kind="error">{pOverlapText}</Message>}{/* ★裁定281（便 U-6①）: 重なりは赤（error）＝作成ボタンは disabled */}
        {pMsg && <Message kind={pMsg.kind} onDismiss={() => setPMsg(null)}>{pMsg.text}</Message>}
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
          締切は表示用の目安です（提出のブロックはしません）。公開済みの期間には自動配置できません。
        </p>
          </section>
        );
      })()}

      {/* ★便 SH-UI-c2 C2-18 ⑤: 「配置を組む」カレンダー（月カレンダー／スタッフ別・＋ キャスト別にまとめて追加）は ③ シフト配置へ移設＝① は期間の一覧とフォームに集中 */}
      {/* ★0125（裁定112-A/B）: 右カラム（必要人数＋配置ルール）は撤去＝単列化。
          必要人数カードは仮シフト（calendar）タブへ移設（見る場所と設定する場所の一致）。
          配置ルールカードは UI 撤去（shift_rules 器と shift_rules_set は残置）。 */}
      </>
      )}

      {/* ── タブ「確定シフト」＝今後の一覧 ──
          ★DP-R S12（教訓26）でモックの confirmedPanel へ追随: **表**（スタッフ／勤務日／確定時間／
            確定者／状態 の5列＝モック逐語）＋CSV出力。build タブからは外した（モックの create パネルに
            確定一覧は無い）。★スタッフ別マトリクスは S9 によりシフト作成タブの「配置を組む」へ移設。
          ★操作列はモックに無いが「時間を調整」だけ残す＝時刻の訂正は**確定後にも起きる**
            （裁定 DP3-③・status は据え置きなので昇格しない）。予定/確認待ちの操作は承認待ちタブ側。 */}
      {/* ★裁定406（便 SH-UI-b）確定シフト＝公開済みの期間を選ぶとカレンダー（下＝従来の確定シフトパネル・追加／外す・代行確定は従来どおり） */}
      {tab === "roster" && (
        <section className="nox-cardtop" style={card} data-shift-fixed-periods="1">
          <h2 style={{ ...secTitle, margin: "0 0 4px" }}>公開済みの期間</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>期間を選ぶとカレンダーがその月に移ります。日を押すと人の追加・外し（変更は本人の確認待ち）。</p>
          {periodTabs(publishedPeriods, "roster", "公開済みの期間")}
        </section>
      )}
      {tab === "roster" && (
      <section className="nox-cardtop nox-print" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>確定シフト</h2>
            {/* ★R4: 役割分担を画面が自己説明する（カレンダータブ＝充足管理／このタブ＝誰がいつ） */}
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>
              <b>誰がいつ入るか</b>を見る画面です（人数の過不足は「仮シフト」タブで見ます）。
            </p>
          </div>
          <span className="nox-noprint nox-plantools">{/* ★306-8: ≤899px はセグメント 1 行＋ボタン 1 行（CSS .nox-plantools） */}
            <div className="nox-seg">
              <button className={rosterView === "cal" ? "on" : ""} onClick={() => setRosterView("cal")}>カレンダー</button>
              <button className={rosterView === "table" ? "on" : ""} onClick={() => setRosterView("table")}>表で見る</button>
            </div>
            {shifts.length > 0 && <button style={btnLight} onClick={exportShiftsCsv}>CSV出力</button>}
            {/* ★B4-c 裁定223（H37）: 印刷＝ブラウザ印刷（PDF 保存もここから）・印刷隔離で確定一覧だけ出す。CSV は残す。 */}
            {shifts.length > 0 && <button style={btnLight} onClick={() => window.print()}>印刷</button>}
          </span>
        </div>

        {confirmCta}{/* ★裁定253 R12: 確定シフト＝カレンダーの上（未確定分の行き先を示す） */}
        {/* ★R4: 人ベース月カレンダー。★confirmed だけを描く＝「確定シフト」の名に嘘をつかせない
            （予定・確認待ちはこの面に混ぜない＝教訓25）。まだ確定していない分は
            「承認待ち」タブに件数つきで出ているので、取りこぼしにはならない。 */}
        {rosterView === "cal" && (() => {
          const confirmedOn = (ymd: string) =>
            shifts.filter((x) => x.date === ymd && x.status === "confirmed")
              .slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm));
          return (
            <>
              {/* ★306-6: 共用部品 MonthNav（確定タブ） */}
              <MonthNav ym={month} today={bizToday} heading="h3" sticky onChange={setMonth} onToday={() => { setMonth(bizToday.slice(0, 7)); setSelDate(bizToday); }} />
              {/* ★便 AU3（2026-09-24）: 7 列をスマホ幅に収める＝.nox-calgrid--fit（≤899 は minmax(0,1fr)・セルは min-width 0）。名前は cellNamesOf（3 名＋他 n）・時刻は .nox-cald-t（≤899 で非表示＝日詳細モーダルで見る） */}
              <div className="nox-calgrid nox-calgrid--fit">
                {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                {calCells.map((ymd, i) => {
                  if (!ymd) return <div key={`rb${i}`} />;
                  const list = confirmedOn(ymd);
                  const cell = cellNamesOf(list.map((x) => castName(x.cast_id)));
                  const unpublished = isUnpublishedDay(periodsAll, ymd); // ★AU2-3: 期間が未公開の日は「未確定」（期間の無い日は印なし）
                  const rst = dayStat(ymd); const cls = ["nox-cald", "nox-cald2", `fill-${calFillOf(rst.assigned, rst.required)}`, isPast(ymd) ? "past" : "", ymd === selDate ? "sel" : "", ymd === bizToday ? "today" : "", unpublished ? "nox-cald--unpub" : ""].filter(Boolean).join(" "); /* ★便 SH-UI-c2 C2-19: 確定シフトタブも同じ地色（充足） */ // ★306-5: 未確定＝帯（≤899）
                  return (
                    <button key={ymd} className={cls} style={{ minHeight: 92, alignItems: "stretch", position: "relative" }}
                      data-day-state={list.length > 0 ? "fixed" : undefined} /* ★便 GV-C C-14（GV-60）: /mine と同じ色規則（確定＝緑塗り） */
                      onClick={() => { setSelDate(ymd); setDayModal("roster"); }}
                      title={`${ymd}${unpublished ? "・未確定（期間が未公開）" : ""}・${list.length === 0 ? "確定なし" : list.map((x) => `${castName(x.cast_id)} ${fmtWin(x.start_hm, x.end_hm)}`).join(" / ")}`}>
                      <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                      {unpublished && <span className="nox-cald-unpub">未確定</span>}<span className={`nox-cald-bd stg-${periodCellStageOf(periodsAll, ymd, bizToday)}`} data-cal-badge={periodCellStageOf(periodsAll, ymd, bizToday)}>{({ draft: "作成中", open: "募集中", closed: "配置中", published: "公開済み", none: "期間なし" } as Record<string, string>)[periodCellStageOf(periodsAll, ymd, bizToday)]}</span>{/* ★306-5: 日付と重ねない（≥900 は番号の下の行・≤899 は非表示＝上辺の帯） */}
                      {list.slice(0, cell.shown.length).map((x, k) => (
                        <span key={x.id} style={{
                          display: "block", fontSize: 9.5, lineHeight: 1.5, textAlign: "left",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ok)",
                        }}>
                          {cell.shown[k]} <span className="nox-cald-t num">{x.start_hm}-</span>
                        </span>
                      ))}
                      {cell.restLabel && (
                        <span style={{ display: "block", fontSize: 9, color: "var(--v2-muted)", textAlign: "left" }}>
                          {cell.restLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="nox-dslegend" data-day-legend="1"><span className="it"><span className="sw" data-day-state="fixed" />{dayStateLabelOf("fixed")}（/mine のシフト希望と同じ色）</span></div>
              <p className="nox-unpub-legend" style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}><span className="nox-unpub-swatch" aria-hidden="true" />帯＝未確定（期間が未公開）</p>{/* ★306-5: 凡例（≤899 のみ） */}
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
                このカレンダーには<b>確定だけ</b>を出しています（採用・確認待ちは「確定」タブの承認待ち）。
                セルは先頭3名まで。<b>日を押すとその日の全員が開きます</b>（時間の調整もそこから）。
              </p>
            </>
          );
        })()}

        {rosterView === "table" && (shifts.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>
        ) : (
          <div className="nox-tablewrap">
            {shifts.some((s) => isClosedDay(s.date)) && <p data-closed-shift-note="1" style={{ fontSize: 12, color: "var(--bad)", margin: "0 0 8px", lineHeight: 1.7 }}>定休日に入っているシフトがあります（状態に赤い「定休日」）。消す（削除）か残すかは店長が選びます＝自動では消しません。</p>}{/* ★便 NR-1 B④ */}
            <table className="nox-table cardrows">
              <thead>
                <tr><th>スタッフ</th><th>勤務日</th><th>確定時間</th><th>確定者</th><th>状態</th><th className="nox-noprint">操作</th></tr>
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
                      <td className="nox-noprint ops">
                        {isManagerUp && (
                          <span className="nox-rowops">
                            <button style={{ ...btnLight, opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                              title={sClosed ? "この日は定休日に設定されています" : undefined}
                              onClick={() => { setAdjTarget(s); setAStart(s.start_hm); setAEnd(s.end_hm); }}>時間を調整</button>
                            {/* ★裁定108: 行の＋＝このキャストで固定してフォーム直開き（Picker を飛ばす） */}
                            <button style={btnLight} title={`${castName(s.cast_id)} に別日のシフトを追加`}
                              onClick={() => {
                                const c = casts.find((x) => x.id === s.cast_id);
                                if (!c) return;
                                setAddCast(c); setAddStatus("planned"); setAddModal(true);
                              }}>＋</button>
                            {/* ★N4（H30）: 確定行の削除＝shift_remove（出勤記録がある日は RPC が拒否） */}
                            <button style={{ ...btnLight, color: "var(--bad)" }} title="このシフトを削除します（出勤記録がある日は削除できません）"
                              onClick={() => void removeShift(s)}>削除</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* ★裁定253 R14（2026-09-14）: castConfirm（settings_json.shift_cast_confirm）が false の店では proposed は「キャスト未確認」ではなく「未確定」＝ラベルを切り替える（数え方は不変）
            ★B4-c 裁定226（H27）: スタッフ確認状況＝表示月の shifts.status の再形（未確認＝proposed／確認済み＝confirmed・変更希望・辞退希望・催促は器なし＝出さない）。新規読取 0。 */}
        {(() => {
          const inMonth = shifts.filter((x) => x.date.slice(0, 7) === month && (x.status === "proposed" || x.status === "confirmed"));
          if (inMonth.length === 0) return null;
          const byCast = new Map<string, { proposed: number; confirmed: number }>();
          for (const x of inMonth) {
            const e = byCast.get(x.cast_id) ?? { proposed: 0, confirmed: 0 };
            if (x.status === "proposed") e.proposed += 1; else e.confirmed += 1;
            byCast.set(x.cast_id, e);
          }
          const people = [...byCast.entries()].sort((a, b) => castName(a[0]).localeCompare(castName(b[0]), "ja"));
          const unconfirmed = people.filter(([, e]) => e.proposed > 0).length;
          return (
            <div className="nox-noprint" style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>スタッフ確認状況（{my}年{mm}月）</h3>
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "0 0 8px" }}>
                確認済み <b className="num" style={{ color: "var(--ok)" }}>{people.length - unconfirmed}</b>人 ・ {castConfirm ? "未確認" : "未確定"} <b className="num" style={unconfirmed > 0 ? { color: "var(--gold2)" } : undefined}>{unconfirmed}</b>人（未確認＝キャスト確認待ちの行が残っている人）
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {people.map(([cid, e]) => (
                  <span key={cid} className={`nox-stpill ${e.proposed === 0 ? "ok" : ""}`}
                    style={e.proposed > 0 ? { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" } : undefined}>
                    {castName(cid)} {e.proposed === 0 ? "確認済み" : `${castConfirm ? "未確認" : "未確定"} ${e.proposed}件`}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ★B4-c 裁定224（H39）: 確定後の変更履歴＝owner のみ（audit_logs の owner 限定 RLS＝裁定190 同型）。「管理者変更を追加」は器なし＝出さない。 */}
        {isOwner && (
          <div className="nox-noprint" style={{ marginTop: 14 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
              <button type="button" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen}
                style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" style={{ fontSize: 11, color: "var(--v2-muted)" }}>{histOpen ? "▼" : "▶"}</span>
                変更履歴（{my}年{mm}月・最新 {auditRows.length} 件）
              </button>
            </h3>
            {!histOpen ? null : auditRows.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>この月のシフト操作の記録はありません。</p>
            ) : (
              <div style={{ display: "grid", gap: 3 }}>
                {auditRows.map((a) => {
                  const sid = a.target && a.target.startsWith("shifts:") ? a.target.slice(7) : null;
                  const sh = sid ? shifts.find((x) => x.id === sid) : undefined;
                  const who = sh ? castName(sh.cast_id) : (typeof a.after_json?.cast_id === "string" ? castName(a.after_json.cast_id as string) : null);
                  return (
                    <span key={a.id} style={{ fontSize: 11.5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="num" style={{ color: "var(--v2-muted)" }}>{new Date(a.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{SHIFT_ACTION_LABEL[a.action] ?? a.action}</span>
                      {who && <span>{who}{sh ? ` ${sh.date.slice(5).replace("-", "/")} ${fmtWin(sh.start_hm, sh.end_hm)}` : ""}</span>}
                      <span style={{ color: "var(--v2-muted)" }}>{a.actor_user_id ? userNames.get(a.actor_user_id) ?? "—" : "—"}</span>
                    </span>
                  );
                })}
              </div>
            )}
            {histOpen && <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>全操作の詳細は<a href="/audit" className="nox-link">操作履歴</a>で確認できます。</p>}
          </div>
        )}
      </section>
      )}



      {/* ── 手動シフト追加（モック `planShiftDialog`）。DP3 P2 でモーダル化し、SC-1 で部品へ切り出した。
             ★フィールド集合・検証・送る RPC と引数は DP3 当時の逐語のまま（子で保持）。 ── */}
      {/* ★SC-1（裁定42）: 手動追加は ShiftAddForm（部品）。開閉と初期値だけ親が渡す。
          ★送る RPC・引数6本は子へ逐語移送（sha 152dd248…fb41 で照合）＝ここには残っていない。
          保存されたら onSaved で親の load() を回す（子は DB の再取得を知らない）。 */}
      {/* ★0125（裁定112）: 2段ピッカーは廃止＝v6 モーダルの左ペイン（CastPicker）へ統合。
          行の「＋」直開きは initialCast で従来どおりキャスト固定で開く（裁定108 の Picker 維持）。 */}
      {isManagerUp && (
        <ShiftAddForm
          casts={casts} photoUrls={photoUrls} initialCast={addCast} bhRows={bhRows}
          initialDate={addDate} initialStatus={addStatus}
          needs={needs} assignedByDate={assignedByDate} /* ★裁定245-6: 不足 n の材料（staffing_needs と日別配置数） */
          open={addModal} onClose={() => setAddModal(false)}
          onSaved={() => { setMsg("シフトを保存しました"); void load(); }}
        />
      )}

      {/* ★SC-8（裁定57）: 仮シフトタブの日詳細をモーダルへ（右ペイン 380px 固定から移設）。
          ★900px 未満では右ペインが下へ落ちて、日を押しても下スクロールしないと見えなかった（C-11 実測）。
          ★中身は移設前の逐語（充足ピル／内訳3値／余剰／予想人件費＋注記／帯グラフ＋51' 注記／
            実時刻グループの割当リスト／＋キャストを追加）。項目も順序も語彙も変えていない。
          ★表示条件に selInMonth を入れる＝月外なら開かない（52' と同じ方式・空状態の文言は不要になった）。
          ★モーダルから他のモーダル／遷移へ行くものは**先に閉じる**（52' と同じ排他・z-index は増やさない）。 */}
      {dayModal === "calendar" && selInMonth && (
        <Modal onClose={() => { closeDay(); }} maxWidth={520} scroll>
          <div className="nox-modalhead">
            <h3 style={{ ...secTitle, margin: 0 }}><span className="num">{selDate}</span> の割当</h3>
            <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => { closeDay(); }}>×</button>
          </div>
          <div className="nox-modalbody">
            {/* 充足ピル／内訳3値／余剰＝移設前の逐語（順序も語彙も不変） */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
              <span className={`nox-stpill ${selStat.fill === "none" ? "" : selStat.fill}`}>
                {FILL_LABEL[selStat.fill]}{selStat.required > 0 ? ` ${selStat.assigned}/${selStat.required}` : ""}
              </span>
              {/* ★SC-2（裁定44）: 内訳は3値で出す（合計だけ見せて中身を隠さない）。
                  余剰は裁定B のとおり灰＝「困っていない状態」を注意色で主張しない。 */}
              <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
                確定 {selStat.confirmed} / 確認待ち {selStat.proposed} / 予定 {selStat.planned}
                {selStat.over > 0 && <span style={{ marginLeft: 6 }}>・余剰 {selStat.over}</span>}
              </span>
            </div>
            {/* 段S-2: 選択日の予想人件費（モック .moneyrow）＋★必須注記（設計§1・常時表示）。
                注記は moneyrow 直下に固定＝金額だけが独り歩きしない（BANZEN W1 §3.1 と同思想）。
                ★D-15: 月外選択のときは以降を描かない（selInMonth を全ブロックの条件に足す）。 */}
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
                {/* ★SC-7（裁定51'）: 今日タブと同じ注記＋導線（同じ理由・同じ文言）。 */}
                {onlyAllDay(selBands) && (
                  <div className="nox-inset" style={{ padding: "9px 12px", marginTop: 10 }}>
                    <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: 0, lineHeight: 1.7 }}>
                      <b>時間帯別の内訳は未設定です。</b>
                      いまは1日ぶんの人数だけを見ています（何時が足りないかは分かりません）。
                    </p>
                    <button style={{ ...btnLight, marginTop: 8 }}
                      onClick={() => { if (closeDay()) gotoNeeds(); }}>時間帯を設定する</button>
                  </div>
                )}
              </div>
            )}
            {bands.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--v2-muted)" }}>
                この日の割当はありません。下の「＋ キャストを追加」から追加できます。
              </p>
            )}
            {/* ★裁定121: 日付起点の追加はこの面で完結（DayAddPanel＝配置面と共通）。
                ShiftAddForm へ送る旧導線（裁定44-4）は撤去＝キャスト起点はウィザード「＋ キャスト別にまとめて追加」へ。
                ★status は planned（仮シフトの面＝これから組む段）＝今日タブの confirmed とは意図が違う。 */}
            {isManagerUp && (
              <DayAddPanel date={selDate} casts={casts} photoUrls={photoUrls} bhRows={bhRows}
                assignedCastIds={shiftsOn(selDate).map((s) => s.cast_id)}
                onSaved={async () => { setMsg("仮シフトを保存しました"); await load(); }}
                onDirtyChange={setDayDirty} />
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
          </div>
        </Modal>
      )}

      {/* ★SC-7（裁定52'）: 確定シフトタブの日詳細モーダル。
          ★カレンダーの下に置いていた頃は、狭い画面で日を押しても下スクロールしないと見えなかった
            （900px 未満は右ペインが下へ落ちる＝C-11 実測）。押した場所で開くようにする。
          ★中身は移設前の逐語（希望との対比・登録者・時間を調整）。送る RPC は無い（表示のみ）。
          ★D-15 の空状態はここでは出さない＝**月移動でモーダルが開いたままになる経路が無い**
            （開くのはセルの onClick だけで、月移動ボタンはモーダルの背後＝オーバーレイが遮断する）。
            それでも保険として selInMonth を条件に入れ、月外なら開かない。 */}
      {/* ★SC-8 ③-0: dayModal は**開いている面の識別子**（"" = 閉）。面ごとに真偽が排他になるため
          tab 判定を条件に足す必要がない（boolean 時代は tab で補っており、落とすと2面が同時に出た）。
          rosterView === "cal" は残す＝これはタブ判定ではなく同じ面の中のビュー切替（表で見る側では開かない）。 */}
      {dayModal === "roster" && rosterView === "cal" && selInMonth && (() => {
        const sel = shifts.filter((x) => x.date === selDate && x.status === "confirmed")
          .slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm));
        return (
          <Modal onClose={() => setDayModal("")} maxWidth={520} scroll>
            <div className="nox-modalhead">
              <h3 style={{ ...secTitle, margin: 0 }}>
                <span className="num">{selDate}</span> の確定
                <span className="num" style={{ marginLeft: 8, fontWeight: 400, color: "var(--v2-muted)" }}>{sel.length}名</span>
              </h3>
              <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => setDayModal("")}>×</button>
            </div>
            <div className="nox-modalbody">
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
                        onClick={() => {
                          // ★C-12: 重ねない＝日詳細を閉じてから調整モーダルを開く（排他）。
                          setDayModal("");
                          setAdjTarget(x); setAStart(x.start_hm); setAEnd(x.end_hm);
                        }}>時間を調整</button>
                    )}
                  </div>
                );
              })}
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
                ここには<b>確定だけ</b>を出しています（採用・確認待ちは「確定」タブの承認待ち）。
              </p>
            </div>
          </Modal>
        );
      })()}

      {/* ★SC-8 ③: 配置ビュー（シフト作成タブ）の日詳細モーダル＝面3。
          ★「配置を組む」カードの中（カレンダー直下・borderTop 区切り）に置いていたものを移設した。
            中身は移設前の逐語（キャスト名／時刻／状態ピル／調整）。出所（自動・手）の表示は ★便 SH-UI-c2 C2-19 ④ で撤去。
          ★見出し「<日付> の配置」は面1・面2 と同じく nox-modalhead の h3 へ移した（器を揃えるため）。
          ★月外の空状態は出さない＝表示条件の selInMonth が月外を弾く（面1・面2 と同じ方式）。
          ★SC-8 ③-1: planView === "cal" を条件に持つ（面1 の rosterView === "cal" と同じ形）。
            スタッフ別ビューには開く口が無いので到達しないが、**到達性ではなく条件で守る**
            ＝開く口が将来増えても、この面がビュー外で開くことはない。 */}
      {dayModal === "build" && planView === "cal" && selInMonth && (
        <Modal onClose={() => { closeDay(); }} maxWidth={520} scroll>
          <div className="nox-modalhead">
            <h3 style={{ ...secTitle, margin: 0 }}><span className="num">{selDate}</span> の配置</h3>
            <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => { closeDay(); }}>×</button>
          </div>
          <div className="nox-modalbody">
            {/* ★SC-8 ⑤: 空状態・追加ボタン・一覧の3ブロック構成へ（面2 と同じ並び＝
                空状態 → ＋キャストを追加 → 一覧）。文言も面4 と揃えて1文のみにする。 */}
            {shiftsOn(selDate).length === 0 && (
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>この日の配置はありません。</p>
            )}
            {/* ★SC-8 ⑤: status は planned＝配置ビューは「これから組む」段で面2 と同じ意図。
                裁定42 の confirmed は「当日その場で足すのは もう入る人」が根拠＝今日タブ限定なので
                ここには当たらない。★裁定121: 追加はこの面で完結（DayAddPanel＝割当面と共通・ShiftAddForm へ送らない）。 */}
            {isManagerUp && (
              <DayAddPanel date={selDate} casts={casts} photoUrls={photoUrls} bhRows={bhRows}
                assignedCastIds={shiftsOn(selDate).map((s) => s.cast_id)}
                onSaved={async () => { setMsg("仮シフトを保存しました"); await load(); }}
                onDirtyChange={setDayDirty} />
            )}
            {shiftsOn(selDate).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((x) => (
              <div key={x.id} className="nox-listrow" style={{ fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{castName(x.cast_id)}</span>
                <span className="num">{fmtWin(x.start_hm, x.end_hm)}</span>
                <span className={`nox-stpill ${x.status === "confirmed" ? "ok" : ""}`}
                  style={x.status === "proposed" ? { color: "var(--gold2)", borderColor: "var(--gold-bd)" } : undefined}>
                  {SHIFT_ST_LABEL[x.status] ?? x.status}
                </span>
                <button style={btnLight}
                  onClick={() => {
                    // ★C-12 と同じ排他: 日詳細を閉じてから調整モーダルを開く（重ねない）。★裁定121: 未保存なら破棄確認。
                    if (!closeDay()) return;
                    setAdjTarget(x); setAStart(x.start_hm); setAEnd(x.end_hm);
                  }}>調整</button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── ★裁定380（GV-B W-9）: 希望の調整モーダル＝「調整して確定」主／「調整して送り返す」副（採用→時間→確定 or 送り返し。RPC は既存 3 本） ── */}
      {adjWish && isManagerUp && (() => {
        const wh = shiftHoursStatus(adjWish.date, wStart, wEnd, bhRows);
        const bad = wh.status === "closed" || hmRangeErrorOf(wStart, 23) !== null || hmRangeErrorOf(wEnd) !== null;
        return (
          <Modal onClose={() => !wBusy && setAdjWish(null)} maxWidth={460}>
            <div className="nox-modalhead">
              <h3 style={{ ...secTitle, margin: 0 }}>希望を調整</h3>
              <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => setAdjWish(null)}>×</button>
            </div>
            <div className="nox-modalbody" data-wish-adjust="1">
              <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>キャスト</span><span style={{ color: "var(--v2-text)", fontWeight: 700 }}>{castName(adjWish.cast_id)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>日付</span><span className="num">{adjWish.date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)" }}>
                  <span>本人希望</span><span className="num">{fmtWin(adjWish.start_hm, adjWish.end_hm)}</span>
                </div>
              </div>
              <div className="nox-field2">
                <div className="nox-field">
                  <span className="lab">開始</span>
                  <HmInput value={wStart} onChange={setWStart} maxHour={23} ariaLabel="開始" style={{ ...input, width: "100%" }} />
                </div>
                <div className="nox-field">
                  <span className="lab">終了</span>
                  <HmInput value={wEnd} onChange={setWEnd} ariaLabel="終了" style={{ ...input, width: "100%" }} />
                  <span className="hint">2000・20:00 のどちらでも入力できます。24時以降は 25:00（2500）のように書けます。</span>
                </div>
              </div>
              {wh.status === "closed" && <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "6px 0 0" }}>この日は定休日です（採用できません）</p>}
              {wh.status === "outside" && wh.row && <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "6px 0 0" }}>営業時間外です（営業 {fmtHoursLabel(wh.row)}）</p>}
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>確定すると本人に「採用・確定」で出ます。送り返すと本人が確認するまで「採用・確認待ち」です。</p>
              <div style={{ display: "grid", gap: 8, marginTop: 17 }}>
                <button type="button" style={t.btnPrimary56} disabled={wBusy || bad} data-wish-confirm="1" onClick={() => void adjustWish(false)}>調整して確定</button>
                <div style={t.btnRow48}>
                  <button type="button" style={t.btnSecondary48} disabled={wBusy || bad} data-wish-sendback="1" onClick={() => void adjustWish(true)}>調整して送り返す</button>
                  <button type="button" style={t.btnSecondary48} disabled={wBusy} onClick={() => setAdjWish(null)}>やめる</button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}
      {/* ── ★DP3 P2（裁定 DP3-③）: 勤務時間の調整モーダル（モック `adjustDialog`）。
             ★「元の希望との対比」はこのモーダルには入れない＝スコープ判断（d＝シフト深部レーンで消化）。
               **`shifts` は wish_id を持っている**（mig0101・一覧側で結線済み）＝出せないのではない。
             ★「メモ」は列が無いため出せない（shifts 14列 / shift_wishes 12列に該当列なし）。
             理由の別は宣言部の同趣旨の注記と対。ここは既存 `shift_set` の update 経路を呼ぶだけ。 ── */}
      {adjTarget && isManagerUp && (() => {
        const aHours = shiftHoursStatus(adjTarget.date, aStart, aEnd, bhRows);
        const hasPunchTab = adjTarget.date === todayDate; // ★裁定310: 打刻（punchIO／punchRef）は表示日の分だけ読んでいる
        const io = punchIO.get(adjTarget.cast_id);
        const pr = punchRef.get(adjTarget.cast_id);
        const canFix = isManagerUp && adjTarget.date === bizToday; // 打刻の書込は当日のみ（SC-8 ⑦ と同じ）
        const showPunch = hasPunchTab && adjTab === "punch";
        return (
          <Modal onClose={() => setAdjTarget(null)} maxWidth={460}>
            <div className="nox-modalhead">
              <h3 style={{ ...secTitle, margin: 0 }}>{showPunch ? "出退勤を調整" : adjTarget.status === "confirmed" ? "確定シフトの時間を調整" : "時間を調整"}</h3>
              <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={() => setAdjTarget(null)}>×</button>
            </div>
            <div className="nox-modalbody">
              {/* ★裁定310: タブ＝①出退勤（既定）②確定シフトの時間。①は表示日の行だけ */}
              <div className="nox-seg" role="tablist" aria-label="調整の対象" style={{ marginBottom: 12, width: "fit-content" }}>
                {hasPunchTab && (
                  <button type="button" role="tab" aria-selected={adjTab === "punch"} className={adjTab === "punch" ? "on" : ""} onClick={() => setAdjTab("punch")}>出退勤</button>
                )}
                <button type="button" role="tab" aria-selected={!showPunch} className={!showPunch ? "on" : ""} onClick={() => setAdjTab("shift")}>確定シフトの時間</button>
              </div>
              <div className="nox-inset" style={{ padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>キャスト</span><span style={{ color: "var(--v2-text)", fontWeight: 700 }}>{castName(adjTarget.cast_id)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)", marginBottom: 3 }}>
                  <span>日付</span><span className="num">{adjTarget.date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--sub)" }}>
                  <span>{showPunch ? "確定シフト" : "現在"}</span><span className="num">{fmtWin(adjTarget.start_hm, adjTarget.end_hm)}</span>
                </div>
                {showPunch && (["in", "out"] as const).map((k) => {
                  const hm = k === "in" ? io?.inHm : io?.outHm;
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "var(--sub)", marginTop: 3 }}>
                      <span>{KIND_LABEL[k]}（実績）</span>
                      <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                        <span className="num" style={{ color: hm ? "var(--v2-text)" : "var(--sub)", fontWeight: 700 }}>{hm ?? "—"}</span>
                        <button type="button" className="nox-link" style={{ fontSize: 11.5, opacity: canFix ? 1 : 0.5 }} disabled={!canFix}
                          title={canFix ? undefined : "打刻の修正は当日の分だけできます"} onClick={() => setAdjCorrKind(k)}>{hm ? "修正" : "記録する"}</button>
                      </span>
                    </div>
                  );
                })}
              </div>
              {showPunch ? (<>
                <p style={{ fontSize: 11.5, color: "var(--sub)", margin: 0, lineHeight: 1.7 }}>
                  打刻の修正は理由が必須で記録に残り、給与に反映されます（承認の流れは現行どおり）。未打刻は「—」。
                </p>
                {adjCorrKind && (
                  <div className="nox-inset" style={{ padding: "10px 14px", marginTop: 10 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 6px" }}>{KIND_LABEL[adjCorrKind]}の時刻を修正</p>
                    <PunchCorrectionForm key={adjCorrKind} showHead={false} castId={adjTarget.cast_id} castName={castName(adjTarget.cast_id)} biz={todayDate} kind={adjCorrKind}
                      punchId={adjCorrKind === "in" ? pr?.inId ?? null : pr?.outId ?? null} punchAtIso={adjCorrKind === "in" ? pr?.inIso ?? null : pr?.outIso ?? null}
                      shiftStartHm={adjTarget.start_hm} shiftEndHm={adjTarget.end_hm} term={termOf(casts.find((c) => c.id === adjTarget.cast_id)?.employment)}
                      onClose={() => setAdjCorrKind(null)} onDone={(text) => { setMsg(text); setPunchTick((v) => v + 1); }} />
                  </div>
                )}
                {!adjCorrKind && (
                  <div className="nox-actions" style={{ display: "flex", gap: 9, marginTop: 17 }}>
                    <button style={btnLight} onClick={() => setAdjTarget(null)}>閉じる</button>
                  </div>
                )}
              </>) : (<>
              <div className="nox-field2">
                <div className="nox-field">
                  <span className="lab">開始</span>
                  <HmInput value={aStart} onChange={setAStart} maxHour={23} ariaLabel="開始" style={{ ...input, width: "100%" }} />
                </div>
                <div className="nox-field">
                  <span className="lab">終了</span>
                  <HmInput value={aEnd} onChange={setAEnd} ariaLabel="終了" style={{ ...input, width: "100%" }} />
                  <span className="hint">2000・20:00 のどちらでも入力できます。24時以降は 25:00（2500）のように書けます。</span>
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0", lineHeight: 1.7 }}>
                {adjTarget.status === "confirmed"
                  ? `状態（${SHIFT_ST_LABEL[adjTarget.status] ?? adjTarget.status}）は変わりません。時間だけを直します。打刻は変わりません・給与は動きません。`
                  : "確定するか、キャストへ送り返して確認を待つかを選びます。打刻は変わりません・給与は動きません。"}{/* ★裁定380 */}
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
              {adjTarget.status === "confirmed" ? (
              <div className="nox-actions" style={{ display: "flex", gap: 9, marginTop: 17 }}>
                <button style={btnLight} onClick={() => setAdjTarget(null)}>やめる</button>
                <button style={{ ...btnDark, opacity: aHours.status === "closed" || hmRangeErrorOf(aStart, 23) !== null || hmRangeErrorOf(aEnd) !== null ? 0.45 : 1 }}
                  disabled={aHours.status === "closed" || hmRangeErrorOf(aStart, 23) !== null || hmRangeErrorOf(aEnd) !== null} onClick={() => void adjustShift()}>保存</button>{/* ★318 追補: 範囲外は非活性 */}
              </div>
              ) : (
              <div style={{ display: "grid", gap: 8, marginTop: 17 }} data-adj-paths="1">{/* ★裁定380（GV-B W-9）: 調整して確定（主）／調整して送り返す（副） */}
                <button type="button" style={t.btnPrimary56} data-adj-confirm="1"
                  disabled={aHours.status === "closed" || hmRangeErrorOf(aStart, 23) !== null || hmRangeErrorOf(aEnd) !== null} onClick={() => void adjustShift("confirm")}>調整して確定</button>
                <div style={t.btnRow48}>
                  <button type="button" style={t.btnSecondary48} data-adj-sendback="1"
                    disabled={aHours.status === "closed" || hmRangeErrorOf(aStart, 23) !== null || hmRangeErrorOf(aEnd) !== null} onClick={() => void adjustShift("sendback")}>調整して送り返す</button>
                  <button type="button" style={t.btnSecondary48} onClick={() => setAdjTarget(null)}>やめる</button>
                </div>
              </div>
              )}
              </>)}
            </div>
          </Modal>
        );
      })()}
      </>)}
    </div>
  );
}
