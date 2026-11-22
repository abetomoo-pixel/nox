/*
 * verify:nox-setup375 — 2026-11-22（相談役 14:10 の 2・DB 変更 0）: 初期設定のスマホ（375）の崩れ。
 *  (1) STEP 3 料金の「席」＝700px 以下は欄の幅いっぱい（ルールの欄の行を 1 つ使う）・選択肢は文字の幅より狭くならない（1 字ずつ縦に折らない・入らない分は次の行）
 *  (2) STEP 4 メニュー＝700px 以下は 1 商品 1 枚のカード（商品名 1 行・その下に値段とバック・出すの印・見出しの行は隠す）
 *  (3) STEP 7 曜日別の必要人数＝700px 以下は 4＋3 の 2 段（欄の余白を詰めて数字が単位に隠れない）
 *  (4) STEP 7 勤務時間の丸め「丸めない」＝(1) と同じ決まりで折らない
 *  (5) 「次へ」「この内容で始める」が押せないとき＝ボタンの上に理由の 1 行（どの欄か）・押せる条件は前のまま
 *  ほかに見つけた所: STEP 5 時給スライドの選択（折り返し型の 2 列が初期設定の CSS に消されていた）・スライドの段（額が欄に隠れた＝2 行に）・ノルマの「円／1 万円」の欄・STEP 9 の「直す」・STEP 1 の価格の調整の行・STEP 3 のルール名の行
 *  (6) 直す前の形（CSS の節が無い・理由の行が無い）はこの検査で赤
 *  画面で数えるのは docs/tmp/setup375_probe.mjs（業態 6 × 375／1024 × 9 STEP・値が見える幅／1 字の縦の折れ／表の列／横のはみ出し）。
 *  使い方: npm run verify:nox-setup375（env 不要・DB 不触）
 */
import fs from "node:fs";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const wz = src("app/(manage)/setup/setup-wizard.tsx");
const css = src("app/globals.css");

const cssOk = (c: string) => ({
  seg: c.includes(".nox-setup-main .nox-seg:not(.nox-seg--wrap) { flex-wrap: wrap; overflow: visible; }") && c.includes(".nox-setup-main .nox-seg:not(.nox-seg--wrap) > button { min-width: -webkit-fit-content; min-width: fit-content; }"),
  seat: c.includes(".nox-setup-main [data-rule] label:has(> .nox-seg) { grid-column: 1 / -1; }"),
  wrap2: c.includes(".nox-setup-main .nox-seg.nox-seg--wrap > button { flex: 1 1 calc(50% - 1px); min-width: -webkit-fit-content; min-width: fit-content; }"),
  menu: c.includes(".nox-setup-main table.nox-setup-menutbl > colgroup, .nox-setup-main table.nox-setup-menutbl > thead { display: none; }") && c.includes(".nox-setup-main table.nox-setup-menutbl tr[data-menu-row] { display: grid; grid-template-columns: 30px minmax(0, 1fr);") && ['"値段"', '"バック（本指名）"', '"ボトルキープ可"'].every((x) => c.includes(`::before { content: ${x}; }`)),
  need7: c.includes(".nox-setup-main .nox-setup-need7 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important;") && c.includes('.nox-setup-main .nox-setup-need7 .nox-unit input.num:not([type="checkbox"]) { padding: 9px 4px !important; }'),
  tier: c.includes(".nox-setup-main .nox-tierrow { grid-template-columns: 40px minmax(0, 1fr) auto; row-gap: 4px; }"),
  fix: c.includes(".nox-setup-main [data-setup-checks] button, .nox-setup-main [data-setup-box] button { white-space: nowrap; flex: 0 0 auto; }"),
  why: c.includes(".nox-setup-foot .in:has(> .why) { flex-wrap: wrap; }") && c.includes(".nox-setup-foot .in > .why { flex: 1 0 100%;"),
  in700: (() => { const i = c.indexOf("@media (max-width: 700px) {\n  .nox-setup-main [data-rule] label:has(> .nox-seg)"); const j = c.indexOf(".nox-setup-main .nox-setup-need7 { grid-template-columns"); const k = c.indexOf(".nox-setup-main .nox-tierrow { grid-template-columns: 40px"); return i > 0 && j > i && k > i && c.indexOf("grid-row: 2; grid-column: 2; } }\n", i) > k; /* 節の閉じ括弧は最後の行の末尾（m5(37b-3)＝行頭は .nox-setup- だけ） */ })(),
});
const r = cssOk(css);
check("(1)(4) 選択肢は文字の幅より狭くならない（fit-content・入らない分は次の行）", r.seg);
check("(1) 席＝700px 以下はルールの欄の行を 1 つ使う", r.seat);
check("(2) メニュー＝700px 以下は 1 商品 1 枚（見出しの行を隠し・値段／バック／キープの名を欄の前に）", r.menu);
check("(3) 必要人数＝700px 以下は 4＋3（4 列）・欄の余白を詰める", r.need7);
check("ほか: 折り返し型の選択は 2 列（時給スライドなど）・スライドの段は 2 行・直すは折らない・理由の行の形", r.wrap2 && r.tier && r.fix && r.why);
check("700px の節の中に席・必要人数・段の決まり（PC の見た目は変えない）", r.in700);

