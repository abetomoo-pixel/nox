/*
 * verify:nox-ops — 運営コンソール 版 1（夜便 2026-11-20 N5・枝 night1120-ops-console・旗 MIG_0202A_APPLIED の後ろ）。
 *   npm run verify:nox-ops。今は DB 不触（0202a は本番に未適用＝旗 false）。旗を true にする便で DB の段（案 §8 の 1〜3・5〜8）を足す。
 *  o(1) 入口の判定（requireOperator の純関数）：未ログイン→/ops/login・運営者でない→404・MFA 未→/ops/mfa（API 403）・aal2→通す。
 *  o(2) 画面と /api/ops/* の全部が requireOperator を通る・旗 false は 404。
 *  o(3) 表示：状態の札・経路・招待・初期設定・LINE・JST・絞り。
 *  o(4) テナント追加の欄：6 業態（ホストを足した）・予約の名前・メール・紹介コード・確かめの文・指定の 2 文。
 *  o(5) 版 1 に入れないもの：「リンクを出す」・「導入中に戻す」・代行の窓口。
 */
import fs from "node:fs";
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
check("o2(1) 旗 MIG_0202A_APPLIED＝false（0202a は未適用）・layout と API は旗 false で 404", MIG_0202A_APPLIED === false && mig0202aOn() === false
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
check("o5(2) 詳細＝出し直しは未受諾だけ・経路の保存と外す・導入完了は導入中だけ・運営の記録・ボタンは中央", od.includes("row.owner_email && !row.owner_accepted") && od.includes(">外す（直販にする）</button>") && od.includes('row.onboarding_state === "onboarding" && (') && od.includes('aria-label="運営の記録"') && (od.match(/className="nox-actions"/g) ?? []).length === 3);

if (fails.length) { console.error(`✗ verify:nox-ops 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-ops OK (${pass} checks)`);
console.log("運営コンソール 版 1（枝）: 入口の判定・画面と API の柵・旗 false で 404・表示・追加の欄・版 1 に入れないもの（DB の段は旗 true の便で）");
