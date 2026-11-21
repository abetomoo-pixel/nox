// ★運営コンソール 版 1（夜便 2026-11-20 N5・枝だけ・旗 MIG_0202A_APPLIED の後ろ）: 判定と表示の純関数（DB を知らない）。
//   画面の案＝docs/tmp/console_ui_v1_1120.md・関数＝docs/tmp/0202a_ops_v1.sql（ops_org_list・ops_org_create・ops_org_set_agency_code・ops_onboarding_set・ops_invite_logged）。

/** 入口の判定（requireOperator の純関数部分）：未ログイン→ログイン・運営者でない（店の人）→404・MFA 未（aal1）→MFA・aal2→通す */
export type OpsGate = "login" | "notfound" | "mfa" | "ok";
export function opsGateOf(o: { hasUser: boolean; isOperator: boolean; aal: string | null }): OpsGate {
  if (!o.hasUser) return "login";
  if (!o.isOperator) return "notfound";
  return o.aal === "aal2" ? "ok" : "mfa";
}
/** API の返し（画面と同じ判定・API は動かさずに状態だけ返す）：未ログイン 401・運営者でない 404・MFA 未 403 */
export function opsApiStatusOf(g: OpsGate): 401 | 404 | 403 | null {
  return g === "login" ? 401 : g === "notfound" ? 404 : g === "mfa" ? 403 : null;
}

/** 業態（6 つ＝相談役 11/20 18:12・ホストを足した） */
export const OPS_BIZ_TYPES = [
  ["cabaret", "キャバクラ"], ["girlsbar", "ガールズバー"], ["snack", "スナック"], ["lounge", "ラウンジ"], ["bar", "バー"], ["host", "ホスト"],
] as const;
export type OpsBizType = (typeof OPS_BIZ_TYPES)[number][0];

/** 一覧の状態の札（ops_org_list.kind） */
export const OPS_KIND_LABEL: Record<string, string> = { trial: "お試し", active: "有効", tester: "テスター", demo: "デモ", verify: "検証用", past_due: "支払い遅れ", canceled: "解約", inactive: "停止", none: "契約なし" };
export const OPS_KIND_FILTERS = [["all", "すべて"], ["onboarding", "導入中"], ["trial", "お試し"], ["active", "有効"], ["tester", "テスター"], ["demo", "デモ"], ["verify", "検証用"]] as const;
export const OPS_ROUTE_FILTERS = [["all", "すべて"], ["agency", "代理店"], ["direct", "直販"]] as const;

/** 日本時間（JST を明示＝#418 の型・教訓） */
export function fmtJst(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", withTime ? { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } : { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

export type OpsOrgRow = {
  org_id: string; org_name: string; kind: string; store_count: number; billing_status: string | null; trial_ends_at: string | null; has_subscription: boolean;
  agency_code: string | null; onboarding_state: string; onboarding_done_at: string | null;
  owner_email: string | null; owner_invited_at: string | null; owner_accepted: boolean | null;
  setup_done_stores: number; setup_step_max: number | null; setup_draft_at: string | null;
  line_login_stores: number; line_notify_stores: number; line_richmenu_stores: number; line_links: number;
  cast_count: number; staff_count: number; last_used_at: string | null; created_at: string;
  /** ★0202e: オーナーの受諾の日時・LINE の確かめの日時（0202e の前は無い） */ owner_accepted_at?: string | null; line_verified_at?: string | null;
};
export const kindLabelOf = (r: Pick<OpsOrgRow, "kind" | "trial_ends_at">): string =>
  r.kind === "trial" ? `お試し（〜${fmtJst(r.trial_ends_at, false)}）` : (OPS_KIND_LABEL[r.kind] ?? r.kind);
export const routeLabelOf = (code: string | null): string => (code ? `代理店（${code}）` : "直販");
export const inviteLabelOf = (r: Pick<OpsOrgRow, "owner_email" | "owner_accepted" | "owner_invited_at">): string =>
  !r.owner_email ? "オーナーなし" : r.owner_accepted ? "受諾済み" : `未受諾（招待 ${fmtJst(r.owner_invited_at, false)}）`;
export const setupLabelOf = (r: Pick<OpsOrgRow, "store_count" | "setup_done_stores" | "setup_step_max">): string =>
  r.store_count > 0 && r.setup_done_stores >= r.store_count ? "済み" : r.setup_step_max ? `STEP ${r.setup_step_max}／9` : "未着手";
/** LINE（版 1 は 3 つの印＝ログイン・通知・リッチメニュー） */
export function lineLabelOf(r: Pick<OpsOrgRow, "line_login_stores" | "line_notify_stores" | "line_richmenu_stores" | "line_links">): string {
  if (!r.line_login_stores && !r.line_notify_stores && !r.line_richmenu_stores) return "未着手";
  const marks = [r.line_login_stores ? "ログイン" : null, r.line_notify_stores ? "通知" : null, r.line_richmenu_stores ? "リッチメニュー" : null].filter(Boolean);
  return `${marks.join("・")}${r.line_links ? `・つながった人 ${r.line_links}` : ""}`;
}
export const onboardingLabelOf = (s: string): string => (s === "done" ? "導入完了" : "導入中");

/** 一覧の絞り */
export function opsFilterOf(rows: readonly OpsOrgRow[], f: { kind: string; route: string; q: string }): OpsOrgRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) =>
    (f.kind === "all" || (f.kind === "onboarding" ? r.onboarding_state === "onboarding" : r.kind === f.kind))
    && (f.route === "all" || (f.route === "agency" ? !!r.agency_code : !r.agency_code))
    && (!q || r.org_name.toLowerCase().includes(q) || (r.owner_email ?? "").toLowerCase().includes(q)));
}

