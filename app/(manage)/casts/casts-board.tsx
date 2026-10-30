"use client";

// キャスト管理ボード（F3d 体入採用 UI・モック「体入・採用管理」＋「新規キャスト登録」準拠）。
// 操作は全て RPC 経由＝trial_register/trial_update/trial_hire/trial_reject／cast_create。
// 真の防御は trials RLS（owner/manager 限定）＋各 RPC ゲート（UI は操作面）。
import { useCallback, useEffect, useState } from "react";
import { useLiveReload } from "@/lib/nox/ui/use-live-reload"; // ★便 GV-C C-12: focus／visibility／60 秒で再読込
import PageHead from "@/components/ui/page-head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-12-1（起票90）: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import Toast, { Message, type MessageKind } from "@/components/ui/toast";
import { rpcErrJa, isRpcMissingError } from "@/lib/nox/ui/rpc-err";
import SegSelect from "@/components/ui/seg-select"; // ★0154 D6: 契約区分
import { WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SELECT_NOTE, WITHHOLDING_KIND_SHORT, defaultWithholdingKindOf, withholdingKindChoices, withholdingKindOf } from "@/lib/nox/payroll/withholding-kind"; // ★便 M3 M-21
import { mig0183On, mig0188On, mig0190On, mig0191On } from "@/lib/nox/rules-0175/flag"; // ★便 M3 M-21 // ★0190（裁定436 ①c）: 退店の失効（route）
import { NOTE_EMPLOYMENT, NOTE_LABOR, amountKeyOf, laborNoteNeeded, nextPeriodStartOf, overridesWithRule, payRuleLabelOf, payRuleOptionsOf, ruleOfOverrides, type Employment } from "@/lib/nox/cast/pay-rule"; // ★0154 D2／D6
import type { PayRule } from "@/lib/nox/pay";
// ★夜間便 N4（裁定282-2／282-3／287-3・0151 ★3）: 保証時給の表示用純関数（DB を知らない）
import { guaranteeStateOf, guaranteeBadgeOf, guaranteeEndNoteOf, addDays, mdOf, type PlanRowLike } from "@/lib/nox/cast/guarantee"; // ★便 L-3-1: 終了の注記
import { useIsDemo } from "@/lib/nox/demo/context"; // ★N7-2 ③: デモでは写真アップロード・招待・PW 再発行の導線を隠す
import Modal from "@/components/ui/modal";
import CastAvatar from "@/components/ui/cast-avatar";
import PhotoEdit from "@/components/ui/photo-edit"; // ★X-13-5: 写真の現在・変更・削除（スタッフ編集と同じ部品）
import { resolveOrgId, signCastPhotos, uploadCastPhoto } from "@/lib/nox/cast-photo";
import { removeCastPhoto } from "@/lib/nox/staff-photo"; // ★0162（裁定329／329 追補1・便 M5-1）: 削除＝storage.remove → clear_cast_photo
import type { Trial, CastLogin } from "./page";
import AdvanceOkuriForm from "@/components/nox/advance-okuri-form"; // ★裁定300-2: 前借り／送り実費の入口（cast 固定・共通部品・既存 RPC）
import DailyPayForm from "@/components/nox/daily-pay-form"; // ★0156（裁定309-6・便 V-4）: 日払いの発行（cast 固定・daily_pay_issue・源泉プレビュー）
import { issueDateDefaultOf } from "@/lib/nox/payroll/advance-okuri";
import { okuriModeOf, okuriFlatTiersOf, okuriTierLabelOf } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）・追補（0180）: 送り区分
import { okuriTiersOn } from "@/lib/nox/rules-0175/flag"; // ★裁定414 追補（0180）
const CAST_RELOAD_COLS: string = okuriTiersOn() ? "id, name, user_id, photo_updated_at, is_active, store_id, left_on, rank_id, joined_on, kind, employment, employment_valid_from, shift_request_mode, okuri_tier" : "id, name, user_id, photo_updated_at, is_active, store_id, left_on, rank_id, joined_on, kind, employment, employment_valid_from, shift_request_mode";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★便 P175-prep P-4
import AvailabilityEditor from "@/components/nox/availability-editor"; // ★便 P175-prep P-4（裁定397＋413）: 基本の働き方
import ContactChangesPanel from "@/components/nox/contact-changes-panel"; // ★便 ON-3（0176 ★4 400）: 連絡先の変更（未確認）
import { LINE_BIND_NOTE, liffBindUrlOf } from "@/lib/nox/line/liff-endpoint"; // ★便 ON-3（0176 ★1 401）: LINE 連携のリンク
import Picker from "@/components/nox/picker"; // ★裁定306-13: 待遇プランの候補（件数可変＝picker）
import { isSystemOn } from "@/lib/nox/store-systems";
import { firstInLastOut, isTodayWorking, todayStateOf, type TodayState } from "@/lib/nox/shift/today-row"; // ★裁定353（便 N1014 A-2）: 今日の状態＝今日タブと同じ純関数
import { bizDateOf } from "@/lib/nox/biz-date";
import { NORM_STATUS_LABEL, castNormStatusOf, currentWageOf, monthElapsedOf, normRateOf, wageTiersOf, type CurrentWage, type NormStatus } from "@/lib/nox/cast/current-wage"; // ★裁定374（GV-B W-4）: 今期の時給（プレビューと同じ純関数）・達成状況
import { sumCastSales, type CastSalesRow } from "@/lib/nox/payroll/cast-sales"; // ★裁定374: 実績＝/mine と同じ合算（get_cast_sales 月レンジ）
import { NORM_AXIS_LABEL, hasOverride, normAxesOf, normTargetsOf, planDefaultQuotaOf, quotaKeysOfAxes, resolveQuotaOf, shimeiScopeOf, resolveNormTargetsOf } from "@/lib/nox/store/norm-axes"; // ★裁定347／GV-2（0171・便 P171）: 継承・上書き・採用軸 // ★GV-3（便 N1013b B-8）: sys_norms OFF＝今月のノルマの入力口を出さない
import { TRIAL_KIND, TRIAL_PLAN_NAME, isTrialCastOf, trialDaysLeftChipOf, trialGuaranteeRangeOf, trialPlanWarnOf, trialSettingsOf } from "@/lib/nox/cast/trial-flow"; // ★便 GV-C C-14f（GV-65・裁定396）: 体入の一括操作
import { SHIFT_REQUEST_MODE_LABEL, mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定337（0167）: シフト希望の方式のラベルと店の既定
import { NOTE_PLAN_SWITCH, planSwitchErrJa, planSwitchValidate } from "@/lib/nox/cast/plan-switch"; // ★裁定306-13（適用開始日の既定＝pay-rule の nextPeriodStartOf）
import { QUOTA_FORM_EMPTY, QUOTA_KEYS, QUOTA_LABEL, QUOTA_UNIT, quotaArgsOf, quotaFormEquals, quotaFormOf, quotaMonthOptionsOf, type Quota, type QuotaForm, cardAxesOf, cardFmt, type CardAxis } from "@/lib/nox/mine/quota"; // ★0160（裁定326-3・便 M2-2）: 今月のノルマ（set_cast_quota）

type Store = { id: string; name: string; settings_json?: Record<string, unknown> | null }; // ★裁定300-2: 送り方式（okuri_mode）・ベース額（okuri_base_amount）

type InviteResult = { login_email: string; initial_password: string | null };

// 書類4種の正本キー（mig0040 の documents jsonb と共有）。
const DOC_KEYS = [
  { key: "id_doc", label: "身分証（年齢確認・風営法）" },
  { key: "contract", label: "雇用契約書" },
  { key: "pledge", label: "誓約書" },
  { key: "bank", label: "振込口座" },
] as const;
const TIERS = ["エース", "人気", "レギュラー", "体入"] as const;
// 段C2: 「出勤した日」の集合＝出勤板（shift-board）/ホームと同一定義（新しい判定を作らない）。
const PRESENT = new Set(["shukkin", "dohan", "late"]);

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const secTitle: React.CSSProperties = t.cardTitle;
const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };
// 招待モーダル（staff-board の追加モーダル雛形）

