// verify:nox-rank-shift-time（★0208・相談役 11/24 夜 N6・時間別の時給 B＝出勤の時刻の段）— DB に触れない純関数と画面の配線の照合。
//   (1) 初期値の順＝希望 → 人の基本の働き方 → ランクの時刻 → 営業時間 → 既定（ランクが無い＝今と 1 バイト同じ）
//   (2) 入力の判定＝DB の CHECK と 'bad time' と同じ線（24 時以降に始まる段は断る・終了が開始以前は翌日・両方空＝外す）
//   (3) 配線＝旗 false の既定・旗の後ろでだけ読む・作成済みのシフトを書き換える呼び出しが無い
import fs from "node:fs";
import { initialSpanOf } from "../lib/nox/shift/half-hour";
import { rankShiftTimeOf, rankShiftHmOf, rankShiftTimeErrJa } from "../lib/nox/shift/rank-time";
import { MIG_0208_APPLIED, mig0208On } from "../lib/nox/rules-0175/flag";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// (1) 初期値の順
const wish = { start_hm: "19:00:00", end_hm: "23:00:00" };
const avail = { from: 1200, to: 1500 };
const rank = { from: 1260, to: 1560 };
const preset = ["20:00", "25:00"] as const;
const fb = ["20:00", "24:00"] as const;
ok("(1-1) 希望が最優先", eq(initialSpanOf(wish, avail, preset, fb, rank), { start: "19:00", end: "23:00" }));
ok("(1-2) 人の基本の働き方がランクより先", eq(initialSpanOf(null, avail, preset, fb, rank), { start: "20:00", end: "25:00" }));
ok("(1-3) 人の基本の働き方が無い＝ランクの時刻", eq(initialSpanOf(null, null, preset, fb, rank), { start: "21:00", end: "26:00" }));
ok("(1-4) ランクの時刻が無い＝営業時間", eq(initialSpanOf(null, null, preset, fb, null), { start: "20:00", end: "25:00" }));
ok("(1-5) ランクの引数を渡さない＝今と同じ", eq(initialSpanOf(null, null, preset, fb), initialSpanOf(null, null, preset, fb, null)));
ok("(1-6) 全部無い＝既定", eq(initialSpanOf(null, null, null, fb, null), { start: "20:00", end: "24:00" }));
ok("(1-7) ランクの時刻は営業時間より先", eq(initialSpanOf(undefined, undefined, preset, fb, rank), { start: "21:00", end: "26:00" }));

