/**
 * verify:nox-m149 — シフトの状態の説明を 1 枚の手順図に（2026-11-10 相談役＝外部レビュー）
 *  ① 手順図＝希望の受付 → 確認 → 確定 → 本人へ公開（components/nox/shift-flow.tsx・シフトの「作る」の手順の下に折りたたみ）
 *  ② 各一覧の状態の名前を段に対応（希望＝審査中／採用・確認待ち／採用・確定・期間＝作成中／募集中／配置中／公開済み・シフト＝planned／proposed／confirmed）
 *  ③ 実装に無い機能の説明（自動配置）を画面から削る
 *  ④ 確定したとき、その日を含む期間が未公開なら「まだ本人には公開されません」を 1 行
 */
import fs from "node:fs";
import { FLOW_LABEL, FLOW_STAGES, FLOW_STATE_NAMES, UNPUBLISHED_NOTE, confirmNoteOf, periodFlowStageOf, shiftFlowStageOf } from "../lib/nox/shift/flow";
import { WISH_STATE_LABEL } from "../lib/nox/shift/wish-state";
import { PERIOD_STAGE_LABEL } from "../lib/nox/shift/period-stage";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const J = JSON.stringify;
const src = (p: string) => fs.readFileSync(p, "utf8");

check("m149(1-1) 段＝4 つ（希望の受付 → 確認 → 確定 → 本人へ公開）", J(FLOW_STAGES.map((k) => FLOW_LABEL[k])) === J(["希望の受付", "確認", "確定", "本人へ公開"]));
const named = new Set(Object.values(FLOW_STATE_NAMES).flat());
const wishNames = [WISH_STATE_LABEL.pending, WISH_STATE_LABEL.accepted_wait, WISH_STATE_LABEL.accepted_fixed];
const periodNames = Object.values(PERIOD_STAGE_LABEL);
check("m149(2-1) 希望の状態（審査中／採用・確認待ち／採用・確定）と期間の状態（作成中／募集中／配置中／公開済み）がどれかの段に載る", [...wishNames, ...periodNames].every((x) => named.has(x)), [...wishNames, ...periodNames].filter((x) => !named.has(x)));
check("m149(2-2) シフトの status → 段＝planned／proposed は確認・confirmed は未公開なら確定・公開済みなら本人へ公開", shiftFlowStageOf("planned", false) === "check" && shiftFlowStageOf("proposed", true) === "check" && shiftFlowStageOf("confirmed", false) === "fixed" && shiftFlowStageOf("confirmed", true) === "public");
check("m149(2-3) 期間の status → 段＝作成中・募集中は希望の受付・配置中は確認・公開済みは本人へ公開", periodFlowStageOf("draft") === "wish" && periodFlowStageOf("open") === "wish" && periodFlowStageOf("closed") === "check" && periodFlowStageOf("published") === "public");
const SB = src("app/(manage)/shift/shift-board.tsx");
check("m149(1-2) シフトの「作る」に手順図（折りたたみ・今いる段＝先頭の期間の実効の段）", SB.includes('<Fold name="shift-flow" title="シフトの流れ"') && SB.includes("<ShiftFlow current={cur} storeDecides={storeDecides} />") && SB.includes("periodFlowStageOf(effectiveStageOf(periods[0], bizToday))"));
check("m149(2-4) 一覧の状態の札に段（title と data-flow-stage）＝3 か所", (SB.match(/title=\{shiftFlowTitleOf\(/g) ?? []).length === 3 && (SB.match(/data-flow-stage=\{shiftFlowStageOf\(/g) ?? []).length === 3);
const SF = src("components/nox/shift-flow.tsx");
check("m149(1-3) 手順図の部品＝ol・段ごとに名前・説明・状態の名前・今いる段は .on・店が決める店は希望の受付を薄く", SF.includes('<ol className="nox-shiftflow" aria-label="シフトの流れ"') && SF.includes('className={`${current === k ? "on" : ""}${storeDecides && k === "wish" ? " skip" : ""}`}') && SF.includes('{FLOW_STATE_NAMES[k].join("・")}'));
const visible = ["app/(manage)/casts/casts-board.tsx", "app/(manage)/shift/shift-board.tsx", "components/nox/shift-flow.tsx", "lib/nox/shift/flow.ts"].map((p) => [p, src(p).split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && !l.includes("{/*")).join("\n")] as const);
const auto = visible.filter(([, s]) => /自動配置の候補|自動で配置します/.test(s)).map(([p]) => p);
check("m149(3-1) 実装に無い「自動配置」の説明を画面に出さない（キャストのシフト希望の方式の注記を直した）", auto.length === 0 && src("app/(manage)/casts/casts-board.tsx").includes("キャストのスマホ（シフト希望／休み希望）に効きます"), auto);
check("m149(4-1) 未公開の確定＝「まだ本人には公開されません」・公開済みは何も足さない", confirmNoteOf(true).includes(UNPUBLISHED_NOTE) && UNPUBLISHED_NOTE.startsWith("まだ本人には公開されません") && confirmNoteOf(false) === "");
check("m149(4-2) 確定する 5 か所（希望の採用・一括採用・調整して確定・まとめて確定・1 件の確定）に 1 行", (SB.match(/confirmNoteOf\(/g) ?? []).length === 5);

if (fails.length) { console.error(`✗ verify:nox-m149 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m149 OK (${pass} checks)`);
console.log("M-149 シフトの流れ＝希望の受付→確認→確定→本人へ公開・状態の名前を段に対応・自動配置の説明を削除・確定時に未公開の 1 行");