check("(2) メニューの表に印（nox-setup-menutbl・data-menu-row・data-cell 6 つ・区分ごとの行）", wz.includes('<table className="nox-setup-menutbl"') && wz.includes('data-menu-row="1"') && ["on", "n", "p", "b", "keep", "act"].every((k) => wz.includes(`data-cell="${k}"`)) && wz.includes('data-menu-kindrow="1"'));
check("(3) 必要人数の欄の並びに印（nox-setup-need7）・PC は 7 列のまま", wz.includes('<div className="nox-setup-need7" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>'));
// (5) 理由の 1 行＝押せない条件と同じ並び
const dis = wz.match(/disabled=\{\(S\.step === 0 && !type\) \|\| \(S\.step === 2 && !S\.timeMode\) \|\| \(S\.step === 4 && okuriFlatBaseMissingOf\(S\)\)/);
check("(5) 次へが押せない条件は前のまま（3 つ）", !!dis);
check("(5) 理由の 1 行＝同じ 3 つ（タイプ・延長の付け方・送りの額）と始めるときの 4 つ（タイプ・オーナー・テンプレートの確認・送りの額）", wz.includes('S.step === 0 && !type ? "お店のタイプを選んでください（「お店のタイプ」）"') && wz.includes('S.step === 2 && !S.timeMode ? "「延長の付け方」で自動か手動を選んでください"') && wz.includes("S.step === 4 && okuriFlatBaseMissingOf(S) ? `「${OKURI_FLAT_BASE_LABEL}」を入れてください`") && wz.includes('!isOwner ? "初期設定はオーナーだけが始められます"') && wz.includes("tplBlocked ? tplBlocked"));
check("(5) 理由はボタンの上（固定バーの中の 1 行目・role=status）", wz.includes('<div className="nox-setup-foot" data-setup-foot="1"><div className="in">{nextWhy && <p className="why" data-setup-next-why="1" role="status">{nextWhy}</p>}'));
check("ほか: ノルマの「円／1 万円」は欄を 120 に・価格の調整の行は折り返す", wz.includes('width={pn.m === "per" && k === "sales" ? 120 : 90}') && wz.includes('fontSize: 12.5, flexWrap: "wrap" }} data-setup-tpl-adj="1">全体の価格を'));

// (6) 直す前の形は赤
const cut = (c: string) => c.slice(0, c.indexOf("/* ★2026-11-22（相談役 14:10 の 2-1・2-4）")) + c.slice(c.indexOf("@media (max-width: 430px) { .nox-setup-main div:has(> button[data-type])"));
const before = cssOk(cut(css));
check("(6) 直す前の CSS（節なし）はこの検査で赤", !before.seg && !before.seat && !before.menu && !before.need7 && !before.tier);

if (fails.length) { console.error(`verify:nox-setup375 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-setup375 OK ${pass} checks（初期設定の 375 の崩れ）`);
