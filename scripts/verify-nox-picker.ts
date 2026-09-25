/*
 * verify:nox-picker — 裁定301（2026-09-25）: picker の折りたたみ型の係留（DB 不触・env 不要）。
 *   npm run verify:nox-picker。f0 74 段目。
 *
 *  (1) 純関数 lib/nox/ui/picker-view.ts: collapsedOf（9 件で折りたたみ・8 件で展開）・openSliceOf（上限 8＋他 n）・moreLabelOf・nextActiveOf（↑↓＝端で止まる）
 *  (2) 配線（逐語 grep）: picker.tsx＝閾値は定数 PICKER_COLLAPSE_AT（prop なし）・折りたたみ時のリストは position absolute（親の高さ不変）・aria-expanded・
 *      Escape／↑↓／Enter・外側クリック（document mousedown）・選択で閉じる・検索欄のフォーカス／入力で開く・259 R17 の性質（dense・onClear・disabled・empty）は不変
 *  (3) 呼び出し側の grep 件数 pin（許可列挙・裁定260）＝<Picker 13 箇所／11 ファイル（既存の呼び出し側はコードを変えない＝301-3）
 *  (4) 301-4: advance-okuri-form＝見出し→12→ラベル→6→picker→16→フォーム行→8→注記・カード下端 16／deduction-panel＝節見出し 上 24・下 12（値は 4/8/12/16/24 のみ）
 *  逆テスト 1 本（手動・1 回）: PICKER_COLLAPSE_AT を 1 にする→pk(1-1) 赤（8 件が折りたたみになる）・戻して緑。
 */
import fs from "node:fs";
import { PICKER_COLLAPSE_AT, PICKER_OPEN_MAX, collapsedOf, moreLabelOf, nextActiveOf, openSliceOf } from "../lib/nox/ui/picker-view";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1)
check("pk(1-1) collapsedOf: 9 件以上で折りたたみ・8 件以下は展開（閾値 9・上限 8）", PICKER_COLLAPSE_AT === 9 && PICKER_OPEN_MAX === 8 && collapsedOf(9) && collapsedOf(30) && !collapsedOf(8) && !collapsedOf(0));
const s12 = openSliceOf(Array.from({ length: 12 }, (_, i) => i));
const s5 = openSliceOf([1, 2, 3, 4, 5]);
check("pk(1-2) openSliceOf: 12 件→8 行＋他 4／5 件→5 行＋他 0", s12.rows.length === 8 && s12.more === 4 && s5.rows.length === 5 && s5.more === 0);
check("pk(1-3) moreLabelOf: 4→「他 4 名・絞り込んでください」・0→null", moreLabelOf(4) === "他 4 名・絞り込んでください" && moreLabelOf(0) === null);
check("pk(1-4) nextActiveOf: 未選択から ↓＝0・↑＝末尾・端で止まる・0 行は -1", nextActiveOf(-1, 1, 8) === 0 && nextActiveOf(-1, -1, 8) === 7 && nextActiveOf(7, 1, 8) === 7 && nextActiveOf(0, -1, 8) === 0 && nextActiveOf(3, 1, 8) === 4 && nextActiveOf(2, 1, 0) === -1);

// (2)
const pk = fs.readFileSync("components/nox/picker.tsx", "utf8");
check("pk(2-1) picker.tsx: 閾値は定数（collapsedOf(items.length)・prop に閾値なし）・折りたたみ時のリストは position absolute・aria-expanded・aria-controls",
  pk.includes("collapsedOf(items.length)") && !/collapseAt|collapse_at|threshold/.test(pk) && pk.includes('position: "absolute"') && pk.includes("aria-expanded={") && pk.includes("aria-controls="));
check("pk(2-2) picker.tsx: Escape で閉じる・ArrowDown／ArrowUp で nextActiveOf・Enter で選択・外側クリック（document mousedown）で閉じる・選択で閉じる・フォーカス／入力で開く",
  pk.includes('e.key === "Escape"') && pk.includes('e.key === "ArrowDown"') && pk.includes('e.key === "ArrowUp"') && pk.includes('e.key === "Enter"') && pk.includes("nextActiveOf(") && pk.includes('document.addEventListener("mousedown"') && pk.includes("pick(") && pk.includes("onFocus={() => setOpen(true)}") && pk.includes("openSliceOf(shown)") && pk.includes("moreLabelOf("));
