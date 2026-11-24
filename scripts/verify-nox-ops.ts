/*
 * verify:nox-ops — 運営コンソール 版 1（夜便 2026-11-20 N5・枝 night1120-ops-console・旗 MIG_0202A_APPLIED の後ろ）。
 *   npm run verify:nox-ops。★2026-11-21 0202a 本番適用（12:06）・旗 true の便で DB の段 o6（案 §8 の 1〜3・5〜8＝試走 trial_0202a の (a)〜(j)・本番の BEGIN…ROLLBACK・env: SUPABASE_DB_URL）を足した。
 *  o(1) 入口の判定（requireOperator の純関数）：未ログイン→/ops/login・運営者でない→404・MFA 未→/ops/mfa（API 403）・aal2→通す。
 *  o(2) 画面と /api/ops/* の全部が requireOperator を通る・旗 false は 404。
 *  o(3) 表示：状態の札・経路・招待・初期設定・LINE・JST・絞り。
 *  o(4) テナント追加の欄：6 業態（ホストを足した）・予約の名前・メール・紹介コード・確かめの文・指定の 2 文。
 *  o(5) 版 1 に入れないもの：「リンクを出す」・「導入中に戻す」・代行の窓口。
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { MIG_0202A_APPLIED, mig0202aOn } from "../lib/nox/rules-0175/flag";
import { fmtJst, inviteLabelOf, kindLabelOf, lineLabelOf, LOGIN_FAIL_TEXT, newOrgConfirmOf, newOrgFormErrOf, OPS_BIZ_TYPES, opsApiStatusOf, opsErrJa, opsFilterOf, opsGateOf, REFERRAL_FIELD_NOTE, ROUTE_FIELD_NOTE, routeLabelOf, setupLabelOf, type OpsOrgRow } from "../lib/nox/ops/labels";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const rd = (p: string) => fs.readFileSync(p, "utf8");

// ── o1 ──
const g = (hasUser: boolean, isOperator: boolean, aal: string | null) => opsGateOf({ hasUser, isOperator, aal });
check("o1(1) 未ログイン＝login・店の人＝notfound・運営者 aal1＝mfa・aal2＝ok", g(false, false, null) === "login" && g(true, false, "aal2") === "notfound" && g(true, true, "aal1") === "mfa" && g(true, true, null) === "mfa" && g(true, true, "aal2") === "ok");
check("o1(2) API＝401／404／403／通す", opsApiStatusOf("login") === 401 && opsApiStatusOf("notfound") === 404 && opsApiStatusOf("mfa") === 403 && opsApiStatusOf("ok") === null);
const ro = rd("lib/nox/ops/require-operator.ts");
check("o1(3) requireOperator＝getUser → ops_operators（有効）→ aal（mfa.getAuthenticatorAssuranceLevel）・画面は redirect／notFound・API は 401／404／403",
  ro.includes("supabase.auth.getUser()") && ro.includes('.from("ops_operators")') && ro.includes("data.is_active !== true") && ro.includes("supabase.auth.mfa.getAuthenticatorAssuranceLevel()")
  && ro.includes('redirect("/ops/login")') && ro.includes("notFound()") && ro.includes('redirect("/ops/mfa")') && ro.includes("opsApiStatusOf(gate)"));

// ── o2 ──
check("o2(1) 旗 MIG_0202A_APPLIED＝true（★0202a 本番適用 2026-11-21 12:06）・layout と API は旗 false なら 404 の枝を持つ", MIG_0202A_APPLIED === true && mig0202aOn() === true
  && rd("app/ops/layout.tsx").includes("if (!mig0202aOn()) notFound();") && ro.includes('if (!mig0202aOn()) return { op: null, res: NextResponse.json({ error: "not found" }, { status: 404 }) };'));
const pages = ["app/ops/page.tsx", "app/ops/orgs/new/page.tsx", "app/ops/orgs/[id]/page.tsx"];
check("o2(2) 一覧・追加・詳細の画面は requireOperatorPage()（MFA を済ませた運営者だけ）", pages.every((p) => rd(p).includes("await requireOperatorPage();")));
check("o2(3) MFA の画面は aal1 を通す（requireOperatorPage({ allowMfa: true })）・済んでいれば /ops", rd("app/ops/mfa/page.tsx").includes("await requireOperatorPage({ allowMfa: true });") && rd("app/ops/mfa/page.tsx").includes('if (gate === "ok") redirect("/ops");'));
const apis = ["app/api/ops/orgs/route.ts", "app/api/ops/orgs/[id]/invite/route.ts", "app/api/ops/orgs/[id]/agency/route.ts", "app/api/ops/orgs/[id]/onboarding/route.ts"];
check("o2(4) /api/ops/* の全部が requireOperatorApi を最初に", apis.every((p) => { const s = rd(p); const i = s.indexOf("const g = await requireOperatorApi();"); return i > 0 && s.indexOf("if (g.res) return g.res;") > i && s.indexOf("createAdminClient()", i) > i; }));
check("o2(5) 関数には運営者の auth id（p_ops）を渡す＝関数の中でも ops_operator_ok（二重）", apis.every((p) => rd(p).includes("p_ops: g.op.authUserId")));

// ── o3 ──
const row: OpsOrgRow = { org_id: "o1", org_name: "CLUB X", kind: "trial", store_count: 1, billing_status: "trialing", trial_ends_at: "2026-11-30T03:00:00Z", has_subscription: false, agency_code: "BWP-4083", onboarding_state: "onboarding", onboarding_done_at: null, owner_email: "a@example.invalid", owner_invited_at: "2026-11-20T05:00:00Z", owner_accepted: false, setup_done_stores: 0, setup_step_max: 3, setup_draft_at: null, line_login_stores: 1, line_notify_stores: 0, line_richmenu_stores: 1, line_links: 2, cast_count: 12, staff_count: 3, last_used_at: "2026-11-20T05:26:00Z", created_at: "2026-11-18T01:00:00Z" };
check("o3(1) 札と列の文", kindLabelOf(row) === "お試し（〜11/30）" && kindLabelOf({ ...row, kind: "tester" }) === "テスター" && routeLabelOf("BWP-4083") === "代理店（BWP-4083）" && routeLabelOf(null) === "直販"
  && inviteLabelOf(row) === "未受諾（招待 11/20）" && inviteLabelOf({ ...row, owner_accepted: true }) === "受諾済み" && setupLabelOf(row) === "STEP 3／9" && setupLabelOf({ ...row, setup_done_stores: 1 }) === "済み" && setupLabelOf({ ...row, setup_step_max: null }) === "未着手"
  && lineLabelOf(row) === "ログイン・リッチメニュー・つながった人 2" && lineLabelOf({ ...row, line_login_stores: 0, line_richmenu_stores: 0 }) === "未着手", { k: kindLabelOf(row), i: inviteLabelOf(row), l: lineLabelOf(row) });
check("o3(2) 日時は JST（UTC 05:26 → 14:26）", fmtJst("2026-11-20T05:26:00Z") === "11/20 14:26" && fmtJst(null) === "—", fmtJst("2026-11-20T05:26:00Z"));
const rows = [row, { ...row, org_id: "o2", org_name: "BAR Y", kind: "tester", agency_code: null, onboarding_state: "done", owner_email: "y@example.invalid" }];
check("o3(3) 絞り＝導入中・状態・経路・検索（会社名とメール）", opsFilterOf(rows, { kind: "onboarding", route: "all", q: "" }).length === 1 && opsFilterOf(rows, { kind: "tester", route: "all", q: "" })[0].org_id === "o2"
  && opsFilterOf(rows, { kind: "all", route: "direct", q: "" })[0].org_id === "o2" && opsFilterOf(rows, { kind: "all", route: "all", q: "Y@EXAMPLE" })[0].org_id === "o2");

// ── o4 ──
const f0 = { orgName: "CLUB Z", storeName: "Z 本店", bizType: "host", ownerEmail: "z@example.invalid", agencyCode: "", tester: true };
check("o4(1) 業態は 6 つ（ホストを足した＝相談役 18:12）", JSON.stringify(OPS_BIZ_TYPES.map(([k]) => k)) === JSON.stringify(["cabaret", "girlsbar", "snack", "lounge", "bar", "host"]));
check("o4(2) 欄の検査＝通る・予約の名前・業態・メール・紹介コード 41 字と前後の空白", newOrgFormErrOf(f0) === null && newOrgFormErrOf({ ...f0, orgName: "NOX-DEMO-A" }) !== null && newOrgFormErrOf({ ...f0, bizType: "club" }) !== null
  && newOrgFormErrOf({ ...f0, ownerEmail: "x" }) !== null && newOrgFormErrOf({ ...f0, agencyCode: "x".repeat(41) }) !== null && newOrgFormErrOf({ ...f0, agencyCode: " A" }) !== null && newOrgFormErrOf({ ...f0, orgName: "NOX-CHECK-1" }) === null);
check("o4(3) 確かめの文・指定の 2 文（紹介コードの欄・経路の欄）・ログインの失敗の文", newOrgConfirmOf(f0) === "CLUB Z を作り、z@example.invalid に招待を送ります。よろしいですか"
  && REFERRAL_FIELD_NOTE === "最初の契約の前に、Yuiba の代理店の画面のコードと同じものを入れてください" && ROUTE_FIELD_NOTE === "報酬の帰属は Yuiba で管理しています。ここを変えても報酬の行き先は変わりません" && LOGIN_FAIL_TEXT === "メールかパスワードが違います");
check("o4(4) 例外の文の写し", opsErrJa("dup email") === "このメールはもう使われています" && opsErrJa("P0001: dup org") === "同じ名前の会社があります" && opsErrJa("cannot reopen") === "導入完了から導入中には戻せません" && opsErrJa("??").startsWith("うまくいきませんでした"));
const nf = rd("app/ops/orgs/new/new-org-form.tsx"), cr = rd("app/api/ops/orgs/route.ts");
check("o4(5) 追加＝確かめ 1 回 → POST・ボタンは中央（nox-actions）・テスターの印は boolean を明示", nf.includes("window.confirm(newOrgConfirmOf(f))") && nf.includes('className="nox-actions"') && cr.includes('if (typeof body.tester !== "boolean")'));
check("o4(6) 招待 → 作成・作成の失敗は今回できた auth だけ消す・孤児は止める", cr.indexOf("inviteUserByEmail") < cr.indexOf('rpc("ops_org_create"') && cr.includes("if (fresh) await admin.auth.admin.deleteUser(authUser.id)") && cr.includes('opsErrJa(already ? "orphan auth" : "invite failed")'));

// ── o5 ──
const od = rd("app/ops/orgs/[id]/org-detail.tsx");
check("o5(1) 版 1 に入れない＝「リンクを出す」・「導入中に戻す」・generateLink", !od.includes("リンクを出す</button>") && !od.includes("導入中に戻す</button>") && !apis.some((p) => rd(p).includes("generateLink")));
check("o5(2) 詳細＝出し直しは未受諾だけ・経路の保存と外す・導入完了は導入中だけ・運営の記録・ボタンは中央", od.includes("row.owner_email && !row.owner_accepted") && od.includes(">外す（直販にする）</button>") && od.includes('row.onboarding_state === "onboarding" && (') && od.includes('aria-label="運営の記録"') && (od.match(/className="nox-actions"/g) ?? []).length === 6 /* ★枝 night1121-ops-v2: 「導入を代行する」の入口で 1 つ増えた */ /* ★起票152（2026-11-24）: サポート許可の URL のコピーで 1 つ増えた */ /* ★起票153（2026-11-24）: 「店を追加」と「経路」を開くボタンの行で 1 つ増えた */);


