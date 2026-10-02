/*
 * verify:nox-demo-guard — 夜間便 N7-1（裁定273-6／277・2026-09-18）公開デモの柵（lib/nox/demo/guard.ts）の許可列挙型 pin（裁定260・DB 不触）。
 *   npm run verify:nox-demo-guard（env 不要）。f0 64 段目。
 *
 *  分類表（0149_pre u7 の表＝273-6 の仮分類を正）: app/api の全 route.ts は次の 3 群のどれかに入っていなければ赤。
 *   A) DENY_GUARDED … デモ org を 403 で拒否（route か、その route が使う共通ガードに assertNotDemo／demoGuardErr がある）
 *   B) DENY_NO_SESSION … 拒否だがユーザーセッションが無い（外部署名・cron・プリンタの store_token）＝差し込みなし。
 *        print/poll・print/result は print/jobs（A）で上流を止める。stripe/webhook は demo org に Stripe イベントが来ない。cron は全 org 対象。
 *   C) ALLOW … デモ内で完結する（給与・入金・前借り・送り・ノルマ・店設定・デモ入場／リセット）
 *  (1) 全 route が A∪B∪C に入る（未分類 0）・(2) A の各 route は柵を通る（逐語 grep）・(3) guard.ts の文言と 403・(4) 表の重複 0
 *  逆テスト 1 本（手動・1 回）: app/api/billing/_owner.ts の assertNotDemo 行を消す→dg(2-*) 赤・戻して緑。
 *  (5) ★夜間便 N5（裁定293-7・2026-09-24）: /demo の入場前に規約 5 項＋「同意する」チェック・未同意は入場ボタン disabled・route／noindex は不変
 *  逆テスト 2 本目（手動・1 回）: demo-terms.tsx の disabled={!agreed} を外す→dg(5-2) 赤・戻して緑。
 */
