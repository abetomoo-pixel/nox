// ★【D8】起票155 の 2（2026-11-25・相談役の決め・旗 MIG_0209_APPLIED の後ろ）: 運営者の管理の純関数（DB を知らない）。
//   役の値は今のまま（ops_admin／ops_support）・画面だけ 管理者／担当。担当ができないのは運営者の管理だけ（/ops/operators は見せない）。
//   関数＝docs/tmp/ops_admin_1125/0209_ops_operator_admin.sql（ops_operator_list・add・reinvite_logged・set_active・set_role・mfa_reset_logged・password_logged）。
import { fmtJst, opsErrJa } from "./labels";

export const OPS_ROLES = [["ops_admin", "管理者"], ["ops_support", "担当"]] as const;
export type OpsRole = (typeof OPS_ROLES)[number][0];
export const OPS_ROLE_LABEL: Record<string, string> = Object.fromEntries(OPS_ROLES);
export const opsRoleLabelOf = (role: string | null | undefined): string => OPS_ROLE_LABEL[String(role ?? "")] ?? "担当";
export const isOpsRole = (v: unknown): v is OpsRole => OPS_ROLES.some(([k]) => k === v);
/** 管理者だけの画面と route（運営者の管理）＝役が ops_admin のときだけ */
export const isOpsAdminRole = (role: string | null | undefined): boolean => role === "ops_admin";

/** ops_operator_list の 1 行 */
export type OpsOperatorRow = {
  auth_user_id: string; email: string; name: string; role: string; is_active: boolean; created_at: string; created_by: string | null;
  stopped_at: string | null; stopped_by: string | null; mfa_reset_at: string | null;
  invited_at: string | null; email_confirmed_at: string | null; last_sign_in_at: string | null;
  mfa_verified: number; is_self: boolean;
};

/** 状態の札：停止 → 招待中（受諾もログインも無い）→ 認証アプリ未登録 → 有効 */
export type OpsOperatorState = "stopped" | "invited" | "no_mfa" | "active";
export const OPS_OPERATOR_STATE_LABEL: Record<OpsOperatorState, string> = { stopped: "停止", invited: "招待中", no_mfa: "認証アプリ未登録", active: "有効" };
export function operatorStateOf(r: Pick<OpsOperatorRow, "is_active" | "email_confirmed_at" | "last_sign_in_at" | "mfa_verified">): OpsOperatorState {
  if (!r.is_active) return "stopped";
  if (!r.email_confirmed_at && !r.last_sign_in_at) return "invited";
  if (!(r.mfa_verified > 0)) return "no_mfa";
  return "active";
}

/** 行に出すボタン（自分の行は 0 個・最後の管理者は止める／担当にするを出さず理由を 1 行） */
export type OpsOperatorAction = "reinvite" | "stop" | "resume" | "to_admin" | "to_support" | "mfa_reset";
export const OPS_OPERATOR_ACTION_LABEL: Record<OpsOperatorAction, string> = {
  reinvite: "招待を出し直す", stop: "止める", resume: "戻す", to_admin: "管理者にする", to_support: "担当にする", mfa_reset: "認証アプリをリセット",
};
export const LAST_ADMIN_NOTE = "最後の管理者は止められません（先に別の人を管理者にしてください）";
export const SELF_ROW_NOTE = "自分の行は変えられません（パスワードは「自分の設定」から）";
export function operatorActionsOf(r: OpsOperatorRow, o: { activeAdmins: number }): { actions: OpsOperatorAction[]; note: string | null } {
  if (r.is_self) return { actions: [], note: SELF_ROW_NOTE };
  const st = operatorStateOf(r);
  const lastAdmin = r.is_active && r.role === "ops_admin" && o.activeAdmins <= 1;
  const a: OpsOperatorAction[] = [];
  if (st === "invited") a.push("reinvite");
  if (r.is_active && !lastAdmin) a.push("stop");
  if (!r.is_active) a.push("resume");
  if (r.role === "ops_admin" && !lastAdmin) a.push("to_support");
  if (r.role !== "ops_admin") a.push("to_admin");
  if (r.mfa_verified > 0) a.push("mfa_reset");
  return { actions: a, note: lastAdmin ? LAST_ADMIN_NOTE : null };
}
export const activeAdminsOf = (rows: readonly Pick<OpsOperatorRow, "role" | "is_active">[]): number => rows.filter((r) => r.is_active && r.role === "ops_admin").length;