// ── o6 DB（★旗 true の便 2026-11-21：0202a 本番適用 12:06 の後・試走 trial_0202a の (a)〜(j) を本番の BEGIN…ROLLBACK で・(k) 消す SQL は運用の紙なので入れない）──
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function dbSection() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000, application_name: "nox-verify-ops" });
  await c.connect();
  const q = async (s: string, p?: unknown[]): Promise<Row[]> => (await c.query(s, p)).rows;
  const fp = async () => (await q("select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t, (select count(*)::int from information_schema.columns where table_schema='public' and table_name in ('orgs','audit_logs')) cols"))[0];
  const before = await fp();
  check("o6(0) 0202b の後の形＝関数 483・表 127（0206 で +1）・orgs と audit_logs の列 33（★0202b 2026-11-21 21:57: 463→478・124→126・27→32＝orgs に代理店の代行 3 列・audit_logs に行い手 2 列・★0203 版 4 2026-11-24 11:21:19: 32→33＝orgs.pay_day）", before.f === 487 /* ★0207・0208（2026-11-25 CC 適用）: 483→487・127→128 */ /* ★0203 版 4（2026-11-24 11:21:19 CC 適用）: 478→483 */ && before.t === 128 /* ★0207（2026-11-25）: 127→128＝表 ops_support_requests */ /* ★0206（2026-11-24 CC 適用）: 126→127＝表 cast_employment */ && before.cols === 33 /* ★0203 版 4: 32→33＝orgs.pay_day */, before);
  await q("begin");
  try {
      const SVC = new Set(["b1", "b2", "b3", "c1", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "e1", "e2", "e3", "e4", "f1", "f2", "f3", "g1", "g2", "i1", "c2", "d8", "d9", "d10", "d11", "d12"]);
      const sp = async (name: string, fn: () => Promise<Row[]>): Promise<{ ok: boolean; r: Row[]; err: string }> => { await q(`savepoint ${name}`); try { if (SVC.has(name)) { await q("select set_config('request.jwt.claims', '', true)"); await q("set local role service_role"); } const r = await fn(); if (SVC.has(name)) await q("reset role"); await q(`release savepoint ${name}`); return { ok: true, r, err: "" }; } catch (e) { await q(`rollback to savepoint ${name}`); return { ok: false, r: [], err: (e as Error).message }; } };
      const asRole = async (role: string, sub: string | null) => { await q("reset role"); if (sub) { await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role })]); await q("select set_config('request.jwt.claim.sub', $1, true)", [sub]); } else { await q("select set_config('request.jwt.claims', '', true)"); } await q(`set local role ${role}`); };
      const back = async () => { await q("reset role"); };
      // 取引の中だけの auth ユーザー
      const mk = async (tag: string): Promise<string> => (await q("insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(), now()) returning id", [`nox-verify-ops-${tag}-${Date.now()}@example.invalid`]))[0].id;
      const op = await mk("op"), ow1 = await mk("ow1"), ow2 = await mk("ow2"), ow3 = await mk("ow3"), ow4 = await mk("ow4"), ow5 = await mk("ow5");
      const emailOf = async (id: string): Promise<string> => (await q("select email from auth.users where id = $1", [id]))[0].email;
      await q("insert into public.ops_operators (auth_user_id, email, name) values ($1, $2, '試走')", [op, await emailOf(op)]);
      const demoOwner = (await q("select u.auth_user_id a from memberships m join users u on u.id=m.user_id join stores s on s.id=m.store_id join orgs o on o.id=s.org_id where o.name='NOX-DEMO-MUSE' and m.role='owner' and m.is_active limit 1"))[0].a;
      // (a) anon・authenticated（店のオーナー）は窓口も表も通らない
      for (const [role, sub, tag] of [["anon", null, "anon"], ["authenticated", demoOwner, "店のオーナー"]]) {
        await asRole(role, sub);
        const r1 = await sp("a1", () => q("select * from public.ops_org_list($1)", [op]));
        check(`(a) ${tag}＝ops_org_list は permission denied`, !r1.ok && /permission denied/.test(r1.err), r1.err ?? "");
        const r2 = await sp("a2", () => q("select public.ops_org_create($1,'x','x','bar','x@example.invalid',$1,null,false)", [op]));
        check(`(a) ${tag}＝ops_org_create は permission denied`, !r2.ok && /permission denied/.test(r2.err), r2.err ?? "");
        const r3 = await sp("a3", () => q("select count(*) from public.ops_operators"));
        check(`(a) ${tag}＝ops_operators の select は permission denied`, !r3.ok && /permission denied/.test(r3.err), r3.err ?? "");
        const r4 = await sp("a4", () => q("select public.ops_audit_write($1,null,'x',null,null,null,null,null,false)", [op]));
        check(`(a) ${tag}＝内部専用 ops_audit_write は permission denied`, !r4.ok && /permission denied/.test(r4.err), r4.err ?? "");
        await back();
      }
      // (b) service でも運営者でない id・null は forbidden
     
      const rb1 = await sp("b1", () => q("select * from public.ops_org_list($1)", [demoOwner]));
      check("(b) service・運営者でない id＝forbidden", !rb1.ok && /forbidden/.test(rb1.err), rb1.err ?? "");
      const rb2 = await sp("b2", () => q("select * from public.ops_org_list(null)"));
      check("(b) service・null＝forbidden", !rb2.ok && /forbidden/.test(rb2.err), rb2.err ?? "");
      const rb3 = await sp("b3", () => q("select public.ops_audit_write($1,null,'x',null,null,null,null,null,false)", [op]));
      check("(b) service でも内部専用 ops_audit_write は permission denied", !rb3.ok && /permission denied/.test(rb3.err), rb3.err ?? "");
      // (c) 一覧
      const list = await sp("c1", () => q("select * from public.ops_org_list($1)", [op]));
      const kinds = list.ok ? [...new Set(list.r.map((x: Row) => x.kind))].sort().join(",") : "";
      check("(c) ops_org_list＝全部の会社・デモ／検証用の分類", list.ok && list.r.length >= 10 && kinds.includes("demo") && kinds.includes("verify"), list.err ?? `${list.r.length} 行・${kinds}`);
      const cols = list.ok && list.r[0] ? Object.keys(list.r[0]).join(",") : "";
      check("(c) 返す列に金額・業務の列が無い（名簿で固定）", cols === "org_id,org_name,kind,store_count,billing_status,trial_ends_at,has_subscription,agency_code,onboarding_state,onboarding_done_at,owner_email,owner_invited_at,owner_accepted,setup_done_stores,setup_step_max,setup_draft_at,line_login_stores,line_notify_stores,line_richmenu_stores,line_links,cast_count,staff_count,last_used_at,created_at,owner_accepted_at,line_verified_at" /* ★0202e（2026-11-21 23:59）: 受諾と LINE の確かめの日時を末尾に 2 列 */, cols);
      // (d) テナント追加
      const n0 = async () => (await q("select (select count(*)::int from orgs) o, (select count(*)::int from org_billing) b, (select count(*)::int from stores) s, (select count(*)::int from users) u, (select count(*)::int from memberships) m, (select count(*)::int from audit_logs where action='ops.org.create') a, (select count(*)::int from ops_audit_logs where action='ops.org.create') oa"))[0];
      const c0 = await n0();
      const e1 = await emailOf(ow1), e2 = await emailOf(ow2), e3 = await emailOf(ow3);
      const rd = await sp("d1", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 1', '試走の店', 'snack', $2, $3, 'BWP-TRIAL', false) j", [op, e1.toUpperCase(), ow1]));
      const c1 = await n0();
      check("(d) ops_org_create＝7 種の行が 1 つずつ", rd.ok && c1.o === c0.o + 1 && c1.b === c0.b + 1 && c1.s === c0.s + 1 && c1.u === c0.u + 1 && c1.m === c0.m + 1 && c1.a === c0.a + 1 && c1.oa === c0.oa + 1, rd.err ?? JSON.stringify({ c0, c1 }));
      const org1 = rd.ok ? rd.r[0].j.org_id : null;
      if (org1) {
        const row = (await q("select o.onboarding_state, o.agency_code, o.agency_code_source, b.status, b.trial_ends_at > now() + interval '27 days' t, s.settings_json->>'biz_type' bt, s.settings_json->>'setup_done' sd, u.email, m.role, (select actor_ops_id from audit_logs where org_id=o.id and action='ops.org.create') ao from orgs o join org_billing b on b.org_id=o.id join stores s on s.org_id=o.id join users u on u.org_id=o.id join memberships m on m.user_id=u.id where o.id=$1", [org1]))[0];
        check("(d) 中身＝導入中・経路 ops・お試し 1 か月・業態・setup_done false・メールは小文字・オーナー・店の監査に運営者", row.onboarding_state === "onboarding" && row.agency_code === "BWP-TRIAL" && row.agency_code_source === "ops" && row.status === "trialing" && row.t === true && row.bt === "snack" && row.sd === "false" && row.email === e1.toLowerCase() && row.role === "owner" && row.ao === op, JSON.stringify(row));
      }
      if (org1) {
        const aj = (await q("select (select after_json from audit_logs where org_id=$1 and action='ops.org.create') s, (select after_json from ops_audit_logs where org_id=$1 and action='ops.org.create') o", [org1]))[0];
        check("(d) 店の側の監査に経路とテスターの印が無い・運営の監査には有る（相談役 ②）", aj.s && !("agency_code" in aj.s) && !("tester" in aj.s) && aj.s.owner_email === e1.toLowerCase() && aj.o.agency_code === "BWP-TRIAL" && aj.o.tester === false, JSON.stringify(aj));
        const l2 = await sp("c2", () => q("select kind from public.ops_org_list($1) where org_id = $2", [op, org1]));
        check("(c) NOX-CHECK- の会社は検証用（verify）に分類（相談役 ④）", l2.ok && l2.r[0]?.kind === "verify", l2.err ?? JSON.stringify(l2.r));
      }
      const rd2 = await sp("d2", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 2', '店', 'bar', $2, $3, null, false)", [op, e1, ow1]));
      check("(d) 同じメール＝dup email", !rd2.ok && /dup email/.test(rd2.err), rd2.err ?? "");
      const rd3 = await sp("d3", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 1', '店', 'bar', $2, $3, null, false)", [op, e2, ow2]));
      check("(d) 同じ会社名＝dup org", !rd3.ok && /dup org/.test(rd3.err), rd3.err ?? "");
      const rd4 = await sp("d4", () => q("select public.ops_org_create($1, 'NOX-DEMO-X', '店', 'bar', $2, $3, null, false)", [op, e2, ow2]));
      check("(d) デモ・検証用の名前＝reserved name", !rd4.ok && /reserved name/.test(rd4.err), rd4.err ?? "");
      const rd5 = await sp("d5", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 3', '店', 'bar', $2, $3, null, null)", [op, e2, ow2]));
      check("(d) テスターの印が null＝bad tester（原則 7）", !rd5.ok && /bad tester/.test(rd5.err), rd5.err ?? "");
      const rd6 = await sp("d6", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 4', '店', 'snack', $2, $3, null, true) j", [op, e2, ow2]));
      const t6 = rd6.ok ? (await q("select b.status, b.stripe_subscription_id from org_billing b where b.org_id=$1", [rd6.r[0].j.org_id]))[0] : null;
      check("(d) テスター＝active・契約なし", rd6.ok && t6?.status === "active" && t6?.stripe_subscription_id === null, rd6.err ?? JSON.stringify(t6));
      const ow6 = await mk("ow6"); const ew6 = await emailOf(ow6);
      const rdh = await sp("d11", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 8', 'ホストの店', 'host', $2, $3, null, true) j", [op, ew6, ow6]));
      const bh = rdh.ok ? (await q("select settings_json->>'biz_type' b from stores where org_id = $1", [rdh.r[0].j.org_id]))[0].b : null;
      const rdx = await sp("d12", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 9', '店', 'club', $2, $3, null, false)", [op, ew6, ow6]));
      check("(d) 業態 host で作れる（6 つ目＝相談役 18:12）・ほかの値は bad biz type", rdh.ok && bh === "host" && !rdx.ok && /bad biz type/.test(rdx.err), (rdh.err ?? bh) + " / " + (rdx.err ?? "通った"));
      // 相談役 ③：create-org.mjs（お試し）＋ tester_store_runbook.md §2 (b) の SQL（status='active'・契約は null のまま）の後の行と比べる
      const ew5 = await emailOf(ow5);
      const rd10 = await sp("d10", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 6', '店', 'snack', $2, $3, null, false) j", [op, ew5, ow5]));
      if (rd6.ok && rd10.ok) {
        const orgT = rd6.r[0].j.org_id, orgR = rd10.r[0].j.org_id;
        await back();
        await q("update public.org_billing set status = 'active' where org_id = $1", [orgR]);
        const cmp = await q("select org_id = $1 t, to_jsonb(b) - 'org_id' - 'created_at' - 'updated_at' - 'trial_ends_at' j, b.trial_ends_at between now() + interval '1 month' - interval '1 minute' and now() + interval '1 month' + interval '1 minute' te from org_billing b where org_id in ($1, $2) order by 1", [orgT, orgR]);
        const same = cmp.length === 2 && JSON.stringify(cmp[0].j) === JSON.stringify(cmp[1].j) && cmp[0].te && cmp[1].te;
        check("(d) テスターの行＝手順書の SQL の後の行と同じ（status・契約・数量など・trial_ends_at はどちらも今から 1 か月）", same, JSON.stringify(cmp));
        const w1 = (await q("select public.billing_writable_of($1) w", [orgT]))[0].w;
        await q("update public.org_billing set trial_ends_at = now() - interval '1 day' where org_id in ($1, $2)", [orgT, orgR]);
        const w2 = (await q("select public.billing_writable_of($1) a, public.billing_writable_of($2) b", [orgT, orgR]))[0];
        await q("update public.org_billing set status = 'trialing' where org_id = $1", [orgR]);
        const w3 = (await q("select public.billing_writable_of($1) w", [orgR]))[0].w;
        check("(d) billing_writable_of＝テスターは期限を過ぎても書ける（期限なし）・お試しは期限で止まる（対照）", w1 === true && w2.a === true && w2.b === true && w3 === false, JSON.stringify({ w1, w2, w3 }));
      } else check("(d) テスターの行の比べ", false, rd10.err ?? "");
      // 相談役 ⑤：招待の後・作成の前に route が落ちた＝auth のユーザーだけが残った状態（ow4＝users の行なし）から、もう一度追加
      const ew4 = await emailOf(ow4);
      const rd8 = await sp("d8", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 7', '店', 'bar', $2, null, null, false)", [op, ew4]));
      check("(d) 残った auth・route が id を渡せない（null）＝bad owner auth", !rd8.ok && /bad owner auth/.test(rd8.err), rd8.err ?? "");
      const rd9 = await sp("d9", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 7', '店', 'bar', $2, $3, null, false) j", [op, ew4, ow4]));
      check("(d) 残った auth・同じ id を渡す＝作れる（dup email にならない）", rd9.ok, rd9.err ?? "");
      // (d) 途中の失敗で 0 行（users の auth id の重なりで落とす）
      await back();
      await q("insert into users (org_id, auth_user_id, email, name) select org_id, $1, 'nox-verify-ops-other@example.invalid', '試走' from users where auth_user_id = $2", [ow3, demoOwner]);
     
      const before7 = (await q("select count(*)::int n from orgs where name = 'NOX-CHECK-検査 5'"))[0].n;
      const rd7 = await sp("d7", () => q("select public.ops_org_create($1, 'NOX-CHECK-検査 5', '店', 'bar', $2, $3, null, false)", [op, e3, ow3]));
      const after7 = (await q("select count(*)::int n from orgs where name = 'NOX-CHECK-検査 5'"))[0].n;
      check("(d) 途中（users の作成）で失敗＝会社も店も残らない", !rd7.ok && before7 === 0 && after7 === 0, rd7.err ?? "");
      // (e) 経路
      if (org1) {
        const re1 = await sp("e1", () => q("select public.ops_org_set_agency_code($1, $2, 'bwp-2', '付け替えの確かめ')", [op, org1]));
        const au = (await q("select (select count(*)::int from ops_audit_logs where org_id=$1 and action='ops.agency_code' and before_json->>'agency_code'='BWP-TRIAL' and after_json->>'agency_code'='bwp-2') o, (select count(*)::int from audit_logs where org_id=$1 and action='ops.agency_code' and actor_ops_id=$2) a, (select agency_code from orgs where id=$1) c", [org1, op]))[0];
        check("(e) 経路を直す＝前と後は運営の監査だけ（店の監査 0＝相談役 ②）・大文字小文字そのまま", re1.ok && au.o === 1 && au.a === 0 && au.c === "bwp-2", re1.err ?? JSON.stringify(au));
        const re2 = await sp("e2", () => q("select public.ops_org_set_agency_code($1, $2, null, null)", [op, org1]));
        check("(e) 経路を外す＝直販（null）", re2.ok && (await q("select agency_code, agency_code_source from orgs where id=$1", [org1]))[0].agency_code === null, re2.err ?? "");
        const re3 = await sp("e3", () => q("select public.ops_org_set_agency_code($1, $2, $3, null)", [op, org1, "x".repeat(41)]));
        check("(e) 41 字＝bad code", !re3.ok && /bad code/.test(re3.err), re3.err ?? "");
        const demoOrg = (await q("select id from orgs where name='NOX-DEMO-MUSE'"))[0].id;
        const re4 = await sp("e4", () => q("select public.ops_org_set_agency_code($1, $2, 'x', null)", [op, demoOrg]));
        check("(e) デモの会社＝demo", !re4.ok && /demo/.test(re4.err), re4.err ?? "");
        // (f) 導入の状態
        const rf = await sp("f1", () => q("select public.ops_onboarding_set($1, $2, 'done')", [op, org1]));
        const st = (await q("select onboarding_state, onboarding_done_by, onboarding_done_kind from orgs where id=$1", [org1]))[0];
        check("(f) 導入完了にする＝完了の人と時刻と行い手（ops）", rf.ok && st.onboarding_state === "done" && st.onboarding_done_by === op && st.onboarding_done_kind === "ops", rf.err ?? JSON.stringify(st));
        const rf2 = await sp("f2", () => q("select public.ops_onboarding_set($1, $2, 'onboarding')", [op, org1]));
        const st2 = (await q("select onboarding_state from orgs where id=$1", [org1]))[0].onboarding_state;
        check("(f) 導入完了→導入中は拒否＝cannot reopen（相談役 ①）", !rf2.ok && /cannot reopen/.test(rf2.err) && st2 === "done", rf2.err ?? "通った");
        const rf3 = await sp("f3", () => q("select public.ops_onboarding_set($1, $2, 'done')", [op, org1]));
        check("(f) 完了→完了＝何もしない（通る）", rf3.ok, rf3.err ?? "");
        // (g) 招待の出し直し
        const rg = await sp("g1", () => q("select public.ops_invite_logged($1, $2, 'email') e", [op, org1]));
        check("(g) 未受諾＝出し直しの監査とメールを返す", rg.ok && rg.r[0].e === e1.toLowerCase(), rg.err ?? "");
        await back(); await q("update auth.users set last_sign_in_at = now() where id = $1", [ow1]);
        const rg2 = await sp("g2", () => q("select public.ops_invite_logged($1, $2, 'email')", [op, org1]));
        check("(g) 受諾済み＝accepted", !rg2.ok && /accepted/.test(rg2.err), rg2.err ?? "");
      }
      await back();
      // (h) 柵のトリガ
      const rh1 = await sp("h1", () => q("insert into users (org_id, auth_user_id, email, name) select org_id, $1, 'nox-verify-ops-op@example.invalid', 'x' from users where auth_user_id = $2", [op, demoOwner]));
      check("(h) 運営者の auth id で users を作る＝拒否", !rh1.ok && /operator cannot be a store user/.test(rh1.err), rh1.err ?? "");
      const rh2 = await sp("h2", () => q("insert into ops_operators (auth_user_id, email) values ($1, 'x')", [demoOwner]));
      check("(h) 店のユーザーを運営者にする＝拒否", !rh2.ok && /store user cannot be an operator/.test(rh2.err), rh2.err ?? "");
      // (i) 無効にした運営者
      await q("update ops_operators set is_active = false where auth_user_id = $1", [op]);
     
      const ri = await sp("i1", () => q("select * from public.ops_org_list($1)", [op]));
      check("(i) 無効にした運営者＝forbidden", !ri.ok && /forbidden/.test(ri.err), ri.err ?? "");
      await back();
      // (j) TRUNCATE が通らない（authenticated）
      await asRole("authenticated", demoOwner);
      const rj = await sp("j1", () => q("truncate public.ops_audit_logs"));
      check("(j) authenticated の TRUNCATE＝permission denied", !rj.ok && /permission denied/.test(rj.err), rj.err ?? "");
      await back();
  } finally {
    await q("rollback");
  }
  const after = await fp();
  check("o6(z) 恒久変更 0（関数・表・orgs と audit_logs の列の数が前と同じ）", after.f === before.f && after.t === before.t && after.cols === before.cols, { before, after });
  const left = (await q("select (select count(*)::int from auth.users where email like 'nox-verify-ops-%') u, (select count(*)::int from orgs where name like 'NOX-CHECK-検査%') o"))[0];
  check("o6(z) 検査の auth ユーザーと会社が残っていない", left.u === 0 && left.o === 0, left);
  await c.end();
}

dbSection().then(() => {
  if (fails.length) { console.error(`✗ verify:nox-ops 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log("運営コンソール 版 1: 入口の判定・画面と API の柵・旗・表示・追加の欄・版 1 に入れないもの・DB（anon／店のオーナーは通らない・運営者でない id は forbidden・一覧・追加・経路・導入の状態・出し直し・柵のトリガ・無効の運営者・TRUNCATE・恒久変更 0）");
  console.log(`verify:nox-ops OK (${pass} checks)`);
}).catch((e) => { console.error("✗ verify:nox-ops", (e as Error).message); process.exit(1); });
