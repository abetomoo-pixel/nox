/*
 * verify:nox-shift-autoassign — 自動配置 純関数（lib/nox/shift-autoassign.ts）の係留＝段60。
 *   npm run verify:nox-shift-autoassign（★DB 非依存・env 不要＝donor の verify 流儀）
 *
 * 正本: docs/NOX_SD設計書v1.md §4（2鍵・need 単層・1日1枠・max_consec ガード・
 *       shortages(日×帯)・warnings）。
 *
 * 観点:
 *  1 決定性（同一入力2回で同一出力＝JSON 一致・入力配列の順序保存も確認）
 *  2 2鍵の順序（①min_month_min 未達優先・②見込分昇順＝公平・rules null で鍵①スキップ・同値は安定）
 *  3 1日1枠（同日複数 wish は1本のみ・既存行がある cast は候補外＝SD-9）
 *  4 連勤ガード（max_consec_days 超の wish は hard 除外→unassigned・null=無制限）
 *  5 need 充足/不足の境界（required ちょうど・不足 short・既存被覆の差し引き・0 need スキップ）
 *  6 帯交差（半開区間＝RPC overlap 同式・26:00 の 24h 超表記・境界の非交差）
 *  7 定休日（wish が unassigned へ・shortage も出ない）
 *  8 warnings（under_min_month_min の式と文言・min null で空）
 */
import { autoAssign, type AutoAssignInput } from "../lib/nox/shift-autoassign";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const open = () => false; // 全日営業
const W = (id: string, castId: string, date: string, s = "20:00", e = "26:00") =>
  ({ id, castId, date, startHm: s, endHm: e });
const B = (dow: number, fromMin: number, toMin: number, required: number) => ({ dow, fromMin, toMin, required });
// 2026-09-09 は水曜（dow=3）
const D = "2026-09-09";

function base(over?: Partial<AutoAssignInput>): AutoAssignInput {
  return {
    startDate: D, endDate: D,
    needs: [B(3, 0, 1440, 1)],
    wishes: [], existing: [], monthMinutes: {},
    rules: null, isClosedDay: open,
    ...over,
  };
}

// ── 1 決定性 ──
{
  const input = base({
    needs: [B(3, 0, 1440, 2)],
    wishes: [W("w1", "A", D), W("w2", "B", D), W("w3", "C", D)],
    monthMinutes: { A: 100, B: 100, C: 100 }, // 同値＝安定ソートの実証
  });
  const r1 = autoAssign(input);
  const r2 = autoAssign(input);
  eq("1 決定性（同一入力2回で同一出力）", r1, r2);
  eq("1 同値タイは入力順（w1,w2 が先着）", r1.assignWishIds, ["w1", "w2"]);
  eq("1 入力 wishes 配列が破壊されない", input.wishes.map((w) => w.id), ["w1", "w2", "w3"]);
}

