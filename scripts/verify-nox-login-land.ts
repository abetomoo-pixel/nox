/*
 * verify:nox-login-land — 2026-11-22（相談役 14:10 の 1・DB 変更 0）: ログインの直後の白い画面（初期設定が途中の店）。
 *  起きていたこと: ログインの画面と利用規約の同意の画面が、読み直さない移動（router.replace("/dashboard")＋refresh）で店側の画面へ入っていた。
 *    店側の殻（app/(manage)/layout.tsx）は初期設定が途中の店なら /setup へ戻す（setupGateRedirectOf）。読み直さない移動では次の /setup でも同じ殻を
 *    使い回すため、殻がまた /setup へ戻す＝くり返して白い画面（地 #fafafa だけ）で止まった（オーナー・店長・スタッフ。キャストは /mine で別の殻＝起きない）。
 *    メールのリンク（/auth/set-password）は前から読み直す移動（window.location.href）＝起きない。
 *  直し: 2 つの画面の移動を読み直す移動（window.location.replace）にした。
 *  (1) ログイン・同意の画面＝読み直す移動・読み直さない移動で店側の画面へ入る形が残っていない
 *  (2) 殻の外の画面（app の (manage) 以外と、そこが読み込む components）に、読み直さない移動で店側の画面へ入る箇所が無い（新しく足しても赤）
 *  (3) 殻は今も /setup へ戻す（戻しが無くなればこの検査の前提が変わる＝赤で知らせる）
 *  (4) 直す前の形（読み直さない移動）はこの検査で赤になる
 *  画面で通すのは docs/tmp/white_1122_pw.mjs（手元の dev・ログイン画面から入り、読み直さずに /setup が描かれること・下書きあり／なし）。
 *  使い方: npm run verify:nox-login-land（env 不要・DB 不触）
 */
import fs from "node:fs";
import path from "node:path";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

const MANAGE = ["dashboard", "register", "shift", "report", "master", "casts", "customers", "payroll", "staff", "analytics", "audit", "billing", "notices", "receipts", "setup"];
const SOFT_INTO_MANAGE = new RegExp(`router\\.(replace|push)\\(\\s*(?:[^)]*\\?\\s*)?["'\`]/(?:${MANAGE.join("|")})\\b`);
const softIntoManage = (s: string): boolean => SOFT_INTO_MANAGE.test(s) || /router\.(replace|push)\(role === "cast" \? "\/mine" : "\/dashboard"\)/.test(s);

const login = src("app/login/page.tsx");
const terms = src("components/nox/terms-accept-form.tsx");
check("(1) ログイン＝読み直す移動（window.location.replace・キャストは /mine・ほかは /dashboard）", login.includes('window.location.replace(role === "cast" ? "/mine" : "/dashboard");'));
check("(1) ログイン＝読み直さない移動で店側へ入る形が無い", !softIntoManage(login) && !/router\.refresh\(\)/.test(login));
check("(1) 同意＝読み直す移動（window.location.replace(\"/dashboard\")）", terms.includes('window.location.replace("/dashboard");'));
check("(1) 同意＝読み直さない移動で店側へ入る形が無い", !softIntoManage(terms) && !/router\.refresh\(\)/.test(terms));
check("(1) メールのリンク（set-password）は前から読み直す移動", src("app/auth/set-password/page.tsx").includes('window.location.href = "/dashboard"'));

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { const p = path.join(dir, e.name); return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : []; });
// 殻の外＝app の (manage) 以外のファイルと、そこから読み込む components（店側の殻の中だけで使う部品＝殻が描かれた後の移動は対象外）
const outsideApp = walk("app").filter((p) => !p.split(path.sep).includes("(manage)"));
const usedComps = new Set<string>();
for (const f of outsideApp) for (const m of src(f).matchAll(/from "@\/components\/([^"]+)"/g)) for (const ext of [".tsx", ".ts"]) { const c = path.join("components", m[1] + ext); if (fs.existsSync(c)) usedComps.add(c); }
const outside = [...outsideApp, ...usedComps];
const hits = outside.filter((p) => { const s = src(p); return s.includes('"use client"') && softIntoManage(s); }).map((p) => p.split(path.sep).join("/"));
check(`(2) 殻の外の画面に、読み直さない移動で店側の画面へ入る箇所が無い（${outside.length} ファイル）`, hits.length === 0 && outside.length > 50 && usedComps.has(path.join("components", "nox", "terms-accept-form.tsx")), hits);

