/*
 * verify:nox-plan1116 — 待遇プランの選び方（Agoora 確定 2026-11-16 ■7）。DB 不触・env 不要＝逐語 pin。
 *   npm run verify:nox-plan1116。
 *  p(1) プランはボタンの並び（select をやめた・「新規プラン…」の選択肢は無い）・新しく作る入口は「＋報酬プランを追加」だけ。
 *  p(2) 開いたときは店の既定のプラン（settings_json.default_plan_id）・無ければ先頭の有効プラン。
 *  p(3) 375 でも編集中のプラン名を 1 行で出す（折り返し可・既定の印）。
 */
import fs from "node:fs";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean) { if (ok) pass++; else fails.push(label); }
const pb = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-board.tsx", "utf8");
check("p(1-1) select と「新規プラン…」が無い・ボタンの並び（radiogroup）", !pb.includes("<select") && !pb.includes("新規プラン…") && pb.includes('role="radiogroup" aria-label="編集するプラン"') && pb.includes("onClick={() => setSelId(p.id)} data-plan-chip={p.id}"));
check("p(1-2) 新しく作る入口は「＋報酬プランを追加」だけ（setSelId(null) はこのボタンだけ）", (pb.match(/setSelId\(null\)/g) ?? []).length === 1 && pb.includes('onClick={() => { setSelId(null); setTab("base"); }} style={{ ...t.btnGhost, ...t.btnSm }}>＋ 報酬プランを追加</button>'));
check("p(2-1) 開いたときは店の既定のプラン（無ければ先頭の有効プラン）", pb.includes("const first = (defaultPlanId ? data.plans.find((p) => p.id === defaultPlanId) : undefined) ?? data.plans.find((p) => p.is_active);"));
check("p(3-1) 編集中のプラン名の行（折り返し可・既定の印）", pb.includes('data-plan-editing="1">編集中：<b style={{ fontSize: 16, color: "var(--champ)", fontWeight: 900, overflowWrap: "anywhere" }}>{sel ? sel.name : "新しいプラン"}</b>') && pb.includes('{p.name}{p.id === defaultPlanId ? "（既定）" : ""}'));
// ★2026-11-16（Agoora 17:50）: スマホのスライドの段＝2 行（読めない金額）・件数の段に売上の額が残る注意（値は変えない）
{ const cs = fs.readFileSync("app/(manage)/master/cast-comp/comp-sections.tsx", "utf8"); const css = fs.readFileSync("app/globals.css", "utf8");
  check("p(4-1) 641px 以下＝1 段を 2 行（n段・判定・以上／→ 時給・時給・−）・入力欄は残りの幅いっぱい", css.includes(".nox-sliderow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto;") && css.includes(".nox-sliderow > .nox-unit, .nox-sliderow .nox-money { width: 100% !important; min-width: 0; }"));
  check("p(4-2) 件数の段に 1,000 以上＝注意（data-slide-count-suspect）・値と保存の形は不変", cs.includes("export const SLIDE_COUNT_SUSPECT_AT = 1000;") && cs.includes('{basis === "count" && rows.some((r) => r.at >= SLIDE_COUNT_SUSPECT_AT) && <div data-slide-count-suspect="1">') && cs.includes("const set = (i: number, key: \"at\" | \"wage\", v: number) => {")); }
if (fails.length) { console.error(`verify:nox-plan1116 FAIL ${fails.length} / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-plan1116 OK (${pass} checks)`);
console.log("待遇プランの選び方（■7）: ボタンの並び・既定のプランを選んだ状態・＋報酬プランを追加だけ・編集中の名前");