// ── 2 2鍵の順序 ──
{
  // ① 未達優先: A は 200分（未達 6000 未満）・B は 9000分（達）→ 枠1 なら A
  const r = autoAssign(base({
    wishes: [W("wB", "B", D), W("wA", "A", D)], // 入力順は B が先＝鍵が効かなければ B が勝つ
    monthMinutes: { A: 200, B: 9000 },
    rules: { maxConsecDays: null, minMonthMin: 6000 },
  }));
  eq("2 鍵①: min_month_min 未達の A が入力順に勝つ", r.assignWishIds, ["wA"]);

  // ② 公平: 未達同士は見込分昇順（B=100 < A=200 → B）
  const r2 = autoAssign(base({
    wishes: [W("wA", "A", D), W("wB", "B", D)],
    monthMinutes: { A: 200, B: 100 },
    rules: { maxConsecDays: null, minMonthMin: 6000 },
  }));
  eq("2 鍵②: 未達同士は見込分昇順（B が先）", r2.assignWishIds, ["wB"]);

  // rules null → 鍵①スキップ＝公平のみ（達/未達に関わらず見込分昇順）
  const r3 = autoAssign(base({
    wishes: [W("wA", "A", D), W("wB", "B", D)],
    monthMinutes: { A: 9000, B: 100 },
    rules: null,
  }));
  eq("2 rules null: 鍵①スキップ＝見込分昇順のみ（B）", r3.assignWishIds, ["wB"]);

  // min_month_min null（rules ありでも）→ 鍵①スキップ
  const r4 = autoAssign(base({
    wishes: [W("wA", "A", D), W("wB", "B", D)],
    monthMinutes: { A: 100, B: 9000 },
    rules: { maxConsecDays: 5, minMonthMin: null },
  }));
  eq("2 min_month_min null: 鍵①スキップ（A=100 が先）", r4.assignWishIds, ["wA"]);

  // 割当済みシフトが後続バンドの被覆に算入される（bandStatsOf と同じ＝二重配置しない）
  const r5 = autoAssign(base({
    needs: [B(3, 0, 720, 1), B(3, 720, 1440, 1)], // 2バンド
    wishes: [W("wA1", "A", D, "00:00", "23:59"), W("wB1", "B", D, "12:30", "23:00")],
    monthMinutes: { A: 0, B: 0 },
  }));
  // バンド1（0-720）は wA1 のみ交差 → A 採用。★wA1（[0,1439)）はバンド2にも交差＝被覆算入
  //   → バンド2の need = 1-1 = 0 → wB1 は採用されず unassigned（枠が埋まっている）。
  eq("2 割当済みが後続バンドの被覆に算入（wB1 は枠なし）", r5.assignWishIds, ["wA1"]);
  check("2 wB1 は unassigned（被覆済みの帯）", r5.unassignedWishes.some((u) => u.wishId === "wB1"));

  // 本実行の割当が見込分（鍵②）に加算される: 2日連続・required=1・同 monthMinutes
  //   → 1日目は入力順で A・2日目は A の見込分が増えたので B。
  const D2 = "2026-09-10"; // 木（dow=4）
  const r6 = autoAssign(base({
    endDate: D2,
    needs: [B(3, 0, 1440, 1), B(4, 0, 1440, 1)],
    wishes: [W("a1", "A", D), W("b1", "B", D), W("a2", "A", D2), W("b2", "B", D2)],
    monthMinutes: { A: 0, B: 0 },
  }));
  eq("2 割当が見込分に加算され翌日は公平で交代（A→B）", r6.assignWishIds, ["a1", "b2"]);
}

// ── 3 1日1枠（SD-9）──
{
  const r = autoAssign(base({
    needs: [B(3, 0, 1440, 3)],
    wishes: [W("w1", "A", D, "20:00", "23:00"), W("w2", "A", D, "23:00", "26:00"), W("w3", "B", D)],
    monthMinutes: {},
  }));
  eq("3 同日複数 wish の cast は1本のみ（w1 採用・w2 落ち）", r.assignWishIds, ["w1", "w3"]);
  check("3 落ちた w2 は unassigned", r.unassignedWishes.some((u) => u.wishId === "w2"));
  eq("3 short = 3-2 = 1", r.shortages, [{ date: D, band: "終日", short: 1 }]);

  // 既存行がある cast は候補外（既存被覆も need から差し引かれる）
  const r2 = autoAssign(base({
    needs: [B(3, 0, 1440, 2)],
    wishes: [W("w1", "A", D), W("w2", "B", D)],
    existing: [{ castId: "A", date: D, startHm: "21:00", endHm: "25:00" }],
    monthMinutes: {},
  }));
  eq("3 既存行の cast A は候補外・B のみ採用（need=2-既存1-新規1=0）", r2.assignWishIds, ["w2"]);
  eq("3 short なし", r2.shortages, []);
}

// ── 4 連勤ガード ──
{
  // A は 09-07/09-08 に既存勤務。max=2 なら 09-09 で3連勤＝hard 除外。
  const input = base({
    wishes: [W("w1", "A", D), W("w2", "B", D)],
    existing: [
      { castId: "A", date: "2026-09-07", startHm: "20:00", endHm: "26:00" },
      { castId: "A", date: "2026-09-08", startHm: "20:00", endHm: "26:00" },
    ],
    monthMinutes: { A: 0, B: 9999 }, // 公平では A が勝つはず＝連勤除外の実証になる
    rules: { maxConsecDays: 2, minMonthMin: null },
  });
  const r = autoAssign(input);
  eq("4 3連勤目の A は hard 除外＝B 採用", r.assignWishIds, ["w2"]);
  check("4 A の wish は unassigned", r.unassignedWishes.some((u) => u.wishId === "w1"));
  // null=無制限
  const r2 = autoAssign({ ...input, rules: { maxConsecDays: null, minMonthMin: null } });
  eq("4 max null: A が公平で勝つ", r2.assignWishIds, ["w1"]);
  // ちょうど max は許容（2連勤目・max=2）
  const r3 = autoAssign({ ...input, existing: input.existing.slice(1), rules: { maxConsecDays: 2, minMonthMin: null } });
  eq("4 ちょうど max（2連勤）は許容", r3.assignWishIds, ["w1"]);
}

