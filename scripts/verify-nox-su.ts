/*
 * verify:nox-su — 便 SU（M-37 殻だけ・2026-10-30・DB 変更 0）: 初期設定の専用レイアウトと関所。
 *  (1) /setup は通常の画面殻（左ナビ・上部バー）の外＝layout が isSetupPath で children だけを描く・殻は正本 setup_v5.html（.bar ロゴ＋見出し＋自動保存／.steps 9 列／main／.foot 固定バー 1 / 9・戻る・次へ）
 *  (2) ステップ表示＝番号付き（.n）＋名前（.t）の大きなタブ（min-height 52・aria-current・done）
 *  (3) setup_done=false の店がある org は owner／manager／staff とも他画面へ行けない（setupGateRedirectOf＝/setup へ・cast と demo は除外・/setup 自身は通す）・manager／staff は /setup で案内（SetupWaiting）
 *  「未完の店で /register を開くと /setup に戻る」＝純関数 1 段（manager・/register → "/setup"）。actions-center の /setup 9 画面は既存の段（主ボタン中央＝固定バーは例外）。
 *  使い方: npm run verify:nox-su（env 不要・DB 不触）
 */
import fs from "node:fs";
import { isSetupPath, setupGateRedirectOf } from "../lib/nox/setup/gate";
import { V5_STEPS } from "../lib/nox/setup/v5";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (3) 関所＝純関数
check("su(3-1) 未完の店で /register を開くと /setup に戻る（manager・staff・owner）・/setup 自身と配下は通す", setupGateRedirectOf({ role: "manager", isDemo: false, needsSetup: true, pathname: "/register" }) === "/setup" && setupGateRedirectOf({ role: "staff", isDemo: false, needsSetup: true, pathname: "/shift" }) === "/setup" && setupGateRedirectOf({ role: "owner", isDemo: false, needsSetup: true, pathname: "/dashboard" }) === "/setup" && setupGateRedirectOf({ role: "owner", isDemo: false, needsSetup: true, pathname: "/setup" }) === null && setupGateRedirectOf({ role: "owner", isDemo: false, needsSetup: true, pathname: "/setup/x" }) === null);
check("su(3-2) 除外＝cast（/mine）・デモ org・setup_done の店だけ・未ログイン", setupGateRedirectOf({ role: "cast", isDemo: false, needsSetup: true, pathname: "/register" }) === null && setupGateRedirectOf({ role: "owner", isDemo: true, needsSetup: true, pathname: "/register" }) === null && setupGateRedirectOf({ role: "manager", isDemo: false, needsSetup: false, pathname: "/register" }) === null && setupGateRedirectOf({ role: null, isDemo: false, needsSetup: true, pathname: "/register" }) === null && isSetupPath("/setup") && isSetupPath("/setup/") && !isSetupPath("/settings"));
// 配線
const lay = src("app/(manage)/layout.tsx"), wz = src("app/(manage)/setup/setup-wizard.tsx"), pg = src("app/(manage)/setup/page.tsx"), css = src("app/globals.css"), wait = src("app/(manage)/setup/setup-waiting.tsx");
check("su(3-3) layout＝setupGateRedirectOf を全ロールに（旧 role === \"owner\" の条件は無い）・/setup は isSetupPath で殻の外（children だけ・DemoProvider は保つ）", lay.includes("const to = setupGateRedirectOf({ role, isDemo, needsSetup, pathname: pathnameSU });") && !lay.includes('if (role === "owner" && !isDemo) { // ★N7-2 ②') && lay.includes('if (isSetupPath(pathnameSU)) {') && lay.includes('<div className="nox-dark nox-setup-page" data-setup-shell="1"><DemoProvider isDemo={isDemo}>{children}</DemoProvider></div>'));
check("su(3-4) page＝cast は /mine・未ログインは /login・manager／staff は SetupWaiting（店名）・owner は wizard", pg.includes('if (role === "cast") redirect("/mine");') && pg.includes('if (!role) redirect("/login");') && pg.includes('if (role !== "owner") return <SetupWaiting storeName={target.name} />;') && wait.includes('data-setup-waiting="1"') && wait.includes("は初期設定の途中です"));
// (1)(2) 殻
check("su(1-1) 殻＝正本の .bar（ロゴ N・h1 NOX 初期設定・sub・自動保存の印 data-setup-saved）・sticky header・main・固定バー（1 / 9・戻る・次へ／この内容で始める）", wz.includes('<header className="nox-setup-top" data-setup-top="1">') && wz.includes('<div className="nox-setup-mark" aria-hidden="true">N</div>') && wz.includes("<h1>NOX 初期設定") && wz.includes('<div className="save" data-setup-saved="1">{saved}</div>') && wz.includes('<main className="nox-setup-main" data-setup-main="1">') && wz.includes('<div className="nox-setup-foot" data-setup-foot="1"><div className="in">') && wz.includes('<span className="pos num" data-setup-pos="1">{S.step + 1} / {V5_STEPS.length}</span>') && wz.includes('data-setup-next="1">次へ：{V5_STEPS[S.step + 1]}</button>') && !wz.includes('className="nox-pthead"') && !wz.includes('data-setup-footcard="1"'));
check("su(2-1) ステップ＝番号付き（.n）＋名前（.t）の 9 タブ（ol.nox-setup-steps・aria-current・done・業態未選択は 2 以降 disabled）", wz.includes('<ol className="nox-setup-steps" aria-label="初期設定の手順">') && wz.includes('<span className="n num">{done ? "✓" : i + 1}</span><span className="t">{n}</span></button></li>') && wz.includes('className={done ? "done" : undefined} aria-current={cur ? "step" : undefined} disabled={i > 0 && !type}') && V5_STEPS.length === 9);
check("su(1-2) CSS＝正本の寸法（steps 9 列・min-height 52・.n 26px 丸・current＝金地・done＝緑・foot fixed・1100／700 の折返し）", css.includes(".nox-setup-steps { max-width: 1200px; margin: 0 auto; padding: 0 24px 12px; display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 6px; list-style: none; }") && css.includes("min-height: 52px") && css.includes(".nox-setup-steps .n { flex: none; width: 26px; height: 26px; border-radius: 50%;") && css.includes('.nox-setup-steps button[aria-current="step"] { background: var(--gold);') && css.includes(".nox-setup-foot { position: fixed;") && css.includes("@media (max-width: 1100px) { .nox-setup-steps { grid-template-columns: repeat(9, minmax(112px, 1fr)); overflow-x: auto; } }"));
check("su(4-1) 9 STEP の中身は不変（見出し 9＋完了・data-setup-start・data-setup-later・data-setup-deferred＝便 M5 で突合）", ["お店について", "席・卓", "料金", "メニュー", "キャスト待遇", "スタッフ", "シフト・勤怠", "会計・レジ", "確認", "初期設定が完了しました"].every((h) => wz.includes(`>${h}</h2>`)) && wz.includes('data-setup-start="1"') && wz.includes('data-setup-later="1"') && wz.includes("data-setup-deferred={planAll.deferred.length}"));

if (fails.length) { console.error(`verify:nox-su FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-su OK ${pass} checks（便 SU＝M-37 殻だけ・初期設定の専用レイアウトと関所）`);
