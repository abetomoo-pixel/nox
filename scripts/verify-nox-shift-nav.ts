/*
 * verify:nox-shift-nav — 裁定306（2026-09-25・スマホ実機の崩れ一式）の L1／L2 の係留（DB 不触・env 不要）。
 *   npm run verify:nox-shift-nav。f0 76 段目。
 *
 *  (1) 純関数 lib/nox/ui/month-nav.ts: ymLabelOf「YYYY年M月」／ymShift（年跨ぎ）／ymFromSearch（形が正しいときだけ）／ymSearchOf（他クエリ保持）／
 *      recruitNoteOf（募集中の期間の月≠表示月→「募集期間: M月」・同じ月は null・複数月は「・」）／outOfPeriodNoteOf（/mine: 活性 0 日→注記・null＝RPC 未適用は注記なし）／
 *      staffCellCompactOf（「早 0/0」の 1 行ずつ・最大 2・残りは +n）
 *  (2) 配線（逐語 grep）: 確定タブ・「配置を組む」・/mine が同じ部品 MonthNav を import（306-6）・sticky（306-1）・?ym＝useYmQuery（3 画面）・募集期間注記＝recruitNoteOf（306-2）・
 *      「＋ キャスト別にまとめて追加」は表示月に追従（306-2）・旧 shiftMonth なし・/mine は outOfPeriodNoteOf と ?ym 優先（306-4）
 *  (3) 崩れ（逐語 grep＋CSS）: 306-3／306-8 .nox-plantools（≤899 は column・seg は width 100%）・306-5 未確定＝.nox-cald--unpub（≤899 は border-top 3px・バッジは非表示）＋凡例「帯＝未確定」・
 *      絶対配置のバッジ 0・306-7 期間カード .nox-periodcard（pc-acts の button は writing-mode horizontal・nowrap）・フォーム .nox-periodform（pf-row 2＋pf-acts）・状態は SegSelect（PERIOD_ST_OPTIONS・Picker 0）・
 *      「作成」は pf-acts の最後・306-10 staff-shift-manage は staffCellCompactOf（.nox-sscell-narrow は ≤899 のみ・nowrap）
 *  逆テスト（手動・各 1 回）: ymLabelOf の「年」を外す→sn(1-1) 赤／shift-board の nox-plantools を外す→sn(3-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { outOfPeriodNoteOf, recruitNoteOf, staffCellCompactOf, ymFromSearch, ymLabelOf, ymSearchOf, ymShift } from "../lib/nox/ui/month-nav";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1)
check("sn(1-1) ymLabelOf: 2026-09→2026年9月・2026-12→2026年12月・形が違えばそのまま", ymLabelOf("2026-09") === "2026年9月" && ymLabelOf("2026-12") === "2026年12月" && ymLabelOf("2026/09") === "2026/09");
check("sn(1-2) ymShift: ±1・年跨ぎ（2026-12+1＝2027-01・2026-01−1＝2025-12）・+13", ymShift("2026-12", 1) === "2027-01" && ymShift("2026-01", -1) === "2025-12" && ymShift("2026-09", 13) === "2027-10");
check("sn(1-3) ymFromSearch: ?ym=2026-10→採用・形が違う（2026-13／2026-9／abc）や無しは null・他のクエリと同居可", ymFromSearch("?ym=2026-10") === "2026-10" && ymFromSearch("?a=1&ym=2026-10") === "2026-10" && ymFromSearch("?ym=2026-13") === null && ymFromSearch("?ym=2026-9") === null && ymFromSearch("?ym=abc") === null && ymFromSearch("") === null);
check("sn(1-4) ymSearchOf: 他のクエリを保持して ym を差し替え・空なら ?ym だけ", ymSearchOf("?a=1&ym=2026-09", "2026-10") === "?a=1&ym=2026-10" && ymSearchOf("", "2026-10") === "?ym=2026-10");
const P = [{ start_date: "2026-10-01", end_date: "2026-10-15", status: "open" }, { start_date: "2026-09-16", end_date: "2026-09-30", status: "published" }];
check("sn(1-5) recruitNoteOf: open の期間の月≠表示月→「募集期間: 10月」・同じ月は null・open なし（published だけ）は null・月跨ぎは「10月・11月」",
  recruitNoteOf(P, "2026-09") === "募集期間: 10月" && recruitNoteOf(P, "2026-10") === null && recruitNoteOf([P[1]], "2026-09") === null
  && recruitNoteOf([{ start_date: "2026-10-20", end_date: "2026-11-05", status: "open" }], "2026-09") === "募集期間: 10月・11月");
check("sn(1-6) outOfPeriodNoteOf: 活性日あり→null・periods null（RPC 未適用）→null・募集なし→「募集中の期間がありません…」・期間外→「この月は提出できる期間の外です（募集期間: 10月）」",
  outOfPeriodNoteOf(3, [P[0]], "2026-09") === null && outOfPeriodNoteOf(0, null, "2026-09") === null && outOfPeriodNoteOf(0, [], "2026-09")?.includes("募集中の期間がありません") === true
  && outOfPeriodNoteOf(0, [P[0]], "2026-09") === "この月は提出できる期間の外です（募集期間: 10月）");
const cc = staffCellCompactOf([{ name: "早番", n: 1, m: 2 }, { name: "遅番", n: 0, m: 0 }, { name: "中番", n: 2, m: 2 }]);
check("sn(1-7) staffCellCompactOf: 「早 1/2」「遅 0/0」の 2 行＋more 1・2 枠以下は more 0", JSON.stringify(cc.lines) === JSON.stringify(["早 1/2", "遅 0/0"]) && cc.more === 1 && staffCellCompactOf([{ name: "早番", n: 0, m: 0 }]).more === 0);

// (2) 配線
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
const wf = fs.readFileSync("app/mine/wishes/wish-form.tsx", "utf8");
const mn = fs.readFileSync("components/nox/month-nav.tsx", "utf8");
const ssm = fs.readFileSync("app/(manage)/shift/staff-shift-manage.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
check("sn(2-1) 306-6: 確定タブ（roster）・カレンダー・「配置を組む」・/mine が同じ部品 MonthNav を import（shift-board 3 箇所・wish-form 1 箇所）・部品は ‹ › 今月・aria-label",
  sb.includes('from "@/components/nox/month-nav"') && wf.includes('from "@/components/nox/month-nav"') && (sb.match(/<MonthNav /g) || []).length === 3 && (wf.match(/<MonthNav /g) || []).length === 1
  && mn.includes('aria-label="前の月"') && mn.includes('aria-label="次の月"') && mn.includes(">今月</button>") && mn.includes("ymLabelOf(ym)"));
check("sn(2-2) 306-1: 見出しは sticky（3 画面とも sticky・CSS .nox-monthnav--sticky は position: sticky）", (sb.match(/<MonthNav [^>]*sticky/g) || []).length === 3 && mn.includes("nox-monthnav--sticky") && /\.nox-monthnav--sticky \{ position: sticky;/.test(css));
check("sn(2-3) 306-1／306-2: 月 state は ?ym と同期（useYmQuery を shift-board と wish-form が呼ぶ・replaceState・/mine は ?ym を initialMonthOf より優先）・旧 shiftMonth なし",
  sb.includes("useYmQuery(month, setMonth)") && wf.includes("useYmQuery(month, setMonth)") && mn.includes("window.history.replaceState(") && wf.includes("ymFromSearch(window.location.search) ?? initialMonthOf(ps, today)") && !sb.includes("shiftMonth("));
check("sn(2-4) 306-2: 「配置を組む」に募集期間の注記（recruitNoteOf(periodsAll, month)）・「＋ キャスト別にまとめて追加」は表示月に追従（setAddDate(…`${month}-01`)）",
  sb.includes("note={recruitNoteOf(periodsAll, month)}") && sb.includes("setAddDate(month === bizToday.slice(0, 7) ? bizToday : `${month}-01`)"));
check("sn(2-5) 306-4: /mine は outOfPeriodNoteOf(active.size, periods, month) を注記に・案内文は right", wf.includes("note={outOfPeriodNoteOf(active.size, periods, month)}") && wf.includes("right={<span"));

// (3) 崩れ
check("sn(3-1) 306-3／306-8: 配置ツールは .nox-plantools（build と roster の 2 箇所）・CSS ≤899 は column・seg は width 100%・ボタンは width 100%",
  (sb.match(/className="nox-plantools"|className="nox-noprint nox-plantools"/g) || []).length === 2 && /@media \(max-width: 899px\) \{\s*\.nox-plantools \{ margin-left: 0; width: 100%; flex-direction: column;/.test(css) && css.includes(".nox-plantools .nox-seg { width: 100%; display: flex; }") && css.includes(".nox-plantools > button { width: 100%; }"));
check("sn(3-2) 306-5: 未確定＝.nox-cald--unpub（≤899 は border-top 3px・.nox-cald-unpub は非表示）・凡例「帯＝未確定」（≤899 のみ）・絶対配置のバッジ 0",
  sb.includes('unpublished ? "nox-cald--unpub" : ""') && sb.includes('<span className="nox-cald-unpub">未確定</span>') && sb.includes("帯＝未確定（期間が未公開）") && !sb.includes('position: "absolute", top: 3, right: 5')
  && css.includes(".nox-cald.nox-cald--unpub { border-top: 3px solid var(--gold2); }") && css.includes(".nox-cald .nox-cald-unpub { display: none; }") && css.includes(".nox-unpub-legend { display: block; }"));
check("sn(3-3) 306-7: 期間カード .nox-periodcard（pc-main 縦 2 段＝pc-sub・pc-acts の 編集／削除は横書き nowrap）・縦書き 0",
  sb.includes('className="nox-periodcard"') && sb.includes('className="pc-sub"') && sb.includes('className="pc-acts"') && css.includes(".nox-periodcard .pc-acts button { writing-mode: horizontal-tb; white-space: nowrap; }") && !/writing-mode:\s*vertical/.test(sb) && !/writing-mode: vertical/.test(css));
check("sn(3-4) 306-7: 新規フォーム .nox-periodform＝pf-row 2 行（開始／終了・希望締切／状態）＋pf-acts（作成は最後＝右端）・状態は SegSelect（PERIOD_ST_OPTIONS）・shift-board に <Picker 0",
  sb.includes('className="nox-periodform"') && (sb.match(/className="pf-row"/g) || []).length === 2 && sb.includes('className="pf-acts"') && sb.includes("<SegSelect value={pStatus} onChange={(v) => setPStatus(v)} options={PERIOD_ST_OPTIONS}") && !sb.includes("<Picker")
  && /className="pf-acts">[\s\S]*?やめる<\/button>[\s\S]*?\{pEditId \? "更新" : "作成"\}<\/button>\s*<\/div>/.test(sb) && css.includes(".nox-periodform .pf-acts { display: flex; justify-content: flex-end; gap: 8px; }"));
check("sn(3-5) 306-10: staff-shift-manage は staffCellCompactOf（.nox-sscell-narrow＝≤899 のみ・nowrap・wide は ≤899 で非表示）",
  ssm.includes("staffCellCompactOf(rows)") && ssm.includes('className="nox-sscell-narrow num"') && ssm.includes('className="nox-sscell-wide"') && css.includes(".nox-sscell-narrow { display: none; }") && css.includes(".nox-sscell-wide { display: none !important; }") && css.includes(".nox-sscell-narrow { display: block; white-space: nowrap;"));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-shift-nav OK (${pass} checks)`);
console.log("裁定306 L1／L2: 年月見出し MonthNav の共用（3 画面）・?ym 同期・募集期間／期間外の注記・配置ツール 1 行×2・未確定の帯＋凡例・期間カード縦 2 段＋横書きボタン・状態 SegSelect・スタッフ月セル圧縮");
