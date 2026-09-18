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
  "mine/norm-progress", "mine/norm-set", "store/okuri-mode",
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

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-guard OK (${pass} checks・route ${routes.length})`);
