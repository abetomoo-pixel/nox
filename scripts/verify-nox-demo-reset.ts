/*
 * verify:nox-demo-reset — mig0149（demo_org_reset・orgs.is_demo／demo_reset_at・storage の is_demo 句）＋0150（service_role statement_timeout）の係留。
 *   裁定273（業態別公開デモ）／276（録画再生）／277（設計）／278（残す 3 表）／279（memberships の例外）。npm run verify:nox-demo-reset（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 60 段目。
 *   Postgres 直結の 1 トランザクション内で JWT claims を emulate（referral 段と同型）→ 最後に ROLLBACK＝残留 0・snapshot 一致。接続は finally で close（教訓88）。
 *
 *  (1) 録画: NOX-VERIFY-A を is_demo=true → owner を emulate して伝票 5 枚（セットのみ／指名＋ドリンク 3／ボトル＋同伴／延長 95 分／紹介料＋売掛）を close
 *      → golden due 5 値（5500／17000／52800／12100／8800＝docs/tmp/0149_poc.md と同値）→ 全表を採取して payload（memberships 含む・audit_logs と stock_logs の sale 系は含めない）
 *  (2) demo_org_reset('all'): 表別件数一致・三点一致 5 枚（check_group_due＝checks.total＝録画値＝groupDueFull 鏡像）・stock_logs の sale 行がトリガ再生成で二重でない・
 *      sale 行の at が元明細の created_at（★7）・demo_reset_at 更新・audit 'demo.reset' 1 行
 *  (3) 復元: reset 前に書き換えた stores.settings_json が payload の値に戻る／owner の emulate で checks を select できる（memberships 復元＝RLS 通過）
 *  (4) 隔離: 他 org（NOX-VERIFY-B）の全表（68 表・memberships は store 経由）の行数が reset 前後で不変
 *  (5) raise: 'not demo'／'bad mode'／'bad payload'／'bad table'（未知）／'bad table'（orgs・org_billing・users）／'org mismatch'（org_id）／
 *      'org mismatch'（memberships の store_id・user_id が他 org）／'bad stock_logs'
 *  (6) 冪等: 2 回連続 reset で件数・Σtotal 不変。wipe（demo_reset_at 不変）→ load の 2 回呼びでも同結果
 *  (7) 権限: anon／authenticated（owner）の emulate で demo_org_reset は permission denied
 *  (8) storage: is_demo=true の org の owner を emulate して storage.objects（cast-photos・自 org パス）へ insert → RLS で拒否・is_demo=false なら通る（同 tx 内・ROLLBACK）
 *  (9) 0150: pg_db_role_setting の service_role statement_timeout=30s（anon 3s／authenticated 8s 不変）
 *  逆テスト 1 本（手動・1 回）: GOLDEN_DUES の先頭を 5501 にする→dr(1-3) 赤・戻して緑（破壊と復元に git を使わない＝教訓91）。
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, ORG_B, loadEnvOrExit } from "./fixtures-f0";
import { groupDueFull, type DueLine } from "../lib/nox/check-calc";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const GOLDEN_DUES = [5500, 17000, 52800, 12100, 8800];

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
  type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
  const call = async (sql: string, params: unknown[] = []): Promise<R> => {
    await db.query("savepoint sp");
    try { const rows = (await db.query(sql, params)).rows; await db.query("release savepoint sp"); return { ok: true, rows }; }
    catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: (e as Error).message }; }
  };
  const errOf = (r: R) => (r.ok ? "(no error)" : r.err);
  const asUid = async (uid: string) => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await db.query(`set local role authenticated`);
  };
  const asAnon = async () => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
    await db.query(`set local role anon`);
  };
  const asPg = async () => { await db.query("reset role"); };
  try {
    const st = await one<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]);
    const orgA = st?.org_id;
    const orgB = (await one<{ id: string }>(`select id from public.orgs where name = $1`, [ORG_B]))?.id;
    const owner = await one<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS.ownerA.email]);
    const seats = await q<{ id: string }>(`select id from public.seats where store_id = $1 and is_active order by name limit 5`, [st?.id]);
    const prodDrink = await one<{ id: string }>(`select id from public.products where store_id = $1 and name = 'NOX-VERIFY-指名ドリンク' and is_active`, [st?.id]);
    const prodChamp = await one<{ id: string }>(`select id from public.products where store_id = $1 and name = 'NOX-VERIFY-シャンパン' and is_active`, [st?.id]);
    const casts = await q<{ id: string }>(`select id from public.casts where store_id = $1 and is_active order by name`, [st?.id]);
    const cust = await one<{ id: string }>(`select id from public.customers where store_id = $1 and name = 'NOX-VERIFY-顧客-フリー'`, [st?.id]);
    check("dr(0-1) fixture: A1／org B／owner-a／卓 5／商品 2／cast 2／顧客 が引ける", !!st && !!orgB && !!owner && seats.length === 5 && !!prodDrink && !!prodChamp && casts.length >= 2 && !!cust);
    if (!st || !orgB || !owner || seats.length < 5 || !prodDrink || !prodChamp || casts.length < 2 || !cust) throw new Error("fixture 解決失敗");

    // 表順＝live の関数定数から読む（68 表・memberships 含む）
    const src = (await one<{ prosrc: string }>(`select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = 'demo_org_reset'`))?.prosrc ?? "";
    const loadArr = (src.match(/c_load constant text\[\] := array\[([\s\S]*?)\];/)?.[1].match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ""));
    check("dr(0-2) live demo_org_reset の投入順＝68 表（stores 直後に memberships）", loadArr.length === 68 && loadArr[0] === "stores" && loadArr[1] === "memberships", `got ${loadArr.length}`);
    const orgWhere = (t: string) => (t === "memberships" ? `store_id in (select id from public.stores where org_id = $1)` : `org_id = $1`);
    const countsOf = async (org: string) => {
      const o: Record<string, number> = {};
      for (const t of loadArr) o[t] = (await one<{ n: number }>(`select count(*)::int n from public."${t}" where ${orgWhere(t)}`, [org])).n;
      return o;
    };

    const snapSql = `select (select count(*)::int from public.checks where org_id = $1) c, (select count(*)::int from public.check_lines where org_id = $1) l,
      (select count(*)::int from public.stock_logs where org_id = $1) sl, (select count(*)::int from public.audit_logs where org_id = $1) au,
      (select count(*)::int from public.casts where org_id = $1) ca, (select count(*)::int from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = $1) m,
      (select is_demo from public.orgs where id = $1) d, (select demo_reset_at from public.orgs where id = $1) dr, (select settings_json::text from public.stores where id = $2) sj,
      (select count(*)::int from storage.objects where bucket_id = 'cast-photos') so`;
    const snap = async () => JSON.stringify(await one(snapSql, [orgA, st.id]));
    const before = await snap();
    const cntB0 = await countsOf(orgB);

    // (9) 0150
    const rs = await q<{ rolname: string; setconfig: string[] | null }>(`select r.rolname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname in ('service_role','anon','authenticated')`);
    const cfg = Object.fromEntries(rs.map((r) => [r.rolname, (r.setconfig ?? []).find((c) => c.startsWith("statement_timeout"))]));
    check("dr(9-1) 0150: service_role statement_timeout=30s・anon 3s／authenticated 8s 不変", cfg.service_role === "statement_timeout=30s" && cfg.anon === "statement_timeout=3s" && cfg.authenticated === "statement_timeout=8s", JSON.stringify(cfg));

    await db.query("begin");
    try {
      await db.query(`update public.orgs set is_demo = true where id = $1`, [orgA]);
      // ── (1) 録画 5 枚（PoC と同じ店舗設定＝同 tx 内・ROLLBACK で戻る）──
      await asUid(owner.auth_user_id);
      await call(`select public.set_store_time_pricing($1, 60, 5000, 30, 3000, 'manual', 'table')`, [st.id]);
      await call(`select public.set_store_pricing($1, 3000, 2000, 5000, 10, 5, 100, 'down')`, [st.id]);
      const openChk = async (seat: string, people: number | null, nom: string, customer: string | null = null) => { const r = await call(`select public.check_open($1, $2, $3, $4) as id`, [seat, people, nom, customer]); if (!r.ok) throw new Error("check_open: " + r.err); return r.rows[0].id as string; };
      const pay = async (chk: string, method: string, amount: number) => call(`select public.check_pay($1, $2, $3, 'A', $5, $4::uuid, null)`, [chk, method, amount, randomUUID(), method === "cash" ? amount : null]);
      const close = async (chk: string) => call(`select public.check_close($1, $2::uuid)`, [chk, randomUUID()]);
      const totalOf = async (chk: string) => (await one<{ total: number }>(`select total from public.checks where id = $1`, [chk])).total;
      const ids: string[] = [];
      { const c = await openChk(seats[0].id, 2, "free"); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
      { const c = await openChk(seats[1].id, 1, "hon"); await call(`select public.check_set_nominations($1, $2::jsonb)`, [c, JSON.stringify([{ cast_id: casts[0].id, weight: 1, nom_kind: "hon", is_dohan: false, ended: false }])]); await call(`select public.check_shimei_add($1, $2, 'hon', $3::uuid)`, [c, casts[0].id, randomUUID()]); await call(`select public.check_add_line($1, $2, 3, null, 'A', null, null)`, [c, prodDrink.id]); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
      { const c = await openChk(seats[2].id, 2, "dohan"); await call(`select public.check_set_nominations($1, $2::jsonb)`, [c, JSON.stringify([{ cast_id: casts[1].id, weight: 1, nom_kind: "hon", is_dohan: true, ended: false }])]); await call(`select public.check_dohan_add($1, $2, 1, $3::uuid)`, [c, casts[1].id, randomUUID()]); await call(`select public.check_add_line($1, $2, 1, null, 'A', null, null)`, [c, prodChamp.id]); await pay(c, "card", await totalOf(c)); await close(c); ids.push(c); }
      { const c = await openChk(seats[3].id, 3, "free"); await asPg(); await db.query(`update public.checks set started_at = now() - interval '95 minutes' where id = $1`, [c]); await asUid(owner.auth_user_id); await call(`select public.check_time_charge_apply($1)`, [c]); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
      { const c = await openChk(seats[4].id, 2, "free", cust.id); await call(`select public.check_add_line($1, null, 1, 'custom', 'A', 'demo カスタム', 3000)`, [c]); await call(`select public.check_add_referral($1, $2, 2000, 'demo 紹介', $3::uuid)`, [c, casts[0].id, randomUUID()]); await pay(c, "ar", await totalOf(c)); await close(c); ids.push(c); }
      await asPg();
      const rec: { id: string; due: number; total: number }[] = [];
      for (const id of ids) rec.push({ id, due: (await one<{ d: number }>(`select public.check_group_due($1, 'A') d`, [id])).d, total: (await one<{ total: number; status: string }>(`select total from public.checks where id = $1`, [id])).total });
      const closedN = (await one<{ n: number }>(`select count(*)::int n from public.checks where id = any($1) and status = 'closed'`, [ids])).n;
      check("dr(1-1) 録画 5 枚が close 済み", closedN === 5, `closed=${closedN}`);
      check("dr(1-2) 録画 5 枚の total＝check_group_due", rec.every((r) => r.total === r.due), JSON.stringify(rec.map((r) => [r.total, r.due])));
      check("dr(1-3) golden due 5 値（5500／17000／52800／12100／8800）", JSON.stringify(rec.map((r) => r.due)) === JSON.stringify(GOLDEN_DUES), JSON.stringify(rec.map((r) => r.due)));
      const payload: Record<string, Record<string, unknown>[]> = {};
      const beforeCounts = await countsOf(orgA);
      for (const t of loadArr) {
        if (t === "audit_logs") continue;
        const rows = await q(`select * from public."${t}" where ${orgWhere(t)}`, [orgA]);
        const use = t === "stock_logs" ? rows.filter((r) => !["sale", "sale_remove"].includes(String(r.reason))) : rows;
        if (use.length) payload[t] = use;
      }
      const saleBefore = (await one<{ n: number }>(`select count(*)::int n from public.stock_logs where org_id = $1 and reason = 'sale'`, [orgA])).n;
      const productLines = (await one<{ n: number }>(`select count(*)::int n from public.check_lines where org_id = $1 and product_id is not null and qty <> 0`, [orgA])).n;
      check("dr(1-4) payload: memberships を含む・audit_logs を含まない・stock_logs に sale／sale_remove なし", !!payload.memberships && payload.memberships.length === beforeCounts.memberships && !payload.audit_logs && !(payload.stock_logs ?? []).some((r) => ["sale", "sale_remove"].includes(String(r.reason))), `memberships=${payload.memberships?.length} saleBefore=${saleBefore}`);
      const payloadStr = JSON.stringify(payload);
      check("dr(1-5) payload 1 MB 以下（277-4）", Buffer.byteLength(payloadStr) < 1_000_000, `${Buffer.byteLength(payloadStr)} B`);

      // ── (3) 前段: settings_json を書き換える ──
      const sjPayload = JSON.stringify((payload.stores.find((r) => r.id === st.id) as { settings_json: unknown }).settings_json);
      await db.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{"__demo_probe":"before reset"}'::jsonb where id = $1`, [st.id]);

      // ── (2) reset('all') ──
      const r1 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all') as r`, [orgA, payloadStr]);
      check("dr(2-1) demo_org_reset('all') が通る（戻り {mode, deleted, inserted}）", r1.ok && (r1.rows[0].r as { mode: string }).mode === "all" && !!(r1.rows[0].r as { deleted: unknown }).deleted && !!(r1.rows[0].r as { inserted: unknown }).inserted, errOf(r1));
      const afterCounts = await countsOf(orgA);
      const diff = loadArr.filter((t) => !["audit_logs", "stock_logs"].includes(t) && afterCounts[t] !== beforeCounts[t]).map((t) => `${t}:${beforeCounts[t]}→${afterCounts[t]}`);
      check("dr(2-2) 再生後の表別件数＝再生前（audit_logs／stock_logs 以外の全表・memberships 含む）", diff.length === 0, diff.join(","));
      const saleAfter = (await one<{ n: number }>(`select count(*)::int n from public.stock_logs where org_id = $1 and reason = 'sale'`, [orgA])).n;
      const saleDup = (await one<{ n: number }>(`select count(*)::int n from (select store_id, product_id, delta, at from public.stock_logs where org_id = $1 and reason = 'sale' group by 1,2,3,4 having count(*) > 1) x`, [orgA])).n;
      check("dr(2-3) stock_logs の sale 行＝トリガ再生成で product 明細数と一致・二重なし", saleAfter === productLines && saleDup === 0, `saleAfter=${saleAfter} productLines=${productLines} dup=${saleDup}`);
      const misAt = (await one<{ n: number }>(`select count(*)::int n from public.stock_logs sl where sl.org_id = $1 and sl.reason = 'sale' and not exists (select 1 from public.check_lines l where l.org_id = sl.org_id and l.store_id = sl.store_id and l.product_id = sl.product_id and -l.qty = sl.delta and l.created_at = sl.at)`, [orgA])).n;
      check("dr(2-4) ★7 sale 行の at＝元明細の created_at（now() のまま残る行 0）", misAt === 0, `mismatch=${misAt}`);
      const res: { rec: number; due: number; total: number; mirror: number }[] = [];
      for (const r of rec) {
        const due = (await one<{ d: number }>(`select public.check_group_due($1, 'A') d`, [r.id])).d;
        const c = await one<{ total: number; service_rate: number; round_unit: number; round_mode: string; business_tax_status: string; price_display: string; tax_rounding: string }>(`select total, service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding from public.checks where id = $1`, [r.id]);
        const lines = await q<DueLine>(`select line_total, kind, tax_category from public.check_lines where check_id = $1 and pay_group = 'A'`, [r.id]);
        res.push({ rec: r.due, due, total: c.total, mirror: groupDueFull(lines, c) });
      }
      check("dr(2-5) 三点一致 5 枚（check_group_due＝checks.total＝録画値＝groupDueFull 鏡像）", res.length === 5 && res.every((x) => x.due === x.rec && x.total === x.rec && x.mirror === x.rec), JSON.stringify(res));
      const o1 = await one<{ demo_reset_at: Date | null }>(`select demo_reset_at from public.orgs where id = $1`, [orgA]);
      const auN = (await one<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id = $1 and action = 'demo.reset' and target = $2`, [orgA, "orgs:" + orgA])).n;
      check("dr(2-6) demo_reset_at 更新・audit 'demo.reset' 1 行（target orgs:<id>）", o1.demo_reset_at !== null && auN === 1, `reset_at=${o1.demo_reset_at} audit=${auN}`);

      // ── (3) 復元 ──
      const sjNow = await one<{ s: string }>(`select settings_json::text s from public.stores where id = $1`, [st.id]);
      check("dr(3-1) reset 前に書き換えた stores.settings_json が payload の値に戻る（probe 消失）", JSON.stringify(JSON.parse(sjNow.s)) === sjPayload && !sjNow.s.includes("__demo_probe"), sjNow.s.slice(0, 100));
      await asUid(owner.auth_user_id);
      const seen = (await one<{ n: number }>(`select count(*)::int n from public.checks`)).n;
      const seenM = (await one<{ n: number }>(`select count(*)::int n from public.memberships where user_id = $1`, [owner.id])).n;
      await asPg();
      check("dr(3-2) owner の emulate で checks を select できる（memberships 復元＝RLS 通過）", seen === beforeCounts.checks && seen > 0 && seenM >= 1, `seen=${seen}/${beforeCounts.checks} own membership=${seenM}`);

      // ── (4) 隔離 ──
      const cntB1 = await countsOf(orgB);
      const diffB = loadArr.filter((t) => cntB1[t] !== cntB0[t]).map((t) => `${t}:${cntB0[t]}→${cntB1[t]}`);
      check("dr(4-1) 他 org（B）の全 68 表の行数が reset 前後で不変（memberships 含む）", diffB.length === 0, diffB.join(","));

      // ── (5) raise ──
      const e1 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgB, "{}"]);
      check("dr(5-1) 'not demo'（is_demo=false の org B）", !e1.ok && e1.err === "not demo", errOf(e1));
      const e2 = await call(`select public.demo_org_reset($1, $2::jsonb, 'nuke')`, [orgA, "{}"]);
      check("dr(5-2) 'bad mode'", !e2.ok && e2.err === "bad mode", errOf(e2));
      const e3 = await call(`select public.demo_org_reset($1, null, 'load')`, [orgA]);
      const e3b = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, "[]"]);
      check("dr(5-3) 'bad payload'（load に null／object でない）", !e3.ok && e3.err === "bad payload" && !e3b.ok && e3b.err === "bad payload", errOf(e3) + "/" + errOf(e3b));
      const e4 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, foo: [] })]);
      check("dr(5-4) 'bad table'（未知の表 foo）", !e4.ok && e4.err === "bad table", errOf(e4));
      const kept: string[] = [];
      for (const k of ["orgs", "org_billing", "users"]) { const e = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, [k]: [] })]); kept.push(errOf(e)); }
      check("dr(5-5) 'bad table'（残す 3 表 orgs／org_billing／users のキー）", kept.every((e) => e === "bad table"), kept.join("/"));
      const e5 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, checks: payload.checks.map((r, i) => (i === 0 ? { ...r, org_id: orgB } : r)) })]);
      check("dr(5-6) 'org mismatch'（checks 1 行の org_id を B に）", !e5.ok && e5.err === "org mismatch", errOf(e5));
      const stB = (await one<{ id: string }>(`select id from public.stores where org_id = $1 limit 1`, [orgB])).id;
      const usB = (await one<{ id: string }>(`select id from public.users where org_id = $1 limit 1`, [orgB])).id;
      const e6 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, memberships: payload.memberships.map((r, i) => (i === 0 ? { ...r, store_id: stB } : r)) })]);
      const e6b = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, memberships: payload.memberships.map((r, i) => (i === 0 ? { ...r, user_id: usB } : r)) })]);
      check("dr(5-7) 'org mismatch'（memberships の store_id／user_id が他 org＝279-1）", !e6.ok && e6.err === "org mismatch" && !e6b.ok && e6b.err === "org mismatch", errOf(e6) + "/" + errOf(e6b));
      const e7 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, JSON.stringify({ ...payload, stock_logs: [...(payload.stock_logs ?? []), { id: randomUUID(), org_id: orgA, store_id: st.id, product_id: prodDrink.id, delta: -1, reason: "sale", by_user_id: null, at: new Date().toISOString() }] })]);
      check("dr(5-8) 'bad stock_logs'（reason='sale' の行入り）", !e7.ok && e7.err === "bad stock_logs", errOf(e7));
      const cntA5 = await countsOf(orgA);
      check("dr(5-9) raise 8 種の後も件数不変（1 行でも不一致なら何も書かない）", loadArr.every((t) => cntA5[t] === afterCounts[t]), loadArr.filter((t) => cntA5[t] !== afterCounts[t]).join(","));

      // ── (6) 冪等 ──
      const sum0 = (await one<{ s: number }>(`select coalesce(sum(total), 0)::int s from public.checks where org_id = $1`, [orgA])).s;
      const g1 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, payloadStr]);
      const g2 = await call(`select public.demo_org_reset($1, $2::jsonb, 'all')`, [orgA, payloadStr]);
      const cntG = await countsOf(orgA);
      const sumG = (await one<{ s: number }>(`select coalesce(sum(total), 0)::int s from public.checks where org_id = $1`, [orgA])).s;
      check("dr(6-1) 2 回連続 reset('all')＝件数・Σtotal 不変", g1.ok && g2.ok && loadArr.every((t) => t === "audit_logs" || cntG[t] === afterCounts[t]) && sumG === sum0, `${errOf(g1)} ${errOf(g2)} Σ ${sum0}→${sumG}`);
      const oW0 = await one<{ demo_reset_at: Date | null }>(`select demo_reset_at from public.orgs where id = $1`, [orgA]);
      const w = await call(`select public.demo_org_reset($1, null, 'wipe')`, [orgA]);
      const cntW = await countsOf(orgA);
      const oW1 = await one<{ demo_reset_at: Date | null }>(`select demo_reset_at from public.orgs where id = $1`, [orgA]);
      check("dr(6-2) mode=wipe＝68 表が 0（memberships・stores 含む・audit_logs は wipe 自身の 1 行が残る＝★8）・demo_reset_at 不変・users／orgs は残る", w.ok && loadArr.every((t) => t === "audit_logs" || cntW[t] === 0) && String(oW0.demo_reset_at) === String(oW1.demo_reset_at) && (await one<{ n: number }>(`select count(*)::int n from public.users where org_id = $1`, [orgA])).n > 0, `${errOf(w)} nonzero=${loadArr.filter((t) => t !== "audit_logs" && cntW[t] !== 0).join(",")}`);
      const l = await call(`select public.demo_org_reset($1, $2::jsonb, 'load')`, [orgA, payloadStr]);
      const cntL = await countsOf(orgA);
      const sumL = (await one<{ s: number }>(`select coalesce(sum(total), 0)::int s from public.checks where org_id = $1`, [orgA])).s;
      check("dr(6-3) wipe→load の 2 回呼びで同結果（件数・Σtotal）", l.ok && loadArr.every((t) => t === "audit_logs" || cntL[t] === afterCounts[t]) && sumL === sum0, `${errOf(l)} Σ ${sumL}`);

      // ── (7) 権限 ──
      await asAnon();
      const p1 = await call(`select public.demo_org_reset($1, $2::jsonb, 'wipe')`, [orgA, "{}"]);
      await asPg();
      await asUid(owner.auth_user_id);
      const p2 = await call(`select public.demo_org_reset($1, $2::jsonb, 'wipe')`, [orgA, "{}"]);
      await asPg();
      check("dr(7-1) anon／authenticated（owner）の emulate では permission denied", !p1.ok && /permission denied for function/.test(p1.err) && !p2.ok && /permission denied for function/.test(p2.err), errOf(p1) + " / " + errOf(p2));
      const cntP = await countsOf(orgA);
      check("dr(7-2) 拒否後も件数不変（wipe は走っていない）", loadArr.every((t) => t === "audit_logs" || cntP[t] === afterCounts[t]));

      // ── (8) storage ──
      const castId = casts[0].id;
      const objName = `${orgA}/${castId}.jpg`;
      await asUid(owner.auth_user_id);
      const s1 = await call(`insert into storage.objects (bucket_id, name, owner) values ('cast-photos', $1, $2::uuid) returning id`, [objName, owner.auth_user_id]);
      await asPg();
      check("dr(8-1) is_demo=true の org の owner は cast-photos へ insert できない（RLS 拒否）", !s1.ok && /row-level security/.test(s1.err), errOf(s1));
      await db.query(`update public.orgs set is_demo = false where id = $1`, [orgA]);
      await asUid(owner.auth_user_id);
      const s2 = await call(`insert into storage.objects (bucket_id, name, owner) values ('cast-photos', $1, $2::uuid) returning id`, [objName, owner.auth_user_id]);
      await asPg();
      check("dr(8-2) is_demo=false なら従来どおり insert が通る（同 tx 内・ROLLBACK で消える）", s2.ok, errOf(s2));
      // 直接 delete は storage.protect_delete() が拒む＝ROLLBACK に任せる
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("dr(10-1) ROLLBACK 後の残留＝実行前と同値（checks／lines／stock_logs／audit／casts／memberships／is_demo／demo_reset_at／settings_json／storage）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-demo-reset ALL PASS (${pass} assertions)`);
  console.log("demo_org_reset(0149/0150): 録画 5 枚 golden 5 値 / reset all＝件数・三点一致・stock_logs 再生成・★7 at / 復元 settings_json・RLS / 隔離 B 68 表 / raise 8 種 / 冪等 all×2・wipe→load / 権限 anon・authenticated denied / storage is_demo 拒否 / 0150 30s / ROLLBACK 一致");
}

main().catch((e) => { console.error(e); process.exit(1); });