// (2) 入力の判定
ok("(2-1) 両方空＝外す", eq(rankShiftTimeOf({ start: "", end: "" }), { ok: true, start: null, end: null }));
ok("(2-2) 片方だけは断る", !rankShiftTimeOf({ start: "20:00", end: "" }).ok && !rankShiftTimeOf({ start: "", end: "02:00" }).ok);
ok("(2-3) 20:00〜25:00", eq(rankShiftTimeOf({ start: "20:00", end: "25:00" }), { ok: true, start: 1200, end: 1500 }));
ok("(2-4) 20:00〜02:00＝翌日", eq(rankShiftTimeOf({ start: "20:00", end: "02:00" }), { ok: true, start: 1200, end: 1560 }));
ok("(2-5) 24 時以降の開始は断る", !rankShiftTimeOf({ start: "24:00", end: "26:00" }).ok && !rankShiftTimeOf({ start: "25:30", end: "27:00" }).ok);
ok("(2-6) 同じ時刻＝翌日まで（24 時間）", eq(rankShiftTimeOf({ start: "20:00", end: "20:00" }), { ok: true, start: 1200, end: 2640 }));
ok("(2-7) 終了が翌 23:59 を超えると断る", !rankShiftTimeOf({ start: "10:00", end: "48:00" }).ok);
ok("(2-8) 形の違う文字は断る", !rankShiftTimeOf({ start: "8時", end: "10:00" }).ok && !rankShiftTimeOf({ start: "20:75", end: "22:00" }).ok);
ok("(2-9) 開始 0:00 と終了 47:59 の端は通す", eq(rankShiftTimeOf({ start: "00:00", end: "47:59" }), { ok: true, start: 0, end: 2879 }));
ok("(2-10) 23:59 の開始は通す", rankShiftTimeOf({ start: "23:59", end: "26:00" }).ok);
// DB の CHECK と同じ線か（通ったものは全部 CHECK を満たす）
const chk = (s: number | null, e: number | null) => (s === null && e === null) || (s !== null && e !== null && s >= 0 && s <= 1439 && e >= 1 && e <= 2879 && e > s);
let allChk = true;
for (let h = 0; h < 48; h++) for (const m of [0, 30]) for (let h2 = 0; h2 < 48; h2 += 3) {
  const r = rankShiftTimeOf({ start: rankShiftHmOf(h * 60 + m), end: rankShiftHmOf(h2 * 60) });
  if (r.ok && !chk(r.start, r.end)) allChk = false;
}
ok("(2-11) 通る入力は全部 DB の CHECK を満たす（48×2×16 通り）", allChk);
ok("(2-12) 分→欄の値", rankShiftHmOf(1560) === "26:00" && rankShiftHmOf(null) === "" && rankShiftHmOf(0) === "00:00");
ok("(2-13) 英語の理由は日本語に", /24 時以降/.test(rankShiftTimeErrJa("bad time")) && !/[a-z]{4}/.test(rankShiftTimeErrJa("forbidden")));

// (3) 配線
ok("(3-1) 旗は false が既定", MIG_0208_APPLIED === false && mig0208On() === false);
const board = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
ok("(3-2) シフト表はランクの時刻を旗の後ろでだけ読む", /if \(mig0208On\(\)\) \{[^]*?cast_ranks[^]*?shift_start_min/.test(board));
ok("(3-3) 追加の 2 つの道にランクの時刻を渡す", (board.match(/rankTimeByCast=\{rankTimeByCast\}/g) ?? []).length >= 2);
const panel = fs.readFileSync("app/(manage)/shift/day-add-panel.tsx", "utf8"), form = fs.readFileSync("app/(manage)/shift/shift-add-form.tsx", "utf8");
ok("(3-4) 日の追加はランクを最後の引数に", /initialSpanOf\(st\.wish, availTimeByCast\[c\.id\]\?\.\[dow\] \?\? null, preset \?\? null, \[FALLBACK_START, FALLBACK_END\], rankTimeByCast\[c\.id\] \?\? null\)/.test(panel));
ok("(3-5) 追加の画面は基本の働き方の後・営業時間の前", (() => { const i = form.indexOf("if (at) return"), j = form.indexOf("rankTimeByCast[selCast.id]"), k = form.indexOf("hoursOf", j); return i > 0 && j > i && k > j; })());
const pricing = fs.readFileSync("app/(manage)/master/pricing/pricing-board.tsx", "utf8");
ok("(3-6) マスタのカードは旗の後ろ", /\{mig0208On\(\) && <RankShiftTimeCard /.test(pricing));
const card = fs.readFileSync("app/(manage)/master/pricing/rank-shift-time-card.tsx", "utf8");
ok("(3-7) カードは RPC 1 本だけを呼ぶ（シフトの表に書かない）", (card.match(/\.rpc\(/g) ?? []).length === 1 && /set_cast_rank_shift_time/.test(card) && !/from\("shifts"\)/.test(card));
const all = [board, panel, form, card].join("\n");
ok("(3-8) 作成済みのシフトを書き換える呼び出しを足していない（一括で直す道なし）", !/rank[^\n]{0,80}(update_shift|shift_bulk|bulk_update)/i.test(all));

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-rank-shift-time FAIL ${fails.length} / ${n}`); process.exit(1); }
console.log(`verify:nox-rank-shift-time ALL PASS (${n} assertions)`);