/** 運営者を足す欄（関数と同じ形＝先に画面で止める）。役は既定なし（必ず選ぶ） */
export type NewOperatorForm = { email: string; name: string; role: string };
export function newOperatorFormErrOf(f: NewOperatorForm): string | null {
  const em = f.email.trim(), nm = f.name.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return "メールの形が違います";
  if (nm.length < 1 || nm.length > 40) return "名前を 40 字までで入れてください";
  if (!isOpsRole(f.role)) return "役を選んでください";
  return null;
}
export const newOperatorConfirmOf = (f: NewOperatorForm): string => `${f.name.trim()}（${opsRoleLabelOf(f.role)}）を足し、${f.email.trim()} に招待を送ります。よろしいですか`;

/** 理由：リセットは必ず・止めるは任意（どちらも 200 字まで） */
export const OPS_REASON_MAX = 200;
export function opsReasonErrOf(reason: string, required: boolean): string | null {
  const r = reason.trim();
  if (required && r.length === 0) return "理由を入れてください";
  if (r.length > OPS_REASON_MAX) return `理由は ${OPS_REASON_MAX} 字までです`;
  return null;
}
export const mfaResetConfirmOf = (name: string): string => `${name} の認証アプリの登録を消します。今ログインしている画面は使えなくなり、次のログインで登録し直します。よろしいですか`;
export const stopConfirmOf = (name: string): string => `${name} を止めます。止めた人は運営の画面に入れません（記録は残ります）。よろしいですか`;

/** パスワードの変更の欄（今のパスワード・新しいパスワード 2 回・8〜72 字＝invitePasswordErrorOf と同じ幅） */
export function opsPasswordChangeErrOf(f: { current: string; password: string; password2: string }): string | null {
  if (f.current.length === 0) return "今のパスワードを入れてください";
  if (f.password.length < 8) return "パスワードは 8 文字以上にしてください";
  if (f.password.length > 72) return "パスワードは 72 文字までです";
  if (f.password !== f.password2) return "確認用のパスワードが一致しません";
  if (f.password === f.current) return "今のパスワードと同じです";
  return null;
}
export const OPS_PASSWORD_WRONG = "今のパスワードが違います";

/** セッションの AMR（認証の方法と時刻）。Supabase の既定は { method, timestamp（秒） }。文字列だけの形は時刻が無い＝古いとみなす */
export type OpsAmr = { method: string; timestamp: number } | string;
export type OpsFactor = { factor_type?: string | null; status?: string | null; created_at?: string | null };
const isSecond = (m: string) => m === "totp" || m.startsWith("mfa/");
const amrAt = (amr: readonly OpsAmr[], pick: (m: string) => boolean): number | null => {
  let at: number | null = null;
  for (const e of amr) if (typeof e === "object" && e && typeof e.timestamp === "number" && pick(e.method)) at = at === null ? e.timestamp : Math.max(at, e.timestamp);
  return at;
};
/**
 * 今のセッションでは /ops を使わせない（ログインからやり直す）か。★認証アプリのリセットの後に、その人の今のセッションで使い続けられないための柵。
 *  ①リセットの記録（mfa_reset_at）があり、このセッションの最初の認証（パスワード・招待・再設定のリンク）がそれより前＝やり直し。
 *  ②aal2 なのに確認済みの認証アプリが今無い（Admin API で消した・手順書の SQL で消した）＝やり直し。
 *  ③aal2 の 6 桁を確かめた時刻より後にできた認証アプリしか無い（登録し直した後の古いセッション）＝やり直し。
 *  aal1（6 桁の前）で ①に当たらなければ false（/ops/mfa で登録か 6 桁へ）。
 */
