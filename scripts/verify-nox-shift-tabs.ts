/*
 * verify:nox-shift-tabs — 裁定274（R15）シフト画面 5→3 タブの写像 lib/nox/shift/tabs.ts の係留（純関数・DB 不触）。
 *   ★裁定406（2026-10-22・便 SH-UI-b）: 上段＝今日／シフト作成／確定シフト・「シフト作成」は手順 4 段（build→submit→queue→publish）・
 *   旧 calendar は ③ の中・URL（?tab=make&step=n&period=）の往復＝tabFromSearch／searchOfTab・shift-board は ShiftTab 型＋手順 ol。
 *   npm run verify:nox-shift-tabs（env 不要）。f0 59 段目。
 *
 *  (1) 3 タブの順と語（今日／作る／確定）・各タブの中の旧キー（作る＝作成|仮シフト・確定＝承認待ち|確定シフト・今日は 1 択）
 *  (2) 旧キー 5 本が 1 本も落ちない＝viewOfTab が全キーを 3 タブのどれかに写像し、VIEW_TABS の和集合＝旧 5 キー
 *  (3) tabOfView＝現在のキーがそのタブの中なら据え置き・外なら先頭（作る→作成／確定→承認待ち）・today は today
 *  (4) 往復＝viewOfTab(tabOfView(v, t)) === v・tabOfView(viewOfTab(t), t) === t（深リンクの state を壊さない）
 *  (5) shift-board の実装が旧キー 5 本を state 型に持ち、tabs.ts を通している（逐語 grep）
 *  逆テスト 1 本（手動・1 回）: viewOfTab の calendar を "confirm" にする→st(2-2)／(4-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { LEGACY_SHIFT_TABS, SHIFT_VIEWS, VIEW_TABS, searchOfTab, stepOfTab, tabFromSearch, tabOfStep, tabOfView, viewOfTab, type ShiftTab, type ShiftView } from "../lib/nox/shift/tabs";
import { nextPeriodDefaults, overlappingPeriods, periodsOverlap, spanDays, addDays, mdOf } from "../lib/nox/shift/period";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1) ★裁定406
check("st(1-1) 3 タブの順と語＝今日／シフト作成／確定シフト（★裁定406）", JSON.stringify(SHIFT_VIEWS) === JSON.stringify([["today", "今日"], ["make", "シフト作成"], ["fixed", "確定シフト"]]), JSON.stringify(SHIFT_VIEWS));
check("st(1-2) シフト作成＝手順 4 段（期間を作る→提出一覧→シフト配置→公開シフト＝build→submit→queue→publish）", JSON.stringify(VIEW_TABS.make) === JSON.stringify([["build", "期間を作る"], ["submit", "提出一覧"], ["queue", "シフト配置"], ["publish", "公開シフト"]]), JSON.stringify(VIEW_TABS.make));
check("st(1-3) 確定シフト＝roster 1 択（手順を出さない）", JSON.stringify(VIEW_TABS.fixed) === JSON.stringify([["roster", "確定シフト"]]), JSON.stringify(VIEW_TABS.fixed));
check("st(1-4) 今日は 1 択（手順を出さない）", VIEW_TABS.today.length === 1 && VIEW_TABS.today[0][0] === "today");
// (2)
const all = (Object.values(VIEW_TABS).flat() as ReadonlyArray<readonly [ShiftTab, string]>).map(([k]) => k).sort();
check("st(2-1) VIEW_TABS の和集合＋旧 calendar＝7 キー（旧 5 本は 1 本も落ちない）", JSON.stringify([...all, "calendar"].sort()) === JSON.stringify([...LEGACY_SHIFT_TABS].sort()) && ["today", "queue", "build", "calendar", "roster"].every((k) => (LEGACY_SHIFT_TABS as readonly string[]).includes(k)), all.join(","));
check("st(2-2) viewOfTab: today→today・build／submit／queue／calendar／publish→make・roster→fixed", viewOfTab("today") === "today" && viewOfTab("build") === "make" && viewOfTab("submit") === "make" && viewOfTab("calendar") === "make" && viewOfTab("queue") === "make" && viewOfTab("publish") === "make" && viewOfTab("roster") === "fixed");
// (3)
check("st(3-1) tabOfView: 外から押すと先頭（make→build・fixed→roster・today→today）", tabOfView("make") === "build" && tabOfView("fixed") === "roster" && tabOfView("today") === "today");
check("st(3-2) tabOfView: 中のキーは据え置き（make,publish→publish・fixed,roster→roster）・旧 calendar は ③ queue", tabOfView("make", "publish") === "publish" && tabOfView("fixed", "roster") === "roster" && tabOfView("make", "calendar") === "queue");
check("st(3-3) tabOfView: 別タブのキーは無視して先頭（fixed,build→roster・make,roster→build）", tabOfView("fixed", "build") === "roster" && tabOfView("make", "roster") === "build");
// (4)
const views: ShiftView[] = ["today", "make", "fixed"];
check("st(4-1) 往復 viewOfTab(tabOfView(v,t))===v（全 v×t）", views.every((v) => LEGACY_SHIFT_TABS.every((t) => viewOfTab(tabOfView(v, t)) === v)));
check("st(4-2) 往復 tabOfView(viewOfTab(t),t)===t（旧キーの深リンクを壊さない・calendar だけ ③ queue に正規化）", LEGACY_SHIFT_TABS.every((t) => tabOfView(viewOfTab(t), t) === (t === "calendar" ? "queue" : t)));
// (4b) ★裁定406: 手順番号と URL
check("st(4-3) stepOfTab: build 1／submit 2／queue 3／calendar 3／publish 4・today／roster は null", stepOfTab("build") === 1 && stepOfTab("submit") === 2 && stepOfTab("queue") === 3 && stepOfTab("calendar") === 3 && stepOfTab("publish") === 4 && stepOfTab("today") === null && stepOfTab("roster") === null);
check("st(4-4) tabOfStep: 1〜4・範囲外／不正は 1（build）", tabOfStep(1) === "build" && tabOfStep("3") === "queue" && tabOfStep(4) === "publish" && tabOfStep(9) === "publish" && tabOfStep(0) === "build" && tabOfStep("x") === "build" && tabOfStep(null) === "build");
check("st(4-5) tabFromSearch: ?tab=make&step=3→queue・?tab=fixed→roster・?tab=make（step なし）→build・なし／不明→today", tabFromSearch("?tab=make&step=3") === "queue" && tabFromSearch("tab=fixed") === "roster" && tabFromSearch("?tab=make") === "build" && tabFromSearch("") === "today" && tabFromSearch("?tab=zzz") === "today");
check("st(4-6) searchOfTab: 他のクエリ保持・make は step・fixed／today は step 削除・period は渡したときだけ", searchOfTab("?ym=2026-10", "publish", "p1") === "?ym=2026-10&tab=make&step=4&period=p1" && searchOfTab("?step=2&period=p1", "roster") === "?tab=fixed" && searchOfTab("", "today") === "?tab=today");
check("st(4-7) URL 往復 tabFromSearch(searchOfTab(\"\", t))＝t（calendar→queue）", LEGACY_SHIFT_TABS.every((t) => tabFromSearch(searchOfTab("", t)) === (t === "calendar" ? "queue" : t)));
// (5)
const src = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("st(5-1) shift-board: state 型は ShiftTab（7 キー）・URL から初期化（tabFromSearch）・URL に写す（searchOfTab＋replaceState・URL 由来のキーが state に乗るまで書かない）", src.includes('useState<ShiftTab>("today")') && src.includes("const t0 = tabFromSearch(window.location.search); urlTabPending.current = t0; setTab(t0);") && src.includes("if (urlTabPending.current && tab !== urlTabPending.current) return;") && src.includes("searchOfTab(window.location.search, tab, focusPeriodId)") && src.includes("window.history.replaceState("));
check("st(5-2) shift-board: 3 タブは tabs.ts（SHIFT_VIEWS／VIEW_TABS／viewOfTab／tabOfView）を通す・手順 ol＝VIEW_TABS.make＋stepOfTab", src.includes('from "@/lib/nox/shift/tabs"') && src.includes("SHIFT_VIEWS.map(") && src.includes("viewOfTab(tab)") && src.includes("tabOfView(") && src.includes('<ol className="nox-steps"') && src.includes("VIEW_TABS.make.map(") && src.includes("stepOfTab(tab) === i + 1"));
check("st(5-3) shift-board: 旧 5 タブの nav・旧 seg（VIEW_TABS[viewOfTab(tab)].length > 1）は残っていない", !src.includes('[["today", "今日"], ["queue", "承認待ち"], ["build", "シフト作成"]') && !src.includes("VIEW_TABS[viewOfTab(tab)].length > 1"));
check("st(5-4) shift-board: 旧 calendar パネルは ③ queue と ④ publish でも描く・② 提出一覧／④ 公開シフト／確定シフトの期間切替パネルがある", src.includes('(tab === "calendar" || tab === "queue" || tab === "publish") && (') && src.includes('data-shift-submit="1"') && src.includes('data-shift-publish="1"') && src.includes('data-shift-fixed-periods="1"') && src.includes('data-shift-place-head="1"'));
check("st(5-5) shift-board: ① の公開ボタンは ④ へ送る（① から直接 published にしない）・作成ボタン＝「作成して募集を始める」・公開は ④ の shift_period_set", !src.includes('onClick={() => cur && void setPeriodStatus(cur, "published")}>スタッフに公開する') && src.includes('"作成して募集を始める"') && src.includes('await setPeriodStatus(p, "published"); openPeriodInStep(p, "roster");') && src.includes('await setPeriodStatus(p, "closed"); openPeriodInStep(p, "queue");'));
check("st(5-6) shift-board: 提出一覧は shift_wishes の kind／created_at を読む（2 経路とも）", (src.match(/\.select\("id, cast_id, date, start_hm, end_hm, status, kind, created_at"\)/g) ?? []).length === 2);

// (6) ★便 T（2026-09-18）: 計画期間の既定日付と重なり判定（lib/nox/shift/period.ts・純関数）。逆テスト＝periodsOverlap の `<=` を `<` にする→pe(6-2) 赤。
const EX = [{ start_date: "2026-09-15", end_date: "2026-09-30" }];
check("pe(6-1) 既定＝既存の最終日の翌日から同じ長さ（16 日）・締切は開始の前日", JSON.stringify(nextPeriodDefaults(EX, "2026-09-18")) === JSON.stringify({ start: "2026-10-01", end: "2026-10-16", deadline: "2026-09-30" }), JSON.stringify(nextPeriodDefaults(EX, "2026-09-18")));
check("pe(6-2) 重なり＝閉区間（末日と初日が同じ日でも重なる・DB の daterange '[]' && と同型）", periodsOverlap(EX[0], { start_date: "2026-09-30", end_date: "2026-10-05" }) && periodsOverlap(EX[0], { start_date: "2026-09-20", end_date: "2026-09-30" }) && !periodsOverlap(EX[0], { start_date: "2026-10-01", end_date: "2026-10-16" }));
check("pe(6-3) 既存なし＝今日の翌日から半月（15 日）・締切は開始の前日", JSON.stringify(nextPeriodDefaults([], "2026-09-18")) === JSON.stringify({ start: "2026-09-19", end: "2026-10-03", deadline: "2026-09-18" }));
check("pe(6-4) overlappingPeriods＝重なる既存だけ・未入力は 0 件・複数既存は最終日が最大のものを基準", overlappingPeriods(EX, "2026-09-20", "2026-09-30").length === 1 && overlappingPeriods(EX, "", "2026-09-30").length === 0 && nextPeriodDefaults([{ start_date: "2026-10-01", end_date: "2026-10-10" }, ...EX], "2026-09-18").start === "2026-10-11");
check("pe(6-5) 月またぎ・閏日: addDays／spanDays／mdOf", addDays("2026-12-31", 1) === "2027-01-01" && addDays("2028-02-28", 1) === "2028-02-29" && spanDays({ start_date: "2026-09-15", end_date: "2026-09-30" }) === 16 && mdOf("2026-09-05") === "9/5");
check("pe(6-6) 不正区間（start>end）は重ならない扱い（DB は 'bad range' で先に落ちる）", !periodsOverlap({ start_date: "2026-09-30", end_date: "2026-09-15" }, EX[0]));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-shift-tabs ALL PASS (${pass} assertions)`);
console.log("シフト 3 タブ(裁定274→406): 順と語 / 7 キーの写像（旧 5 欠落 0）/ tabOfView の据え置き・先頭 / 往復恒等 / 手順と URL / shift-board の結線（逐語）");