// ── 5 need 境界 ──
{
  const r = autoAssign(base({
    needs: [B(3, 0, 1440, 2)],
    wishes: [W("w1", "A", D), W("w2", "B", D), W("w3", "C", D)],
  }));
  eq("5 required ちょうど充足（2本採用・short 0）", { a: r.assignWishIds.length, s: r.shortages }, { a: 2, s: [] });
  check("5 あぶれた w3 は unassigned", r.unassignedWishes.length === 1 && r.unassignedWishes[0].wishId === "w3");

  const r2 = autoAssign(base({ needs: [B(3, 0, 1440, 3)], wishes: [W("w1", "A", D)] }));
  eq("5 不足 short=2", r2.shortages, [{ date: D, band: "終日", short: 2 }]);

  const r3 = autoAssign(base({
    needs: [B(3, 0, 1440, 1)],
    wishes: [W("w1", "A", D)],
    existing: [{ castId: "Z", date: D, startHm: "20:00", endHm: "26:00" }],
  }));
  eq("5 既存被覆で need=0 → 採用なし・short なし", { a: r3.assignWishIds, s: r3.shortages }, { a: [], s: [] });
  check("5 w1 は unassigned（枠なし）", r3.unassignedWishes.some((u) => u.wishId === "w1"));
}

// ── 6 帯交差（半開区間＝RPC overlap 同式）──
{
  // 深夜帯 [60,120)＝01:00〜02:00。26:00 表記（=1560）は from=60 < 1560 ∧ 1200 < 120 → 偽（20:00 開始は交差しない）
  const r = autoAssign(base({
    needs: [B(3, 60, 120, 1)],
    wishes: [W("w1", "A", D, "20:00", "26:00")],
  }));
  eq("6 20:00〜26:00 は深夜帯[01:00,02:00) と非交差（クロック半開区間）", r.assignWishIds, []);
  eq("6 非交差の short=1（band 表記）", r.shortages, [{ date: D, band: "01:00〜02:00", short: 1 }]);

  // 00:30〜02:00（クロック 30..120）は交差
  const r2 = autoAssign(base({
    needs: [B(3, 60, 120, 1)],
    wishes: [W("w1", "A", D, "00:30", "02:00")],
  }));
  eq("6 00:30〜02:00 は交差＝採用", r2.assignWishIds, ["w1"]);

  // 26:00 表記はバンド上限 1440 との交差がそのまま成立（[1200,1560) × [0,1440)）
  const r3 = autoAssign(base({ wishes: [W("w1", "A", D, "20:00", "26:00")] }));
  eq("6 26:00 表記は終日バンドと交差", r3.assignWishIds, ["w1"]);

  // 境界の非交差: 帯 [0,1200) とシフト 20:00(=1200) 開始は非交差（半開区間）
  const r4 = autoAssign(base({
    needs: [B(3, 0, 1200, 1)],
    wishes: [W("w1", "A", D, "20:00", "26:00")],
  }));
  eq("6 境界一致（start==toMin）は非交差", r4.assignWishIds, []);
}

// ── 7 定休日 ──
{
  const r = autoAssign(base({
    wishes: [W("w1", "A", D)],
    isClosedDay: (d) => d === D,
  }));
  eq("7 定休日は採用なし・shortage も出ない", { a: r.assignWishIds, s: r.shortages }, { a: [], s: [] });
  check("7 wish は unassigned へ", r.unassignedWishes.some((u) => u.wishId === "w1"));
}

// ── 8 warnings ──
{
  const r = autoAssign(base({
    wishes: [W("w1", "A", D)], // 360分 assign → A=360
    monthMinutes: { A: 0 },
    rules: { maxConsecDays: null, minMonthMin: 6000 }, // 100h
  }));
  eq("8 under_min_month_min（式と文言）", r.warnings,
    [{ castId: "A", type: "under_min_month_min", detail: "最低月間100h に対し 6h" }]);
  const r2 = autoAssign(base({ wishes: [W("w1", "A", D)], rules: null }));
  eq("8 rules null なら warnings 空", r2.warnings, []);
}

if (fails.length) {
  console.error(`verify:nox-shift-autoassign FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-shift-autoassign ALL PASS (${pass} assertions)`);
console.log("自動配置純関数: 決定性/2鍵(未達優先→公平・null=スキップ)/1日1枠/連勤hard除外/need境界/半開区間交差/定休日/warnings");