function ageOf(birthday: string | null): string {
  if (!birthday) return "—";
  const b = new Date(birthday + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return `${a}歳`;
}

export default function CastsBoard({
  isOwner, stores, myStoreId, initialTrials, initialLoginCasts, ranks, emailByUser = {},
}: {
  isOwner: boolean; stores: Store[]; myStoreId: string; initialTrials: Trial[]; initialLoginCasts: CastLogin[];
  ranks: { id: string; name: string; is_active: boolean }[];
  /** ★裁定193（B1・K7）: users.id → email（null=未登録）。KPI 判定専用・画面には出さない */
  emailByUser?: Record<string, string | null>;
}) {
  const supabase = createClient();
  const isDemo = useIsDemo(); // ★N7-2 ③
  // ★便 ON-3（0176 ★1 401）: LINE 連携（line_links subject 'cast'）＝連携済みの集合・発行したリンク（1 回だけ表示）
  const [lineLinked, setLineLinked] = useState<Set<string>>(new Set());
  const [bindUrl, setBindUrl] = useState<string | null>(null);
  const [bindCopied, setBindCopied] = useState(false);
  useEffect(() => { void (async () => { const { data } = await supabase.from("line_links").select("subject_id").eq("subject_kind", "cast"); setLineLinked(new Set(((data ?? []) as { subject_id: string }[]).map((x) => x.subject_id))); })(); }, [supabase]);
  async function issueBind(c: CastLogin) {
    setBindUrl(null); setBindCopied(false);
    const { data, error } = await supabase.rpc("line_bind_token_create", { p_subject_kind: "cast", p_subject_id: c.id, p_purpose: "bind" });
    if (error || typeof data !== "string") { setMsg(`LINE 連携のリンクを発行できませんでした: ${rpcErrJa(error?.message ?? "")}`); return; }
    setBindUrl(liffBindUrlOf(window.location.origin, c.store_id, data));
  }
  const [trials, setTrials] = useState<Trial[]>(initialTrials);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // F3g' castログイン招待（mig0041）: 招待/PW再発行モーダル
  const [loginCasts, setLoginCasts] = useState<CastLogin[]>(initialLoginCasts);
  const [invTarget, setInvTarget] = useState<CastLogin | null>(null);
  const [invMode, setInvMode] = useState<"invite" | "reset">("invite");
  const [invEmail, setInvEmail] = useState("");
  const [invIdemKey, setInvIdemKey] = useState("");
  const [invErr, setInvErr] = useState<string | null>(null);
  const [invResult, setInvResult] = useState<InviteResult | null>(null);
  const [invCopied, setInvCopied] = useState(false);

  // F4a キオスク打刻 PIN（mig0043 set_cast_pin・owner/manager 自店・4桁）
  const [pinTarget, setPinTarget] = useState<CastLogin | null>(null);
  const [pinVal, setPinVal] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinDone, setPinDone] = useState(false);

  // ── 段P キャスト写真（mig0064/0065＋Storage ポリシー3本）──
  //   実体は private バケット cast-photos の {org_id}/{cast_id}.jpg 固定（1キャスト1ファイル・上書き運用）。
  //   ここは操作面。真の防御は Storage ポリシー（owner ∨ manager∧自店 ∨ 本人）と
  //   set_cast_photo_updated_at の同一 authz＝UI を通さない直叩きでも他店の子は差し替えられない。
  const [orgId, setOrgId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  // ── 段C2（キャスト刷新・正本 nox-casts-redesign-mock-v1.html）──
  //   テーブル→カードグリッド＋詳細3タブ。フィルタ/検索/月次2数値はすべて既存データの client 再形。
  //   ★機微情報（本名・生年月日・マイナンバー等）はこの画面に持ち込まない＝現行の分離設計を維持。
  const [filter, setFilter] = useState<"active" | "trial" | "left" | "today">("active"); // ★裁定353: 「今日出勤」フィルタ
  const [todayOf, setTodayOf] = useState<Record<string, TodayState>>({}); // ★裁定353: cast → 今日の状態
  const [liveTick, setLiveTick] = useState(0); // ★便 GV-C C-12: 今日の状態を再読込する合図
  useLiveReload(() => setLiveTick((n) => n + 1));
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ kind: "cast" | "trial"; id: string } | null>(null);
  const [dtab, setDtab] = useState<"basic" | "comp" | "account">("basic");
  // ★裁定109（mig0122）: 源氏名・入店日の編集 draft（開くとき現在値で初期化・保存成功で閉じる）
  const [profEdit, setProfEdit] = useState(false);
  const [profName, setProfName] = useState("");
  const [profJoined, setProfJoined] = useState("");
  // ★X-13-6（便 X-13a）: 別キャストを開いたとき前回の編集 draft（源氏名・入店日）が残らないように＝sel が変わったら編集を閉じ draft を空に
  useEffect(() => { setProfEdit(false); setProfName(""); setProfJoined(""); }, [sel]);
  const [showAdd, setShowAdd] = useState(false);
  // 月次2数値（相談役メモ②）＝現物確認の結果★どちらも新規 RPC なしで取れる:
  //   今月指名＝既存 get_cast_ranking（cast_id 付きで hon/jonai/dohan を返す・dashboard と同じ呼び方）
  //   今月出勤＝attendance を月範囲で引いて cast_id 別に数える（(cast_id,date) UNIQUE ゆえ行数＝日数）
  const [rankOf, setRankOf] = useState<Record<string, { hon: number; jonai: number; dohan: number }>>({});
  const [attDaysOf, setAttDaysOf] = useState<Record<string, number>>({});
  const month = new Date().toISOString().slice(0, 7);
  // E8-5 casts#2: ランク絞り込み（T2）。プルダウン新設禁止＝チップ（ボタン）で行う。
  //   "" = 全ランク／"none" = ランクなし／それ以外 = rank_id。
  const [rankFilter, setRankFilter] = useState<string>("");
  // E8-5 casts#3/#5: プラン割当（cast_plan）とプラン実値（comp_plans）＝owner/manager は RLS で読める。
  //   表示専用（編集経路はマスタのまま＝機能不変）。overrides_json は mig0086 の8キー。
  const [castPlanOf, setCastPlanOf] = useState<Record<string, { planId: string; ov: Record<string, number | string> }>>({});
  // ★0154 D2／D6（裁定291 追補1 B・294-5／294-9）: 報酬型（cast_plan.overrides_json の pay_rule／額）と契約区分（set_cast_employment）の編集状態
  const [ruleForm, setRuleForm] = useState<{ rule: PayRule; amount: string } | null>(null);
  const [ruleMsg, setRuleMsg] = useState<{ kind: "error" | "success" | "warn" | "info"; text: string } | null>(null);
  const [empForm, setEmpForm] = useState<{ employment: Employment; from: string } | null>(null);
  const [castWhKind, setCastWhKind] = useState<Record<string, string | null>>({}); // ★便 M3 M-21: 源泉区分（cast_tax_profiles.withholding_kind・null＝既定）
  useEffect(() => { if (!mig0183On()) return; let alive = true; void supabase.from("cast_tax_profiles").select("cast_id, withholding_kind").then(({ data }) => { if (alive) setCastWhKind(Object.fromEntries(((data ?? []) as { cast_id: string; withholding_kind: string | null }[]).map((r) => [r.cast_id, r.withholding_kind]))); }); return () => { alive = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveCastKind(castId: string, v: string) {
    const { error } = await supabase.rpc("set_withholding_kind", { p_subject_kind: "cast", p_subject_id: castId, p_kind: v === "" ? null : v });
    setEmpMsg(error ? { kind: "error", text: `源泉区分の保存エラー: ${rpcErrJa(error.message)}` } : { kind: "success", text: "源泉区分を保存しました" });
    if (!error) setCastWhKind((m) => ({ ...m, [castId]: v === "" ? null : v }));
  }
  const [empMsg, setEmpMsg] = useState<{ kind: "error" | "success" | "warn" | "info"; text: string } | null>(null);
  // ★裁定306-13: 待遇プランの切替（候補＝店の有効な comp_plans・適用開始日＝次の給与期の初日が既定・過去日不可・確定済みの期は不可・既存 RPC set_cast_plan＝上書きは維持）
  const [activePlans, setActivePlans] = useState<{ id: string; name: string }[]>([]);
  const [planForm, setPlanForm] = useState<{ planId: string | null; from: string } | null>(null);
  const [planMsg, setPlanMsg] = useState<{ kind: "error" | "success" | "warn" | "info"; text: string } | null>(null);
  const [plansById, setPlansById] = useState<Record<string, {
    name: string; base: number; hon_back: number; jonai_back: number; dohan_back: number;
    hon_back_mode: string; hon_back_rate: number | null; jonai_back_mode: string; jonai_back_rate: number | null;
    norm_days_target?: number | null; norm_dohan_target?: number | null; norm_sales_target?: number | null; norm_shimei_target?: number | null; // ★裁定347（0171）: プラン既定の目標
  }>>({});
  // E8-5 casts#6（縮小）: 選択キャストの次回シフト（shifts 1行 select・表示専用）
  const [nextShift, setNextShift] = useState<{ date: string; start_hm: string; end_hm: string; status: string } | null>(null);
  // ★夜間便 N4-1（裁定282-2／287-3）: 保証時給＝cast_plan の履歴行（valid_from／valid_to・overrides_json.guarantee=true）を全件持ち、
  //   現在行＝今日を含む行（旧: 順不同の最後の行が勝っていた＝履歴行があると現在行を取り違える）。
  //   guaRpc: set_cast_guarantee の有無（0151 手貼り前は 'missing'＝節ごと非表示）。probe は p_amount null で 'bad amount' が返る＝書込なし。
  const [planRowsOf, setPlanRowsOf] = useState<Record<string, PlanRowLike[]>>({});
  const [guaRpc, setGuaRpc] = useState<"unknown" | "ok" | "missing">("unknown");
  const [guaForm, setGuaForm] = useState<{ mode: "new" | "extend"; amount: string; start: string; end: string } | null>(null);
  const [guaMsg, setGuaMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const today = new Date().toISOString().slice(0, 10); // 次回シフト（casts#6）と同じ日付の取り方
  // ★0160（裁定326-3・便 M2-2）: 今月のノルマ＝cast_quotas（店×cast×月初 date・4 項目・NULL＝目標なし）。月は今月／翌月（month と同じ取り方）・保存は set_cast_quota（owner／manager 自店）
  const [quotaMonth, setQuotaMonth] = useState<string>(`${month}-01`);
  const [quotaCur, setQuotaCur] = useState<QuotaForm>(QUOTA_FORM_EMPTY);
  const [quotaForm, setQuotaForm] = useState<QuotaForm>(QUOTA_FORM_EMPTY);
  const [quotaRow, setQuotaRow] = useState<Partial<Quota> | null>(null); // ★裁定347: 個別（null＝継承）
  // ★裁定374（GV-B W-4）: 今期の時給（給与プレビュー 1 リクエスト）とノルマ達成状況（get_cast_sales 1 本＋cast_quotas／cast_norms／in 打刻 各 1 本＝N+1 なし）。表示専用・計算は純関数
  const [w4, setW4] = useState<{ pay: Record<string, { pay: Record<string, unknown>; planName: string }>; sales: CastSalesRow[]; quotas: Record<string, Partial<Quota>>; norms: Record<string, { days_target: number }>; inDays: Record<string, number> }>({ pay: {}, sales: [], quotas: {}, norms: {}, inDays: {} });
  const [planFilter, setPlanFilter] = useState<string>("");
  const [normFilter, setNormFilter] = useState<"" | NormStatus>("");
  const [wageFilter, setWageFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<"name" | "wage" | "rate">("name");
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaMsg, setQuotaMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const selCastId = sel?.kind === "cast" ? sel.id : null;
  useEffect(() => {
    let alive = true;
    setQuotaMsg(null);
    if (!selCastId) { setQuotaCur(QUOTA_FORM_EMPTY); setQuotaForm(QUOTA_FORM_EMPTY); return; }
    void supabase.from("cast_quotas").select("hon, jonai, dohan, sales").eq("cast_id", selCastId).eq("month", quotaMonth).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const f = quotaFormOf((data ?? null) as Partial<Quota> | null);
      setQuotaRow((data ?? null) as Partial<Quota> | null); // ★裁定347
      setQuotaCur(f); setQuotaForm(f);
    });
    return () => { alive = false; };
  }, [supabase, selCastId, quotaMonth]);
  async function saveQuota(c: CastLogin) {
    const a = quotaArgsOf(quotaForm);
    if (!a.ok) { setQuotaMsg({ kind: "error", text: a.err }); return; }
    setQuotaBusy(true); setQuotaMsg(null);
    const { error } = await supabase.rpc("set_cast_quota", { p_store_id: c.store_id, p_cast_id: c.id, p_month: quotaMonth, ...a.args });
    setQuotaBusy(false);
    if (error) { setQuotaMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    setQuotaCur(quotaForm);
    setQuotaRow(Object.fromEntries(QUOTA_KEYS.map((k) => [k, quotaForm[k].trim() === "" ? null : Number(quotaForm[k].replace(/[^0-9]/g, ""))])) as Partial<Quota>); // ★裁定347: 保存後の個別値
    setQuotaMsg({ kind: "success", text: "ノルマを保存しました" });
  }
  // ★裁定347（0171・便 P171）: 「プランの既定に戻す」＝個別を全部 null にして保存（set_cast_quota 4 引数 null＝目標なし＝継承）
  async function resetQuotaToPlan(c: CastLogin) {
    setQuotaBusy(true); setQuotaMsg(null);
    const { error } = await supabase.rpc("set_cast_quota", { p_store_id: c.store_id, p_cast_id: c.id, p_month: quotaMonth, p_hon: null, p_jonai: null, p_dohan: null, p_sales: null });
    setQuotaBusy(false);
    if (error) { setQuotaMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    setQuotaRow(null); setQuotaCur(QUOTA_FORM_EMPTY); setQuotaForm(QUOTA_FORM_EMPTY);
    setQuotaMsg({ kind: "success", text: "プランの既定に戻しました" });
  }
  /** ★裁定347: 選択キャストのプラン既定（cast_plan 現在行→comp_plans.norm_*）と採用軸・指名カウントから解決（個別＞既定＞なし） */
  const quotaResolvedOf = (c: CastLogin) => {
    const sj = stores.find((st) => st.id === c.store_id)?.settings_json ?? null;
    const axes = normAxesOf(sj); const scope = shimeiScopeOf(sj);
    const a = castPlanOf[c.id]; const pl = a ? plansById[a.planId] : null;
    return { axes, scope, keys: quotaKeysOfAxes(axes, scope), res: resolveQuotaOf(planDefaultQuotaOf(normTargetsOf(pl ?? null), axes), quotaRow, axes, scope) };
  };

  useEffect(() => { void resolveOrgId(supabase).then(setOrgId); }, [supabase]);
  // ★裁定374（GV-B W-4）: 今期の時給＝/api/payroll/preview（当月・給与と同じ純関数）／実績＝get_cast_sales（当月）／個別目標＝cast_quotas・cast_norms（当月）／出勤日数＝in 打刻の営業日
  useEffect(() => {
    const storeId = myStoreId || stores[0]?.id || "";
    if (!storeId) return;
    let alive = true;
    void (async () => {
      const sj = (stores.find((st) => st.id === storeId)?.settings_json ?? {}) as Record<string, unknown>;
      const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
      const mEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const [pv, sr, qr, nr, pr] = await Promise.all([
        fetch("/api/payroll/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, period: month }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.rpc("get_cast_sales", { p_store_id: storeId, p_from: `${month}-01`, p_to: mEnd }),
        supabase.from("cast_quotas").select("cast_id, hon, jonai, dohan, sales").eq("month", `${month}-01`),
        supabase.from("cast_norms").select("cast_id, days_target").eq("period", month),
        supabase.from("punches").select("cast_id, punched_at").eq("type", "in").gte("punched_at", `${month}-01T${cutoff}:00+09:00`),
      ]);
      if (!alive) return;
      const pay: Record<string, { pay: Record<string, unknown>; planName: string }> = {};
      for (const r of ((pv as { rows?: { castId: string; breakdown?: { pay?: Record<string, unknown> } }[] } | null)?.rows ?? [])) pay[r.castId] = { pay: r.breakdown?.pay ?? {}, planName: String((r.breakdown?.pay as { plan?: { name?: string } } | undefined)?.plan?.name ?? "") };
      const quotas: Record<string, Partial<Quota>> = {};
      for (const r of (qr.data ?? []) as { cast_id: string; hon: number | null; jonai: number | null; dohan: number | null; sales: number | null }[]) quotas[r.cast_id] = { hon: r.hon, jonai: r.jonai, dohan: r.dohan, sales: r.sales };
      const norms: Record<string, { days_target: number }> = {};
      for (const r of (nr.data ?? []) as { cast_id: string; days_target: number }[]) norms[r.cast_id] = { days_target: r.days_target };
      const inDays: Record<string, number> = {};
      const seen: Record<string, Set<string>> = {};
      for (const r of (pr.data ?? []) as { cast_id: string; punched_at: string }[]) { const d = bizDateOf(r.punched_at, cutoff); if (d.slice(0, 7) !== month) continue; (seen[r.cast_id] ??= new Set()).add(d); }
      for (const [cid, set] of Object.entries(seen)) inDays[cid] = set.size;
      setW4({ pay, sales: (sr.data ?? []) as CastSalesRow[], quotas, norms, inDays });
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStoreId, stores, month]);

  const loadStats = useCallback(async () => {
    const storeId = myStoreId || stores[0]?.id || "";
    if (storeId) {
      const { data: rk } = await supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: month });
      const m: Record<string, { hon: number; jonai: number; dohan: number }> = {};
      for (const r of (rk ?? []) as Record<string, unknown>[]) {
        m[r.cast_id as string] = { hon: (r.hon_count as number) ?? 0, jonai: (r.jonai_count as number) ?? 0, dohan: (r.dohan_count as number) ?? 0 };
      }
      setRankOf(m);
    }
    // 出勤日数＝出勤/同伴/遅刻を「出勤した日」とみなす（出勤板 shift-board / home と同じ PRESENT 集合）
    const { data: at } = await supabase
      // ★#66（2026-09-09）: 月末 lte -31 は 30 日月／2 月で Postgres 22008（KPI が 0 名に落ちる）→ 翌月 1 日 lt へ。month の決め方は不触。
      .from("attendance").select("cast_id, status").gte("date", `${month}-01`)
      .lt("date", (() => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; })());
    const d: Record<string, number> = {};
    for (const r of (at ?? []) as Record<string, unknown>[]) {
      if (PRESENT.has(r.status as string)) d[r.cast_id as string] = (d[r.cast_id as string] ?? 0) + 1;
    }
    setAttDaysOf(d);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, myStoreId, stores]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  // E8-5 casts#3/#5: プラン割当＋実値の一括取得（表示専用・2 select のみ）
  //   ★N4-1: valid_from／valid_to を足して履歴行を全件持ち、表示する割当は「今日を含む行」（無ければ valid_to null の行）。保証の保存後に再読込。
  const loadPlans = useCallback(async () => {
      const [{ data: cp }, { data: pl }] = await Promise.all([
        supabase.from("cast_plan").select("cast_id, plan_id, overrides_json, valid_from, valid_to"),
        supabase.from("comp_plans").select("id, name, base, hon_back, jonai_back, dohan_back, hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate, is_active, norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target, slide_period, slide_apply") /* ★裁定374: 判定期間・★便 X13-H H-8: 判定タイミング */, // ★裁定347（0171）: 既定目標 4 列 // ★306-13: is_active（同じ取得に同乗）
      ]);
      const m: Record<string, { planId: string; ov: Record<string, number | string> }> = {};
      const rowsOf: Record<string, PlanRowLike[]> = {};
      for (const r of (cp ?? []) as Record<string, unknown>[]) {
        const cid = r.cast_id as string;
        const vf = (r.valid_from as string) ?? "0000-01-01"; const vt = (r.valid_to as string | null) ?? null;
        (rowsOf[cid] ??= []).push({ valid_from: vf, valid_to: vt, overrides_json: r.overrides_json });
        const isCurrent = vf <= today && (vt === null || today <= vt);
        if (isCurrent || (!m[cid] && vt === null)) m[cid] = { planId: r.plan_id as string, ov: (r.overrides_json ?? {}) as Record<string, number | string> };
      }
      const p: typeof plansById = {};
      for (const r of (pl ?? []) as Record<string, unknown>[]) {
        p[r.id as string] = {
          name: r.name as string, base: r.base as number,
          hon_back: r.hon_back as number, jonai_back: r.jonai_back as number, dohan_back: r.dohan_back as number,
          hon_back_mode: (r.hon_back_mode as string) ?? "per_count", hon_back_rate: r.hon_back_rate as number | null,
          jonai_back_mode: (r.jonai_back_mode as string) ?? "per_count", jonai_back_rate: r.jonai_back_rate as number | null,
          norm_days_target: r.norm_days_target as number | null, norm_dohan_target: r.norm_dohan_target as number | null, norm_sales_target: r.norm_sales_target as number | null, norm_shimei_target: r.norm_shimei_target as number | null, // ★裁定347
          ...({ slide_period: r.slide_period ?? null, slide_apply: r.slide_apply ?? null } as object), // ★便 X13-H live ②: 判定期間とタイミングを写す（select はしていたが詰めていなかった＝裁定374 の文言が常に「日次」だった）
        };
      }
      setActivePlans(((pl ?? []) as Record<string, unknown>[]).filter((r) => r.is_active !== false).map((r) => ({ id: r.id as string, name: r.name as string }))); // ★306-13: 候補＝有効プランのみ
      setCastPlanOf(m); setPlansById(p); setPlanRowsOf(rowsOf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  useEffect(() => { void loadPlans(); }, [loadPlans]);
  // ★裁定353（便 N1014 A-2）: 今日（営業日＝店の cutoff）の確定シフト／出勤区分／打刻＝各 1 クエリ→todayStateOf（今日タブと同じ材料・別計算なし）
  useEffect(() => {
    let alive = true;
    void (async () => {
      const sj = (stores[0]?.settings_json ?? {}) as Record<string, unknown>;
      const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
      const bizToday = bizDateOf(new Date().toISOString(), cutoff);
      const next = new Date(`${bizToday}T${cutoff}:00+09:00`); next.setDate(next.getDate() + 1);
      const [sh, at, pu] = await Promise.all([
        supabase.from("shifts").select("cast_id, start_hm, end_hm, status").eq("date", bizToday),
        supabase.from("attendance").select("cast_id, status").eq("date", bizToday),
        supabase.from("punches").select("cast_id, type, punched_at").gte("punched_at", `${bizToday}T${cutoff}:00+09:00`).lt("punched_at", next.toISOString()),
      ]);
      if (!alive) return;
      const io = firstInLastOut(((pu.data ?? []) as { cast_id: string; type: "in" | "out"; punched_at: string }[]));
      const attBy = new Map(((at.data ?? []) as { cast_id: string; status: string }[]).map((r) => [r.cast_id, r.status]));
      const shBy = new Map<string, { start_hm: string; end_hm: string; status: string }>();
      for (const r of ((sh.data ?? []) as { cast_id: string; start_hm: string; end_hm: string; status: string }[])) { const cur = shBy.get(r.cast_id); if (!cur || r.status === "confirmed") shBy.set(r.cast_id, r); }
      const m: Record<string, TodayState> = {};
      for (const cid of new Set([...shBy.keys(), ...attBy.keys(), ...io.keys()])) m[cid] = todayStateOf({ shift: shBy.get(cid) ?? null, attStatus: attBy.get(cid) ?? null, inHm: io.get(cid)?.inHm ?? null, outHm: io.get(cid)?.outHm ?? null });
      setTodayOf(m);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, liveTick]);
  const todayStateOfCast = (cid: string): TodayState => todayOf[cid] ?? { key: "none", label: "予定なし" };
  // ★N4-1: set_cast_guarantee の有無を 1 回だけ探る（引数 null＝RPC は 'bad amount' を raise・書込なし。未適用なら PostgREST が「関数が無い」を返す）
  useEffect(() => {
    let alive = true;
    void supabase.rpc("set_cast_guarantee", { p_cast_id: null, p_amount: null, p_start: null, p_end: null })
      .then(({ error }) => { if (alive) setGuaRpc(error && isRpcMissingError(error.message) ? "missing" : "ok"); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setGuaForm(null); setGuaMsg(null); }, [sel, dtab]); // 281-4: 選択・タブが変わったら節内のフォームと成否を消す
  // ★0155（裁定309-3・便 S-3）: マイナンバーの廃棄候補（cast_mynumber_discard_candidates＝owner のみ・退店日の翌年 1/1 起算 7 年経過＋登録あり・全店）。owner 以外は取得も描画もしない（S-6）
  const [discardCands, setDiscardCands] = useState<{ cast_id: string; store_id: string; name: string; left_on: string; due_on: string }[] | null>(null);
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void supabase.rpc("cast_mynumber_discard_candidates", { p_store_id: null })
      .then(({ data }) => { if (alive) setDiscardCands((data ?? []) as { cast_id: string; store_id: string; name: string; left_on: string; due_on: string }[]); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);
  // E8-5 casts#6（縮小）: 選択キャストの次回シフト（今日以降の最初の1行）
  useEffect(() => {
    setNextShift(null);
    const castId = sel?.kind === "cast" ? sel.id : null;
    if (!castId) return;
    let alive = true;
    void supabase.from("shifts").select("date, start_hm, end_hm, status")
      .eq("cast_id", castId).gte("date", new Date().toISOString().slice(0, 10))
      .order("date").limit(1)
      .then(({ data }) => { if (alive) setNextShift(((data ?? [])[0] as typeof nextShift) ?? null); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    void signCastPhotos(supabase, orgId, loginCasts).then((m) => { if (alive) setPhotoUrls(m); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, loginCasts]);

  /** ★0162（裁定329／329 追補1・便 M5-1）: 写真の削除＝Storage の実体 → clear_cast_photo。成功で一覧の photo_updated_at を取り直す（署名 URL が消える） */
  async function deletePhoto(c: CastLogin) {
    if (!orgId) return;
    if (!confirm(`${c.name} の写真を削除しますか？`)) return;
    setBusy(true);
    try {
      await removeCastPhoto(supabase, orgId, c.id);
      await reloadLoginCasts();
      setMsg("写真を削除しました");
    } catch (e) {
      setMsg(rpcErrJa(e instanceof Error ? e.message : "削除に失敗しました"));
    } finally {
      setBusy(false);
    }
  }
  /** ★X-13-5（便 X-13a）: 写真の登録／差替え＝直接 pick（PhotoEdit）→ uploadCastPhoto（縮小・Storage・打刻は lib）。旧プレビュー付きモーダル経路は撤去 */
  async function uploadPhotoDirect(c: CastLogin, f: File) {
    if (!orgId) return;
    setBusy(true);
    try {
      await uploadCastPhoto(supabase, orgId, c.id, f);
      await reloadLoginCasts(); // photo_updated_at を取り直す＝署名 URL も新しい v= で張り直る
      setMsg("写真を保存しました");
    } catch (e) {
      setMsg(rpcErrJa(e instanceof Error ? e.message : "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function submitPin() {
    if (!pinTarget) return;
    if (!(mig0191On() ? /^[0-9]{4,6}$/ : /^[0-9]{4}$/).test(pinVal)) { setPinErr(mig0191On() ? "PIN は数字 4〜6 桁で入力してください" : "PIN は数字4桁で入力してください"); return; }   // ★0191 ★3
    setBusy(true); setPinErr(null);
    const { error } = await supabase.rpc("set_cast_pin", { p_cast_id: pinTarget.id, p_pin: pinVal });
    setBusy(false);
    if (error) setPinErr(error.message);
    else setPinDone(true); // PIN 自体は再表示しない（DB は bcrypt のみ・audit にも非搭載）
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("trials")
      .select("id, store_id, name, real_name, birthday, tier, rating, documents, memo, status, trial_date")
      .eq("status", "trial")
      .order("created_at", { ascending: false });
    setTrials((data ?? []) as Trial[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setTrials(initialTrials); }, [initialTrials]);

  async function rpc(label: string, fn: string, args: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setMsg(error ? `${label}に失敗: ${error.message}` : `${label}しました`);
    setBusy(false);
    await load();
    return !error;
  }

  // ★便 GV-C C-14f（GV-65・裁定396）: 「体入を追加」＝cast_create（区分 体入）→ set_cast_plan（体験入店・今日から）→ set_cast_guarantee（店設定の日数・体験入店の基本時給）。
  //   新 RPC なし・非原子＝途中で失敗したら、どこまで済んだかを出して止める（キャストは登録済み＝詳細から続きを設定できる）。
  const trialPlanOf = () => activePlans.find((p) => p.name === TRIAL_PLAN_NAME) ?? null;
  async function addTrialCast(args: Record<string, unknown>): Promise<boolean> {
    const plan = trialPlanOf();
    if (!plan) { setMsg(`「${TRIAL_PLAN_NAME}」プランが見つかりません（マスタ ▸ 待遇プランで作成してください）`); return false; }
    const sid = (args.p_store_id as string) || myStoreId || stores[0]?.id || "";
    const ts = trialSettingsOf(stores.find((st) => st.id === sid)?.settings_json ?? null);
    setBusy(true); setMsg(null);
    const done: string[] = [];
    const stop = async (step: string, m: string) => { setMsg(`体入の追加を途中で止めました（${done.length ? `済み: ${done.join("・")}／` : ""}失敗: ${step}＝${rpcErrJa(m)}）`); setBusy(false); await reloadLoginCasts(); await loadPlans(); return false; };
    const c = await supabase.rpc("cast_create", { ...args, p_kind: TRIAL_KIND });
    if (c.error || !c.data) return stop("キャスト登録", c.error?.message ?? "no id");
    const castId = c.data as string; done.push("キャスト登録（在籍区分 体入）");
    const p = await supabase.rpc("set_cast_plan", { p_cast_id: castId, p_plan_id: plan.id, p_overrides: {}, p_valid_from: today });
    if (p.error) return stop(`プラン「${TRIAL_PLAN_NAME}」`, p.error.message);
    done.push(`プラン「${TRIAL_PLAN_NAME}」`);
    const r = trialGuaranteeRangeOf(today, ts.days);
    const amount = plansById[plan.id]?.base ?? 0;
    if (amount > 0) {
      const g = await supabase.rpc("set_cast_guarantee", { p_cast_id: castId, p_amount: amount, p_start: r.start, p_end: r.end });
      if (g.error) return stop("期限付き保証", g.error.message);
      done.push(`保証 ¥${amount.toLocaleString()}（${mdOf(r.start)}〜${mdOf(r.end)}）`);
    }
    setMsg(`体入を追加しました（${done.join("・")}）`);
    setBusy(false);
    await reloadLoginCasts(); await loadPlans();
    return true;
  }
  // 本採用＝店の既定プランへ切替（確認なし・今日から・上書きは引き継がない）。★在籍区分の更新は RPC が無い＝0175
  async function hireTrialCast(c: CastLogin, planId: string) {
    setBusy(true); setPlanMsg(null);
    const { error } = await supabase.rpc("set_cast_plan", { p_cast_id: c.id, p_plan_id: planId, p_overrides: {}, p_valid_from: today });
    if (error) { setBusy(false); setPlanMsg({ kind: "error", text: planSwitchErrJa(error.message) }); return; }
    // ★便 X13-H H-11 ③: 本入店日が空なら当日（体入開始日は別の値のまま）
    if (!c.joined_on) {
      const pf = await supabase.rpc("set_cast_profile", { p_cast_id: c.id, p_name: c.name, p_joined_on: today });
      if (pf.error) { setBusy(false); setPlanMsg({ kind: "error", text: `本採用しました。本入店日の設定に失敗しました（詳細の「編集」から入れてください）: ${rpcErrJa(pf.error.message)}` }); await loadPlans(); await reloadLoginCasts(); return; }
      await reloadLoginCasts();
    }
    setBusy(false);
    setPlanMsg({ kind: "success", text: `本採用しました（待遇プラン「${activePlans.find((p) => p.id === planId)?.name ?? ""}」・${today} から・詳細から変更できます）` });
    await loadPlans();
  }
  const [hirePick, setHirePick] = useState<string | null>(null);

  // ── mig0074 入退店（cast_leave / cast_rejoin・owner∨manager自店＝RPC 側が最終防御）──
  //   本ページは page.tsx が owner/manager 以外を redirect 済み＝ボタンの出し分けは role ではなく状態で行う。
  const LEAVE_MSG: Record<string, string> = {
    "already inactive": "このキャストはすでに退店済みです。",
    "already active": "このキャストはすでに在籍中です。",
    "already active elsewhere": "同じユーザーの在籍キャストが既に存在します。",
    "not found": "対象のキャストが見つかりません。",
    forbidden: "この操作を行う権限がありません。",
  };
  async function castLeaveRejoin(c: CastLogin, kind: "leave" | "rejoin") {
    const label = kind === "leave" ? "退店" : "復活";
    if (!confirm(kind === "leave"
      ? `${c.name} を退店にします。よろしいですか？（本人のログインとキオスク打刻ができなくなります）`
      : `${c.name} を復活（在籍に戻す）します。よろしいですか？`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(kind === "leave" ? "cast_leave" : "cast_rejoin",
      kind === "leave" ? { p_cast_id: c.id, p_left_on: null } : { p_cast_id: c.id });
    const key = Object.keys(LEAVE_MSG).find((k) => (error?.message ?? "").includes(k));
    // ★0190（裁定436 ①c）: RPC 成功の後に auth の失効（退店＝ban・復活＝unban）を route に頼む。RPC 側は staff_pin の削除と kiosk_sessions の終了を済ませている。
    //   route の失敗は退店を止めない（is_active=false が真の防御・再実行で ban し直せる）＝注記を足すだけ
    let retireNote = "";
    if (!error && mig0190On()) {
      try {
        const res = await fetch("/api/auth/retire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cast", id: c.id, mode: kind === "leave" ? "ban" : "unban" }) });
        if (!res.ok) retireNote = "（ログインの失効は後で再実行できます）";
      } catch { retireNote = "（ログインの失効は後で再実行できます）"; }
    }
    setMsg(error ? (key ? LEAVE_MSG[key] : `${label}に失敗: ${error.message}`) : `${label}しました${retireNote}`);
    setBusy(false);
    await reloadLoginCasts();
  }

  // ★夜間便 N4-1（裁定287-3・0151 ★3）: 保証時給の設定／延長＝set_cast_guarantee(p_cast_id, p_amount, p_start, p_end)。
  //   延長＝現在の保証の終了日の翌日を開始日にして同じ金額で送る（RPC (b) 経路＝戻し行を保証行に書き換える）。成否は節内の Message。
  async function saveGuarantee(c: CastLogin) {
    if (!guaForm) return;
    const amount = Number(guaForm.amount);
    const start = guaForm.start; const end = guaForm.end;
    if (!Number.isInteger(amount) || amount <= 0) { setGuaMsg({ kind: "error", text: "金額は 1 円以上の整数で入力してください" }); return; }
    if (!start || !end || end < start) { setGuaMsg({ kind: "error", text: "終了日は開始日以降にしてください" }); return; }
    setBusy(true); setGuaMsg(null);
    const { error } = await supabase.rpc("set_cast_guarantee", { p_cast_id: c.id, p_amount: amount, p_start: start, p_end: end });
    setBusy(false);
    if (error) {
      if (isRpcMissingError(error.message)) setGuaRpc("missing");
      setGuaMsg({ kind: "error", text: rpcErrJa(error.message) });
      return;
    }
    setGuaMsg({ kind: "success", text: guaForm.mode === "extend" ? `保証時給を ${mdOf(end)} まで延長しました` : `保証時給を設定しました（${mdOf(start)}〜${mdOf(end)}）` });
    setGuaForm(null);
    await loadPlans();
  }

  // ★0154 D2（裁定294-5）: 報酬型の保存＝set_cast_plan（現在行の上書き・overrides は白名単 8 キー＋報酬型 3 キーだけ・guarantee は含めない）
  async function saveRule(c: CastLogin) {
    if (!ruleForm) return;
    const a = castPlanOf[c.id];
    if (!a) { setRuleMsg({ kind: "error", text: "先に待遇プランを割り当ててください（マスタ ▸ 待遇プラン）" }); return; }
    if ((a.ov as Record<string, unknown>).guarantee === true) { setRuleMsg({ kind: "warn", text: "保証時給の期間中は報酬型を変更できません（保証の終了後に設定してください）" }); return; }
    const amount = amountKeyOf(ruleForm.rule) ? Number(ruleForm.amount.replace(/[,，¥￥\s]/g, "")) : null;
    const ov = overridesWithRule(a.ov, ruleForm.rule, amountKeyOf(ruleForm.rule) ? (Number.isFinite(amount as number) ? (amount as number) : null) : null);
    if (!ov.ok) { setRuleMsg({ kind: "error", text: ov.err }); return; }
    setBusy(true); setRuleMsg(null);
    const { error } = await supabase.rpc("set_cast_plan", { p_cast_id: c.id, p_plan_id: a.planId, p_overrides: ov.overrides, p_valid_from: null });
    setBusy(false);
    if (error) { setRuleMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    setRuleMsg({ kind: "success", text: `報酬型を「${payRuleLabelOf(ruleForm.rule, c.employment ?? null)}」にしました` });
    setRuleForm(null);
    await loadPlans();
  }
  // ★裁定306-13: 待遇プランの切替＝既存 RPC set_cast_plan（p_overrides は現在の上書きをそのまま＝維持）。確定済みの期は payroll_runs を 1 回読んで止める（保存時のみ・+1）
  async function savePlan(c: { id: string; store_id: string }) {
    if (!planForm) return;
    setPlanMsg(null);
    const { data: run } = await supabase.from("payroll_runs").select("status").eq("store_id", c.store_id).eq("period", planForm.from.slice(0, 7)).maybeSingle();
    const err = planSwitchValidate({ planId: planForm.planId, from: planForm.from, today, runStatus: (run?.status as string | undefined) ?? null });
    if (err) { setPlanMsg({ kind: "error", text: err }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_cast_plan", { p_cast_id: c.id, p_plan_id: planForm.planId, p_overrides: castPlanOf[c.id]?.ov ?? {}, p_valid_from: planForm.from });
    setBusy(false);
    if (error) { setPlanMsg({ kind: "error", text: planSwitchErrJa(error.message) }); return; }
    setPlanMsg({ kind: "success", text: `待遇プランを「${activePlans.find((p) => p.id === planForm.planId)?.name ?? ""}」にしました（${planForm.from} から）。${NOTE_PLAN_SWITCH}` });
    setPlanForm(null);
    await load();
  }
  // ★0154 D6（裁定294-9）: 契約区分の変更＝set_cast_employment（owner のみ・給与期の初日のみ・確定済み期には遡れない）
  async function saveEmployment(c: CastLogin) {
    if (!empForm) return;
    setBusy(true); setEmpMsg(null);
    const { error } = await supabase.rpc("set_cast_employment", { p_cast_id: c.id, p_employment: empForm.employment, p_valid_from: empForm.from });
    setBusy(false);
    if (error) {
      const m = error.message;
      setEmpMsg({ kind: "error", text: m === "bad valid_from" ? "契約区分の変更は給与期の初日（月初）からのみです" : m === "period finalized" ? "確定済みの給与期には遡れません（次の期の初日以降を指定してください）" : rpcErrJa(m) });
      return;
    }
    setEmpMsg({ kind: "success", text: `契約区分を「${empForm.employment}」にしました（${empForm.from} から）` });
    setEmpForm(null);
    await reloadLoginCasts();
  }

  const docs = (tr: Trial) => tr.documents ?? {};
  const allDocs = (tr: Trial) => DOC_KEYS.every((d) => docs(tr)[d.key] === true);

  // ── F3g' castログイン招待（招待=未結線 / PW再発行=結線済み・POST /api/cast/invite） ──
  const reloadLoginCasts = useCallback(async () => {
    // mig0074: left_on を含め、page.tsx と同一の取得にする（.eq(is_active,true) を外す＝段C2 の在籍/退店タブ前提）。
    const { data } = await supabase.from("casts").select(CAST_RELOAD_COLS) /* ★裁定414 追補（0180）: okuri_tier はフラグ true のときだけ */.order("name"); // ★0154 D2／D6・★GV-C C-14f: 在籍区分
    setLoginCasts((data ?? []) as unknown as CastLogin[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D2-4: 指名ランクの割当（set_cast_rank_of）。null=解除。失敗トークンは日本語化。
  // ★裁定337（0167・便 X-13d-2b）: シフト希望の方式＝キャスト個別の上書き（null＝店の既定に従う）。保存は set_cast_shift_request_mode（owner ∨ manager 自店・課金ゲート・監査）。
  // ★裁定414 追補（0180）: 送り区分＝set_cast_okuri_tier（owner ∨ manager 自店・店の区分にある code だけ・null＝区分なし＝ベース額）
  async function setOkuriTier(c: CastLogin, tier: string | null) {
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("set_cast_okuri_tier", { p_cast_id: c.id, p_tier: tier });
    setBusy(false);
    if (error) { setMsg(error.message.includes("forbidden") ? "権限がありません" : error.message.includes("billing locked") ? "ご契約の状態により変更できません" : error.message.includes("bad tier") ? "区分の値が正しくありません（店設定の区分から選びます）" : error.message); return; }
    setLoginCasts((rows) => rows.map((r) => (r.id === c.id ? { ...r, okuri_tier: tier } : r)));
    setMsg(tier === null ? "送り区分を「区分なし（ベース額）」にしました" : `送り区分を「${okuriTiersOf(c.store_id).find((t) => t.code === tier)?.name ?? tier}」にしました`);
  }
  async function setShiftMode(c: CastLogin, mode: "shift" | "off_only" | null) {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc("set_cast_shift_request_mode", { p_cast_id: c.id, p_mode: mode });
    setBusy(false);
    if (error) {
      setMsg(error.message.includes("forbidden") ? "権限がありません" : error.message.includes("billing locked") ? "ご契約の状態により変更できません" : error.message.includes("bad mode") ? "方式の値が正しくありません" : error.message);
      return;
    }
    setLoginCasts((rows) => rows.map((r) => (r.id === c.id ? { ...r, shift_request_mode: mode } : r)));
    setMsg(mode === null ? "シフト希望の方式を店の既定に戻しました" : `シフト希望の方式を「${SHIFT_REQUEST_MODE_LABEL[mode]}」にしました`);
  }
  async function assignRank(c: CastLogin, rankId: string | null) {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc("set_cast_rank_of", { p_cast_id: c.id, p_rank_id: rankId });
    setBusy(false);
    setMsg(error
      ? (error.message.includes("inactive rank") ? "停止中のランクは指定できません"
        : error.message.includes("bad rank") ? "このお店のランクではありません"
        : error.message.includes("not found") ? "キャストが見つかりません（再読込してください）"
        : error.message.includes("forbidden") ? "権限がありません"
        : error.message)
      : rankId ? "指名ランクを割り当てました" : "指名ランクを解除しました");
    await reloadLoginCasts();
  }

  function openInvite(c: CastLogin, mode: "invite" | "reset") {
    setInvTarget(c); setInvMode(mode); setInvEmail(""); setInvErr(null); setInvResult(null); setInvCopied(false);
    setInvIdemKey(crypto.randomUUID()); // 送信意図ごとに1つ＝リトライは同キー（route が二重作成を止める）
  }

  async function submitInvite() {
    if (!invTarget) return;
    setBusy(true); setInvErr(null);
    try {
      const res = await fetch("/api/cast/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          castId: invTarget.id,
          action: invMode,
          email: invMode === "invite" && invEmail.trim() ? invEmail.trim() : undefined, // 空なら送らない＝合成 email を route が自動発行
          idemKey: invMode === "invite" ? invIdemKey : undefined,
        }),
      });
      const body = (await res.json()) as InviteResult & { error?: string };
      if (!res.ok) setInvErr(body.error ?? `失敗しました（${res.status}）`);
      else { setInvResult(body); await reloadLoginCasts(); }
    } catch (e) {
      setInvErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!invResult?.initial_password) return;
    await navigator.clipboard.writeText(`${invResult.login_email}\n${invResult.initial_password}`);
    setInvCopied(true);
  }

  async function toggleDoc(tr: Trial, key: string) {
    const next = { id_doc: false, contract: false, pledge: false, bank: false, ...docs(tr), [key]: !docs(tr)[key] };
    await rpc("書類を更新", "trial_update", { p_trial_id: tr.id, p_documents: next });
  }
  async function setRating(tr: Trial, r: number) {
    await rpc("評価を更新", "trial_update", { p_trial_id: tr.id, p_rating: r });
  }

  // ── 段C2 派生値（すべて既存データの client 再形＝新規取得なし）──
  const hit = (name: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
  // E8-5 casts#2: ランク絞り込み（"none"=ランクなし）を検索に AND 合成
  const rankHit = (c: CastLogin) =>
    rankFilter === "" || (rankFilter === "none" ? !c.rank_id : c.rank_id === rankFilter);
  // ★裁定374（GV-B W-4）: 今期の時給＝プレビューの PayResult から（currentWageOf）・達成状況＝/mine と同じ cardAxesOf（個別＞プラン既定＞なし・採用軸だけ）
  const calToday = new Date().toISOString().slice(0, 10);
  const salesByCast = sumCastSales(w4.sales);
  const wageOf = (c: CastLogin): CurrentWage | null => { const pv = w4.pay[c.id]; if (!pv) return null; const a = castPlanOf[c.id]; const pl = a ? (plansById[a.planId] as unknown as { slide_period?: unknown; slide_apply?: unknown } | undefined) : undefined; return currentWageOf(pv.pay as never, { planName: pv.planName || (a ? plansById[a.planId]?.name : null) || null, slidePeriod: pl?.slide_period, slideApply: pl?.slide_apply ?? null, today: calToday, planBase: a ? plansById[a.planId]?.base ?? null : null, rows: planRowsOf[c.id] ?? [] /* ★便 P174 T-5（GV-55／56）: wageNowOf で時給・接尾・保証を 1 本に */ }); };
  const normAxesOfCast = (c: CastLogin): CardAxis[] => {
    const sj = stores.find((st) => st.id === c.store_id)?.settings_json ?? null;
    const axes = normAxesOf(sj); const scope = shimeiScopeOf(sj);
    const a = castPlanOf[c.id]; const pl = a ? plansById[a.planId] : null;
    const resolved = resolveQuotaOf(planDefaultQuotaOf(normTargetsOf(pl ?? null), axes), w4.quotas[c.id] ?? null, axes, scope);
    const daysT = resolveNormTargetsOf(normTargetsOf(pl ?? null), { days: w4.norms[c.id]?.days_target ?? 0 }, axes);
    const act = salesByCast.get(c.id) ?? { hon: 0, jonai: 0, dohan: 0, sales: 0 };
    return cardAxesOf({ days: axes.days ? daysT.value.days : null, ...resolved.quota }, { days: w4.inDays[c.id] ?? 0, hon: act.hon, jonai: act.jonai, dohan: act.dohan, sales: act.sales });
  };
  const normStatusOf = (c: CastLogin): NormStatus => castNormStatusOf(normAxesOfCast(c), monthElapsedOf(calToday));
  const wageTiers = wageTiersOf(loginCasts.filter((c) => c.is_active).map((c) => wageOf(c)?.hourly ?? 0));
  const planNames = [...new Set(loginCasts.filter((c) => c.is_active).map((c) => { const a = castPlanOf[c.id]; return a ? plansById[a.planId]?.name ?? "" : ""; }).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  const w4Hit = (c: CastLogin) => (planFilter === "" || (castPlanOf[c.id] ? plansById[castPlanOf[c.id].planId]?.name === planFilter : false))
    && (normFilter === "" || normStatusOf(c) === normFilter)
    && (wageFilter === "" || String(wageOf(c)?.hourly ?? 0) === wageFilter);
  const isTrialCast = (c: CastLogin) => isTrialCastOf(c, castPlanOf[c.id] ? plansById[castPlanOf[c.id].planId]?.name ?? null : null); // ★GV-C C-14f（裁定396）: 体入タブ＝在籍区分で絞る
  const shownCasts = loginCasts.filter((c) => (filter === "trial" ? isTrialCast(c) : filter === "today" ? c.is_active && isTodayWorking(todayStateOfCast(c.id)) : c.is_active === (filter === "active")) && hit(c.name) && (filter === "trial" || (rankHit(c) && w4Hit(c))))
    .sort((a, b) => sortKey === "wage" ? (wageOf(b)?.hourly ?? 0) - (wageOf(a)?.hourly ?? 0) || a.name.localeCompare(b.name, "ja")
      : sortKey === "rate" ? normRateOf(normAxesOfCast(b)) - normRateOf(normAxesOfCast(a)) || a.name.localeCompare(b.name, "ja")
      : a.name.localeCompare(b.name, "ja")); // ★裁定374: 並び替え＝名前・時給・達成率 // ★裁定353: 今日出勤＝確定シフトあり／出勤中／退勤
  const shownTrials = trials.filter((tr) => hit(tr.name));
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const nomTotal = (id: string) => { const r = rankOf[id]; return r ? r.hon + r.jonai + r.dohan : 0; };
  // E8-5 casts#1: KPI 4枚（在籍/体入/未招待/今月出勤者）＝既存 state の再形のみ
  const kpiActive = loginCasts.filter((c) => c.is_active).length;
  const kpiUninvited = loginCasts.filter((c) => c.is_active && !c.user_id).length;
  const kpiWorked = loginCasts.filter((c) => c.is_active && (attDaysOf[c.id] ?? 0) > 0).length;
  // ★裁定193（B1・K7）: メール未登録＝在籍かつ（未招待 or users.email が null）。既存 KPI 4 枚は据え置き＝5 枚目
  const kpiNoEmail = loginCasts.filter((c) => c.is_active && (!c.user_id || !emailByUser[c.user_id])).length;
  // E8-5 casts#3: 副次情報のラベル（ランク名・プラン名）
  const rankNameOf = (c: CastLogin) => (c.rank_id ? ranks.find((r) => r.id === c.rank_id)?.name ?? null : null);
  const planNameOf = (id: string) => { const a = castPlanOf[id]; return a ? plansById[a.planId]?.name ?? null : null; };
  // ★N4-2（裁定282-3）: 保証時給の残りが 7 日以内なら印（純関数・0151 未適用でも cast_plan に保証行が無ければ null）
  const guaBadgeOf = (id: string) => guaranteeBadgeOf(guaranteeStateOf(planRowsOf[id] ?? [], today));
  const selCast = sel?.kind === "cast" ? loginCasts.find((c) => c.id === sel.id) ?? null : null;
  // ★GV-3（便 N1013b B-8）: 店の制度「ノルマ」の ON/OFF（sys_norms・欠損＝ON）＝今月のノルマの入力口の出し分け
  const normsOnOf = (sid: string) => isSystemOn(stores.find((st) => st.id === sid)?.settings_json ?? null, "sys_norms");
  // ★裁定300-2: 店の送り方式・ベース額（stores.settings_json＝page が同じクエリで渡す）
  const okuriTiersOf = (sid: string) => okuriFlatTiersOf((stores.find((st) => st.id === sid)?.settings_json ?? null) as Record<string, unknown> | null); // ★裁定414 追補（0180）
  const okuriOf = (sid: string) => { const sj = stores.find((st) => st.id === sid)?.settings_json ?? null; return { mode: okuriModeOf(sj as Record<string, unknown> | null) /* ★裁定414: 4 方式 */, base: typeof sj?.okuri_base_amount === "number" ? (sj.okuri_base_amount as number) : 0 }; };
  const selTrial = sel?.kind === "trial" ? trials.find((tr) => tr.id === sel.id) ?? null : null;

  return (
    <div className="nox-mv1">
      {/* 段0R 第1陣: モック .head を新シェルの nox-hero へ（/master・/home と同基準） */}
      {/* ★裁定141（v3.1 K2）: lead はモック語彙のうち器のある語だけで寄せる（「勤務条件・連絡先」は器なし＝書かない） */}
      <PageHead eyebrow="CAST MANAGEMENT" title="キャスト管理"
        desc="在籍・待遇・実績・アカウントをキャストごとに管理します。" />
      <Toast msg={msg} />
      <ContactChangesPanel canConfirm={isOwner || !!myStoreId} />{/* ★便 ON-3（0176 ★4）: 連絡先の変更（未確認）＝0 件なら出ない */}

      {/* E8-5 casts#1（T1）: KPI 帯4枚＝既存 state の再形のみ（新規取得ゼロ） */}
      <div className="nox-repsum">
        <div className="nox-rs"><div className="l">在籍</div><div className="v num">{kpiActive}名</div></div>
        <div className="nox-rs"><div className="l">体入中</div><div className="v num">{trials.length + loginCasts.filter(isTrialCast).length}名</div></div>{/* ★GV-C C-14f: 在籍区分 体入を足す */}
        <div className="nox-rs"><div className="l">未招待</div><div className="v num">{kpiUninvited}名</div></div>
        <div className="nox-rs"><div className="l">今月出勤者</div><div className="v num">{kpiWorked}名</div></div>
        {/* ★裁定193（B1・K7）: モック KPI「メール未登録」（在籍のうち未招待 or email 未登録） */}
        <div className="nox-rs"><div className="l">メール未登録</div><div className="v num">{kpiNoEmail}名</div></div>
      </div>

      {/* ★0155（裁定309-3・便 S-3）: 廃棄候補（owner のみ描画）。行の「詳細」で既存の詳細モーダルを開く。廃棄の操作はマスタ ▸ システム（機密・税務情報）で行う */}
      {isOwner && (
        <section className="nox-cardtop" style={{ ...card, marginBottom: 12 }}>
          <h3 style={{ ...secTitle, margin: "0 0 4px" }}>マイナンバーの廃棄候補</h3>
          <p style={{ ...t.sub, margin: "0 0 8px", lineHeight: 1.7 }}>
            退店日の翌年 1 月 1 日から 7 年を過ぎ、マイナンバーの登録が残っているキャスト。廃棄は
            <Link href="/master/system" className="nox-link">機密・税務情報</Link>
            でキャストを選んで行います（理由必須・元に戻せません）。
          </p>
          {discardCands === null ? (
            <p style={{ ...t.sub, margin: 0 }}>読み込み中…</p>
          ) : discardCands.length === 0 ? (
            <p style={{ ...t.sub, margin: 0 }}>該当するキャストはいません。</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {discardCands.map((c) => (
                <div key={c.cast_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, borderBottom: "1px solid var(--line)", padding: "4px 0" }}>
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  <span style={lbl}>{storeName(c.store_id)}</span>
                  <span style={lbl}>退店日 <span className="num">{c.left_on}</span></span>
                  <span style={{ ...lbl, color: "var(--bad)" }}>期限 <span className="num">{c.due_on}</span></span>
                  <button type="button" style={{ ...btnGhost, marginLeft: "auto" }}
                    onClick={() => { setSel({ kind: "cast", id: c.cast_id }); setDtab("basic"); }}>詳細</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ツールバー＝検索＋在籍/体入/退店済み（既存 is_active と trials の再形・新規取得なし） */}
      <div className="nox-ctoolbar">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索"
          style={{ ...input, width: 200 }} aria-label="名前で検索"
        />
        <div className="nox-seg">
          {([["active", "在籍"], ["today", "今日出勤"], ["trial", "体入"], ["left", "退店済み"]] as const).map(([k, label]) => (/* ★裁定353: 「今日出勤」 */
            <button key={k} className={filter === k ? "on" : ""}
              onClick={() => { setFilter(k); setSel(null); }}>{label}</button>
          ))}
        </div>
        <button style={{ ...btnGold, marginLeft: "auto" }} onClick={() => setShowAdd((v) => !v)}>
          ＋ {filter === "trial" ? "体入を追加" : "キャスト登録"}
        </button>
      </div>
      {/* ★裁定374（GV-B W-4）: 絞り込みチップ＝待遇プラン／ノルマ（達成・進行中・未達）／時給の段・並び替え＝名前・時給・達成率（既存 state の再形＋当月の実績 1 本） */}
      {filter !== "trial" && (
        <div className="nox-ctoolbar" data-w4-filters="1" style={{ gap: 8, flexWrap: "wrap", margin: "0 0 10px" }}>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>並び替え</span>
          <SegSelect value={sortKey} onChange={(v) => setSortKey(v as "name" | "wage" | "rate")} options={[["name", "名前"], ["wage", "時給"], ["rate", "達成率"]] as const} ariaLabel="並び替え" />
          {planNames.length > 0 && (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              {["", ...planNames].map((n) => <button key={n || "all"} type="button" className={`nox-chip${planFilter === n ? " on" : ""}`} style={{ ...btnGhost, ...t.btnSm, ...(planFilter === n ? { border: "1px solid var(--gold)", color: "var(--champ)", background: "var(--goldface)" } : {}) }} onClick={() => setPlanFilter(n)}>{n || "全プラン"}</button>)}
            </span>
          )}
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {([["", "ノルマ: 全員"], ["done", "達成"], ["progress", "進行中"], ["behind", "未達"]] as const).map(([k, l]) => <button key={k || "all"} type="button" className={`nox-chip${normFilter === k ? " on" : ""}`} style={{ ...btnGhost, ...t.btnSm, ...(normFilter === k ? { border: "1px solid var(--gold)", color: "var(--champ)", background: "var(--goldface)" } : {}) }} onClick={() => setNormFilter(k)}>{l}</button>)}
          </span>
          {wageTiers.length > 1 && (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              {["", ...wageTiers.map(String)].map((w) => <button key={w || "all"} type="button" className={`nox-chip${wageFilter === w ? " on" : ""}`} style={{ ...btnGhost, ...t.btnSm, ...(wageFilter === w ? { border: "1px solid var(--gold)", color: "var(--champ)", background: "var(--goldface)" } : {}) }} onClick={() => setWageFilter(w)}>{w ? `¥${Number(w).toLocaleString()}` : "時給: 全段"}</button>)}
            </span>
          )}
        </div>
      )}
      {/* E8-5 casts#2（T2）: ランク絞り込み＝チップ（プルダウン新設禁止の規律）。ranks が無い店は出さない */}
      {filter !== "trial" && ranks.filter((r) => r.is_active).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 12px" }}>
          {[["", "全ランク"], ["none", "ランクなし"] as const,
            ...ranks.filter((r) => r.is_active).map((r) => [r.id, r.name] as const)].map(([v, label]) => (
            <button key={v || "all"} type="button"
              className="nox-chip"
              style={{
                ...btnGhost, padding: "4px 12px", fontSize: 12,
                ...(rankFilter === v ? { border: "1px solid var(--gold)", color: "var(--champ)", background: "var(--goldface)" } : {}), /* ★#80 */
              }}
              onClick={() => setRankFilter(v as string)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ★DP1 P3（裁定 DP1-⑨・E8 casts#9）: 登録フローをモック `castDialog` 準拠の**モーダルへ集約**した。
          旧＝一覧の上にインラインの section をトグル表示（横1列の flex フォーム）。
          新＝モーダル（modalhead＋modalbody＋formgrid＋actions）＋**登録後にやることを同じ面に集約**。
          ★送る RPC も引数も現行のまま（体入=trial_register／本登録=cast_create）＝器を変えただけ。
          ★写真・待遇プラン・ログイン招待は**登録の送信には含めない**（＝機能不変）。
            モックは1フォームに畳んでいるが、NOX では
              - 写真   … Storage（段P）へのアップロード＝別 authz（storage.objects ポリシー3本）
              - プラン … /master/cast-comp/plan の cast_plan 割当
              - 招待   … POST /api/cast/invite（PW 一度だけ表示）
            と**それぞれ authz と経路が違う**うえ、同じフォームを trial_hire 経路も共有している
            （E8-5 が casts#9 を「誤操作リスク＞見た目の利得」でスキップした理由がここ）。
            そこで**集約は「1つの面に順序として見せる」ところまで**とし、実行は既存の操作のまま残す。 */}
      {showAdd && (
        <Modal onClose={() => { if (!busy) setShowAdd(false); }} maxWidth={560} scroll>
          <div className="nox-modalhead">
            <h3 style={{ ...secTitle, margin: 0 }}>{filter === "trial" ? "体入を追加" : "キャストを登録"}</h3>
            <button type="button" style={{ ...btnGhost, padding: "2px 10px" }}
              disabled={busy} onClick={() => setShowAdd(false)}>×</button>
          </div>
          <div className="nox-modalbody">
            <p style={{ ...t.sub, margin: "0 0 14px", lineHeight: 1.7 }}>
              {filter === "trial"
                ? "在籍区分「体入」で登録し、待遇プラン「体験入店」と期限付き保証（店設定の日数）を一度に設定します。本採用は詳細から（店の既定プランへ切り替わります）。"
                : "体入を経ずに直接登録します（実績はゼロから）。"}
            </p>
            <RegisterForm
              key={filter} stores={stores} isOwner={isOwner} myStoreId={myStoreId} busy={busy}
              fixedKind={filter === "trial" ? TRIAL_KIND : undefined}
              onSubmit={async (a) => {
                if (filter === "trial") return addTrialCast(a); // ★GV-C C-14f（裁定396）: 一括設定
                // ★便 X13-H H-11: cast_create は本入店日を持たない＝登録の直後に set_cast_profile（源氏名＋本入店日・audit あり）を続けて呼ぶ
                const { _joined_on: jo, ...ca } = a as Record<string, unknown> & { _joined_on?: string };
                setBusy(true); setMsg(null);
                const c = await supabase.rpc("cast_create", ca);
                if (c.error || !c.data) { setBusy(false); setMsg(`キャストを登録に失敗: ${rpcErrJa(c.error?.message ?? "no id")}`); return false; }
                if (jo) {
                  const pf = await supabase.rpc("set_cast_profile", { p_cast_id: c.data as string, p_name: String(ca.p_name ?? ""), p_joined_on: jo });
                  if (pf.error) { setBusy(false); setMsg(`キャストは登録しました。本入店日の設定に失敗しました（詳細の「編集」から入れてください）: ${rpcErrJa(pf.error.message)}`); await reloadLoginCasts(); return true; }
                }
                setBusy(false); setMsg(`キャストを登録しました${jo ? `（本入店日 ${jo}）` : ""}`);
                await reloadLoginCasts();
                return true;
              }}
            />
            {/* ★登録後にやること＝モックが同じフォームに置いている3項目の「行き先」を同じ面に集約する。
                ここでは**何も送らない**（案内のみ）。実行は登録後に一覧からそのキャストを選んで行う。 */}
            <div className="nox-inset" style={{ padding: "12px 14px", marginTop: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>
                登録した後に設定する項目
              </p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.9 }}>
                <li><b style={{ color: "var(--v2-text)" }}>プロフィール写真</b>：一覧でそのキャストを選び「写真」から設定します（任意）。</li>
                <li><b style={{ color: "var(--v2-text)" }}>ランク</b>：一覧のランク欄から設定します（指名料に反映されます）。</li>
                <li>
                  <b style={{ color: "var(--v2-text)" }}>待遇プラン</b>：
                  <Link href="/master/cast-comp/plan" className="nox-link">マスタ ▸ 待遇プラン</Link>
                  で割り当てます。
                </li>
                <li><b style={{ color: "var(--v2-text)" }}>ログイン招待</b>：一覧の「招待」からアカウントを発行します（初期パスワードは一度だけ表示）。</li>
              </ol>
            </div>
          </div>
        </Modal>
      )}

      {/* カードグリッド（モック .cards）＝写真・名前・状態・月次2数値だけ。機微情報は出さない。 */}
      {filter === "trial" && shownTrials.length > 0 && (
        <div className="nox-cardgrid" data-legacy-trials="1" style={{ marginBottom: 12 }}>{/* ★GV-C C-14f: 旧・体入台帳（trials）は残っている間だけ出す */}
          {shownTrials.map((tr) => (
            <button key={tr.id} className={`nox-ccard ${sel?.kind === "trial" && sel.id === tr.id ? "sel" : ""}`}
              onClick={() => { setSel({ kind: "trial", id: tr.id }); setDtab("basic"); }}>
              <span className="nox-ctag">体入</span>
              <div className="chead">
                {/* ★体入は写真なし固定＝trials に casts 行がまだ無い（写真パスは cast_id 由来）。 */}
                <CastAvatar name={tr.name} size={44} />
                <div>
                  <div className="cname">{tr.name}</div>
                  <div className="csub">体入 {tr.trial_date ?? "—"}</div>
                </div>
              </div>
              <div className="cstats">
                <div className="cstat"><div className="l">書類</div><div className="v">{allDocs(tr) ? "完了" : "未完了"}</div></div>
                <div className="cstat"><div className="l">評価</div><div className="v num">{tr.rating ? `★${tr.rating}` : "—"}</div></div>
              </div>
            </button>
          ))}
        </div>
      )}
      {(
        <div className="nox-cardgrid">
          {shownCasts.length === 0 && (
            <p style={{ ...t.sub, margin: 0 }}>
              {filter === "trial" ? "体入中のキャストはいません。" : filter === "active" ? "在籍キャストがいません。" : filter === "today" ? "今日の出勤（確定シフト・出勤中・退勤）はいません。" : "退店済みのキャストはいません。"}
            </p>
          )}
          {shownCasts.map((c) => (
            <button key={c.id} className={`nox-ccard ${sel?.kind === "cast" && sel.id === c.id ? "sel" : ""}`}
              onClick={() => { setSel({ kind: "cast", id: c.id }); setDtab("basic"); }}>
              {!c.is_active && <span className="nox-ctag off">{c.left_on ? `退店 ${c.left_on}` : "退店"}</span>}
              {c.is_active && isTrialCast(c) && <span className="nox-ctag">体入</span>}
              <div className="chead">
                <CastAvatar name={c.name} url={photoUrls.get(c.id)} size={44} />
                <div>
                  <div className="cname">{c.name}</div>
                  <div className="csub">{c.is_active ? "在籍" : "退店"} / {c.user_id ? "ログイン済み" : "未招待"}</div>
                  {c.is_active && <div className="csub" data-today-state={todayStateOfCast(c.id).key} style={{ color: todayStateOfCast(c.id).key === "working" ? "var(--ok)" : todayStateOfCast(c.id).key === "absent" ? "var(--bad)" : undefined }}>今日: {todayStateOfCast(c.id).label}</div>}{/* ★裁定353: 今日の状態 1 行 */}
                  {/* E8-5 casts#3: 副次情報（ランク・プラン名）。LINE 連携は T3 後送り＝出さない */}
                  {/* ★裁定196'（B1・K16）: ランク名／プラン名をモックのバッジ形（nox-stpill）へ＝表示スタイルのみ・値は不変・意味名トークン */}
                  {(rankNameOf(c) || planNameOf(c.id) || guaBadgeOf(c.id) || isTrialCast(c)) && (
                    <div className="csub" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                      {rankNameOf(c) && <span className="nox-stpill" style={{ color: "var(--v2-text)" }}>{rankNameOf(c)}</span>}
                      {planNameOf(c.id) && <span className="nox-stpill" style={{ color: "var(--v2-muted)" }}>{planNameOf(c.id)}</span>}
                      {/* ★夜間便 N4-2（裁定282-3）: 保証時給の期限が 7 日以内＝「保証 あと n 日」（warn 色・期限切れ当日以降は出さない） */}
                      {guaBadgeOf(c.id) && !isTrialCast(c) && <span className="nox-stpill warn">保証 あと{guaBadgeOf(c.id)!.daysLeft}日</span>}
                      {isTrialCast(c) && trialDaysLeftChipOf(guaranteeStateOf(planRowsOf[c.id] ?? [], today).daysLeft) && <span className="nox-stpill warn" data-trial-days="1">{trialDaysLeftChipOf(guaranteeStateOf(planRowsOf[c.id] ?? [], today).daysLeft)}</span>}{/* ★GV-C C-14f（裁定396）: 体入カードは保証の残日数を常に */}
                    </div>
                  )}
                </div>
              </div>
              <div className="cstats">
                <div className="cstat"><div className="l">今月指名</div><div className="v num">{nomTotal(c.id)}件</div></div>
                <div className="cstat"><div className="l">今月出勤</div><div className="v num">{attDaysOf[c.id] ?? 0}日</div></div>
                {(() => { const w = wageOf(c); return w ? (/* ★裁定374（GV-B W-4）: 今期の時給＝給与プレビューと同じ純関数・判定期間併記・保証中／体験入店の印 */
                  <div className="cstat" data-w4-wage={w.hourly}><div className="l">今期の時給</div><div className="v num">¥{w.hourly.toLocaleString()}<small style={{ fontWeight: 400, fontSize: 9.5, marginLeft: 3 }}>{w.basis}</small></div>
                    <div style={{ fontSize: 9.5, color: "var(--v2-muted)" }}>{w.periodLabel}{w.guarantee && !w.now ? <span className="nox-stpill warn" style={{ marginLeft: 4 }}>保証中</span> : null}{w.trial ? <span className="nox-stpill" style={{ marginLeft: 4 }}>体験入店</span> : null}</div>
                    {w.basisLine && <div data-wage-basis="1" style={{ fontSize: 9.5, color: "var(--v2-muted)" }}>{w.basisLine}</div>}{/* ★便 X13-H H-8: 根拠 1 行 */}</div>
                ) : null; })()}
              </div>
              {(() => { const axes = normAxesOfCast(c); return axes.length > 0 ? (/* ★裁定374: ノルマ達成状況＝採用軸ごとの 実績／目標＋進捗バー（/mine と同値） */
                <div className="nox-w4norm" data-w4-norm={normStatusOf(c)} style={{ marginTop: 8, display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 10.5, color: "var(--sub)" }}>ノルマ <b style={{ color: normStatusOf(c) === "done" ? "var(--ok)" : normStatusOf(c) === "behind" ? "var(--bad)" : "var(--champ)" }}>{NORM_STATUS_LABEL[normStatusOf(c)]}</b></div>
                  {axes.map((a) => (
                    <div key={a.key} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center", fontSize: 10.5 }}>
                      <span style={{ color: "var(--sub)" }}>{a.label}</span>
                      <span style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${a.pct}%`, background: a.done ? "var(--ok)" : "var(--gold)" }} /></span>
                      <span className="num">{cardFmt(a.key, a.actual)} / {cardFmt(a.key, a.target)}</span>
                    </div>
                  ))}
                </div>
              ) : null; })()}
            </button>
          ))}
        </div>
      )}

      {/* ── 詳細（カード選択で開く）＝現行の編集・招待・PW再発行・体入採否を3タブへ再配置 ──
          ★裁定253 R4（2026-09-14）: インラインの section をやめ共通 Modal へ（タブ構成・中身・RPC は不変＝器のみ・広め 640）。
            閉じる＝×・背景タップ・Esc。「写真を変更」「機密・税務情報へ」はモーダル内に残す。 */}
      {selCast && (
        <Modal onClose={() => !busy && setSel(null)} maxWidth={640} scroll>
          <div className="nox-cdrawer">
            <div style={{ textAlign: "center" }}>
              {/* ★X-13-5（便 X-13a）: ヘッダー写真の下に「写真を変更」を常時表示＝共通部品 PhotoEdit（スタッフ編集 X-13-4 と同じ）。
                  デモ org は表示するが無効（裁定328 ④＝storage policy が真の防御・useIsDemo で理由を出す） */}
              <PhotoEdit name={selCast.name} url={photoUrls.get(selCast.id)} hasPhoto={photoUrls.has(selCast.id)} busy={busy || !orgId} size={64} layout="col"
                disabled={isDemo} disabledReason="デモ環境では写真を変更できません"
                onPick={(f) => void uploadPhotoDirect(selCast, f)} onRemove={() => void deletePhoto(selCast)} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--v2-text)" }}>{selCast.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--v2-muted)", whiteSpace: "nowrap" }}>{/* ★便 X13-G W-10: 「在籍 / 未招待」を語の途中で折らない */}
                {selCast.is_active ? (isTrialCast(selCast) ? "体入" : "在籍") : "退店"} / {selCast.user_id ? "ログイン済み" : "未招待"}
              </div>
              {isTrialCast(selCast) && (() => { /* ★GV-C C-14f（裁定396）: 本採用＝店の既定プランへ切替（確認なし）。既定が未設定なら候補から選ぶ */
                const dp = trialSettingsOf(stores.find((st) => st.id === selCast.store_id)?.settings_json ?? null).defaultPlanId;
                const dpOk = !!dp && activePlans.some((p) => p.id === dp);
                const cands = activePlans.filter((p) => p.name !== TRIAL_PLAN_NAME);
                return (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }} data-trial-hire="1">
                    {dpOk ? (
                      <button type="button" style={btnGold} disabled={busy} onClick={() => void hireTrialCast(selCast, dp!)}>本採用（{activePlans.find((p) => p.id === dp)?.name}）</button>
                    ) : (
                      <>
                        <select value={hirePick ?? ""} onChange={(e) => setHirePick(e.target.value || null)} disabled={busy} style={{ ...input, width: "auto" }} aria-label="本採用後のプラン">
                          <option value="">本採用後のプラン…</option>
                          {cands.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button type="button" style={btnGold} disabled={busy || !hirePick} onClick={() => hirePick && void hireTrialCast(selCast, hirePick)}>本採用</button>
                        <span style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>店の既定プランが未設定です</span>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
            <span style={{ marginLeft: "auto" }}><button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !busy && setSel(null)}>×</button></span>
          </div>

          <div className="nox-dtabs">
            {([["basic", "基本"], ["comp", "待遇・バック"], ["account", "アカウント"]] as const).map(([k, label]) => (
              <button key={k} className={dtab === k ? "on" : ""} onClick={() => setDtab(k)}>{label}</button>
            ))}
          </div>

          {dtab === "basic" && (
            <>
              {/* ★裁定109（mig0122）: 源氏名・入店日の編集＝set_cast_profile（owner=org 全店/manager=自店・
                  店内 active の源氏名重複と joined_on<=left_on は RPC が最終防御・変更なし再送は no-op） */}
              {!profEdit ? (
                <>
                  <div className="nox-frow"><span className="k">源氏名</span>
                    <span className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {selCast.name}
                      <button style={btnGhost} disabled={busy} onClick={() => {
                        setProfName(selCast.name); setProfJoined(selCast.joined_on ?? ""); setProfEdit(true);
                      }}>編集</button>
                    </span>
                  </div>
                  {/* ★裁定142（v3.1 K27）: 「入店日」→「本入店日」（体験入店との対比語・値は joined_on のまま） */}
                  <div className="nox-frow" data-joined-row="1"><span className="k">本入店日</span><span className="v num" style={{ display: "flex", gap: 8, alignItems: "center" }}>{selCast.joined_on ?? "—"}
                    <button style={btnGhost} disabled={busy} onClick={() => { setProfName(selCast.name); setProfJoined(selCast.joined_on ?? today); setProfEdit(true); }}>編集</button>{/* ★便 X13-H H-11 ②: 源氏名と同じ編集（set_cast_profile・audit） */}</span></div>
                </>
              ) : (
                <div className="nox-frow"><span className="k">源氏名・本入店日</span>
                  <span className="v" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={profName} placeholder="源氏名" disabled={busy}
                      onChange={(e) => setProfName(e.target.value)} style={{ ...input, width: 160 }} />
                    <input type="date" value={profJoined} disabled={busy}
                      onChange={(e) => setProfJoined(e.target.value)} style={{ ...input, width: 150 }} />
                    <button style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !profName.trim() || !profJoined}
                      onClick={async () => {
                        const ok = await rpc("プロフィールを更新", "set_cast_profile",
                          { p_cast_id: selCast.id, p_name: profName.trim(), p_joined_on: profJoined });
                        if (ok) setProfEdit(false);
                      }}>保存</button>
                    <button style={btnGhost} disabled={busy} onClick={() => setProfEdit(false)}>やめる</button>
                  </span>
                </div>
              )}
              <div className="nox-frow"><span className="k">所属店</span><span className="v">{storeName(selCast.store_id)}</span></div>
              {rules0175On() && (/* ★便 P175-prep P-4（裁定397＋413・0175 v2 ★9）: 基本の働き方＝曜日 可／不可／相談＋時間帯・週の目安・適用開始日（雇用の時間帯は店が決める）。フラグ false＝DOM 差分 0 */
                <div className="nox-frow" data-availability-row="1"><span className="k">働き方</span><span className="v" style={{ flex: 1 }}>
                  <AvailabilityEditor castId={selCast.id} storeId={selCast.store_id} employment={((selCast as { employment?: string | null }).employment ?? null)} bySelf={false} />
                </span></div>
              )}
              <div className="nox-frow">
                <span className="k">状態</span>
                <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{selCast.is_active ? "在籍" : selCast.left_on ? `退店（${selCast.left_on}）` : "退店"}</span>
                  {selCast.is_active
                    ? <button style={btnGhost} disabled={busy} onClick={() => void castLeaveRejoin(selCast, "leave")}>退店</button>
                    : <button style={btnGhost} disabled={busy} onClick={() => void castLeaveRejoin(selCast, "rejoin")}>復活</button>}
                </span>
              </div>
              {(() => { const w = wageOf(selCast); const axes = normAxesOfCast(selCast); return (<>{/* ★裁定374（GV-B W-4）: 詳細にも今期の時給とノルマ達成状況 */}
                {w && (
                  <div className="nox-frow" data-w4-detail="wage">
                    <span className="k">今期の時給</span>
                    <span className="v"><b className="num">¥{w.hourly.toLocaleString()}</b> <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>{w.basis}・{w.periodLabel}</span>{w.guarantee && !w.now ? <span className="nox-stpill warn" style={{ marginLeft: 6 }}>保証中</span> : null}{w.trial ? <span className="nox-stpill" style={{ marginLeft: 6 }}>体験入店</span> : null}
                      {w.basisLine && <span data-wage-basis="1" style={{ display: "block", fontSize: 11, color: "var(--v2-muted)" }}>{w.basisLine}</span>}{/* ★便 X13-H H-8: 根拠 1 行 */}</span>
                  </div>
                )}
                {w?.now && (/* ★便 P174 T-5（GV-56）: 「基本時給 ¥2,200／保証中 ¥3,200（10/18 まで）」＝基本は非保証行の値・保証は今日を含む保証行 */
                  <div className="nox-frow" data-wage-now="1">
                    <span className="k">基本時給／保証</span>
                    <span className="v num">基本時給 ¥{w.now.base.toLocaleString()}{w.now.guarantee ? `／保証中 ¥${w.now.guarantee.amount.toLocaleString()}${w.now.guarantee.to ? `（${mdOf(w.now.guarantee.to)} まで）` : ""}` : ""}</span>
                  </div>
                )}
                {axes.length > 0 && (
                  <div className="nox-frow" data-w4-detail="norm">
                    <span className="k">ノルマ達成状況</span>
                    <span className="v" style={{ display: "grid", gap: 4 }}>
                      <b style={{ fontSize: 12 }}>{NORM_STATUS_LABEL[normStatusOf(selCast)]}</b>
                      {axes.map((a) => (
                        <span key={a.key} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center", fontSize: 11 }}>
                          <span style={{ color: "var(--sub)" }}>{a.label}</span>
                          <span style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${a.pct}%`, background: a.done ? "var(--ok)" : "var(--gold)" }} /></span>
                          <span className="num">{cardFmt(a.key, a.actual)} / {cardFmt(a.key, a.target)}（{a.pct}%）</span>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </>); })()}
              <div className="nox-frow">
                <span className="k">今月指名</span>
                <span className="v num">
                  {nomTotal(selCast.id)}件
                  <span style={{ fontSize: 11, color: "var(--v2-muted)", marginLeft: 6 }}>
                    本{rankOf[selCast.id]?.hon ?? 0}・場内{rankOf[selCast.id]?.jonai ?? 0}・同伴{rankOf[selCast.id]?.dohan ?? 0}
                  </span>
                </span>
              </div>
              <div className="nox-frow"><span className="k">今月出勤</span><span className="v num">{attDaysOf[selCast.id] ?? 0}日</span></div>
              {/* E8-5 casts#6（縮小）: 次回シフト（今日以降の最初の1行・表示専用） */}
              <div className="nox-frow">
                <span className="k">次回シフト</span>
                <span className="v">
                  {nextShift
                    ? `${nextShift.date} ${nextShift.start_hm}〜${nextShift.end_hm}（${nextShift.status === "confirmed" ? "確定" : "予定"}）`
                    : "予定なし"}
                </span>
              </div>
              {/* ★裁定300-2／306-12（2026-09-25）: 前借り／送り実費の入口（このキャストに固定・共通部品・既存 RPC）＝「基本」タブ（次回シフトの下・機微情報注記の上）。
                  owner／manager のみ（page.tsx が他ロールを redirect 済み）。残高管理は 0156（300-4）。 */}
              {/* ★裁定414 追補（0180）: 送り区分＝定額徴収の店で区分があるとき（フラグ true）。退勤の送りの既定額がこの区分の額になる */}
              {okuriTiersOn() && okuriOf(selCast.store_id).mode === "flat" && okuriTiersOf(selCast.store_id).length > 0 && (
                <div style={{ marginTop: 12, marginBottom: 12 }} data-cast-okuri-tier="1">
                  <h3 style={{ ...secTitle, margin: "0 0 6px" }}>送り区分（定額徴収）</h3>
                  <label style={{ fontSize: 12.5 }}>区分{" "}
                    <select value={selCast.okuri_tier ?? ""} disabled={busy} aria-label="送り区分" onChange={(e) => void setOkuriTier(selCast, e.target.value || null)} style={{ ...t.input, width: "auto", padding: "6px 10px", fontSize: 13 }}>
                      <option value="">区分なし（ベース額 ¥{okuriOf(selCast.store_id).base.toLocaleString()}）</option>
                      {okuriTiersOf(selCast.store_id).map((tr) => <option key={tr.code} value={tr.code}>{okuriTierLabelOf(tr)}</option>)}
                    </select>
                  </label>
                  <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 0" }}>退勤時の送りはこの区分の額が既定（当日だけ変更可）。区分は店設定「控除・送り」で作ります。</p>
                </div>
              )}
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <h3 style={{ ...secTitle, margin: "0 0 6px" }}>前借り／送り実費</h3>
                <AdvanceOkuriForm storeId={selCast.store_id} casts={[]} castId={selCast.id} castName={selCast.name}
                  dateDefault={issueDateDefaultOf(new Date().toISOString().slice(0, 10))}
                  okuriMode={okuriOf(selCast.store_id).mode} okuriBase={okuriOf(selCast.store_id).base} />
              </div>
              {/* ★0156（裁定309-6／309 追補2・便 V-4）: 日払いの発行（このキャストに固定・owner／manager＝page が他ロールを redirect 済み）。源泉は月次と同式（日数 1）でプレビュー・雇用は 0＋注記 */}
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <h3 style={{ ...secTitle, margin: "0 0 6px" }}>日払いの発行</h3>
                <DailyPayForm castId={selCast.id} castName={selCast.name} storeId={selCast.store_id} dateDefault={issueDateDefaultOf(new Date().toISOString().slice(0, 10))} />{/* ★便 L-3-2: storeId＝過徴収 warn の当期プレビュー */}
              </div>
              {/* ★0160（裁定326-3・便 M2-2）: 今月のノルマ（本指名／場内／同伴／売上・月単位＝今月／翌月・空欄＝目標なし）＝set_cast_quota。
                  キャストのマイページに「実績／目標・達成率」で出る（目標が無い項目は出ない）。owner／manager のみ（page.tsx が他ロールを redirect 済み）。 */}
              {/* ★GV-3（便 N1013b B-8）: 店の制度「ノルマ」（sys_norms）が OFF の店は入力口を出さない（/mine のノルマカード・報酬設定のノルマタブと同じ鍵） */}
              <div style={{ marginTop: 12, marginBottom: 12, display: normsOnOf(selCast.store_id) ? undefined : "none" }}
                data-norms-off={normsOnOf(selCast.store_id) ? undefined : "1"} aria-hidden={!normsOnOf(selCast.store_id)}>
                <h3 style={{ ...secTitle, margin: "0 0 6px" }}>今月のノルマ</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <SegSelect value={quotaMonth} onChange={(v) => setQuotaMonth(v)} options={quotaMonthOptionsOf(month)} disabled={quotaBusy} ariaLabel="ノルマの月" />
                  <span style={lbl}>空欄＝目標なし。キャストのマイページに「実績／目標・達成率」が出ます</span>
                </div>
                {(() => { const q = quotaResolvedOf(selCast); return (<>
                <p style={{ ...lbl, margin: "0 0 6px" }} data-quota-source={JSON.stringify(q.res.source)}>
                  {hasOverride(q.res) ? <span className="nox-stpill ok" style={{ marginRight: 6 }}>個別</span> : <span className="nox-stpill" style={{ marginRight: 6 }}>プランの既定を継承</span>}
                  空欄＝プランの既定を継承（薄い数字）。入力すると個別の目標として上書きします。採用していない軸は出ません（{Object.entries(q.axes).filter(([, v]) => !v).map(([k]) => NORM_AXIS_LABEL[k as keyof typeof NORM_AXIS_LABEL]).join("・") || "なし"}）。
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  {QUOTA_KEYS.filter((k) => q.keys.includes(k)).map((k) => (
                    <label key={k} style={{ display: "block", minWidth: 0 }} data-quota-key={k} data-source={q.res.source[k] ?? "none"}>
                      <span style={{ ...lbl, display: "block", marginBottom: 3 }}>{QUOTA_LABEL[k]}（{QUOTA_UNIT[k]}）{q.res.source[k] === "override" ? <span className="nox-stpill ok" style={{ marginLeft: 6 }}>個別</span> : q.res.source[k] === "plan" ? <span style={{ color: "var(--sub)", marginLeft: 6 }}>既定 {k === "sales" ? "¥" + (q.res.quota[k] ?? 0).toLocaleString() : q.res.quota[k]}</span> : null}</span>
                      {k === "sales"
                        ? <MoneyInput value={quotaForm.sales} disabled={quotaBusy} width="100%" style={{ padding: "8px 10px", fontSize: 13 }} ariaLabel="売上の目標" onChange={(v) => setQuotaForm((f) => ({ ...f, sales: v }))} />
                        : <input inputMode="numeric" value={quotaForm[k]} disabled={quotaBusy} placeholder={q.res.source[k] === "plan" ? String(q.res.quota[k]) : "目標なし"} onChange={(e) => setQuotaForm((f) => ({ ...f, [k]: e.target.value.replace(/[^0-9]/g, "") }))} style={{ ...input, width: "100%" }} />}
                    </label>
                  ))}
                </div>
                {hasOverride(q.res) && (
                  <div className="nox-actions" style={{ marginTop: 6 }}>
                    <button type="button" style={btnGhost} disabled={quotaBusy} onClick={() => void resetQuotaToPlan(selCast)}>プランの既定に戻す</button>
                  </div>
                )}
                </>); })()}
                {quotaMsg && <Message kind={quotaMsg.kind} style={{ margin: "8px 0 0" }}>{quotaMsg.text}</Message>}
                <div className="nox-actions" style={{ marginTop: 8 }}>
                  <button type="button" style={btnGhost} disabled={quotaBusy || quotaFormEquals(quotaForm, quotaCur)} onClick={() => { setQuotaForm(quotaCur); setQuotaMsg(null); }}>元に戻す</button>
                  <button type="button" style={btnGold} disabled={quotaBusy || quotaFormEquals(quotaForm, quotaCur)} onClick={() => void saveQuota(selCast)}>ノルマを保存</button>
                </div>
              </div>
              {/* ★機微情報の分離を明示（モックの .lockrow 逐語）＝この画面には出さない */}
              <div className="nox-lockrow">
                本名・生年月日・マイナンバー等の機微情報は「機密・税務情報」（owner/manager 限定・閲覧ログ記録）でのみ扱います。この画面には表示しません。
              </div>
              {/* ★裁定109: 機密・税務情報パネル（/master/system 搭載）への導線（閲覧は owner 限定＝パネル側で出し分け） */}
              <div className="nox-actions" style={{ marginTop: 8 }}>{/* ★便 M3 M-24: 末尾の遷移＝中央の副ボタン（文字リンクをやめる） */}
                <Link href="/master/system" style={{ ...btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }} data-cast-link-secrets="1">機密・税務情報（システム設定）</Link>
              </div>
            </>
          )}

          {dtab === "comp" && (
            <>
              {/* ★裁定337（0167・便 X-13d-2b）: シフト希望の方式＝3 択（店の既定に従う／シフト希望／休み希望のみ）・既定＝店の既定に従う（null）。/mine と自動配置の候補は「キャスト個別→店の既定」で解決 */}
              <div className="nox-frow">
                <span className="k">シフト希望の方式</span>
                <span className="v">
                  <select value={selCast.shift_request_mode ?? ""} disabled={busy} aria-label="シフト希望の方式"
                    onChange={(e) => void setShiftMode(selCast, e.target.value === "" ? null : (e.target.value as "shift" | "off_only"))}
                    style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12.5 }}>
                    <option value="">店の既定に従う（{SHIFT_REQUEST_MODE_LABEL[mineSettingsOf(stores.find((st) => st.id === selCast.store_id)?.settings_json).shift_request_mode]}）</option>
                    <option value="shift">{SHIFT_REQUEST_MODE_LABEL.shift}</option>
                    <option value="off_only">{SHIFT_REQUEST_MODE_LABEL.off_only}</option>
                  </select>
                  <span style={{ fontSize: 11, color: "var(--v2-muted)", marginLeft: 8 }}>キャストのスマホ（シフト希望／休み希望）と自動配置の候補に効きます</span>
                </span>
              </div>
              {/* D2-4（mig0083/0085）: 指名ランクの割当（set_cast_rank_of・null=ランクなし）。
                  ランク別指名料（pricing_rules）の解決軸＝行追加時のキャストの現在ランクで決まる。 */}
              <div className="nox-frow">
                {/* ★裁定109: ラベルを「指名料ランク」へ（料金軸であることを明示・DB 呼び形 set_cast_rank_of 不変） */}
                <span className="k">指名料ランク</span>
                <span className="v">
                  <select
                    value={selCast.rank_id ?? ""}
                    disabled={busy}
                    aria-label="指名料ランク"
                    onChange={(e) => void assignRank(selCast, e.target.value === "" ? null : e.target.value)}
                    style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 12.5 }}
                  >
                    <option value="">標準（店の既定指名料）</option>
                    {ranks.filter((r) => r.is_active || r.id === selCast.rank_id).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}{r.is_active ? "" : "（無効）"}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: "var(--v2-muted)", marginLeft: 8 }}>
                    ランク別の指名料は<Link href="/master/pricing" className="nox-link">料金設定</Link>で管理
                  </span>
                </span>
              </div>
              {/* E8-5 casts#5: 割当済みプランの実値表示（mig0086 データ・overrides 適用後の実効値・表示専用）。
                  編集経路は現行どおりマスタ側＝この画面からは変更できない（機能不変）。 */}
              {(() => {
                const a = castPlanOf[selCast.id];
                const p = a ? plansById[a.planId] : null;
                if (!p) {
                  return (
                    <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: "0 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      待遇プランは未割当です（既定条件で計算されます）。
                      {!planForm && <button style={btnGhost} disabled={busy} onClick={() => { setPlanMsg(null); setPlanForm({ planId: activePlans[0]?.id ?? null, from: nextPeriodStartOf(today) }); }}>割り当てる</button>}{/* ★306-13 */}
                    </p>
                  );
                }
                const ov = a!.ov;
                const num = (k: string, fallback: number) => (typeof ov[k] === "number" ? (ov[k] as number) : fallback);
                const str = (k: string, fallback: string) => (typeof ov[k] === "string" ? (ov[k] as string) : fallback);
                const honMode = str("honBackMode", p.hon_back_mode);
                const jonaiMode = str("jonaiBackMode", p.jonai_back_mode);
                const honLabel = honMode === "rate"
                  ? `${num("honBackRate", p.hon_back_rate ?? 0)}%（率）`
                  : `¥${num("honBack", p.hon_back).toLocaleString()}/本`;
                const jonaiLabel = jonaiMode === "rate"
                  ? `${num("jonaiBackRate", p.jonai_back_rate ?? 0)}%（率）`
                  : `¥${num("jonaiBack", p.jonai_back).toLocaleString()}/本`;
                const nowW = wageOf(selCast)?.now ?? null; // ★便 P174 T-5（GV-56）: 保証行の base を「基本時給（個別上書き）」と見せない
                const ovCount = nowW ? (nowW.overridden ? 1 : 0) : Object.keys(ov).filter((k) => k !== "guarantee").length;
                return (
                  <>
                    <div className="nox-frow"><span className="k">待遇プラン</span><span className="v" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{p.name}{ovCount > 0 && <span style={{ fontSize: 11, color: "var(--gold2)" }}>個別上書きあり</span>}
                      {!planForm && <button style={btnGhost} disabled={busy} onClick={() => { setPlanMsg(null); setPlanForm({ planId: a!.planId, from: nextPeriodStartOf(today) }); }}>変更</button>}{/* ★306-13 */}
                    </span></div>
                    {/* ★裁定143（v3.1 K35）: 「保証時給」→「通常時給（プラン基本）」＝comp_plans.base（＋overrides.base）を指す語へ。
                        モックの「入店時給保証」（K33・第2期）と語を衝突させない。値・経路は不変。 */}
                    <div className="nox-frow"><span className="k">基本時給</span><span className="v num">¥{(nowW ? nowW.base : num("base", p.base)).toLocaleString()}</span></div>
                    <div className="nox-frow"><span className="k">本指名バック</span><span className="v num">{honLabel}</span></div>
                    <div className="nox-frow"><span className="k">場内バック</span><span className="v num">{jonaiLabel}</span></div>
                    <div className="nox-frow"><span className="k">同伴バック</span><span className="v num">¥{num("dohanBack", p.dohan_back).toLocaleString()}/本</span></div>
                  </>
                );
              })()}
              {/* ★裁定306-13: 待遇プランの切替フォーム（候補＝店の有効プラン・適用開始日の既定＝次の給与期の初日・上書きは維持） */}
              {planForm && (
                <div className="nox-inset" style={{ padding: "10px 14px", margin: "6px 0 10px" }}>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>待遇プラン</div>
                  <Picker dense items={activePlans.map((p) => ({ id: p.id, label: p.name }))} value={planForm.planId} onPick={(id) => setPlanForm({ ...planForm, planId: id })} disabled={busy} placeholder="プランを検索" empty="（有効なプランがありません）" />
                  {(() => { const w = trialPlanWarnOf(selCast.kind, activePlans.find((p) => p.id === planForm.planId)?.name); return w ? <Message kind="warn" style={{ margin: "8px 0 0" }}>{w}</Message> : null; })()}{/* ★GV-C C-14f（裁定396）: 在籍キャストへの体験入店は警告 */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                    <label style={lbl}>適用開始日（既定＝次の給与期の初日）<br /><input type="date" value={planForm.from} min={today} disabled={busy} onChange={(e) => setPlanForm({ ...planForm, from: e.target.value })} style={{ ...input, width: 160 }} /></label>
                    <button style={btnGold} disabled={busy} onClick={() => void savePlan(selCast)}>切り替える</button>
                    <button style={btnGhost} disabled={busy} onClick={() => { setPlanForm(null); setPlanMsg(null); }}>やめる</button>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>{NOTE_PLAN_SWITCH} 過去の日付と確定済みの給与期には適用できません。</p>
                </div>
              )}
              {planMsg && <Message kind={planMsg.kind} onDismiss={() => setPlanMsg(null)}>{planMsg.text}</Message>}
              {/* ★0154 D2／D6（裁定291 追補1 B・294-5／294-9）: 報酬型（雇用＝実働時間払い／シフト時間保証／固定給・委託＝時間報酬／1 稼働固定）と契約区分。
                  報酬型＝set_cast_plan の overrides（pay_rule／per_shift_amount／fixed_amount・'bad pay_rule for employment' は和文）。区分＝set_cast_employment（owner・期初のみ）。 */}
              {(() => {
                const a = castPlanOf[selCast.id];
                const emp = (selCast.employment ?? null) as Employment | null;
                const cur = ruleOfOverrides(a?.ov ?? null);
                const opts = payRuleOptionsOf(emp);
                const curLabel = payRuleLabelOf(cur.rule, emp);
                return (
                  <div className="nox-inset" style={{ padding: "10px 14px", margin: "6px 0 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>報酬型・契約区分</span>
                      {!ruleForm && <button style={btnGhost} disabled={busy || !a} title={a ? "" : "先に待遇プランを割り当ててください"}
                        onClick={() => { setRuleMsg(null); setRuleForm({ rule: cur.rule, amount: cur.amount === null ? "" : String(cur.amount) }); }}>報酬型を変更</button>}
                      {isOwner && !empForm && <button style={btnGhost} disabled={busy}
                        onClick={() => { setEmpMsg(null); setEmpForm({ employment: emp ?? "委託", from: nextPeriodStartOf(today) }); }}>契約区分を変更</button>}
                    </div>
                    <div className="nox-frow" data-cast-withholding-kind="1"><span className="k">源泉区分</span><span className="v">{WITHHOLDING_KIND_SHORT[withholdingKindOf(castWhKind[selCast.id] ?? null, defaultWithholdingKindOf({ subject: "cast", taxMode: emp ?? "委託" }))]}{(castWhKind[selCast.id] ?? null) === null ? "（既定）" : ""}
                      {mig0183On() && <select value={castWhKind[selCast.id] ?? ""} onChange={(e) => void saveCastKind(selCast.id, e.target.value)} disabled={busy} style={{ ...input, width: "auto", marginLeft: 8 }} aria-label="源泉区分（キャスト）"><option value="">既定</option>{withholdingKindChoices().map((k) => <option key={k} value={k}>{WITHHOLDING_KIND_LABEL[k]}</option>)}</select>}</span></div>{/* ★便 M3 M-21: 働き方＝契約区分＋源泉区分（人ごと・set_withholding_kind） */}
                    {mig0188On() && <p style={{ ...t.sub, margin: "0 0 4px" }} data-cast-withholding-note="1">{WITHHOLDING_KIND_SELECT_NOTE}</p>}
                    <div className="nox-frow"><span className="k">契約区分</span><span className="v">{emp ?? "未設定（委託として計算）"}{selCast.employment_valid_from ? <span style={{ fontSize: 11, color: "var(--v2-muted)", marginLeft: 6 }}>（{selCast.employment_valid_from} から）</span> : null}</span></div>
                    <div className="nox-frow"><span className="k">報酬型</span><span className="v">{curLabel}{cur.amount !== null ? <span className="num" style={{ marginLeft: 6 }}>¥{cur.amount.toLocaleString()}{cur.rule === "per_shift" ? "／稼働" : "／期"}</span> : null}</span></div>
                    {ruleForm && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                        <label style={lbl}>報酬型<br />
                          <select value={ruleForm.rule} disabled={busy} onChange={(e) => setRuleForm({ ...ruleForm, rule: e.target.value as PayRule })} style={{ ...input, width: 190 }}>
                            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select></label>
                        {amountKeyOf(ruleForm.rule) && (
                          <label style={lbl}>{ruleForm.rule === "per_shift" ? "1 稼働の額" : "期の定額"}<br />
                            <MoneyInput value={ruleForm.amount} disabled={busy} onChange={(v) => setRuleForm({ ...ruleForm, amount: v })} style={input} width={140} ariaLabel="報酬型の額" /></label>
                        )}
                        <button style={btnGold} disabled={busy} onClick={() => void saveRule(selCast)}>保存する</button>
                        <button style={btnGhost} disabled={busy} onClick={() => { setRuleForm(null); setRuleMsg(null); }}>やめる</button>
                      </div>
                    )}
                    {ruleMsg && <Message kind={ruleMsg.kind} onDismiss={() => setRuleMsg(null)}>{ruleMsg.text}</Message>}
                    {empForm && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                        <SegSelect value={empForm.employment} onChange={(v) => setEmpForm({ ...empForm, employment: v as Employment })} options={[["委託", "委託"], ["雇用", "雇用"]]} ariaLabel="契約区分" />
                        <label style={lbl}>適用開始（給与期の初日）<br /><input type="date" value={empForm.from} disabled={busy} onChange={(e) => setEmpForm({ ...empForm, from: e.target.value })} style={{ ...input, width: 150 }} /></label>
                        <button style={btnGold} disabled={busy} onClick={() => void saveEmployment(selCast)}>変更する</button>
                        <button style={btnGhost} disabled={busy} onClick={() => { setEmpForm(null); setEmpMsg(null); }}>やめる</button>
                      </div>
                    )}
                    {empMsg && <Message kind={empMsg.kind} onDismiss={() => setEmpMsg(null)}>{empMsg.text}</Message>}
                    <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0", lineHeight: 1.7 }}>
                      {NOTE_EMPLOYMENT} 区分の変更は給与期の初日からのみ・確定済みの期には遡りません。
                      {laborNoteNeeded(emp, cur.rule, false) && <><br />{NOTE_LABOR}</>}
                    </p>
                  </div>
                );
              })()}
              {/* ★夜間便 N4-1（裁定282-2／287-3・0151 ★3 set_cast_guarantee）: 保証時給＝期限つきの個別時給（cast_plan の保証行）。
                  owner／manager のみ（page.tsx が他ロールを redirect 済み）。RPC 未適用（0151 手貼り前）は節ごと非表示。
                  延長＝終了日だけ変更（開始日＝現在の終了日の翌日・金額は同じ）。成否は節内の Message（281-3）。 */}
              {guaRpc !== "missing" && (() => {
                const st = guaranteeStateOf(planRowsOf[selCast.id] ?? [], today);
                const cur = st.current;
                const span = (g: { from: string; to: string | null }) => `${mdOf(g.from)}〜${g.to ? mdOf(g.to) : "期限なし"}`;
                return (
                  <div className="nox-inset" style={{ padding: "10px 14px", margin: "6px 0 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>保証時給</span>
                      {cur
                        ? <button style={btnGhost} disabled={busy || guaRpc !== "ok" || !cur.to}
                            onClick={() => { setGuaMsg(null); setGuaForm({ mode: "extend", amount: String(cur.base), start: addDays(cur.to ?? today, 1), end: addDays(cur.to ?? today, 30) }); }}>延長</button>
                        : <button style={btnGhost} disabled={busy || guaRpc !== "ok" || !!st.upcoming}
                            onClick={() => { setGuaMsg(null); setGuaForm({ mode: "new", amount: "", start: today, end: addDays(today, 29) }); }}>保証を設定</button>}
                    </div>
                    <div className="nox-frow"><span className="k">現在</span>
                      <span className="v num">{cur ? `¥${cur.base.toLocaleString()}　${span(cur)}${st.daysLeft !== null ? `（あと ${st.daysLeft} 日）` : ""}` : "なし"}</span></div>
                    {(() => { const note = guaranteeEndNoteOf(st, castPlanOf[selCast.id] ? plansById[castPlanOf[selCast.id].planId]?.base ?? null : null); return note ? <div className="nox-frow"><span className="k">注記</span><span className="v" style={{ color: "var(--warning)", fontWeight: 700 }}>{note}</span></div> : null; })()}{/* ★便 L-3-1: 7 日以内に終了 */}
                    {st.upcoming && <div className="nox-frow"><span className="k">予定</span><span className="v num">¥{st.upcoming.base.toLocaleString()}　{span(st.upcoming)}</span></div>}
                    {st.history.length > 0 && (
                      <div className="nox-frow"><span className="k">履歴</span>
                        <span className="v" style={{ fontSize: 12, color: "var(--v2-muted)" }}>
                          {st.history.slice(0, 5).map((g) => `${g.from.slice(0, 4)}年 ${span(g)} ¥${g.base.toLocaleString()}`).join("、")}{st.history.length > 5 ? ` ほか${st.history.length - 5}件` : ""}
                        </span></div>
                    )}
                    {guaForm && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                        {guaForm.mode === "new"
                          ? <>
                              <label style={lbl}>金額<br /><MoneyInput value={guaForm.amount} disabled={busy}
                                onChange={(v) => setGuaForm({ ...guaForm, amount: v })} style={input} width={130} ariaLabel="保証時給の金額" /></label>
                              <label style={lbl}>開始日<br /><input type="date" min={today} value={guaForm.start} disabled={busy}
                                onChange={(e) => setGuaForm({ ...guaForm, start: e.target.value, end: guaForm.end < e.target.value ? addDays(e.target.value, 29) : guaForm.end })} style={{ ...input, width: 150 }} /></label>
                            </>
                          : <span style={{ fontSize: 12, color: "var(--sub)", paddingBottom: 8 }}>¥{Number(guaForm.amount).toLocaleString()}・{mdOf(guaForm.start)} から続けて</span>}
                        <label style={lbl}>終了日<br /><input type="date" min={guaForm.start} value={guaForm.end} disabled={busy}
                          onChange={(e) => setGuaForm({ ...guaForm, end: e.target.value })} style={{ ...input, width: 150 }} /></label>
                        <button style={btnGold} disabled={busy} onClick={() => void saveGuarantee(selCast)}>{guaForm.mode === "extend" ? "延長する" : "設定する"}</button>
                        <button style={btnGhost} disabled={busy} onClick={() => { setGuaForm(null); setGuaMsg(null); }}>やめる</button>
                      </div>
                    )}
                    {guaMsg && <Message kind={guaMsg.kind} onDismiss={() => setGuaMsg(null)}>{guaMsg.text}</Message>}
                    <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0", lineHeight: 1.7 }}>
                      期間中は基本時給の代わりにこの金額で計算し、終了の翌日から元の待遇に戻ります。
                    </p>
                  </div>
                );
              })()}
              {/* ★待遇プランの編集経路は現行この画面に存在しない（マスタ側）。
                  新規 RPC も新規フォームも作らず、管理場所への案内だけを置く＝機能不変。 */}
              <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: "0 0 10px", lineHeight: 1.8 }}>
                待遇プランの中身（基本時給・スライド・指名バック単価）は<strong style={{ color: "var(--v2-text)" }}>マスタ</strong>で管理します。キャストへの割当（切替）は上の「変更」から（306-13）。
              </p>
              <div className="nox-actions">{/* ★便 M3 M-24 */}
                <Link href="/master/cast-comp/plan" style={{ ...btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }} data-cast-link-plan="1">待遇プラン・報酬シミュレーター</Link>
              </div>
            </>
          )}

          {dtab === "account" && (
            <>
              <div className="nox-frow">
                <span className="k">ログイン（マイページ）</span>
                <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: selCast.user_id ? "var(--ok)" : "var(--v2-muted)" }}>
                    {selCast.user_id ? "招待済み" : "未招待"}
                  </span>
                  {isDemo ? <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>デモでは招待できません</span>
                    : selCast.user_id
                    ? <button style={btnGhost} disabled={busy} onClick={() => openInvite(selCast, "reset")}>PW再発行</button>
                    : <button style={btnGold} disabled={busy} onClick={() => openInvite(selCast, "invite")}>招待</button>}{/* ★N7-2 ③ */}
                </span>
                {/* ★便 ON-3（0176 ★1 401）: LINE 連携＝紐付けのリンク（line_bind_token_create 'cast'・7 日・1 回だけ）。ログイン未招待（user_id なし）でも紐付けは可＝LINE ログインは招待後 */}
                <span className="k">LINE 連携</span>
                <span className="v" style={{ display: "grid", gap: 4 }} data-cast-line-bind={lineLinked.has(selCast.id) ? "linked" : "none"}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: lineLinked.has(selCast.id) ? "var(--ok)" : "var(--v2-muted)" }}>{lineLinked.has(selCast.id) ? "連携済み（LINE に通知が届きます）" : "未連携"}</span>
                    {isDemo ? <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>デモでは連携できません</span>
                      : <button style={btnGhost} disabled={busy} onClick={() => void issueBind(selCast)}>{lineLinked.has(selCast.id) ? "付け替えのリンク" : "連携のリンクを発行"}</button>}
                  </span>
                  {bindUrl && (
                    <span style={{ display: "grid", gap: 4 }} data-cast-line-bind-url="1">
                      <span style={{ fontSize: 12, wordBreak: "break-all" }}>{bindUrl}</span>
                      <span><button type="button" style={btnGhost} onClick={() => { void navigator.clipboard?.writeText(bindUrl).then(() => setBindCopied(true)).catch(() => undefined); }}>{bindCopied ? "コピーしました ✓" : "リンクをコピー"}</button></span>
                      <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{LINE_BIND_NOTE}</span>
                    </span>
                  )}
                </span>
              </div>
              <div className="nox-frow">
                <span className="k">キオスク打刻 PIN</span>
                <span className="v">
                  {/* F4a: 打刻 PIN（ログイン結線と独立＝招待していない子も打刻できる） */}
                  <button style={btnGhost} disabled={busy}
                    onClick={() => { setPinTarget(selCast); setPinVal(""); setPinErr(null); setPinDone(false); }}>
                    打刻PIN を設定
                  </button>
                </span>
              </div>
              {/* ★v3.1 K36（C1）: 説明文をモックの2カード語彙「本人レコード／NOXログインアカウント」へ寄せる（構造は現行の行形式のまま） */}
              <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--v2-text)" }}>本人レコード</strong>（源氏名・所属・待遇・写真など店舗で管理する人物情報）と
                <strong style={{ color: "var(--v2-text)" }}>NOXログインアカウント</strong>（本人がマイページで出勤・報酬を確認するためのログイン）は別管理です。
                ログインは必要な人だけ発行します。招待するとマイページが使えます。PIN はキオスク端末での打刻に使い、画面にも記録にも残りません。
              </p>
            </>
          )}
        </Modal>
      )}

      {/* 体入の詳細＝評価・書類・メモ・採否（現行 UI をそのまま移設＝送る RPC も引数も不変）。★裁定253 R4: 同じく Modal（560）へ */}
      {selTrial && (
        <Modal onClose={() => !busy && setSel(null)} maxWidth={560} scroll>
          <div className="nox-cdrawer">
            <CastAvatar name={selTrial.name} size={64} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--v2-text)" }}>{selTrial.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
                体入 {selTrial.trial_date ?? "—"}・{selTrial.tier ?? "—"}・{ageOf(selTrial.birthday)}
              </div>
            </div>
            <span style={{ marginLeft: "auto" }}><button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !busy && setSel(null)}>×</button></span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>評価</span>
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} disabled={busy} onClick={() => void setRating(selTrial, r)}
                style={{ ...btnGhost, padding: "2px 8px", color: (selTrial.rating ?? 0) >= r ? "var(--gold)" : "var(--v2-muted)" }}>
                ★
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            {DOC_KEYS.map((d) => (
              <label key={d.key} style={{ ...lbl, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={docs(selTrial)[d.key] === true} disabled={busy}
                  onChange={() => void toggleDoc(selTrial, d.key)} style={{ accentColor: "var(--gold)", cursor: "pointer" }} />
                {d.label}
              </label>
            ))}
          </div>

          <MemoField tr={selTrial} busy={busy} onSave={(m) => rpc("メモを更新", "trial_update", { p_trial_id: selTrial.id, p_memo: m })} />

          <div className="nox-formmodal-foot">
            {/* ★裁定244: Danger 左端・実行 右端（見送り→本採用の順へ入替）・行は中央。★裁定253 R4: モーダル脚（.nox-formmodal-foot） */}
            {/* ★裁定146（裁定120 適用）: 取り消し困難な操作＝Danger 系トークン（--bad 系は警告面用・値は同系） */}
            <button style={{ ...btnGhost, color: "var(--danger)", border: "1px solid var(--danger-bd)" }} disabled={busy} onClick={async () => {
              if (!confirm(`${selTrial.name} を見送りますか？`)) return;
              if (await rpc("見送り", "trial_reject", { p_trial_id: selTrial.id })) setSel(null);
            }}>見送り</button>
            <button style={btnGold} disabled={busy || !allDocs(selTrial)} onClick={async () => {
              if (!confirm(`${selTrial.name} を本採用しますか？（キャストに登録され、実績ゼロから開始します）`)) return;
              if (await rpc("本採用", "trial_hire", { p_trial_id: selTrial.id })) { setSel(null); await reloadLoginCasts(); }
            }}>本採用</button>
            {!allDocs(selTrial) && <span style={{ ...t.sub }}>本採用には全書類のチェックが必要です。</span>}
          </div>
        </Modal>
      )}

      {/* 招待/PW再発行モーダル（staff-board の追加モーダル雛形・PW は一度だけ表示） */}
      {invTarget && (
        <Modal onClose={() => !busy && !invResult && setInvTarget(null)}>
            {!invResult ? (
              <>
                <h2 style={secTitle}>{invMode === "invite" ? `${invTarget.name} を招待` : `${invTarget.name} のパスワード再発行`}</h2>
                {invMode === "invite" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={t.fieldLabel}>メールアドレス（任意）</span>
                      <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} style={t.input}
                        placeholder="未入力なら自動でログインIDを発行" type="email" />
                    </label>
                    <p style={{ ...t.sub, margin: 0 }}>発行した初期パスワードは次の画面で一度だけ表示されます。</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                    新しいパスワードを発行します（現在のパスワードは使えなくなります）。新パスワードは次の画面で一度だけ表示されます。
                  </p>
                )}
                {invErr && <Message kind="error" style={{ margin: "8px 0 0" }}>{invErr}</Message>}
                <div className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={btnGhost} disabled={busy} onClick={() => setInvTarget(null)}>キャンセル</button>
                  <button style={btnGold} disabled={busy} onClick={() => void submitInvite()}>
                    {busy ? "処理中…" : invMode === "invite" ? "招待する" : "再発行する"}
                  </button>
                </div>
              </>
            ) : invResult.initial_password ? (
              <>
                <h2 style={secTitle}>{invMode === "invite" ? "招待しました" : "パスワードを再発行しました"}</h2>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{invResult.login_email}</span></div>
                  <div style={t.bdRow}><span style={t.bdKey}>{invMode === "invite" ? "初期パスワード" : "新パスワード"}</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{invResult.initial_password}</span></div>
                </div>
                <p style={{ ...t.alert, marginBottom: 10 }}>このパスワードは再表示できません。キャストに安全に渡してください。</p>
                <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
                  <button style={btnGhost} onClick={() => void copyInvite()}>{invCopied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
                  <button style={btnGold} onClick={() => setInvTarget(null)}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>既存アカウントに結線しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {invResult.login_email} は登録済みのため、既存のログイン情報のまま結線しました（パスワードの再発行はありません）。
                </p>
                <div className="nox-actions" style={{ display: "flex" }}>
                  <button style={btnGold} onClick={() => setInvTarget(null)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* F4a 打刻PIN 設定モーダル（set_cast_pin＝owner/manager 自店・4桁・上書きでロック解除） */}
      {pinTarget && (
        <Modal onClose={() => !busy && setPinTarget(null)}>
            {!pinDone ? (
              <>
                <h2 style={secTitle}>{pinTarget.name} の打刻PIN</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  キオスク端末（タブレット）で打刻するときの4桁の数字です。
                  設定し直すと失敗カウント・ロックもリセットされます。
                </p>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={t.fieldLabel}>PIN（数字4桁）</span>
                  <input value={pinVal} onChange={(e) => setPinVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    inputMode="numeric" autoComplete="off" placeholder="0000"
                    style={{ ...t.input, width: 120, letterSpacing: 6, fontSize: 18, textAlign: "center" }} />
                </label>
                {pinErr && <Message kind="error" style={{ margin: "8px 0 0" }}>{pinErr}</Message>}
                <div className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={btnGhost} disabled={busy} onClick={() => setPinTarget(null)}>キャンセル</button>
                  <button style={btnGold} disabled={busy || !(mig0191On() ? pinVal.length >= 4 && pinVal.length <= 6 : pinVal.length === 4)} onClick={() => void submitPin()}>
                    {busy ? "処理中…" : "設定する"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>PIN を設定しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {pinTarget.name} さんに PIN を口頭で伝えてください（画面・記録には残りません）。
                </p>
                <div className="nox-actions" style={{ display: "flex" }}>
                  <button style={btnGold} onClick={() => setPinTarget(null)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* 段P: 写真アップロードモーダル（現在の写真→ファイル選択→プレビュー→保存。削除経路は持たない＝差し替えは上書き） */}
    </div>
  );
}

function MemoField({ tr, busy, onSave }: { tr: Trial; busy: boolean; onSave: (m: string) => Promise<boolean> }) {
  const [memo, setMemo] = useState(tr.memo ?? "");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
      <span style={lbl}>メモ</span>
      <input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={busy}
        placeholder="評価・引き継ぎ等" style={{ ...input, width: 260 }} maxLength={500} />
      <button style={btnGhost} disabled={busy} onClick={() => void onSave(memo)}>保存</button>
    </div>
  );
}

// 体入登録（withTrialFields=true）と直接キャスト登録の共用フォーム。
function RegisterForm({
  stores, isOwner, myStoreId, busy, withTrialFields, fixedKind, onSubmit,
}: {
  stores: Store[]; isOwner: boolean; myStoreId: string; busy: boolean;
  withTrialFields?: boolean;
  /** ★GV-C C-14f: 区分を固定（体入の追加＝「体入」）＝区分の選択を出さない */
  fixedKind?: string;
  onSubmit: (args: Record<string, unknown>) => Promise<boolean>;
}) {
  const [storeId, setStoreId] = useState(myStoreId || stores[0]?.id || "");
  const [name, setName] = useState("");
  const [realName, setRealName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [tier, setTier] = useState<string>(fixedKind ?? "レギュラー"); // ★GV-C C-14f: 直接登録の既定は「レギュラー」（体入は体入タブから＝在籍区分で絞るため）
  const [trialDate, setTrialDate] = useState("");
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const [joinedOn, setJoinedOn] = useState(todayJst); // ★便 X13-H H-11: 入店日（直接登録だけ・必須・既定＝今日）＝登録後に set_cast_profile で本入店日へ
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("源氏名を入力してください"); return; }
    if (!birthday) { setErr("生年月日を入力してください"); return; }
    if (!fixedKind && !withTrialFields && !joinedOn) { setErr("入店日を入力してください"); return; }
    setErr(null);
    const base: Record<string, unknown> = {
      p_store_id: isOwner ? storeId : myStoreId,
      p_name: name.trim(),
      p_birthday: birthday,
      p_real_name: realName.trim() || null,
    };
    const args = withTrialFields
      ? { ...base, p_tier: tier, p_trial_date: trialDate || null }
      : { ...base, p_kind: fixedKind ?? tier, ...(!fixedKind ? { _joined_on: joinedOn } : {}) };
    const ok = await onSubmit(args);
    if (ok) { setName(""); setRealName(""); setBirthday(""); setTrialDate(""); setTier(fixedKind ?? "レギュラー"); setJoinedOn(todayJst); }
  }

  // ★DP1 P3（裁定 DP1-⑨）: モック castDialog の `.formgrid`（2カラム・`.field` / `.field.full`）へ。
  //   ★フィールドの集合・検証・送る RPC と引数は**1文字も変えていない**（上の submit() は不触）。
  //     変えたのは並べ方だけ＝横1列の flex → 2カラムの格子（既存部品 .nox-field2 / .nox-field）。
  return (
    <div>
      <div className="nox-field2">
        {isOwner && stores.length > 1 && (
          <div className="nox-field full">
            <span className="lab">配属店</span>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...input, width: "100%" }}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="nox-field">
          <span className="lab">源氏名<span className="req">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: "100%" }} maxLength={80} />
          <span className="hint">一覧・レジ・シフトに出る表示名です。</span>
        </div>
        <div className="nox-field">
          <span className="lab">本名</span>
          <input value={realName} onChange={(e) => setRealName(e.target.value)} style={{ ...input, width: "100%" }} maxLength={80} />
          <span className="hint">画面には出しません（機密・税務情報の扱い）。</span>
        </div>
        <div className="nox-field">
          <span className="lab">生年月日<span className="req">*</span></span>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={{ ...input, width: "100%" }} />
        </div>
        {!fixedKind && !withTrialFields && (/* ★便 X13-H H-11 ①: 入店日（必須・既定＝今日）＝本入店日 */
          <div className="nox-field" data-joined-on="1">
            <span className="lab">入店日<span className="req">*</span></span>
            <input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} style={{ ...input, width: "100%" }} aria-label="入店日" />
          </div>
        )}
        {!fixedKind && <div className="nox-field">
          <span className="lab">区分</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...input, width: "100%" }}>
            {TIERS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>}
        {withTrialFields && (
          <div className="nox-field">
            <span className="lab">体入日</span>
            <input type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} style={{ ...input, width: "100%" }} />
          </div>
        )}
      </div>
      {err && <Message kind="error" style={{ margin: "0 0 10px" }}>{err}</Message>}
      {/* モック `.actions`＝右寄せのフッタ（主ボタン1つ） */}
      <div className="nox-actions" style={{ display: "flex", gap: 9, marginTop: 17 }}>
        <button style={btnGold} disabled={busy} onClick={() => void submit()}>{withTrialFields ? "追加" : "登録する"}</button>
      </div>
    </div>
  );
}
