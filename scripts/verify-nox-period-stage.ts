/*
 * verify:nox-period-stage — 便 AU2（2026-09-24・週末バックログ 2）計画期間の進行段 lib/nox/shift/period-stage.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-period-stage（env 不要）。f0 67 段目。
 *
 *  (1) periodStageOf: draft／open／closed／published → 作成中／募集中／仮シフト調整／公開済み（4 語固定・未知は作成中）・裁定274 の 3 語と衝突しない
 *  (2) stageIndexOf: 0〜3・未知 0／periodBandText: 「M/D〜M/D・締切 M/D」（締切なし「—」）
 *  (3) periodIndexOfDate: 両端含む・無ければ -1／periodToneOf: 4 色循環・-1 は null／isUnpublishedDay: 期間あり かつ published でない
 *  (4) 配線（逐語 grep）: shift-board が periodStageOf／periodIndexOfDate／isUnpublishedDay を通す
 *  逆テスト 1 本（手動・1 回）: PERIOD_STAGE_LABEL.closed を「締切」にする→ps(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { PERIOD_STAGES, isUnpublishedDay, periodBandText, periodIndexOfDate, periodStageOf, periodToneOf, stageIndexOf } from "../lib/nox/shift/period-stage";
import { SHIFT_VIEWS } from "../lib/nox/shift/tabs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const P = (id: string, s: string, e: string, w: string | null, status: string) => ({ id, start_date: s, end_date: e, wish_deadline: w, status });
const A = P("a", "2026-10-01", "2026-10-15", "2026-09-25", "open");
const B = P("b", "2026-10-16", "2026-10-31", null, "published");
const C = P("c", "2026-11-01", "2026-11-15", "2026-10-25", "closed");

// (1)
check("ps(1-1) 4 語固定: draft 作成中／open 募集中／closed 仮シフト調整／published 公開済み", periodStageOf("draft") === "作成中" && periodStageOf("open") === "募集中" && periodStageOf("closed") === "仮シフト調整" && periodStageOf("published") === "公開済み");
check("ps(1-2) 未知・null・undefined は作成中（最初の段）", periodStageOf("x") === "作成中" && periodStageOf(null) === "作成中" && periodStageOf(undefined) === "作成中");
const tabWords = SHIFT_VIEWS.map(([, l]) => l);
check("ps(1-3) 裁定274 の 3 タブ語（今日／作る／確定）と衝突しない・段は 4", PERIOD_STAGES.length === 4 && PERIOD_STAGES.every((s) => !tabWords.includes(periodStageOf(s))), tabWords.join(","));
// (2)
check("ps(2-1) stageIndexOf 0〜3・未知 0", stageIndexOf("draft") === 0 && stageIndexOf("open") === 1 && stageIndexOf("closed") === 2 && stageIndexOf("published") === 3 && stageIndexOf("zzz") === 0);
check("ps(2-2) periodBandText 「10/1〜10/15・締切 9/25」・締切なし「—」", periodBandText(A) === "10/1〜10/15・締切 9/25" && periodBandText(B) === "10/16〜10/31・締切 —");
// (3)
check("ps(3-1) periodIndexOfDate 両端含む（10/1→0・10/15→0・10/16→1・11/16→-1）", periodIndexOfDate([A, B, C], "2026-10-01") === 0 && periodIndexOfDate([A, B, C], "2026-10-15") === 0 && periodIndexOfDate([A, B, C], "2026-10-16") === 1 && periodIndexOfDate([A, B, C], "2026-11-16") === -1 && periodIndexOfDate([], "2026-10-01") === -1);
check("ps(3-2) periodToneOf 4 色循環・-1 は null", periodToneOf(0) === "var(--goldface2)" && periodToneOf(4) === "var(--goldface2)" && periodToneOf(3) === "var(--card2)" && periodToneOf(-1) === null);
check("ps(3-3) isUnpublishedDay: open の日 true・published の日 false・期間なしの日 false", isUnpublishedDay([A, B, C], "2026-10-05") && !isUnpublishedDay([A, B, C], "2026-10-20") && !isUnpublishedDay([A, B, C], "2026-12-01") && isUnpublishedDay([A, B, C], "2026-11-03"));
// (4)
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("ps(4-1) shift-board: 進行の帯（periodStageOf・stageIndexOf）・期間の帯と凡例（periodToneOf）・セル背景（periodIndexOfDate）・確定シフトの「未確定」（isUnpublishedDay）", /periodStageOf\(/.test(sb) && /stageIndexOf\(/.test(sb) && /periodToneOf\(/.test(sb) && /periodIndexOfDate\(/.test(sb) && /isUnpublishedDay\(/.test(sb) && /未確定/.test(sb));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-period-stage OK (${pass} checks)`);