const layout = src("app/(manage)/layout.tsx");
check("(3) 殻は今も初期設定が途中の店を /setup へ戻す（setupGateRedirectOf → redirect）", layout.includes("const to = setupGateRedirectOf({ role, isDemo, needsSetup, pathname: pathnameSU });") && layout.includes("if (to) redirect(to);"));

const before = `    router.replace(role === "cast" ? "/mine" : "/dashboard");\n    router.refresh();\n`;
const beforeTerms = `    router.replace("/dashboard");\n    router.refresh();\n`;
check("(4) 直す前の形（ログイン・同意）はこの検査で赤", softIntoManage(before) && softIntoManage(beforeTerms));

// (5) ★2026-11-22（相談役 17:50 の 1）: 同じ形の洗い出し＝外枠が「同じ群の中」へ戻す行き先は店側の殻の 3 つ（/setup・キオスクの本人の /register・権限の無いスタッフの /dashboard）。
//   そこへ殻の外から入る口は、どれも読み直す移動（or フォームの POST）であること（読み直さない移動に変えたら赤）。
const has = (p: string, s: string) => src(p).includes(s);
check("(5) 戻しを持つ外枠＝店側の殻（/setup・/register・/dashboard は同じ群）・マスタ（/dashboard＝同じ群だが殻の中からだけ）・キャスト（/register＝別の群）・運営は戻しなし",
  (layout.match(/redirect\(/g) ?? []).length === 9 /* ★0203（■2-d）: オーナーが初期設定の前の店を見ているときの /setup?store=（外枠の外から入るのはログインと同意＝読み直す移動） */ &&(src("app/(manage)/master/layout.tsx").match(/redirect\(/g) ?? []).length === 3 && (src("app/mine/layout.tsx").match(/redirect\(/g) ?? []).length === 2 && !src("app/ops/layout.tsx").includes("redirect("));
check("(5) パスワードを決めた後（set-password）＝読み直す移動（/dashboard・運営は /ops/login）", has("app/auth/set-password/page.tsx", 'window.location.href = "/dashboard"') && has("app/auth/set-password/page.tsx", 'window.location.href = j.dest === "/ops/login" ? "/ops/login" : "/dashboard"'));
check("(5) 招待の受諾（/i/[token]）＝読み直す移動", has("app/i/[token]/accept-form.tsx", 'window.location.href = j.dest ?? "/dashboard"'));
check("(5) 初期設定の確定の後「ホームへ」＝a の href（読み直す移動）", has("app/(manage)/setup/setup-wizard.tsx", '<a href="/dashboard" style={{ ...t.btnGold, textDecoration: "none" }} data-setup-home="1">ホームへ</a>'));
check("(5) 端末（キオスク）の入口＝タイルの行き先も本人のログインも location.assign", has("components/nox/kiosk-person-entry.tsx", "window.location.assign(dest ?? r.dest)") && has("lib/nox/kiosk/person-login-client.ts", 'window.location.assign("/login?kiosk=1")') && has("lib/nox/kiosk/person-login-client.ts", 'window.location.assign(ok ? "/kiosk" : "/login")'));
check("(5) LINE（LIFF）から着いた後＝location.replace", has("app/liff/[storeId]/liff-bridge.tsx", "location.replace(liffDestOf("));
check("(5) ログアウト＝フォームの POST（/auth/signout が 303 で /login）・デモの入口＝フォームの POST（/api/demo/enter）", has("components/ui/header-chips.tsx", '<form action="/auth/signout" method="post"') && has("components/ui/demo-terms.tsx", 'method="post" action="/api/demo/enter"'));
check("(5) 運営のログインと MFA＝運営の殻は戻しを持たない（柵は各ページ）＝読み直さない移動でよい", has("app/ops/login/login-form.tsx", 'router.replace("/ops/mfa")') && has("app/ops/mfa/mfa-form.tsx", 'router.replace("/ops")'));

if (fails.length) { console.error(`verify:nox-login-land FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-login-land OK ${pass} checks（ログインの直後の白い画面＝読み直す移動）`);
