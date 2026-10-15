/*
 * verify:nox-register-sticky — 便 GV-A（2026-10-14）裁定367（GV-15〜18）上部ヘッダー非固定・レジの 2 段 sticky・人数変更の注記 1 行の係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-register-sticky。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const rb = src("app/(manage)/register/register-board.tsx"); const css = src("app/globals.css");
check("rs(1) .nox-tb は position static（sticky 解除・高さ 64 は不変）・.nox-regsticky＝sticky top 0・不透明 var(--bg)・backbar 自身の sticky は解除", css.includes(".nox-tb { position: static; }") && /\.nox-tb \{[^}]*height: 64px/.test(css) && css.includes(".nox-regsticky { position: sticky; top: 0; z-index: 6; background: var(--bg);") && css.includes(".nox-regsticky .nox-backbar { position: static; }"));
check("rs(2) register: 操作バー（.nox-backbar＋row2）とセグメントを .nox-regsticky で包む（data-regsticky）・注記「※セット中の人数変更はセット料金に反映されます」は削除・開卓モーダルに「延長は追加時点の人数で確定」1 行", rb.includes('<div className="nox-regsticky" data-regsticky="1">') && !rb.includes("※セット中の人数変更はセット料金に反映されます") && rb.includes('data-people-note="1">延長は追加時点の人数で確定</p>'));
check("rs(3) PWA: manifest＝standalone・start_url /・icons 192／512・shortcuts（/register・/kiosk）・layout＝appleWebApp capable・statusBarStyle black-translucent・apple-touch-icon 180・戻り導線（レジ「← フロア」・開卓モーダル「やめる」・kiosk「すぐ戻る」）", (() => { const m = JSON.parse(src("public/manifest.json")); const lay = src("app/layout.tsx"); return m.display === "standalone" && m.start_url === "/" && m.icons.some((i: { sizes: string }) => i.sizes === "192x192") && m.icons.some((i: { sizes: string }) => i.sizes === "512x512") && Array.isArray(m.shortcuts) && m.shortcuts.some((x: { url: string }) => x.url === "/register") && m.shortcuts.some((x: { url: string }) => x.url === "/kiosk") && lay.includes("capable: true") && lay.includes('statusBarStyle: "black-translucent"') && lay.includes('sizes: "180x180"') && rb.includes("← フロア") && rb.includes('data-open-cancel="1">やめる</button>') && src("app/kiosk/page.tsx").includes(">すぐ戻る</button>"); })());

if (fails.length) { console.error(`✗ verify:nox-register-sticky 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-register-sticky OK (${pass} checks)`);