/** テナント追加の欄の検査（関数と同じ形＝先に画面で止める） */
export type NewOrgForm = { orgName: string; storeName: string; bizType: string; ownerEmail: string; agencyCode: string; tester: boolean };
export function newOrgFormErrOf(f: NewOrgForm): string | null {
  const on = f.orgName.trim(), sn = f.storeName.trim(), em = f.ownerEmail.trim(), code = f.agencyCode;
  if (on.length < 1 || on.length > 60) return "会社名を 60 字までで入れてください";
  if (sn.length < 1 || sn.length > 60) return "店名を 60 字までで入れてください";
  if (/^NOX-(DEMO|VERIFY)/.test(on)) return "NOX-DEMO／NOX-VERIFY で始まる名前は使えません";
  if (!OPS_BIZ_TYPES.some(([k]) => k === f.bizType)) return "業態を選んでください";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return "オーナーのメールを入れてください";
  if (code !== "" && (code.length > 40 || code !== code.trim())) return "紹介コードは 40 字以内・前後の空白なしで入れてください";
  return null;
}
export const newOrgConfirmOf = (f: NewOrgForm): string => `${f.orgName.trim()} を作り、${f.ownerEmail.trim()} に招待を送ります。よろしいですか`;
export const REFERRAL_FIELD_NOTE = "最初の契約の前に、Yuiba の代理店の画面のコードと同じものを入れてください";
export const ROUTE_FIELD_NOTE = "報酬の帰属は Yuiba で管理しています。ここを変えても報酬の行き先は変わりません";
export const TESTER_NOTE = "契約の画面を押さないよう伝えてください。テストを終えるときは詳細の画面で戻します";
export const LOGIN_FAIL_TEXT = "メールかパスワードが違います";   // 運営者でない人にも同じ文（運営の画面があることを教えない）

/** 関数の例外の文 → 画面の文 */
const ERR: Record<string, string> = {
  forbidden: "権限がありません",
  "dup email": "このメールはもう使われています",
  "dup org": "同じ名前の会社があります",
  "reserved name": "NOX-DEMO／NOX-VERIFY で始まる名前は使えません",
  "bad name": "会社名と店名を 60 字までで入れてください",
  "bad biz type": "業態を選んでください",
  "bad email": "オーナーのメールの形が違います",
  "bad code": "紹介コードは 40 字以内・前後の空白なしで入れてください",
  "bad owner auth": "招待を送れませんでした（会社は作っていません）",
  "orphan auth": "このメールは以前の作成の途中で残っています（運営で確かめてください）",
  "invite failed": "招待を送れませんでした（会社は作っていません）",
  "cannot reopen": "導入完了から導入中には戻せません",
  accepted: "受諾済みです（パスワードを忘れたときは、本人がログインの画面の「パスワードを忘れた」から）",
  "no owner": "オーナーがいません",
  demo: "デモの会社は変えられません",
  "not found": "会社が見つかりません",
  "bad state": "状態の値が違います",
};
export function opsErrJa(msg: string | null | undefined): string {
  const m = String(msg ?? "");
  for (const k of Object.keys(ERR).sort((a, b) => b.length - a.length)) if (m.includes(k)) return ERR[k];
  return "うまくいきませんでした。時間をおいてもう一度試してください";
}

