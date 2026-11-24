// verify:nox-punch-buttons（起票158 の 1・相談役 11/24 夜 N1・見た目だけ）— 打刻のボタンの出し分け＝DB に触れない純関数と配線の照合
//   マイページ：出勤していない＝出勤だけ・出勤中＝退勤だけ・退勤済み（キャストは 1 日 1 回）＝どちらも出さない
//   端末のスタッフ：最後の打刻が in＝退勤だけ・それ以外＝出勤だけ（同じ日に出勤し直せる）・キャスト＝状態を読めない＝両方
import fs from "node:fs";
import { punchButtonsOf, punchButtonsShownOf, kioskButtonsShownOf, type PunchState } from "../lib/nox/shift/punch-state";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };
const J = (x: unknown) => JSON.stringify(x);

ok("(1-1) 出勤していない＝出勤だけ", J(punchButtonsShownOf("none")) === J({ in: true, out: false }));
ok("(1-2) 出勤中＝退勤だけ", J(punchButtonsShownOf("open")) === J({ in: false, out: true }));
ok("(1-3) 退勤済み＝どちらも出さない", J(punchButtonsShownOf("closed")) === J({ in: false, out: false }));
ok("(1-4) 出すボタンは押せるボタンと同じ（押せないボタンを並べない）", (["none", "open", "closed"] as PunchState[]).every((s) => { const a = punchButtonsShownOf(s), b = punchButtonsOf(s); return a.in === b.inEnabled && a.out === b.outEnabled; }));
ok("(2-1) 端末のスタッフ：今日まだ＝出勤だけ", J(kioskButtonsShownOf(null, true)) === J({ in: true, out: false }));
ok("(2-2) 端末のスタッフ：最後が in＝退勤だけ", J(kioskButtonsShownOf("in", true)) === J({ in: false, out: true }));
ok("(2-3) 端末のスタッフ：最後が out＝出勤し直せる＝出勤だけ", J(kioskButtonsShownOf("out", true)) === J({ in: true, out: false }));
ok("(2-4) 端末のキャスト＝状態を読めない＝両方", J(kioskButtonsShownOf(undefined, false)) === J({ in: true, out: true }));

const mine = fs.readFileSync("app/mine/punch-actions.tsx", "utf8"), kiosk = fs.readFileSync("app/kiosk/page.tsx", "utf8");
ok("(3-1) マイページは出す印で出勤と退勤を出し分け", mine.includes("const shownBtn = punchButtonsShownOf(shown);") && mine.includes('{shownBtn.in && <button className="nox-punchbtn"') && mine.includes('{shownBtn.out && <button className="nox-punchbtn"'));
ok("(3-2) 端末はスタッフにだけ今日の最後の打刻を渡す（キャストの行は lastKind なし）", kiosk.includes("staff: true, lastKind: m.last_kind })") && kiosk.includes("kioskButtonsShownOf(target.lastKind, !!target.staff)"));
ok("(3-3) 端末のボタンは 1 つのとき全幅（two を外す）", kiosk.includes('className={sb.in && sb.out ? "nox-pinpad-go two" : "nox-pinpad-go"}'));

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-punch-buttons FAIL ${fails.length} / ${n}`); process.exit(1); }
console.log(`verify:nox-punch-buttons ALL PASS (${n} assertions)`);
