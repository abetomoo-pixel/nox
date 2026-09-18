/*
 * verify:nox-shift-tabs — 裁定274（R15）シフト画面 5→3 タブの写像 lib/nox/shift/tabs.ts の係留（純関数・DB 不触）。
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
import { LEGACY_SHIFT_TABS, SHIFT_VIEWS, VIEW_TABS, tabOfView, viewOfTab, type ShiftTab, type ShiftView } from "../lib/nox/shift/tabs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1)
check("st(1-1) 3 タブの順と語＝今日／作る／確定", JSON.stringify(SHIFT_VIEWS) === JSON.stringify([["today", "今日"], ["make", "作る"], ["confirm", "確定"]]), JSON.stringify(SHIFT_VIEWS));
check("st(1-2) 作る＝作成|仮シフト（build→calendar）", JSON.stringify(VIEW_TABS.make) === JSON.stringify([["build", "作成"], ["calendar", "仮シフト"]]), JSON.stringify(VIEW_TABS.make));
check("st(1-3) 確定＝承認待ち|確定シフト（queue→roster）", JSON.stringify(VIEW_TABS.confirm) === JSON.stringify([["queue", "承認待ち"], ["roster", "確定シフト"]]), JSON.stringify(VIEW_TABS.confirm));
check("st(1-4) 今日は 1 択（seg を出さない）", VIEW_TABS.today.length === 1 && VIEW_TABS.today[0][0] === "today");
// (2)
const all = (Object.values(VIEW_TABS).flat() as ReadonlyArray<readonly [ShiftTab, string]>).map(([k]) => k).sort();
check("st(2-1) VIEW_TABS の和集合＝旧 5 キー（重複なし・欠落なし）", JSON.stringify(all) === JSON.stringify([...LEGACY_SHIFT_TABS].sort()), all.join(","));
check("st(2-2) viewOfTab: today→today・build／calendar→make・queue／roster→confirm", viewOfTab("today") === "today" && viewOfTab("build") === "make" && viewOfTab("calendar") === "make" && viewOfTab("queue") === "confirm" && viewOfTab("roster") === "confirm");
// (3)
check("st(3-1) tabOfView: 外から押すと先頭（make→build・confirm→queue・today→today）", tabOfView("make") === "build" && tabOfView("confirm") === "queue" && tabOfView("today") === "today");
check("st(3-2) tabOfView: 中のキーは据え置き（make,calendar→calendar・confirm,roster→roster）", tabOfView("make", "calendar") === "calendar" && tabOfView("confirm", "roster") === "roster");
check("st(3-3) tabOfView: 別タブのキーは無視して先頭（confirm,build→queue・make,roster→build）", tabOfView("confirm", "build") === "queue" && tabOfView("make", "roster") === "build");
// (4)
const views: ShiftView[] = ["today", "make", "confirm"];
check("st(4-1) 往復 viewOfTab(tabOfView(v,t))===v（全 v×t）", views.every((v) => LEGACY_SHIFT_TABS.every((t) => viewOfTab(tabOfView(v, t)) === v)));
check("st(4-2) 往復 tabOfView(viewOfTab(t),t)===t（旧キーの深リンクを壊さない）", LEGACY_SHIFT_TABS.every((t) => tabOfView(viewOfTab(t), t) === t));
// (5)
const src = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("st(5-1) shift-board: state 型は旧 5 キーのまま", src.includes('useState<"today" | "calendar" | "build" | "queue" | "roster">("today")'));
check("st(5-2) shift-board: 3 タブは tabs.ts（SHIFT_VIEWS／VIEW_TABS／viewOfTab／tabOfView）を通す", src.includes('from "@/lib/nox/shift/tabs"') && src.includes("SHIFT_VIEWS.map(") && src.includes("viewOfTab(tab)") && src.includes("tabOfView("));
check("st(5-3) shift-board: 旧 5 タブの nav（today→queue→build→calendar→roster の 5 本並び）は残っていない", !src.includes('[["today", "今日"], ["queue", "承認待ち"], ["build", "シフト作成"]'));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-shift-tabs ALL PASS (${pass} assertions)`);
console.log("シフト 3 タブ(裁定274): 順と語 / 旧 5 キーの写像（欠落 0）/ tabOfView の据え置き・先頭 / 往復恒等 / shift-board の結線（逐語）");
