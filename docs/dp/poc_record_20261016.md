# poc_record — 録画再生の PoC スクリプト（scripts/demo/poc-record.mjs の md 化・起票105 の処置・便 V46 V-0・2026-10-16）

出自＝裁定276-1（2026-09-18）の PoC。本体 `scripts/demo/poc-record.mjs` は未追跡のまま repo に残っていたため、便 V46（v46 §0「poc-record.mjs（docs/dp に md 化して本体削除＝起票105）」）で本書に写して本体を削除した。実行結果の控え＝docs/tmp/0149_poc.md／0149_poc_result.json（docs/tmp は .gitignore＝コミットしない）。結果の要点は 0149_poc.md の冒頭に同じ（録画 5 枚 5,204 ms・採取 1,530 ms・再生 削除 843 ms＋投入 1,062 ms・check_group_due＝録画値＝checks.total＝receipt 鏡像・ROLLBACK 後 snapshot 一致）。

再実行するなら: 本書のコードを `scripts/demo/poc-record.mjs` に戻して `npx tsx scripts/demo/poc-record.mjs`（NOX-VERIFY-A1・owner-a の JWT emulate・1 トランザクション・最後に ROLLBACK＝恒久変更 0）。録画の本番化（起票105＝Playwright 自動収録）は第 2 期。

## scripts/demo/poc-record.mjs（逐語・150 行）

