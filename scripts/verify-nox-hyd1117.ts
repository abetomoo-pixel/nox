/*
 * verify:nox-hyd1117 — #418（サーバーとブラウザで日時の文字が違う）の再発防止（2026-11-16 夜便 N3・見た目と値は不変）。DB 不触・env 不要。
 *   npm run verify:nox-hyd1117。
 *  h(1) 日報の「現在 HH:MM → 営業日」がサーバー（UTC）の時刻で描かれていた（本番 ACE で再現＝現在 12:22・ブラウザは 21:22）＝JST を明示。
 *  h(2) 画面の ja-JP の日時の文字化（時・分・月・日・年・曜日を出すもの）は全部 timeZone: "Asia/Tokyo" を持つ（JST のブラウザでは同じ文字）。
 *  h(3) 今日のカード（1279px 以下）＝名前の列は残りの幅（長い札で状態の札が時刻に重ならない）。
 */
import fs from "node:fs";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const rb = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
check("h(1) 日報の「現在」＝JST", rb.includes('現在 {new Date(nowIso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}'));
const files = ["app", "components"].flatMap((d) => (fs.readdirSync(d, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => `${d}/${f}`));
const bad: string[] = [];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/toLocale(Time|Date)?String\("ja-JP", \{([^}]*)\}/g)) {
    const opts = m[2];
    if (/\b(hour|minute|month|day|year|weekday)\b/.test(opts) && !opts.includes("timeZone")) bad.push(`${f}: ${m[0].slice(0, 80)}`);
  }
}
check("h(2) ja-JP の日時の文字化は全部 JST を明示", bad.length === 0, bad);
const css = fs.readFileSync("app/globals.css", "utf8");
check("h(3) 今日のカード＝名前の列は残りの幅（minmax(0, 1fr) auto auto）", css.includes("@media (max-width: 1279px) { .nox-todaywrap .nox-table.cardrows tr { grid-template-columns: minmax(0, 1fr) auto auto; }"));
if (fails.length) { console.error(`✗ verify:nox-hyd1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-hyd1117 OK (${pass} checks)`);