// ★2026-11-21 夜（相談役 18:40 の 2c）: 導入の状況の札（済・途中・未）・「何日前」・次にすること（詳細の一番上と一覧で同じもの）。
//   「何日前」は済んだ日時が ops_org_list にある項目だけ（導入＝onboarding_done_at・初期設定＝setup_draft_at＝最後の保存）。オーナーの受諾と LINE は済んだ日時を返していない＝出さない。
export type OpsStepState = "done" | "doing" | "todo";
export const OPS_STEP_STATE_LABEL: Record<OpsStepState, string> = { done: "済", doing: "途中", todo: "未" };
export type OpsProgressItem = { key: "owner" | "setup" | "line" | "people" | "onboarding"; name: string; state: OpsStepState; detail: string; ago: string | null };
/** JST の日付の差（今日・n 日前）。日時が無い・未来は null */
export function daysAgoJa(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x: Date) => Math.floor((x.getTime() + 9 * 3600_000) / 86_400_000);
  const n = day(now) - day(d);
  return n < 0 ? null : n === 0 ? "今日" : `${n} 日前`;
}
export function opsProgressOf(r: OpsOrgRow, now: Date): OpsProgressItem[] {
  const owner: OpsStepState = r.owner_accepted ? "done" : r.owner_email ? "doing" : "todo";
  const setupDone = r.store_count > 0 && r.setup_done_stores >= r.store_count;
  const setup: OpsStepState = setupDone ? "done" : r.setup_step_max || r.setup_draft_at ? "doing" : "todo";
  const lineAll = !!(r.line_login_stores && r.line_notify_stores && r.line_richmenu_stores);
  const line: OpsStepState = lineAll || r.line_verified_at ? "done" : r.line_login_stores || r.line_notify_stores || r.line_richmenu_stores ? "doing" : "todo";
  const people: OpsStepState = r.cast_count > 0 ? "done" : r.staff_count > 0 ? "doing" : "todo";
  const onb: OpsStepState = r.onboarding_state === "done" ? "done" : "doing";
  return [
    { key: "owner", name: "オーナーの受諾", state: owner, detail: inviteLabelOf(r), ago: owner === "done" ? daysAgoJa(r.owner_accepted_at, now) : null },
    { key: "setup", name: "初期設定", state: setup, detail: setupLabelOf(r), ago: setup === "done" ? daysAgoJa(r.setup_draft_at, now) : null },
    { key: "line", name: "LINE", state: line, detail: r.line_verified_at ? `${lineLabelOf(r)}・確かめ済み` : lineLabelOf(r), ago: line === "done" ? daysAgoJa(r.line_verified_at, now) : null },
    { key: "people", name: "キャスト・スタッフ", state: people, detail: `${r.cast_count} 人・${r.staff_count} 人`, ago: null },
    { key: "onboarding", name: "導入", state: onb, detail: onboardingLabelOf(r.onboarding_state), ago: onb === "done" ? daysAgoJa(r.onboarding_done_at, now) : null },
  ];
}
/** 次にすること（1 行）＝済でない最初の項目 */
export function opsNextStepOf(items: readonly OpsProgressItem[]): string {
  const it = items.find((x) => x.state !== "done");
  if (!it) return "なし（導入は済んでいます）";
  switch (it.key) {
    case "owner": return it.state === "todo" ? "オーナーを決めて招待を送る" : "オーナーの受諾を待つ（届いていなければ招待をもう一度送る）";
    case "setup": return it.state === "todo" ? "オーナーが初期設定を始める" : `オーナーが初期設定を終える（今 ${it.detail}）`;
    case "line": return "LINE 連携を終える（ログイン・通知・リッチメニュー）";
    case "people": return "キャストを登録する";
    default: return "確かめが済んだら「導入完了にする」";
  }
}