```js
// 録画再生の PoC（裁定276-1・恒久変更 0）: NOX-VERIFY-A1 で owner を JWT emulate → 伝票 5 枚を実 RPC で作って閉じる（録画）→
//   FK を辿って行を JSON 化（営業日相対の日オフセット＋時刻）→ 同じトランザクション内で削除 → 3 日前の営業日へずらして直 INSERT（再生）→
//   check_group_due＝録画値＝checks.total・receipt 鏡像（groupDueFull）・stock_logs／backs／claims の件数・daily_report_close の売上 を assert → ROLLBACK。
//   実行: npx tsx scripts/demo/poc-record.mjs（.ts の lib を import するため tsx）。接続は finally で閉じる（教訓88）。結果は docs/tmp/0149_poc.md（コミットしない）。
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { groupDueFull } from "../../lib/nox/check-calc.ts";
import { bizDateOf } from "../../lib/nox/biz-date.ts";
process.loadEnvFile(".env.local");

const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const R = { asserts: [], issues: [], timing: {}, notes: [] };
const ok = (label, cond, detail = "") => { R.asserts.push({ label, ok: !!cond, detail }); if (!cond) console.log("NG", label, detail); };
const ms = () => Date.now();
try {
  await db.connect();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const one = async (s, p = []) => (await q(s, p))[0];
  const st = await one("select id, org_id from stores where name='NOX-VERIFY-A1'");
  const owner = await one("select id, auth_user_id from users where email='nox-verify-owner-a@example.com' and is_active");
  const seats = (await q("select id, name from seats where store_id=$1 and is_active order by name limit 5", [st.id]));
  const prodDrink = await one("select id, price from products where store_id=$1 and name='NOX-VERIFY-指名ドリンク' and is_active", [st.id]);
  const prodChamp = await one("select id, price from products where store_id=$1 and name='NOX-VERIFY-シャンパン' and is_active", [st.id]);
  const casts = await q("select id, name from casts where store_id=$1 and is_active order by name", [st.id]);
  const cust = await one("select id from customers where store_id=$1 and name='NOX-VERIFY-顧客-フリー'", [st.id]);
  const cutoff = (await one("select coalesce(nullif(trim(settings_json->>'biz_cutoff_hm'),''),'06:00') c from stores where id=$1", [st.id])).c;
  if (!st || !owner || seats.length < 5 || !prodDrink || !prodChamp || casts.length < 2 || !cust) throw new Error("fixture 不足");
  const snapSql = "select (select count(*) from checks where store_id=$1)::int c, (select count(*) from check_lines where store_id=$1)::int l, (select count(*) from payments p join checks c on c.id=p.check_id where c.store_id=$1)::int p, (select count(*) from stock_logs where store_id=$1)::int sl, (select count(*) from check_cast_backs where store_id=$1)::int cb, (select count(*) from check_nominations where store_id=$1)::int cn, (select count(*) from receivables where store_id=$1)::int rv, (select count(*) from daily_reports where store_id=$1)::int dr, (select count(*) from audit_logs where org_id=$2)::int au, (select set_fee||'/'||ext_fee||'/'||service_rate||'/'||round_unit from stores where id=$1) stcfg";
  const before = JSON.stringify(await one(snapSql, [st.id, st.org_id]));
  const asUid = async (uid) => { await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); await db.query("set local role authenticated"); };
  const asPg = async () => db.query("reset role");
  const call = async (sql, p = []) => { await db.query("savepoint sp"); try { const r = await q(sql, p); await db.query("release savepoint sp"); return { ok: true, rows: r }; } catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: e.message }; } };

  await db.query("begin");
  try {
    const txStart = (await one("select now() t")).t;
    // 店設定を同一トランザクション内で狙った値に（set 5000／延長 3000／指名 3000・場内 2000・同伴 5000・サ料 10%・100 down）
    await asUid(owner.auth_user_id);
    const s1 = await call("select public.set_store_time_pricing($1, 60, 5000, 30, 3000, 'manual', 'table')", [st.id]);
    const s2 = await call("select public.set_store_pricing($1, 3000, 2000, 5000, 10, 5, 100, 'down')", [st.id]);
    ok("x0 店設定（時間制・料金）を tx 内で設定", s1.ok && s2.ok, (s1.err || "") + (s2.err || ""));

    // ── x1 録画（5 枚）
    const t0 = ms();
    const rec = [];
    const openChk = async (seat, people, nom, customer = null) => { const r = await call("select public.check_open($1, $2, $3, $4) as id", [seat, people, nom, customer]); if (!r.ok) throw new Error("check_open: " + r.err); return r.rows[0].id; };
    const pay = async (chk, method, amount) => call("select public.check_pay($1, $2, $3, 'A', $5, $4::uuid, null)", [chk, method, amount, randomUUID(), method === "cash" ? amount : null]); // ★card／ar は p_tendered null（'bad tendered' を PoC 1 回目で踏んだ）
    const close = async (chk) => call("select public.check_close($1, $2::uuid)", [chk, randomUUID()]);
    const totalOf = async (chk) => (await one("select total from checks where id=$1", [chk])).total;
    // (1) セットのみ
    { const c = await openChk(seats[0].id, 2, "free"); const tt = await totalOf(c); const p = await pay(c, "cash", tt); const cl = await close(c); rec.push({ n: 1, label: "セットのみ", id: c, payOk: p.ok, closeOk: cl.ok, err: p.err || cl.err }); }
    // (2) 指名＋ドリンク 3
    { const c = await openChk(seats[1].id, 1, "hon"); const nm = await call("select public.check_set_nominations($1, $2::jsonb)", [c, JSON.stringify([{ cast_id: casts[0].id, weight: 1, nom_kind: "hon", is_dohan: false, ended: false }])]); const sh = await call("select public.check_shimei_add($1, $2, 'hon', $3::uuid)", [c, casts[0].id, randomUUID()]); const dl = await call("select public.check_add_line($1, $2, 3, null, 'A', null, null)", [c, prodDrink.id]); const tt = await totalOf(c); const p = await pay(c, "cash", tt); const cl = await close(c); rec.push({ n: 2, label: "指名＋ドリンク 3", id: c, payOk: p.ok, closeOk: cl.ok, err: [nm, sh, dl, p, cl].filter(x => !x.ok).map(x => x.err).join("/") }); }
    // (3) ボトル＋同伴
    { const c = await openChk(seats[2].id, 2, "dohan"); const nm = await call("select public.check_set_nominations($1, $2::jsonb)", [c, JSON.stringify([{ cast_id: casts[1].id, weight: 1, nom_kind: "hon", is_dohan: true, ended: false }])]); const dh = await call("select public.check_dohan_add($1, $2, 1, $3::uuid)", [c, casts[1].id, randomUUID()]); const bl = await call("select public.check_add_line($1, $2, 1, null, 'A', null, null)", [c, prodChamp.id]); const tt = await totalOf(c); const p = await pay(c, "card", tt); const cl = await close(c); rec.push({ n: 3, label: "ボトル＋同伴", id: c, payOk: p.ok, closeOk: cl.ok, err: [nm, dh, bl, p, cl].filter(x => !x.ok).map(x => x.err).join("/") }); }
    // (4) 延長＝started_at を 95 分前へ UPDATE → check_time_charge_apply
    { const c = await openChk(seats[3].id, 3, "free"); await asPg(); await db.query("update checks set started_at = now() - interval '95 minutes' where id=$1", [c]); await asUid(owner.auth_user_id); const tc = await call("select public.check_time_charge_apply($1)", [c]); const lines = await q("select fee_kind, block_no, line_total, time_auto from check_lines where check_id=$1 order by sort_order", [c]); const ext = lines.filter(l => l.fee_kind === "extension"); ok("x1(4) 95 分前へ UPDATE 後の time_charge_apply で延長行が乗る（set 60 分＋延長 30 分×2 見込み）", tc.ok && ext.length >= 1, (tc.err || "") + " lines=" + JSON.stringify(lines)); const tt = await totalOf(c); const p = await pay(c, "cash", tt); const cl = await close(c); rec.push({ n: 4, label: "延長（95 分）", id: c, payOk: p.ok, closeOk: cl.ok, err: [tc, p, cl].filter(x => !x.ok).map(x => x.err).join("/"), extLines: ext.length }); }
    // (5) 紹介料＋売掛
    { const c = await openChk(seats[4].id, 2, "free", cust.id); const cu = await call("select public.check_add_line($1, null, 1, 'custom', 'A', 'PoC カスタム', 3000)", [c]); const rf = await call("select public.check_add_referral($1, $2, 2000, 'PoC 紹介', $3::uuid)", [c, casts[0].id, randomUUID()]); const tt = await totalOf(c); const p = await pay(c, "ar", tt); const cl = await close(c); rec.push({ n: 5, label: "紹介料＋売掛", id: c, payOk: p.ok, closeOk: cl.ok, err: [cu, rf, p, cl].filter(x => !x.ok).map(x => x.err).join("/") }); }
    R.timing.record_ms = ms() - t0;
    await asPg();
    for (const r of rec) { r.due = (await one("select public.check_group_due($1,'A') d", [r.id])).d; const c = await one("select total, status, started_at, closed_at, set_fee, ext_fee, service_rate, round_unit, round_mode, price_display, business_tax_status, tax_rounding from checks where id=$1", [r.id]); r.total = c.total; r.status = c.status; r.frozen = c; ok(`x1(${r.n}) ${r.label}: pay／close 成功・status closed・total=due`, r.payOk && r.closeOk && c.status === "closed" && c.total === r.due, `err=${r.err} total=${c.total} due=${r.due}`); }
    const ids = rec.map(r => r.id);

    // ── x2 採取（FK で check_id を持つ表＋checks＋stock_logs（tx 内生成）＋audit（target が採取 id））
    const t1 = ms();
    const chkTables = (await q("select distinct table_name t from information_schema.columns where table_schema='public' and column_name='check_id' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') order by 1")).map(r => r.t);
    const colTypes = {};
    for (const t of ["checks", ...chkTables, "stock_logs", "audit_logs"]) colTypes[t] = Object.fromEntries((await q("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [t])).map(r => [r.column_name, r.data_type]));
    const captured = { checks: await q("select * from checks where id = any($1)", [ids]) };
    for (const t of chkTables) captured[t] = await q(`select * from public."${t}" where check_id = any($1)`, [ids]);
    const lineIds = captured.check_lines.map(l => l.id);
    captured.stock_logs = await q("select * from stock_logs where org_id=$1 and at >= $2", [st.org_id, txStart]);
    const targets = [...ids.map(i => "checks:" + i), ...lineIds.map(i => "check_lines:" + i), ...(captured.receivables || []).map(r => "receivables:" + r.id), ...(captured.payments || []).map(r => "payments:" + r.id), ...(captured.receipt_issues || []).map(r => "receipt_issues:" + r.id)];
    captured.audit_logs = await q("select * from audit_logs where org_id=$1 and at >= $2 and target = any($3)", [st.org_id, txStart, targets]);
    const bizToday = bizDateOf(new Date(txStart).toISOString(), cutoff);
    const dayMs = 86400000;
    const toRel = (t, row) => { const o = {}; for (const [k, v] of Object.entries(row)) { const ty = colTypes[t][k]; if (v instanceof Date && /timestamp/.test(ty)) { const bd = bizDateOf(v.toISOString(), cutoff); const off = Math.round((Date.parse(bd) - Date.parse(bizToday)) / dayMs); const jst = new Date(v.getTime() + 9 * 3600000); o[k] = { $rel: off, t: jst.toISOString().slice(11, 23) }; } else if (v instanceof Date && ty === "date") { const off = Math.round((v.getTime() - Date.parse(bizToday)) / dayMs); o[k] = { $rel: off }; } else o[k] = v; } return o; };
    const payload = {}; const counts = {};
    for (const [t, rows] of Object.entries(captured)) { counts[t] = rows.length; if (t === "stock_logs") { payload[t] = rows.filter(r => !["sale", "sale_remove", "void_recredit"].includes(r.reason)).map(r => toRel(t, r)); } else payload[t] = rows.map(r => toRel(t, r)); }
    const payloadStr = JSON.stringify(payload);
    R.timing.capture_ms = ms() - t1; R.capture = { tables: Object.keys(captured).length, rows: Object.values(captured).reduce((a, r) => a + r.length, 0), counts, bytes: Buffer.byteLength(payloadStr), bizToday, cutoff, saleRowsExcluded: captured.stock_logs.length - payload.stock_logs.length };

    // ── x3 再生（同 tx）: 削除 → 3 日前の営業日へずらして直 INSERT
    const t2 = ms();
    const delOrder = ["check_cast_backs", "check_nominations", "check_seats", "approvals", "drink_claims", "print_jobs", "receipt_issues", "ar_collections", "receivables", "payments"].filter(t => captured[t]);
    await db.query("delete from stock_logs where org_id=$1 and at >= $2", [st.org_id, txStart]);
    for (const t of delOrder) await db.query(`delete from public."${t}" where check_id = any($1)`, [ids]);
    await db.query("delete from audit_logs where id = any($1)", [captured.audit_logs.map(a => a.id)]);
    await db.query("delete from check_lines where check_id = any($1)", [ids]);
    const regen = (await one("select count(*)::int n from stock_logs where org_id=$1 and at >= $2", [st.org_id, txStart])).n;
    await db.query("delete from stock_logs where org_id=$1 and at >= $2", [st.org_id, txStart]);
    await db.query("delete from checks where id = any($1)", [ids]);
    const leftover = await one("select (select count(*) from checks where id = any($1))::int c, (select count(*) from check_lines where check_id = any($1))::int l, (select count(*) from stock_logs where org_id=$2 and at >= $3)::int sl", [ids, st.org_id, txStart]);
    ok("x3 削除＝checks／lines／tx 内 stock_logs が 0（check_lines 削除で再生成された sale_remove は " + regen + " 行→再削除）", leftover.c === 0 && leftover.l === 0 && leftover.sl === 0, JSON.stringify(leftover));
    const delMs = ms() - t2;
    const t3 = ms();
    const targetBiz = new Date(Date.parse(bizToday) - 3 * dayMs).toISOString().slice(0, 10);
    const fromRel = (t, row) => { const o = {}; for (const [k, v] of Object.entries(row)) { if (v && typeof v === "object" && "$rel" in v) { const d = new Date(Date.parse(targetBiz) + v.$rel * dayMs); if (v.t) { const iso = d.toISOString().slice(0, 10) + "T" + v.t + "+09:00"; o[k] = new Date(iso).toISOString(); } else o[k] = d.toISOString().slice(0, 10); } else o[k] = v; } return o; };
    const insOrder = ["checks", "check_lines", "check_nominations", "check_cast_backs", "payments", "receivables", "ar_collections", "receipt_issues", "check_seats", "approvals", "print_jobs", "drink_claims", "audit_logs"].filter(t => payload[t] && payload[t].length);
    const insErr = []; const insMs = {};
    for (const t of insOrder) { const ts = ms(); const rows = payload[t].map((row) => fromRel(t, row)); const r = await call(`insert into public."${t}" select * from jsonb_populate_recordset(null::public."${t}", $1::jsonb)`, [JSON.stringify(rows)]); if (!r.ok) insErr.push(t + ": " + r.err.slice(0, 140)); insMs[t] = ms() - ts; }
    R.insMs = insMs;
    ok("x3 投入＝表ごと 1 文の jsonb_populate_recordset（276-2 の形）で全表 INSERT 成功・表順 " + insOrder.join("→"), insErr.length === 0, insErr.join(" | "));
    R.timing.replay_delete_ms = delMs; R.timing.replay_insert_ms = ms() - t3;
    // assert 三点＋鏡像
    const results = [];
    for (const r of rec) {
      const due = (await one("select public.check_group_due($1,'A') d", [r.id])).d;
      const c = await one("select total, status, started_at, closed_at, service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding, to_char(public.biz_date_of(store_id, started_at), 'YYYY-MM-DD') bd from checks where id=$1", [r.id]);
      const lines = await q("select line_total, kind, tax_category from check_lines where check_id=$1 and pay_group='A'", [r.id]);
      const mirror = groupDueFull(lines, c);
      results.push({ n: r.n, label: r.label, recDue: r.due, replayDue: due, total: c.total, mirror, bizDate: c.bd, ok: due === r.due && c.total === r.due && mirror === r.due });
      ok(`x3(${r.n}) ${r.label}: check_group_due（再生）=録画値=checks.total=receipt 鏡像`, due === r.due && c.total === r.due && mirror === r.due, `rec=${r.due} replay=${due} total=${c.total} mirror=${mirror}`);
      ok(`x3(${r.n}) 営業日が 3 日前（${targetBiz}）にずれている`, c.bd === targetBiz, String(c.bd));
    }
    const after = { sl: (await one("select count(*)::int n from stock_logs where org_id=$1 and at >= $2", [st.org_id, txStart])).n, sale: (await one("select count(*)::int n from stock_logs where org_id=$1 and at >= $2 and reason='sale'", [st.org_id, txStart])).n, cb: (await one("select count(*)::int n from check_cast_backs where check_id = any($1)", [ids])).n, cn: (await one("select count(*)::int n from check_nominations where check_id = any($1)", [ids])).n, dc: (await one("select count(*)::int n from drink_claims where check_id = any($1)", [ids])).n, pay: (await one("select count(*)::int n from payments where check_id = any($1)", [ids])).n, rv: (await one("select count(*)::int n from receivables where check_id = any($1)", [ids])).n };
    const recSale = captured.stock_logs.filter(x => x.reason === "sale").length;
    ok("x3 stock_logs: 再生後の sale 行＝録画時と同数（トリガ再生成・二重なし）", after.sale === recSale && after.sl === recSale + payload.stock_logs.length, JSON.stringify({ recSale, after }));
    ok("x3 件数一致: check_cast_backs／check_nominations／drink_claims／payments／receivables", after.cb === counts.check_cast_backs && after.cn === counts.check_nominations && after.dc === (counts.drink_claims || 0) && after.pay === counts.payments && after.rv === (counts.receivables || 0), JSON.stringify({ counts, after }));
    R.after = after; R.recSale = recSale;
    // stock_logs の at は now()＝今日（録画時刻ではない）
    const slAt = await q("select distinct public.biz_date_of($1, at)::text bd from stock_logs where org_id=$2 and at >= $3", [st.id, st.org_id, txStart]);
    R.notes.push("再生で自動生成された stock_logs.sale 行の営業日＝" + slAt.map(x => x.bd).join(",") + "（伝票の営業日 " + targetBiz + " ではなく now()＝在庫台帳の日付がずれる）");
    // daily_report_close（ずらした営業日）
    await asUid(owner.auth_user_id);
    const drc = await call("select public.daily_report_close($1, $2::date, 0, 0, 0, null, null, false, $3::uuid) r", [st.id, targetBiz, randomUUID()]);
    await asPg();
    const dr = drc.ok ? await one("select cash, card_gross, uri, other, slips, guests, drink_sales from daily_reports where store_id=$1 and biz_date=$2::date", [st.id, targetBiz]) : null;
    const sumTot = rec.reduce((a, r) => a + r.total, 0);
    const drSum = dr ? (dr.cash + dr.card_gross + dr.uri + dr.other) : -1;
    ok("x3 daily_report_close（3 日前の営業日）が通り 売上（cash+card+uri+other）＝5 枚の合計", drc.ok && drSum === sumTot, (drc.err || "") + ` dr=${JSON.stringify(dr)} sum=${sumTot}`);
    R.daily = { ok: drc.ok, err: drc.err, dr, sumTot, targetBiz };
    R.rec = rec.map(({ n, label, due, total, status, err, extLines }) => ({ n, label, due, total, status, err, extLines }));
    R.results = results;
  } finally {
    await db.query("rollback");
  }
  const afterSnap = JSON.stringify(await one(snapSql, [st.id, st.org_id]));
  ok("x6 ROLLBACK 後の snapshot 一致（checks／lines／payments／stock_logs／backs／noms／receivables／daily_reports／audit／店設定）", afterSnap === before, `${before} → ${afterSnap}`);
  R.snapshot = { before, after: afterSnap };
} finally {
  await db.end().catch(() => {});
}
fs.writeFileSync("docs/tmp/0149_poc_result.json", JSON.stringify(R, null, 1));
console.log(R.asserts.map(a => (a.ok ? "OK " : "NG ") + a.label + (a.ok ? "" : " — " + a.detail)).join("\n"));
console.log("timing", JSON.stringify(R.timing), "capture", JSON.stringify(R.capture));
console.log("notes", JSON.stringify(R.notes));
console.log(R.asserts.every(a => a.ok) ? "PoC: ALL OK" : "PoC: NG あり");
```
