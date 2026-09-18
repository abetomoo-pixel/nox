// 裁定268 実機確認用 fixture（A1・今日）: prepare1（A1a 15:00 開始・15:25 in 打刻＝遅刻 +25／A1b 15:00 開始・打刻なし＝未着）
//   prepare2（A1b に 15:05 in 打刻＝猶予内）／cleanup（挿入行を id で削除・snapshot 照合）
import { Client } from "pg";
import fs from "fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
const ORG = "6408ecea-514d-4ca8-aadf-242eaba96377", ST = "0f748408-659a-4a94-8efd-8b093efb9dbd";
const A1a = "7f441220-ff3f-456d-875c-7798d5afd82c", A1b = "eaeea76d-e692-4170-b6ea-0a8bb91fe139";
const TODAY = "2026-09-17";
const IDS = "docs/tmp/q0918_fx_ids.json";
const snap = async () => (await q("select (select count(*)::int from shifts) shifts, (select count(*)::int from punches) punches, (select count(*)::int from attendance) att, (select count(*)::int from audit_logs) audit"))[0];
const mode = process.argv[2];
if (mode === "prepare1") {
  const ids = { snap: await snap(), shifts: [], punches: [] };
  for (const c of [A1a, A1b]) ids.shifts.push((await q("insert into shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by) values ($1,$2,$3,$4,'15:00','23:00','confirmed',(select id from users where email='nox-verify-owner-a@example.com')) returning id", [ORG, ST, c, TODAY]))[0].id);
  ids.punches.push((await q("insert into punches (org_id, store_id, cast_id, type, punched_at, source) values ($1,$2,$3,'in',$4,'manager') returning id", [ORG, ST, A1a, `${TODAY}T15:25:00+09:00`]))[0].id);
  fs.writeFileSync(IDS, JSON.stringify(ids));
  console.log("prepared1", JSON.stringify(ids));
} else if (mode === "prepare2") {
  const ids = JSON.parse(fs.readFileSync(IDS, "utf8"));
  ids.punches.push((await q("insert into punches (org_id, store_id, cast_id, type, punched_at, source) values ($1,$2,$3,'in',$4,'manager') returning id", [ORG, ST, A1b, `${TODAY}T15:05:00+09:00`]))[0].id);
  fs.writeFileSync(IDS, JSON.stringify(ids));
  console.log("prepared2", JSON.stringify(ids));
} else if (mode === "cleanup") {
  const ids = JSON.parse(fs.readFileSync(IDS, "utf8"));
  const dp = (await q("delete from punches where id = any($1::uuid[]) returning id", [ids.punches])).length;
  const ds = (await q("delete from shifts where id = any($1::uuid[]) returning id", [ids.shifts])).length;
  const now = await snap();
  console.log("cleanup", JSON.stringify({ deletedPunches: dp, deletedShifts: ds, before: ids.snap, after: now, match: JSON.stringify(ids.snap) === JSON.stringify(now) }));
} else console.log("status", JSON.stringify(await snap()));
await db.end();
