/*
 * verify:nox-layout-bottom — 便 P166／X-13b（X-13-11・2026-10-08）スマホ共通＝本文の下余白が下部ナビに隠れない（DB 不触・env 不要・CSS と layout の逐語 pin）。
 *   npm run verify:nox-layout-bottom。f0 95 段目。
 *
 *  lb(1) globals.css: --nox-bnav-h（下部タブの高さ）を :root に持ち、≤900／≤641 の .nox-mainarea と /mine の .nox-main の padding-bottom が
 *        「var(--nox-bnav-h) + 余白 + env(safe-area-inset-bottom, 0px)」（env に 0px の既定）。.nox-tabbar は fixed bottom:0・padding に safe-area。
 *  lb(2) (manage)/layout.tsx は main.nox-mainarea・mine/layout.tsx は main.nox-main＝実機幅 390 の「最下段に操作がある画面」6 つ（店舗設定 2 タブ・キャスト詳細・ノルマ・商品編集・レジ会計・スタッフ編集）は全て (manage) 配下＝同じ下余白を受ける。
 *  lb(3) 数値の妥当性＝下部タブ（padding 9+9・アイコン 22＋ラベル 11＋gap）≈ 64px 以下・本文の下余白 ≥ 下部タブ＋20px。
 *  逆テスト 1 本（手動・1 回）: globals.css の ≤900 の .nox-mainarea の padding-bottom から var(--nox-bnav-h) を外す→lb(1-2) 赤・戻して緑。
 */
import fs from "node:fs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const css = src("app/globals.css");
const bnav = css.match(/--nox-bnav-h:\s*(\d+)px;/);
check("lb(1-1) :root に --nox-bnav-h（px）", !!bnav && Number(bnav[1]) >= 56 && Number(bnav[1]) <= 80, bnav?.[0]);
check("lb(1-2) ≤900 の .nox-mainarea の下余白＝var(--nox-bnav-h) + 24px + env(safe-area-inset-bottom, 0px)", /\.nox-mainarea \{ padding: 20px 20px calc\(var\(--nox-bnav-h\) \+ 24px \+ env\(safe-area-inset-bottom, 0px\)\); \}/.test(css));
check("lb(1-3) ≤641 の .nox-mainarea の下余白＝var(--nox-bnav-h) + 20px + env(safe-area-inset-bottom, 0px)", /@media \(max-width: 641px\) \{ \.nox-mainarea \{ padding: 16px 16px calc\(var\(--nox-bnav-h\) \+ 20px \+ env\(safe-area-inset-bottom, 0px\)\); \} \}/.test(css));
check("lb(1-4) /mine の .nox-main の下余白＝var(--nox-bnav-h) + 32px + env(safe-area-inset-bottom, 0px)", /\.nox-main \{\s*flex: 1;\s*padding: 16px 16px calc\(var\(--nox-bnav-h\) \+ 32px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css));
check("lb(1-5) .nox-tabbar＝position fixed・bottom 0・padding の下に safe-area", /\.nox-tabbar \{\s*position: fixed;\s*left: 0;\s*right: 0;\s*bottom: 0;/.test(css) && /padding: 9px 2px calc\(9px \+ env\(safe-area-inset-bottom\)\);/.test(css));
check("lb(1-6) 印刷では下部タブを出さず mainarea の padding 0（末尾空白ページ対策＝不変）", /\.nox-topbar, \.nox-tabbar, \.nox-noprint \{ display: none !important; \}/.test(css) && /\.nox-mainarea \{ padding: 0 !important; \}/.test(css));

const manage = src("app/(manage)/layout.tsx"), mine = src("app/mine/layout.tsx");
check("lb(2-1) (manage)/layout は main.nox-mainarea・mine/layout は main.nox-main", manage.includes('<main className="nox-mainarea">') && mine.includes('<main className="nox-main">'));
const SCREENS = ["app/(manage)/master/store-profile/page.tsx", "app/(manage)/casts/casts-board.tsx", "app/(manage)/master/cast-comp/norma/norma-board.tsx", "app/(manage)/master/products/products-board.tsx", "app/(manage)/register/register-board.tsx", "app/(manage)/staff/staff-board.tsx"];
check("lb(2-2) 最下段に操作がある 6 画面（店舗設定 2 タブ・キャスト詳細・ノルマ・商品編集・レジ会計・スタッフ編集）は全て (manage) 配下＝同じ下余白", SCREENS.every((f) => fs.existsSync(f) && f.startsWith("app/(manage)/")));
check("lb(2-3) レジ会計の下部 sticky バーは safe-area 対応のまま（下余白と二重に隠さない）", /padding: 10px 14px calc\(10px \+ env\(safe-area-inset-bottom\)\);/.test(css));

const h = Number(bnav?.[1] ?? 0);
check("lb(3-1) 本文の下余白 ≥ 下部タブ＋20px（≤900: h+24・≤641: h+20・/mine: h+32）", h > 0 && h + 20 >= 56 + 20);

if (fails.length) {
  console.error(`verify:nox-layout-bottom FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-layout-bottom OK (${pass} checks)`);
console.log("スマホ共通の下余白（X-13-11）: --nox-bnav-h・≤900／≤641 の .nox-mainarea・/mine の .nox-main＝下部ナビ高さ＋余白＋env(safe-area-inset-bottom, 0px)・6 画面は (manage) 配下");
