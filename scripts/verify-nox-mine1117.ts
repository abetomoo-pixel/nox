/*
 * verify:nox-mine1117 — 本人の画面の「自分の cast 行」の取り違え（2026-11-16 夜便 N2 で発見・①）。DB 不触・env 不要・逐語 pin。
 *   npm run verify:nox-mine1117。
 *  m(1) app/mine/page.tsx の自分の cast 行＝auth_cast_id で絞る（layout.tsx と同じ・裁定337）。旧 limit(1) は レジの許可がある cast
 *       （casts の RLS＝auth_cast_can_register なら同じ店の全員）で別の人の行を拾っていた（明細の宛名・admin で読む勤怠の表・保証・基本の働き方・修正申請）。
 *  m(2) 本人の画面（app/mine 配下）で casts を limit(1) で読んで店以外の列を使う所が無い（store_id だけは同じ店なら誰の行でも同じ）。
 */
import fs from "node:fs";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const pg = fs.readFileSync("app/mine/page.tsx", "utf8");
check("m(1) 自分の cast 行＝auth_cast_id → eq(id)", pg.includes('const { data: myCastId } = await supabase.rpc("auth_cast_id"); if (!myCastId) return { data: null }; const { data } = await supabase.from("casts").select(MINE_CAST_COLS).eq("id", myCastId as string).maybeSingle();') && !pg.includes("select(MINE_CAST_COLS).limit(1)"));
const files = (fs.readdirSync("app/mine", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => `app/mine/${f}`);
const bad: string[] = [];
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/from\("casts"\)\.select\("([^"]*)"\)\.limit\(1\)/g)) if (m[1].trim() !== "store_id") bad.push(`${f}: ${m[1]}`);
check("m(2) app/mine で casts を limit(1) で読むのは store_id だけ", bad.length === 0, bad);
if (fails.length) { console.error(`✗ verify:nox-mine1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-mine1117 OK (${pass} checks)`);