import fs from "node:fs";
import path from "node:path";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// A) route → 柵を含むファイル（route 自身か共通ガード）
const DENY_GUARDED: Record<string, string> = {
  "billing/checkout": "app/api/billing/_owner.ts",
  "billing/interval": "app/api/billing/_owner.ts",
  "billing/portal": "app/api/billing/_owner.ts",
  "billing/switch-to-card": "app/api/billing/_owner.ts",
  "billing/switch-to-card/return": "app/api/billing/_owner.ts",
  "cast/invite": "lib/nox/cast/route-guard.ts",
  "staff/create": "lib/nox/staff/route-guard.ts",
  "staff/update-email": "app/api/staff/update-email/route.ts",
  "cast/mynumber": "app/api/cast/mynumber/route.ts",
  "kiosk/provision": "app/api/kiosk/provision/route.ts",
  "print/jobs": "app/api/print/jobs/route.ts",
};
// B) セッション無し（差し込みなし）
const DENY_NO_SESSION = new Set<string>([
  "stripe/webhook", "cron/expire-trials", "cron/billing-reminders", "cron/demo-reset", "print/poll/[store_token]", "print/result/[store_token]",
]);
// C) 許可
const ALLOW = new Set<string>([
  "payroll/adjustment/add", "payroll/adjustment/delete", "payroll/finalize", "payroll/mark-paid", "payroll/preview", "payroll/tax-overview",
  "payroll/reopen", "payroll/tax-report-csv",
  "payment/record", "advance/issue", "advance/cancel", "transport/issue", "transport/cancel", "incentive/publish", "incentive/cancel",
  "advance/issue-bulk", "transport/issue-bulk", // ★mig0157（裁定302／304・2026-09-25）: 一括発行＝単発と同じ C（RPC が二重防御・デモ org も可）
  "mine/norm-progress", "store/okuri-mode", // ★便 M2-1（裁定326-3）: mine/norm-set は削除（set_cast_norm_self は 0160 で drop＝cast の自己設定は廃止）
  "demo/enter", "demo/reset",
]);

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p.replace(/\\/g, "/"));
  }
}
const files: string[] = [];
walk("app/api", files);
const routes = files.map((f) => f.replace(/^app\/api\//, "").replace(/\/route\.ts$/, "")).sort();

// (1) 未分類 0
const unclassified = routes.filter((r) => !(r in DENY_GUARDED) && !DENY_NO_SESSION.has(r) && !ALLOW.has(r));
check(`dg(1-1) app/api の全 route が分類済み（走査 ${routes.length}・A ${Object.keys(DENY_GUARDED).length}／B ${DENY_NO_SESSION.size}／C ${ALLOW.size}）`, unclassified.length === 0, unclassified.join(", "));
// (4) 重複 0
const dup = [...Object.keys(DENY_GUARDED)].filter((r) => DENY_NO_SESSION.has(r) || ALLOW.has(r)).concat([...DENY_NO_SESSION].filter((r) => ALLOW.has(r)));
check("dg(4-1) 分類表に重複なし", dup.length === 0, dup.join(", "));
// (2) A の柵
for (const [r, guardFile] of Object.entries(DENY_GUARDED)) {
  const routeFile = `app/api/${r}/route.ts`;
  if (!fs.existsSync(routeFile)) { check(`dg(2) ${r}: route が存在する`, false, routeFile); continue; }
  const g = fs.existsSync(guardFile) ? fs.readFileSync(guardFile, "utf8") : "";
  const hasGuard = /assertNotDemo\(|demoGuardErr\(/.test(g) && /from "@\/lib\/nox\/demo\/guard"/.test(g);
  const routeUsesHelper = guardFile === routeFile || new RegExp(`from "(@/|\\./|\\.\\./)[^"]*${path.basename(guardFile, ".ts")}"`).test(fs.readFileSync(routeFile, "utf8"));
  check(`dg(2) ${r}: 柵あり（${guardFile}）`, hasGuard && routeUsesHelper, hasGuard ? "route が共通ガードを import していない" : "assertNotDemo／demoGuardErr が無い");
}
// (3) guard.ts
const guard = fs.readFileSync("lib/nox/demo/guard.ts", "utf8");
check("dg(3-1) guard.ts: 文言「デモ環境ではこの操作はできません」・403・orgs.is_demo を admin で読む・読めなければ false（本番を止めない）", /DEMO_FORBIDDEN_MESSAGE = "デモ環境ではこの操作はできません"/.test(guard) && /status: 403/.test(guard) && /from\("orgs"\)\.select\("is_demo"\)/.test(guard) && /return false;/.test(guard));
check("dg(3-2) guard.ts はサーバ専用（admin client のみ・use client 指示なし）", !/"use client"/.test(guard) && /createAdminClient/.test(guard));

// (5) ★N5（裁定293-7）: 公開デモの規約
const demoPage = fs.readFileSync("app/demo/page.tsx", "utf8");
const demoTerms = fs.readFileSync("components/ui/demo-terms.tsx", "utf8");
const termsN = (demoTerms.match(/^  "[^"]+",$/gm) || []).length;
check("dg(5-1) /demo: 規約 5 項（実在人物の個人情報／本番利用禁止／リセット／給与等へ利用しない／不正利用禁止）と「同意する」チェック", termsN === 5 && /実在の人物の個人情報/.test(demoTerms) && /本番の店舗運営には利用しません/.test(demoTerms) && /初期化されます/.test(demoTerms) && /実際の給与・報酬・税務に利用しません/.test(demoTerms) && /不正利用/.test(demoTerms) && /type="checkbox" checked=\{agreed\}/.test(demoTerms) && /上記に同意する/.test(demoTerms), `terms=${termsN}`);
check("dg(5-2) /demo: 未同意は入場ボタン disabled（aria-disabled・onSubmit も止める）・page は DemoEntry を通す・form POST /api/demo/enter は不変", /disabled=\{!agreed\} aria-disabled=\{!agreed\}/.test(demoTerms) && /onSubmit=\{\(e\) => \{ if \(!agreed\) e\.preventDefault\(\); \}\}/.test(demoTerms) && /<DemoEntry biz=\{STORES\} roles=\{ROLES\} kiosk=\{KIOSK\} \/>/.test(demoPage) && /action="\/api\/demo\/enter"/.test(demoTerms) && !/action="\/api\/demo\/enter"/.test(demoPage));
check("dg(5-3) /demo: noindex 維持（robots index:false・follow:false）・資格情報／リンクを置かない（http は無い）", /robots: \{ index: false, follow: false, nocache: true \}/.test(demoPage) && !/https?:\/\//.test(demoPage) && !/https?:\/\//.test(demoTerms));

// (6) ★裁定328（便 D1-5）: デモ制限 5 種＝demo フラグで判定し本番 org には影響しない（柵の所在を列挙）
{
  const layout = fs.readFileSync("app/(manage)/layout.tsx", "utf8");
  const routes6 = files.map((f) => f.replace(/^app\/api\//, "").replace(/\/route\.ts$/, ""));
  const walk2 = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk2(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const clientSrc = walk2("app").concat(walk2("components")).map((f) => fs.readFileSync(f, "utf8"));
  check("dg(6-1) ①メール／パスワード変更: staff/update-email は柵 A・パスワード／メール変更の route は他に無い・client は auth.updateUser を呼ばない", "staff/update-email" in DENY_GUARDED && !routes6.some((r) => /password|email/.test(r) && r !== "staff/update-email") && !clientSrc.some((s) => /auth\.updateUser\(/.test(s)));
  check("dg(6-2) ②org 削除・Auth 系（招待・スタッフ作成・キオスク発行）: org 削除 route なし・cast/invite／staff/create／kiosk/provision は柵 A", !routes6.some((r) => /org.*delete|delete.*org/.test(r)) && ["cast/invite", "staff/create", "kiosk/provision"].every((r) => r in DENY_GUARDED));
  const enter = fs.readFileSync("app/api/demo/enter/route.ts", "utf8");
  check("dg(6-3) ③外部送信（LINE／メール／Stripe）: LINE・メール送信の route なし・billing 4 本は柵 A・stripe/webhook はセッション無し（B）・demo/enter の magiclink は送信しない", !routes6.some((r) => /line|mail/.test(r) && r !== "staff/update-email") && ["billing/checkout", "billing/interval", "billing/portal", "billing/switch-to-card"].every((r) => r in DENY_GUARDED) && DENY_NO_SESSION.has("stripe/webhook") && !/sendEmail|inviteUserByEmail|signInWithOtp/.test(enter));
  check("dg(6-4) ④写真・印刷: storage policy の is_demo 句（0149 ★10）＋ client は useIsDemo で導線を隠す（photo-card／casts／staff）・print/jobs は柵 A", "print/jobs" in DENY_GUARDED && ["app/mine/photo-card.tsx", "app/(manage)/casts/casts-board.tsx", "app/(manage)/staff/staff-board.tsx"].every((f) => /useIsDemo\(\)/.test(fs.readFileSync(f, "utf8"))));
  check("dg(6-5) ⑤判定は demo フラグ（orgs.is_demo）だけ・本番 org には効かない: guard は読めなければ false・layout は is_demo で帯と「ご契約」を切替・/setup へ飛ばさない", /return data\?\.is_demo === true;/.test(guard) && layout.includes("{isDemo && <DemoBanner />}") && layout.includes('role === "owner" && !isDemo ? [{ href: "/billing"') && layout.includes('if (role === "owner" && !isDemo)'));
  const demoPage2 = fs.readFileSync("app/demo/page.tsx", "utf8");
  check("dg(6-6) ★/demo は seed の DEMO_STORES（6）× DEMO_ROLES（4）＋ 端末（kiosk）・入場 route は store/role を検査（demo-payload suite dp(4-1) と対）", demoPage2.includes("DEMO_STORES.map(") && demoPage2.includes("DEMO_ROLES.map(") && demoPage2.includes("kiosk={KIOSK}"));
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-guard OK (${pass} checks・route ${routes.length})`);
