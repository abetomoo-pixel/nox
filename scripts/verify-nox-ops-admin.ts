/*
 * verify:nox-ops-admin — 【D8】起票155 の 2＝運営者の管理（0209・2026-11-25・旗 MIG_0209_APPLIED の後ろ）。
 *   (1) 純関数＝役の名前（管理者／担当）・状態の札・行のボタン（自分の行は 0 個・最後の管理者）・欄の検査・理由・パスワードの欄・例外の日本語・記録の文・
 *       ★リセットの後に今のセッションで /ops を使えない（opsSessionStaleOf → opsGateOf の relogin・API 401）・パスワードの道（invite／recovery）。
 *   (2) 配線（源）＝6 本の route（requireOperatorApi が最初・役は opsAdminApiRes・me/password は役を見ない）・旗の後ろ・招待 → 関数 → 失敗時に今回の auth だけ消す・
 *       リセットは先に記録 → Admin API の listFactors → deleteFactor（auth の表を SQL で消さない・ban しない）・パスワードは今のパスワードを使い捨ての client で確かめ・
 *       先に記録 → updateUserById（client は auth.updateUser を呼ばない）・requireOperator（旗の後ろだけ mfa_reset_at と stale）・画面（管理者だけ）・帯のリンク・
 *       demo-guard の運営の route・課金ゲートの正本 B(am)・mig の形（あれば）。Admin API は呼ばない。
 *   (3) DB（本番・1 トランザクション・ROLLBACK＝恒久変更 0）＝0209 が本番にあるときだけ scripts/fixtures-ops-admin.ts（試走 try-0209 と同じもの）。無ければ飛ばす（試走で見た）。
 */