check("pk(2-3) 259 R17 の性質は不変: dense／onClear（×）／disabled（opacity .55・not-allowed）／empty／limit 30／選択中の表示・全展開（8 件以下）の一覧は従来の grid",
  pk.includes("onClear?: () => void") && pk.includes("disabled = false") && pk.includes("limit = 30") && pk.includes("opacity: 0.55") && pk.includes('aria-label="選択を解除"') && pk.includes("{shown.length === 0 && <p") && pk.includes("maxHeight: dense ? 220 : 300"));

// (3) 呼び出し側の pin（許可列挙）
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith(".tsx") ? [`${dir}/${d.name}`] : []);
const files = [...walk("app"), ...walk("components")];
const hits = files.map((f) => [f, (fs.readFileSync(f, "utf8").match(/<Picker\b/g) || []).length] as const).filter(([, n]) => n > 0).sort((a, b) => a[0].localeCompare(b[0]));
const EXPECT: Array<[string, number]> = [
  ["app/(manage)/analytics/analytics-board.tsx", 1], ["app/(manage)/customers/[id]/customer-detail.tsx", 1], ["app/(manage)/customers/customers-board.tsx", 1],
  ["app/(manage)/master/cast-comp/comp-sections.tsx", 1], ["app/(manage)/register/bottle-keep-panel.tsx", 2], ["app/(manage)/register/register-board.tsx", 1],
  ["app/(manage)/register/reservation-panel.tsx", 2], ["app/(manage)/shift/shift-board.tsx", 1], ["app/(manage)/shift/staff-place-by-staff.tsx", 1],
  ["app/mine/drink-claim-form.tsx", 1], ["components/nox/advance-okuri-form.tsx", 1], // cast-picker.tsx は <PickerBadge（型）だけ＝<Picker の JSX は無い
];
check("pk(3-1) <Picker の呼び出し＝13 箇所／11 ファイル（許可列挙・呼び出し側は 301 でコードを変えない）", JSON.stringify(hits) === JSON.stringify(EXPECT) && hits.reduce((a, [, n]) => a + n, 0) === 13, JSON.stringify(hits));

// (4) 301-4 の余白
const ao = fs.readFileSync("components/nox/advance-okuri-form.tsx", "utf8");
const dp = fs.readFileSync("app/(manage)/master/deduction-panel.tsx", "utf8");
check("pk(4-1) advance-okuri-form: 見出し→12・ラベル→6・picker→16・フォーム行→8→注記・カード下端 16（値は 4/8/12/16/24 のみ）",
  ao.includes('margin: "0 0 12px"') && ao.includes("marginBottom: 6") && ao.includes("marginBottom: 16") && ao.includes('margin: "8px 0 0"') && ao.includes("paddingBottom: 16") && !/[^0-9](2|3|5|7|9|10|11|13|14|15|18|20)px/.test(ao.replace(/fontSize: [0-9.]+|width: [0-9]+|size=\{[0-9]+\}|borderRadius: [0-9]+|padding: "[0-9]+px [0-9]+px"|minmax\([^)]*\)/g, "")));
check("pk(4-2) deduction-panel: 節見出し「天引き（前借り・送り実費）」の上 24（外側 div marginTop 24）・下 12（h2 margin 0 0 12px）", dp.includes("<div style={{ marginTop: 24 }}>") && dp.includes('<h2 style={{ ...t.pheadH1, fontSize: 16, margin: "0 0 12px" }}>天引き（前借り・送り実費）</h2>'));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-picker OK (${pass} checks)`);
console.log("picker 折りたたみ型(裁定301): 9 件で畳む・8 件で展開・上限 8＋他 n・↑↓ Enter Escape・外側クリック・絶対配置・259 の性質不変・呼び出し側 13/11 pin・301-4 の余白");