export function opsSessionStaleOf(o: { aal: string | null; amr: readonly OpsAmr[]; factors: readonly OpsFactor[]; mfaResetAt: string | null }): boolean {
  const firstAt = amrAt(o.amr, (m) => !isSecond(m));
  if (o.mfaResetAt) {
    const reset = Date.parse(o.mfaResetAt);
    if (!Number.isFinite(reset) || firstAt === null || firstAt * 1000 <= reset) return true;
  }
  if (o.aal !== "aal2") return false;
  const verified = o.factors.filter((f) => f.status === "verified" && (f.factor_type ?? "totp") === "totp");
  if (verified.length === 0) return true;
  const totpAt = amrAt(o.amr, isSecond);
  if (totpAt === null) return true;
  return !verified.some((f) => { const c = Date.parse(String(f.created_at ?? "")); return Number.isFinite(c) && c <= totpAt * 1000 + 1000; });   // AMR は秒で切り捨て＝1 秒の幅
}

/** invite-accept（/auth/set-password）で決めたパスワードの道＝このセッションの最初の認証の方法（招待のリンク・再設定のリンク） */
export function passwordViaOf(amr: readonly OpsAmr[]): "invite" | "recovery" | "other" {
  let last: { method: string; timestamp: number } | null = null;
  for (const e of amr) if (typeof e === "object" && e && typeof e.timestamp === "number" && !isSecond(e.method) && (!last || e.timestamp >= last.timestamp)) last = e;
  return last?.method === "invite" ? "invite" : last?.method === "recovery" ? "recovery" : "other";
}

/** 関数の例外の文 → 画面の文（'op …' は運営者の管理だけ・ほかは会社の文に任せる） */
const OP_ERR: Record<string, string> = {
  "forbidden (role)": "管理者だけが使えます",
  "op self": "自分には使えません",
  "op last admin": LAST_ADMIN_NOTE,
  "op dup": "この人はもう運営者です（止めている人は「戻す」から）",
  "op store user": "店のユーザーのメールは運営者にできません",
  "op bad role": "役を選んでください",
  "op bad name": "名前を 40 字までで入れてください",
  "op bad email": "メールの形が違います",
  "op bad auth": "招待を送れませんでした（運営者は足していません）",
  "op not found": "運営者が見つかりません",
  "op stopped": "止めている人です（先に「戻す」）",
  "op accepted": "受諾済みです（パスワードを忘れたときは、本人がログインの画面の「パスワードをお忘れの方」から）",
  "op no factor": "認証アプリは登録されていません",
  "op reason required": "理由を入れてください",
  "op bad reason": `理由は ${OPS_REASON_MAX} 字までです`,
  "op bad active": "止めるか戻すかを選んでください",
  "op bad via": "記録の種類が違います",
};
export function opsOperatorErrJa(msg: string | null | undefined): string {
  const m = String(msg ?? "");
  for (const k of Object.keys(OP_ERR).sort((a, b) => b.length - a.length)) if (m.includes(k)) return OP_ERR[k];
  return opsErrJa(m);
}

/** 運営者の記録（ops_audit_logs の ops.operator.*）の 1 行 */
export type OpsOperatorLog = { id: string; at: string; who: string; action: string; target: string | null; before: unknown; after: unknown; reason: string | null };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
export function operatorLogLineOf(l: Pick<OpsOperatorLog, "action" | "before" | "after">, targetName: string): string {
  const a = obj(l.after), b = obj(l.before);
  switch (l.action) {
    case "ops.operator.seed": return `最初の運営者を登録した（${targetName}）`;
    case "ops.operator.add": return `運営者を足した：${String(a.name ?? targetName)}（${opsRoleLabelOf(String(a.role ?? ""))}・${String(a.email ?? "")}）`;
    case "ops.operator.reinvite": return `招待を出し直した（${targetName}）`;
    case "ops.operator.stop": return `止めた（${targetName}）`;
    case "ops.operator.resume": return `戻した（${targetName}）`;
    case "ops.operator.role": return `役を変えた（${targetName}：${opsRoleLabelOf(String(b.role ?? ""))} → ${opsRoleLabelOf(String(a.role ?? ""))}）`;
    case "ops.operator.mfa_reset": return `認証アプリをリセットした（${targetName}）`;
    case "ops.operator.password": return a.via === "self" ? `パスワードを変えた（${targetName}）` : a.via === "invite" ? `招待からパスワードを決めた（${targetName}）` : `パスワードを再設定した（${targetName}）`;
    default: return l.action;
  }
}
export const operatorLogAtOf = (iso: string): string => fmtJst(iso);