import fs from "node:fs";
import pg from "pg";
import { MIG_0209_APPLIED, mig0209On, __set0209ForTest } from "../lib/nox/rules-0175/flag";
import { opsApiStatusOf, opsGateOf } from "../lib/nox/ops/labels";
import {
  activeAdminsOf, isOpsAdminRole, LAST_ADMIN_NOTE, newOperatorFormErrOf, OPS_ROLE_LABEL, operatorActionsOf, operatorLogLineOf, operatorStateOf, opsOperatorErrJa,
  opsPasswordChangeErrOf, opsReasonErrOf, opsRoleLabelOf, opsSessionStaleOf, passwordViaOf, type OpsOperatorRow,
} from "../lib/nox/ops/operators";
import { opsAdminDbChecks } from "./fixtures-ops-admin";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else { fails.push(label); console.error(`NG ${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");
// 注記を外した源（行の // とブロックの注記）＝注記の中の語で順番を見誤らない
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");

// ── (1) 純関数 ──
check("(1-1) 役の値は今のまま（ops_admin／ops_support）・画面は 管理者／担当・管理者だけが運営者の管理", OPS_ROLE_LABEL.ops_admin === "管理者" && OPS_ROLE_LABEL.ops_support === "担当" && opsRoleLabelOf("x") === "担当" && isOpsAdminRole("ops_admin") && !isOpsAdminRole("ops_support") && !isOpsAdminRole(null));
const R0: OpsOperatorRow = { auth_user_id: "u1", email: "a@example.invalid", name: "A", role: "ops_admin", is_active: true, created_at: "2026-11-21T06:56:00Z", created_by: null, stopped_at: null, stopped_by: null, mfa_reset_at: null, invited_at: null, email_confirmed_at: "2026-11-21T06:56:00Z", last_sign_in_at: "2026-11-25T01:00:00Z", mfa_verified: 1, is_self: false };
check("(1-2) 状態の札＝停止 → 招待中 → 認証アプリ未登録 → 有効", operatorStateOf({ ...R0, is_active: false }) === "stopped" && operatorStateOf({ ...R0, email_confirmed_at: null, last_sign_in_at: null }) === "invited" && operatorStateOf({ ...R0, mfa_verified: 0 }) === "no_mfa" && operatorStateOf(R0) === "active");
const acts = (r: OpsOperatorRow, n: number) => operatorActionsOf(r, { activeAdmins: n });
check("(1-3) 行のボタン＝自分の行は 0 個・最後の管理者は止める／担当にするが無く理由の 1 行・管理者 2 人なら出る・担当は管理者にする・招待中だけ出し直し・登録がある人だけリセット",
  acts({ ...R0, is_self: true }, 2).actions.length === 0 && acts(R0, 1).actions.join(",") === "mfa_reset" && acts(R0, 1).note === LAST_ADMIN_NOTE && acts(R0, 2).actions.join(",") === "stop,to_support,mfa_reset"
  && acts({ ...R0, role: "ops_support" }, 1).actions.join(",") === "stop,to_admin,mfa_reset" && acts({ ...R0, role: "ops_support", email_confirmed_at: null, last_sign_in_at: null, mfa_verified: 0 }, 1).actions.join(",") === "reinvite,stop,to_admin"
  && acts({ ...R0, is_active: false }, 1).actions.join(",") === "resume,to_support,mfa_reset" && activeAdminsOf([R0, { ...R0, is_active: false }, { ...R0, role: "ops_support" }]) === 1, [acts(R0, 1), acts(R0, 2)]);
const F = { email: "b@example.invalid", name: "B", role: "ops_support" };
check("(1-4) 足す欄＝通る・メールの形・名前 1〜40 字・役は必ず（既定なし）", newOperatorFormErrOf(F) === null && newOperatorFormErrOf({ ...F, email: "x" }) !== null && newOperatorFormErrOf({ ...F, name: " " }) !== null && newOperatorFormErrOf({ ...F, name: "あ".repeat(41) }) !== null && newOperatorFormErrOf({ ...F, role: "" }) === "役を選んでください" && newOperatorFormErrOf({ ...F, role: "admin" }) !== null);
check("(1-5) 理由＝リセットは必ず・止めるは任意・どちらも 200 字まで", opsReasonErrOf("", true) === "理由を入れてください" && opsReasonErrOf("  ", false) === null && opsReasonErrOf("あ".repeat(200), true) === null && opsReasonErrOf("あ".repeat(201), false) !== null);
check("(1-6) パスワードの欄＝今のパスワードは必ず・8〜72 字・2 回一致・今と同じは不可", opsPasswordChangeErrOf({ current: "", password: "abcdefgh", password2: "abcdefgh" }) !== null && opsPasswordChangeErrOf({ current: "old12345", password: "abc", password2: "abc" }) !== null
  && opsPasswordChangeErrOf({ current: "old12345", password: "x".repeat(73), password2: "x".repeat(73) }) !== null && opsPasswordChangeErrOf({ current: "old12345", password: "abcdefgh", password2: "abcdefgX" }) !== null
  && opsPasswordChangeErrOf({ current: "abcdefgh", password: "abcdefgh", password2: "abcdefgh" }) === "今のパスワードと同じです" && opsPasswordChangeErrOf({ current: "old12345", password: "abcdefgh", password2: "abcdefgh" }) === null);
check("(1-7) 例外の日本語＝'op …' は運営者の文（会社の 'not found'・'accepted' と混ざらない）・ほかは会社の文に任せる", opsOperatorErrJa("op not found") === "運営者が見つかりません" && opsOperatorErrJa("not found") === "会社が見つかりません" && opsOperatorErrJa("op accepted").startsWith("受諾済みです")
  && opsOperatorErrJa("P0001: op last admin") === LAST_ADMIN_NOTE && opsOperatorErrJa("forbidden (role)") === "管理者だけが使えます" && opsOperatorErrJa("forbidden") === "権限がありません" && opsOperatorErrJa("op self") === "自分には使えません");
check("(1-8) 運営者の記録の文", operatorLogLineOf({ action: "ops.operator.add", before: null, after: { name: "B", role: "ops_support", email: "b@example.invalid" } }, "B") === "運営者を足した：B（担当・b@example.invalid）"
  && operatorLogLineOf({ action: "ops.operator.role", before: { role: "ops_support" }, after: { role: "ops_admin" } }, "B") === "役を変えた（B：担当 → 管理者）" && operatorLogLineOf({ action: "ops.operator.password", before: null, after: { via: "recovery" } }, "B") === "パスワードを再設定した（B）"
  && operatorLogLineOf({ action: "ops.operator.mfa_reset", before: { factors: 1 }, after: {} }, "B") === "認証アプリをリセットした（B）");
// ★リセットの後に今のセッションで使えない（純関数の全部の形）
const T = Date.parse("2026-11-25T03:00:00Z") / 1000, RESET = "2026-11-25T03:00:00.500Z";
const oldS = { amr: [{ method: "password", timestamp: T - 3600 }, { method: "totp", timestamp: T - 3590 }], factors: [{ factor_type: "totp", status: "verified", created_at: "2026-10-01T00:00:00Z" }] };
const gate = (aal: string, amr: { method: string; timestamp: number }[] | string[], factors: { factor_type: string; status: string; created_at: string }[], mfaResetAt: string | null) => opsGateOf({ hasUser: true, isOperator: true, aal, stale: opsSessionStaleOf({ aal, amr, factors, mfaResetAt }) });
check("(1-9) リセットの前＝今のセッションは ok（記録なし・アプリあり）・aal1 は mfa", gate("aal2", oldS.amr, oldS.factors, null) === "ok" && gate("aal1", oldS.amr.slice(0, 1), oldS.factors, null) === "mfa");
check("(1-10) ★リセットの記録の後＝古いセッションは relogin（アプリを消す前も後も）・API は 401", gate("aal2", oldS.amr, oldS.factors, RESET) === "relogin" && gate("aal2", oldS.amr, [], RESET) === "relogin" && gate("aal1", oldS.amr.slice(0, 1), [], RESET) === "relogin" && opsApiStatusOf("relogin") === 401);
check("(1-11) ★記録が無くても、aal2 なのに確認済みのアプリが無い（Admin API や手順書の SQL で消した）＝relogin・未確認のアプリだけ＝relogin", gate("aal2", oldS.amr, [], null) === "relogin" && gate("aal2", oldS.amr, [{ ...oldS.factors[0], status: "unverified" }], null) === "relogin");
const newFactor = [{ factor_type: "totp", status: "verified", created_at: "2026-11-25T03:05:00Z" }];
check("(1-12) ★ログインし直す＝mfa（登録し直し）・登録して 6 桁＝ok・古いセッションは新しいアプリでも relogin（6 桁の後にできたアプリ）",
  gate("aal1", [{ method: "password", timestamp: T + 60 }], [], RESET) === "mfa" && gate("aal2", [{ method: "password", timestamp: T + 60 }, { method: "totp", timestamp: T + 310 }], newFactor, RESET) === "ok"
  && gate("aal2", oldS.amr, newFactor, null) === "relogin" && gate("aal2", [{ method: "password", timestamp: T + 60 }, { method: "totp", timestamp: T + 310 }], newFactor, null) === "ok");
check("(1-13) AMR が時刻の無い形（文字列）・totp が無い aal2＝relogin（分からないときは通さない）・リセットと同じ秒のログイン＝relogin", gate("aal2", ["password", "totp"], oldS.factors, null) === "relogin" && gate("aal2", [{ method: "password", timestamp: T - 10 }], oldS.factors, null) === "relogin"
  && gate("aal1", [{ method: "password", timestamp: T }], [], RESET) === "relogin");
check("(1-14) パスワードの道＝招待のリンク invite・再設定のリンク recovery・ほか other（totp は見ない）", passwordViaOf([{ method: "invite", timestamp: 1 }]) === "invite" && passwordViaOf([{ method: "recovery", timestamp: 1 }, { method: "totp", timestamp: 2 }]) === "recovery" && passwordViaOf([{ method: "password", timestamp: 1 }]) === "other" && passwordViaOf([]) === "other");
check("(1-15) 入口の判定は stale を渡さなければ今と同じ（旗 false の requireOperator）", opsGateOf({ hasUser: true, isOperator: true, aal: "aal2" }) === "ok" && opsGateOf({ hasUser: true, isOperator: true, aal: "aal1" }) === "mfa" && opsGateOf({ hasUser: true, isOperator: false, aal: "aal2", stale: true }) === "notfound");

// ── (2) 配線 ──
check("(2-1) 旗 MIG_0209_APPLIED は true（★0209 を 2026-11-25 に CC が適用した後）・差し替え口がある", (MIG_0209_APPLIED as boolean) === true && mig0209On() === true && (() => { __set0209ForTest(false); const off = mig0209On(); __set0209ForTest(null); return !off && mig0209On(); })());
const R = {
  add: "app/api/ops/operators/route.ts", invite: "app/api/ops/operators/[id]/invite/route.ts", active: "app/api/ops/operators/[id]/active/route.ts",
  role: "app/api/ops/operators/[id]/role/route.ts", reset: "app/api/ops/operators/[id]/mfa-reset/route.ts", pw: "app/api/ops/me/password/route.ts",
};
const S = Object.fromEntries(Object.entries(R).map(([k, p]) => [k, code(p)])) as Record<keyof typeof R, string>;
const firstGuard = (s: string) => /const g = await requireOperatorApi\(\);\s*\n\s*if \(g\.res\) return g\.res;/.test(s);
const adminGuard = (s: string) => /if \(g\.res\) return g\.res;\s*\n\s*const ng = opsAdminApiRes\(g\.op\);\s*\n\s*if \(ng\) return ng;/.test(s);
check("(2-2) 6 本とも requireOperatorApi が最初・管理者の 5 本はその直後に opsAdminApiRes（旗 false は 404・担当は 403）・自分のパスワードは役を見ず旗を見る",
  Object.values(S).every(firstGuard) && ["add", "invite", "active", "role", "reset"].every((k) => adminGuard(S[k as keyof typeof R])) && !S.pw.includes("opsAdminApiRes") && S.pw.includes('if (!mig0209On()) return NextResponse.json({ error: "not found" }, { status: 404 });'));
const ro = src("lib/nox/ops/require-operator.ts");
check("(2-3) opsAdminApiRes＝旗 false 404・管理者でなければ 403 'forbidden (role)'・画面は requireOperatorAdminPage（旗 false と担当は 404）",
  ro.includes('if (!mig0209On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && ro.includes('if (!isOpsAdminRole(op.role)) return NextResponse.json({ error: "forbidden (role)" }, { status: 403 });')
  && ro.includes("export async function requireOperatorAdminPage(): Promise<Operator> {\n  if (!mig0209On()) notFound();\n  const op = await requireOperatorPage();\n  if (!isOpsAdminRole(op.role)) notFound();"));
check("(2-4) requireOperator＝旗の後ろだけ mfa_reset_at を読み stale を渡す・user.factors（毎回 Auth のサーバ）と AMR・relogin は画面 /ops/login?again=1（MFA の画面も通さない）",
  ro.includes('const cols = mig0209On() ? "auth_user_id, email, name, role, is_active, mfa_reset_at" : "auth_user_id, email, name, role, is_active";')
  && ro.includes("const stale = mig0209On() && !!op") && ro.includes("factors: user.factors ?? [], mfaResetAt: op.mfaResetAt ?? null") && ro.includes("aal?.currentAuthenticationMethods")
  && ro.indexOf('if (gate === "relogin") redirect("/ops/login?again=1");') > 0 && ro.indexOf('if (gate === "relogin") redirect("/ops/login?again=1");') < ro.indexOf('if (gate === "mfa" && !opts.allowMfa)'));
check("(2-5) 足す＝店のユーザーと運営者のメールを先に見る → 招待（件名は今のテンプレのまま）→ ops_operator_add → 失敗は今回できた auth だけ消す",
  S.add.indexOf('from("users")') < S.add.indexOf("inviteUserByEmail") && S.add.indexOf('from("ops_operators")') < S.add.indexOf("inviteUserByEmail") && S.add.indexOf("inviteUserByEmail") < S.add.indexOf('rpc("ops_operator_add"')
  && S.add.includes("if (fresh) await admin.auth.admin.deleteUser(authUser.id)") && S.add.includes('p_role: f.role') && !/from\("ops_operators"\)\.(insert|update|upsert|delete)/.test(Object.values(S).join("\n")));
check("(2-6) ★リセット＝自分は不可・理由は必ず・先に記録（ops_operator_mfa_reset_logged）→ Admin API の listFactors → deleteFactor（全部）・auth の表を SQL で消さない・ban も signOut もしない",
  S.reset.includes('if (id === g.op.authUserId) return NextResponse.json({ error: opsOperatorErrJa("op self") }, { status: 409 });') && S.reset.includes("opsReasonErrOf(reason, true)")
  && S.reset.indexOf('rpc("ops_operator_mfa_reset_logged"') > 0 && S.reset.indexOf('rpc("ops_operator_mfa_reset_logged"') < S.reset.indexOf("admin.auth.admin.mfa.listFactors({ userId: id })")
  && S.reset.indexOf("admin.auth.admin.mfa.listFactors({ userId: id })") < S.reset.indexOf("admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id })")
  && !/auth\.mfa_factors|ban_duration|signOut|\.from\("mfa_factors"\)/.test(S.reset));
check("(2-7) 止める＝active は boolean を必ず（原則 7）・理由は任意・ban しない", S.active.includes('if (typeof body.active !== "boolean")') && S.active.includes("opsReasonErrOf(reason, false)") && !/ban_duration|updateUserById/.test(S.active));
check("(2-8) 出し直し＝先に記録（ops_operator_reinvite_logged）→ inviteUserByEmail・役＝isOpsRole で値を確かめる", S.invite.indexOf('rpc("ops_operator_reinvite_logged"') < S.invite.indexOf("inviteUserByEmail") && S.role.includes("if (!isOpsRole(body.role))"));
check("(2-9) ★パスワード＝今のパスワードを使い捨ての client（保存しない）で確かめ → その確かめのセッションだけ signOut（local）→ 先に記録 → updateUserById・パスワードを出さない",
  S.pw.includes("persistSession: false, autoRefreshToken: false") && S.pw.indexOf("probe.auth.signInWithPassword({ email: g.op.email, password: f.current })") < S.pw.indexOf('probe.auth.signOut({ scope: "local" })')
  && S.pw.indexOf('probe.auth.signOut({ scope: "local" })') < S.pw.indexOf('rpc("ops_operator_password_logged", { p_ops: g.op.authUserId, p_via: "self" })')
  && S.pw.indexOf('rpc("ops_operator_password_logged"') < S.pw.indexOf("admin.auth.admin.updateUserById(g.op.authUserId, { password: f.password })") && !/console\.|password: f\.password[^}]*\}\)\s*;[\s\S]*json\([^)]*password/.test(S.pw));
const me = code("app/ops/me/me-form.tsx"), board = code("app/ops/operators/operators-board.tsx");
check("(2-10) client は auth.updateUser・auth.mfa.unenroll（他人の登録）を呼ばない・画面は /api/ops/* だけ", !/auth\.updateUser|createClient\(/.test(me) && !/auth\.|createClient\(/.test(board) && me.includes('fetch("/api/ops/me/password"') && board.includes('fetch(url, { method: "POST"'));
const ia = code("app/api/auth/invite-accept/route.ts");
check("(2-11) /auth/forgot と招待の道も運営の記録に＝invite-accept は変えた後・運営者・旗の後ろだけ ops_operator_password_logged（道は AMR）・行き先の決まりは今のまま",
  ia.indexOf("updateUserById(user.id, { password })") < ia.indexOf("if (op && mig0209On()) {") && ia.includes('rpc("ops_operator_password_logged", { p_ops: user.id, p_via: passwordViaOf(') && ia.includes('return NextResponse.json({ ok: true, dest: op ? "/ops/login" : "/dashboard" });'));
const page = src("app/ops/operators/page.tsx"), mePage = src("app/ops/me/page.tsx"), shell = src("app/ops/ops-shell.tsx");
check("(2-12) 画面＝/ops/operators は requireOperatorAdminPage・/ops/me は旗の後ろの requireOperatorPage・帯の「運営者」は管理者だけ・「自分の設定」は旗の後ろ",
  page.includes("const op = await requireOperatorAdminPage();") && page.includes('admin.rpc("ops_operator_list", { p_ops: op.authUserId })') && mePage.includes("if (!mig0209On()) notFound();") && mePage.includes("await requireOperatorPage();")
  && shell.includes('{mig0209On() && role !== undefined && isOpsAdminRole(role) && <Link href="/ops/operators"') && shell.includes('{mig0209On() && role !== undefined && <Link href="/ops/me"')
  && ["app/ops/page.tsx", "app/ops/orgs/new/page.tsx", "app/ops/orgs/[id]/page.tsx", "app/ops/orgs/[id]/assist/page.tsx"].every((p) => src(p).includes("<OpsShell name={op.name} role={op.role}")));
check("(2-13) MFA の画面の下の文＝旗の後ろは「管理者に認証アプリのリセットを頼んでください」・ログインの画面は relogin から来たら 1 行", src("app/ops/mfa/mfa-form.tsx").includes('mig0209On() ? "アプリを失くしたときは、管理者に認証アプリのリセットを頼んでください"') && src("app/ops/login/page.tsx").includes('again={mig0209On() && sp.again === "1"}'));
const dg = src("scripts/verify-nox-demo-guard.ts");
check("(2-14) demo-guard の運営の route に 6 本", ["ops/operators", "ops/operators/[id]/invite", "ops/operators/[id]/active", "ops/operators/[id]/role", "ops/operators/[id]/mfa-reset", "ops/me/password"].every((r) => dg.includes(`"${r}"`)));
const bill = src("docs/NOX_課金ゲート対象_v1.md");
const bam = bill.slice(bill.indexOf("### B(am)."), bill.indexOf("## C. kiosk"));
check("(2-15) 課金ゲートの正本 B(am) に 9 本（service 専用 7・内部 2）・A には無い", ["ops_operator_list", "ops_operator_add", "ops_operator_reinvite_logged", "ops_operator_set_active", "ops_operator_set_role", "ops_operator_mfa_reset_logged", "ops_operator_password_logged", "ops_admin_ok", "ops_admin_floor_guard"].every((n) => bam.includes(n))
  && !/ops_operator_|ops_admin_ok/.test(bill.slice(bill.indexOf("## A. 対象"), bill.indexOf("## B. 除外"))));
const migPath = ["supabase/migrations/0209_ops_operator_admin.sql", "docs/tmp/ops_admin_1125/0209_ops_operator_admin.sql"].find((p) => fs.existsSync(p));
if (migPath) {
  const mig = src(migPath);
  check(`(2-16) mig の形（${migPath}）＝begin／commit 1 つずつ・lock_timeout・表を作らない・関数 9・内部 2 本は 4 ロール revoke で grant なし・auth の表を消さない`,
    (mig.match(/^begin;$/gm) ?? []).length === 1 && (mig.match(/^commit;$/gm) ?? []).length === 1 && mig.includes("set local lock_timeout = '10s';") && !/create table/i.test(mig) && (mig.match(/^CREATE OR REPLACE FUNCTION public\./gm) ?? []).length === 9
    && ["ops_admin_ok(uuid)", "ops_admin_floor_guard()"].every((f) => mig.includes(`revoke all on function public.${f} from public, anon, authenticated, service_role;`) && !mig.includes(`grant execute on function public.${f}`)) && !/delete\s+from\s+auth\./i.test(mig) && mig.includes("revoke insert, update on table public.ops_operators from service_role;"));
} else console.log("  (2-16) mig の形は飛ばす（0209 の本体は supabase/migrations にまだ無い＝適用の後に収蔵・起草は main の docs/tmp/ops_admin_1125）");

// ── (3) DB ──
async function main() {
  if (process.env.NOX_SKIP_DB === "1") { console.log("  (3) DB の段は飛ばす（NOX_SKIP_DB=1）"); return; }
  const env = Object.fromEntries(src(".env.local").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-ops-admin", statement_timeout: 60000 });
  await db.connect();
  try {
    const has = (await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname in ('ops_admin_ok','ops_admin_floor_guard','ops_operator_list','ops_operator_add','ops_operator_reinvite_logged','ops_operator_set_active','ops_operator_set_role','ops_operator_mfa_reset_logged','ops_operator_password_logged')")).rows[0].n as number;
    if (has !== 9) { console.log(`  (3) DB の段は飛ばす（0209 の関数が本番に ${has}／9＝未適用・試走 docs/tmp/ops_admin_1125/try-0209.mts で同じものを見た）`); return; }
    const cnt = async () => (await db.query("select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t")).rows[0] as { f: number; t: number };
    const before = await cnt();
    await db.query("begin");
    try { await opsAdminDbChecks(db, check); } finally { await db.query("rollback").catch(() => undefined); }
    const after = await cnt();
    const left = (await db.query("select count(*)::int u from auth.users where email like 'nox-verify-opsadm-%'")).rows[0].u as number;
    check("(3-z) 恒久変更 0（関数と表の数・取引の auth ユーザーが残っていない）", after.f === before.f && after.t === before.t && left === 0, { before, after, left });
  } finally { await db.end(); }
}
main().then(() => {
  if (fails.length) { console.error(`✗ verify:nox-ops-admin 失敗 ${fails.length}（成功 ${pass}）`); process.exit(1); }
  console.log("運営者の管理（0209）: 役の名前・状態・行のボタン・欄・理由・パスワード・例外の文・記録の文・リセットの後の古いセッションは relogin・配線（6 本の route・旗・招待・先に記録・Admin API の deleteFactor・使い捨ての確かめ・画面・帯・demo-guard・課金ゲートの正本）・DB（本番にあれば）");
  console.log(`verify:nox-ops-admin OK (${pass} checks)`);
}).catch((e) => { console.error("✗ verify:nox-ops-admin", (e as Error).message); process.exit(1); });
