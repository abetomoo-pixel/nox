// ★【D8】起票155 の 2（2026-11-25）: 0209（運営者の管理）の DB の確かめ＝verify:nox-ops-admin の DB の段と試走（docs/tmp/ops_admin_1125/try-0209.mts）で同じものを使う。
//   呼ぶ側が begin と rollback を持つ（この中では commit しない）。取引の中だけの auth のユーザーと運営者を作る（rollback で消える）。
//   Admin API（deleteFactor・inviteUserByEmail・updateUserById）は呼ばない＝route の配線は suite の (2) が源で見る。
//   リセットの後に今のセッションで /ops を使えないことは、関数が入れた mfa_reset_at を opsSessionStaleOf と opsGateOf に渡して示す（(k)）。
import type { Client } from "pg";
import { pgTx } from "./fixtures-pgtx";
import { opsGateOf } from "../lib/nox/ops/labels";
import { opsSessionStaleOf } from "../lib/nox/ops/operators";

type Check = (label: string, ok: boolean, detail?: unknown) => void;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const OPS_ADMIN_SERVICE_FNS = [
  ["ops_operator_list", "select * from public.ops_operator_list($1)", 1],
  ["ops_operator_add", "select public.ops_operator_add($1, $1, 'x@example.invalid', 'x', 'ops_support')", 1],
  ["ops_operator_reinvite_logged", "select public.ops_operator_reinvite_logged($1, $1)", 1],
  ["ops_operator_set_active", "select public.ops_operator_set_active($1, $1, false, null)", 1],
  ["ops_operator_set_role", "select public.ops_operator_set_role($1, $1, 'ops_support')", 1],
  ["ops_operator_mfa_reset_logged", "select public.ops_operator_mfa_reset_logged($1, $1, 'x')", 1],
  ["ops_operator_password_logged", "select public.ops_operator_password_logged($1, 'self')", 1],
] as const;

export async function opsAdminDbChecks(db: Client, check: Check): Promise<void> {
  const tx = pgTx(db);
  const q = tx.q, one = tx.one;
  const asSvc = async (sql: string, params: unknown[] = []) => {
    await tx.asPg();
    await q("select set_config('request.jwt.claims', '', true)");
    await q("set local role service_role");
    const r = await tx.call(sql, params);
    await tx.asPg();
    return r;
  };
  const stamp = Date.now();
  const mk = async (tag: string): Promise<{ id: string; email: string }> =>
    one<{ id: string; email: string }>("insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(), now()) returning id, email", [`nox-verify-opsadm-${tag}-${stamp}@example.invalid`]);
  const A = await mk("a"), B = await mk("b"), S = await mk("s"), N = await mk("n"), X = await mk("x");
  await q("update auth.users set email_confirmed_at = now(), last_sign_in_at = now() where id = any($1::uuid[])", [[A.id, B.id, S.id]]);
  await q("insert into public.ops_operators (auth_user_id, email, name, role) values ($1, $2, '試走の管理者 A', 'ops_admin'), ($3, $4, '試走の管理者 B', 'ops_admin'), ($5, $6, '試走の担当 S', 'ops_support')", [A.id, A.email, B.id, B.email, S.id, S.email]);
  const owner = await one<{ a: string; e: string }>("select auth_user_id a, email e from public.users where email = 'nox-verify-owner-a@example.com'");
  const audit = async (action: string, target: string) => (await one<{ n: number }>("select count(*)::int n from public.ops_audit_logs where action = $1 and target = $2", [action, `ops_operators:${target}`])).n;

  // (a) anon・authenticated（店のオーナー）は 7 本とも BLOCKED・内部 2 本は service でも BLOCKED
  const blocked: string[] = [];
  for (const [name, sql] of OPS_ADMIN_SERVICE_FNS) {
    const an = await tx.as("anon", sql, [A.id]);
    const au = await tx.as({ auth_user_id: owner.a }, sql, [A.id]);
    if (an.ok || !/permission denied for function/.test(an.err) || au.ok || !/permission denied for function/.test(au.err)) blocked.push(`${name}: ${tx.errOf(an)} / ${tx.errOf(au)}`);
  }
  check("(a-1) service 専用 7 本は anon と authenticated（店のオーナー）で permission denied for function", blocked.length === 0, blocked);
  const internal: string[] = [];
  for (const sql of ["select public.ops_admin_ok($1)", "select public.ops_admin_floor_guard()"]) {
    const params = sql.includes("$1") ? [A.id] : [];
    for (const r of [await tx.as("anon", sql, params), await tx.as({ auth_user_id: owner.a }, sql, params), await asSvc(sql, params)]) if (r.ok || !/permission denied for function/.test(r.err)) internal.push(`${sql}: ${tx.errOf(r)}`);
  }
  check("(a-2) 内部専用 2 本（ops_admin_ok・ops_admin_floor_guard）は anon・authenticated・service_role の全部で permission denied for function", internal.length === 0, internal);

  // (b) service でも ops_operators は読むだけ（insert・update・delete・truncate は permission denied）
  const sel = await asSvc("select count(*)::int n from public.ops_operators");
  const ins = await asSvc("insert into public.ops_operators (auth_user_id, email) values ($1, $2)", [N.id, N.email]);
  const upd = await asSvc("update public.ops_operators set is_active = false where auth_user_id = $1", [S.id]);
  const del = await asSvc("delete from public.ops_operators where auth_user_id = $1", [S.id]);
  const trn = await asSvc("truncate public.ops_operators");
  check("(b-1) service_role＝ops_operators の select は通る・insert／update／delete／truncate は permission denied（書くのは関数だけ）", sel.ok && [ins, upd, del, trn].every((r) => !r.ok && /permission denied/.test(r.err)), [sel.ok ? sel.rows : tx.errOf(sel), ...[ins, upd, del, trn].map(tx.errOf)]);

  // (c) 管理者でない（担当・運営者でない・null）は管理者の 6 本が forbidden
  const adminSix = OPS_ADMIN_SERVICE_FNS.filter(([n]) => n !== "ops_operator_password_logged");
  const notAdmin: string[] = [];
  for (const who of [S.id, N.id, null]) for (const [name, sql] of adminSix) { const r = await asSvc(sql.replace(/\$1, \$1/, "$1, '" + B.id + "'"), [who]); if (r.ok || !/forbidden/.test(r.err)) notAdmin.push(`${name}(${who === S.id ? "担当" : who === N.id ? "運営者でない" : "null"}): ${tx.errOf(r)}`); }
  check("(c-1) 担当・運営者でない id・null は管理者の 6 本が forbidden", notAdmin.length === 0, notAdmin);

  // (d) パスワードの記録（担当も本人の分は通る）
  const pw0 = await audit("ops.operator.password", S.id);
  const pw1 = await asSvc("select public.ops_operator_password_logged($1, 'self')", [S.id]);
  const pw2 = await asSvc("select public.ops_operator_password_logged($1, 'recovery')", [S.id]);
  const pwRow = await one<{ v: string; o: string | null }>("select after_json->>'via' v, org_id::text o from public.ops_audit_logs where action = 'ops.operator.password' and target = $1 order by at desc, id limit 1", [`ops_operators:${S.id}`]);
  const pwBad = await asSvc("select public.ops_operator_password_logged($1, 'sms')", [S.id]);
  const pwN = await asSvc("select public.ops_operator_password_logged($1, 'self')", [N.id]);
  check("(d-1) 担当でも自分のパスワードの記録は通る（self・recovery）・会社に付かない・知らない道は op bad via・運営者でない id は forbidden", pw1.ok && pw2.ok && (await audit("ops.operator.password", S.id)) === pw0 + 2 && pwRow.o === null && ["self", "recovery"].includes(pwRow.v)
    && !pwBad.ok && /op bad via/.test(pwBad.err) && !pwN.ok && /forbidden/.test(pwN.err), [tx.errOf(pw1), tx.errOf(pw2), pwRow, tx.errOf(pwBad), tx.errOf(pwN)]);

  // (e) 足す
  const storeAud0 = (await one<{ n: number }>("select count(*)::int n from public.audit_logs where action like 'ops.operator.%'")).n;
  const e1 = await asSvc("select public.ops_operator_add($1, $2, $3, '試走の X', null)", [A.id, X.id, X.email]);
  const e2 = await asSvc("select public.ops_operator_add($1, $2, $3, '', 'ops_support')", [A.id, X.id, X.email]);
  const e3 = await asSvc("select public.ops_operator_add($1, $2, $3, $4, 'ops_support')", [A.id, X.id, X.email, "あ".repeat(41)]);
  const e4 = await asSvc("select public.ops_operator_add($1, $2, 'other@example.invalid', '試走の X', 'ops_support')", [A.id, X.id]);
  const e5 = await asSvc("select public.ops_operator_add($1, null, $2, '試走の X', 'ops_support')", [A.id, X.email]);
  check("(e-1) 足す＝役なし op bad role・名前 0 字と 41 字 op bad name・メールと auth の不一致と auth なし op bad auth", !e1.ok && /op bad role/.test(e1.err) && !e2.ok && /op bad name/.test(e2.err) && !e3.ok && /op bad name/.test(e3.err) && !e4.ok && /op bad auth/.test(e4.err) && !e5.ok && /op bad auth/.test(e5.err), [e1, e2, e3, e4, e5].map(tx.errOf));
  const e6 = await asSvc("select public.ops_operator_add($1, $2, $3, ' 試走の X ', 'ops_support') j", [A.id, X.id, X.email.toUpperCase()]);
  const xRow = await one<Row>("select role, is_active, created_by, name, email, stopped_at, mfa_reset_at from public.ops_operators where auth_user_id = $1", [X.id]);
  const xAud = await one<Row>("select count(*)::int n, max(org_id::text) o, max(after_json->>'role') r from public.ops_audit_logs where action = 'ops.operator.add' and target = $1", [`ops_operators:${X.id}`]);
  const storeAud1 = (await one<{ n: number }>("select count(*)::int n from public.audit_logs where action like 'ops.operator.%'")).n;
  check("(e-2) 足す＝担当で 1 行（created_by＝足した管理者・名前は前後の空白を外す・メールは小文字）・運営の監査 1（会社なし）・店の監査 0", e6.ok && xRow?.role === "ops_support" && xRow.is_active === true && xRow.created_by === A.id && xRow.name === "試走の X" && xRow.email === X.email.toLowerCase()
    && xAud.n === 1 && xAud.o === null && xAud.r === "ops_support" && storeAud1 === storeAud0, [tx.errOf(e6), xRow, xAud, { storeAud0, storeAud1 }]);
  const e7 = await asSvc("select public.ops_operator_add($1, $2, $3, '試走の X', 'ops_support')", [A.id, X.id, X.email]);
  const e8 = await asSvc("select public.ops_operator_add($1, $2, $3, '店の人', 'ops_support')", [A.id, owner.a, owner.e]);
  check("(e-3) 同じ人 2 回＝op dup・店のユーザー＝op store user", !e7.ok && /op dup/.test(e7.err) && !e8.ok && /op store user/.test(e8.err), [tx.errOf(e7), tx.errOf(e8)]);

  // (f) 一覧
  const l1 = await asSvc("select * from public.ops_operator_list($1)", [A.id]);
  const cols = l1.ok && l1.rows[0] ? Object.keys(l1.rows[0]).join(",") : "";
  const me = l1.ok ? l1.rows.find((r) => r.auth_user_id === A.id) : null;
  const others = l1.ok ? l1.rows.filter((r) => r.is_self).length : -1;
  check("(f-1) 一覧＝管理者だけ・列の名簿（パスワードや認証アプリのキーの列が無い）・自分の行だけ is_self", l1.ok && cols === "auth_user_id,email,name,role,is_active,created_at,created_by,stopped_at,stopped_by,mfa_reset_at,invited_at,email_confirmed_at,last_sign_in_at,mfa_verified,is_self" && me?.is_self === true && others === 1, tx.errOf(l1) + " " + cols);

  // (g) 止める・戻す
  const g1 = await asSvc("select public.ops_operator_set_active($1, $1, false, null)", [A.id]);
  const g2 = await asSvc("select public.ops_operator_set_active($1, $2, null, null)", [A.id, S.id]);
  const g3 = await asSvc("select public.ops_operator_set_active($1, $2, false, $3)", [A.id, S.id, "あ".repeat(201)]);
  check("(g-1) 自分を止める＝op self・止めるか戻すかが null＝op bad active・理由 201 字＝op bad reason", !g1.ok && /op self/.test(g1.err) && !g2.ok && /op bad active/.test(g2.err) && !g3.ok && /op bad reason/.test(g3.err), [g1, g2, g3].map(tx.errOf));
  const g4 = await asSvc("select public.ops_operator_set_active($1, $2, false, '試走で止める')", [A.id, S.id]);
  const sRow = await one<Row>("select is_active, stopped_at is not null sa, stopped_by from public.ops_operators where auth_user_id = $1", [S.id]);
  const sAud = await one<Row>("select count(*)::int n, max(reason) r from public.ops_audit_logs where action = 'ops.operator.stop' and target = $1", [`ops_operators:${S.id}`]);
  const sList = await asSvc("select * from public.ops_org_list($1)", [S.id]);
  const sPw = await asSvc("select public.ops_operator_password_logged($1, 'self')", [S.id]);
  check("(g-2) 担当を止める＝stopped_at と stopped_by・監査に理由・止めた人は ops_org_list もパスワードの記録も forbidden", g4.ok && sRow.is_active === false && sRow.sa === true && sRow.stopped_by === A.id && sAud.n === 1 && sAud.r === "試走で止める"
    && !sList.ok && /forbidden/.test(sList.err) && !sPw.ok && /forbidden/.test(sPw.err), [tx.errOf(g4), sRow, sAud, tx.errOf(sList), tx.errOf(sPw)]);
  const g5 = await asSvc("select public.ops_operator_set_active($1, $2, false, null)", [A.id, S.id]);
  check("(g-3) 同じ値＝何もしない（監査も書かない）", g5.ok && (await audit("ops.operator.stop", S.id)) === 1, tx.errOf(g5));
  const g6 = await asSvc("select public.ops_operator_set_active($1, $2, true, null)", [A.id, S.id]);
  const sRow2 = await one<Row>("select is_active, stopped_at, stopped_by from public.ops_operators where auth_user_id = $1", [S.id]);
  check("(g-4) 戻す＝有効・stopped_at と stopped_by は null・監査 ops.operator.resume", g6.ok && sRow2.is_active === true && sRow2.stopped_at === null && sRow2.stopped_by === null && (await audit("ops.operator.resume", S.id)) === 1, [tx.errOf(g6), sRow2]);

  // (h) 役を変える
  const h1 = await asSvc("select public.ops_operator_set_role($1, $1, 'ops_support')", [A.id]);
  const h2 = await asSvc("select public.ops_operator_set_role($1, $2, 'admin')", [A.id, S.id]);
  const h3 = await asSvc("select public.ops_operator_set_role($1, $2, 'ops_admin')", [A.id, S.id]);
  const h3a = await asSvc("select * from public.ops_operator_list($1)", [S.id]);
  const h4 = await asSvc("select public.ops_operator_set_role($1, $2, 'ops_admin')", [A.id, S.id]);
  const hAud = await one<Row>("select count(*)::int n, max(before_json->>'role') b, max(after_json->>'role') a from public.ops_audit_logs where action = 'ops.operator.role' and target = $1", [`ops_operators:${S.id}`]);
  const h5 = await asSvc("select public.ops_operator_set_role($1, $2, 'ops_support')", [A.id, S.id]);
  check("(h-1) 自分の役＝op self・知らない役＝op bad role・担当→管理者は通る（一覧が使える）・同じ役は監査なし・前後の役が監査に・戻せる", !h1.ok && /op self/.test(h1.err) && !h2.ok && /op bad role/.test(h2.err) && h3.ok && h3a.ok && h4.ok && hAud.n === 1 && hAud.b === "ops_support" && hAud.a === "ops_admin" && h5.ok,
    [h1, h2, h3, h3a, h4, h5].map(tx.errOf).concat([JSON.stringify(hAud)]));

  // (i) 最後の管理者（DB の柵）＝取引の中で、ほかの管理者（本番の Agoora と B）を止め、A だけが有効な管理者の形にする（rollback で戻る）
  await q("update public.ops_operators set is_active = false where role = 'ops_admin' and auth_user_id <> $1", [A.id]);
  const i0 = await one<{ n: number }>("select count(*)::int n from public.ops_operators where role = 'ops_admin' and is_active");
  const i1 = await asSvc("select public.ops_operator_set_active($1, $1, false, null)", [A.id]);
  const i2 = await asSvc("select public.ops_operator_set_role($1, $1, 'ops_support')", [A.id]);
  const i3 = await tx.call("set constraints public.ops_operators_admin_floor immediate");   // 取引の始めからの遅延分もここで見る（A が有効な管理者＝通る）
  const i4 = await tx.call("update public.ops_operators set is_active = false where auth_user_id = $1", [A.id]);
  const i5 = await tx.call("update public.ops_operators set role = 'ops_support' where auth_user_id = $1", [A.id]);
  const i6 = await tx.call("delete from auth.users where id = $1", [A.id]);
  const i7 = await tx.call("update public.ops_operators set name = '試走の管理者 A（名前だけ）' where auth_user_id = $1", [A.id]);
  const i8 = await tx.call("update public.ops_operators set is_active = true where auth_user_id = $1", [B.id]);
  const i9 = await tx.call("update public.ops_operators set is_active = false where auth_user_id = $1", [A.id]);
  await q("set constraints public.ops_operators_admin_floor deferred");
  check("(i-1) 有効な管理者が A だけ＝A は自分を止められない・担当にできない（op self）", i0.n === 1 && !i1.ok && /op self/.test(i1.err) && !i2.ok && /op self/.test(i2.err), [i0, tx.errOf(i1), tx.errOf(i2)]);
  check("(i-2) DB の柵（制約トリガを immediate にして）＝最後の管理者を直の update で止める・担当にする・auth のユーザーを消す（cascade）は op last admin・名前だけの update は通る",
    i3.ok && !i4.ok && /op last admin/.test(i4.err) && !i5.ok && /op last admin/.test(i5.err) && !i6.ok && /op last admin/.test(i6.err) && i7.ok, [i3, i4, i5, i6, i7].map(tx.errOf));
  check("(i-3) 別の管理者（B）を戻せば、A を止めても柵は通る（有効な管理者が 1 人残る）", i8.ok && i9.ok, [tx.errOf(i8), tx.errOf(i9)]);
  await q("update public.ops_operators set is_active = true where auth_user_id = $1", [A.id]);

  // (j) 認証アプリのリセットの記録（auth.mfa_factors は数を読むだけ＝消さない）
  await q("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), $1, $2, 'totp', 'verified', now() - interval '30 days', now() - interval '30 days')", [S.id, `nox-verify-opsadm-${stamp}`]);
  const f0 = (await one<{ n: number }>("select count(*)::int n from auth.mfa_factors where user_id = $1", [S.id])).n;
  const j1 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $2, null)", [A.id, S.id]);
  const j2 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $2, $3)", [A.id, S.id, "あ".repeat(201)]);
  const j3 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $1, '自分')", [A.id]);
  const j4 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $2, '登録なし')", [A.id, B.id]);
  const j5 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $2, '本人がスマホを失くした')", [A.id, N.id]);
  check("(j-1) リセット＝理由なし op reason required・201 字 op bad reason・自分 op self・登録なし op no factor（監査なし）・運営者でない相手 op not found",
    !j1.ok && /op reason required/.test(j1.err) && !j2.ok && /op bad reason/.test(j2.err) && !j3.ok && /op self/.test(j3.err) && !j4.ok && /op no factor/.test(j4.err) && (await audit("ops.operator.mfa_reset", B.id)) === 0 && !j5.ok && /op not found/.test(j5.err), [j1, j2, j3, j4, j5].map(tx.errOf));
  const j6 = await asSvc("select public.ops_operator_mfa_reset_logged($1, $2, '本人がスマホを失くした') at", [A.id, S.id]);
  const resetAt = j6.ok ? new Date(j6.rows[0].at as string).toISOString() : "";
  const sReset = await one<Row>("select mfa_reset_at from public.ops_operators where auth_user_id = $1", [S.id]);
  const f1 = (await one<{ n: number }>("select count(*)::int n from auth.mfa_factors where user_id = $1", [S.id])).n;
  const jAud = await one<Row>("select count(*)::int n, max(reason) r, max((before_json->>'factors')) bf, bool_or(after_json::text ~* 'secret|factor_id|[0-9a-f]{8}-[0-9a-f]{4}-') leak from public.ops_audit_logs where action = 'ops.operator.mfa_reset' and target = $1", [`ops_operators:${S.id}`]);
  check("(j-2) リセットの記録＝mfa_reset_at が入る（戻りと同じ）・auth.mfa_factors は消さない（消すのは route の Admin API）・監査に理由と数だけ（キーや factor の id は無い）",
    j6.ok && sReset.mfa_reset_at && new Date(sReset.mfa_reset_at).toISOString() === resetAt && f0 === 1 && f1 === 1 && jAud.n === 1 && jAud.r === "本人がスマホを失くした" && jAud.bf === "1" && jAud.leak === false, [tx.errOf(j6), sReset, { f0, f1 }, jAud]);

  // (k) リセットの後に、その人の今のセッションで /ops を使えない（関数が入れた mfa_reset_at で requireOperator の判定を回す）
  const R = Date.parse(resetAt) / 1000;
  const oldAmr = [{ method: "password", timestamp: Math.floor(R - 3600) }, { method: "totp", timestamp: Math.floor(R - 3590) }];
  const oldFactor = [{ factor_type: "totp", status: "verified", created_at: new Date((R - 30 * 86400) * 1000).toISOString() }];
  const gate = (aal: string, amr: typeof oldAmr, factors: typeof oldFactor) => opsGateOf({ hasUser: true, isOperator: true, aal, stale: opsSessionStaleOf({ aal, amr, factors, mfaResetAt: String(sReset.mfa_reset_at ? new Date(sReset.mfa_reset_at).toISOString() : "") }) });
  const k1 = gate("aal2", oldAmr, oldFactor);   // Admin API で消す前（記録の直後）
  const k2 = gate("aal2", oldAmr, []);          // 消した後（aal2 のままのアクセストークン・リフレッシュでも aal2）
  const newLogin = [{ method: "password", timestamp: Math.floor(R + 5) }];
  const k3 = gate("aal1", newLogin, []);        // 本人がログインし直す＝/ops/mfa で登録し直す
  const newFactor = [{ factor_type: "totp", status: "verified", created_at: new Date((R + 10) * 1000).toISOString() }];
  const k4 = gate("aal2", [...newLogin, { method: "totp", timestamp: Math.floor(R + 20) }], newFactor);   // 登録し直して 6 桁
  const k5 = gate("aal2", oldAmr, newFactor);   // 古いセッションは新しいアプリがあっても通らない
  check("(k-1) リセットの後の古いセッション＝消す前も消した後も relogin（API は 401）・ログインし直すと mfa（登録し直し）・登録し直した後の新しいセッションだけ ok・古いセッションは新しいアプリでも relogin",
    k1 === "relogin" && k2 === "relogin" && k3 === "mfa" && k4 === "ok" && k5 === "relogin", { k1, k2, k3, k4, k5, resetAt });

  // (l) 招待の出し直し
  const l2 = await asSvc("select public.ops_operator_reinvite_logged($1, $2) e", [A.id, X.id]);
  await q("update auth.users set email_confirmed_at = now() where id = $1", [X.id]);
  const l3 = await asSvc("select public.ops_operator_reinvite_logged($1, $2)", [A.id, X.id]);
  await q("update auth.users set email_confirmed_at = null where id = $1", [X.id]);
  const l4 = await asSvc("select public.ops_operator_set_active($1, $2, false, null)", [A.id, X.id]);
  const l5 = await asSvc("select public.ops_operator_reinvite_logged($1, $2)", [A.id, X.id]);
  const l6 = await asSvc("select public.ops_operator_reinvite_logged($1, $2)", [A.id, N.id]);
  check("(l-1) 出し直し＝招待中はメールを返して監査 1・受諾済み op accepted・止めた人 op stopped・運営者でない op not found", l2.ok && l2.rows[0].e === X.email.toLowerCase() && (await audit("ops.operator.reinvite", X.id)) === 1
    && !l3.ok && /op accepted/.test(l3.err) && l4.ok && !l5.ok && /op stopped/.test(l5.err) && !l6.ok && /op not found/.test(l6.err), [l2, l3, l4, l5, l6].map(tx.errOf));
}
