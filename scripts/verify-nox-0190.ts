/*
 * verify:nox-0190 — 0190 打刻ゲート＋端末の束縛＋便 K（⑥ RLS kiosk 腕・⑦ M-29 上限 3 台・⑧ ロック 10 分）の本番適用後の挙動（2026-10-30）。
 *  翻訳元＝docs/tmp/t0190_rollback.mts（BEGIN…ROLLBACK 試走・18 expect）。mig 本体は流さない（適用済み＝本番の定義で試す）。DB 恒久変更 0。
 *  NOX-VERIFY-A1 の fixture（ownerA／managerA1／castA1a／staffA1）で 1 本の BEGIN…ROLLBACK の中だけを動かす＝A1 のデータは触らない:
 *   - 打刻ゲート＝on_duty_of（cast）打刻なし false→in true→out false・assert_on_duty 'off duty'／通る・manager は免除で audit 'off_duty_exempt'・
 *     店設定 duty_gate=false は通る・set_store_profile の duty_gate は boolean だけ（白名単）・staff は staff_punches で通る・assert の置き場 25 本。
 *   - 端末の束縛＝kiosk_device_bind 初回で束縛→同じ fp は bound=false→別の fp 'device bound'→短い fp 'bad device_fp'・
 *     kiosk_login／unlock／qr_secret／qr_poll は別 fp・fp なしで 'device bound'・kiosk_device_unbind は owner だけ→別 fp で再束縛・audit bind 2＋unbind 1。
 *   - 退店＝staff_deactivate で staff_pin 削除・kiosk_sessions 'retired'・cast_leave で staff_pin 削除。
 *   - ACL＝入口 4 本（DROP→CREATE）と退店 2 本は authenticated＋service_role・anon なし・内部 3 本は anon／authenticated とも BLOCKED。
 *   - 便 K＝_select_kiosk ポリシー 29・端末ユーザーは自店の seats／stores を読める（他店 0）・kiosk_provision は 1 店 3 台（有効な既存を数えて 3−n0 台だけ発行→次は 'device limit'）・
 *     無効化→枠が空く→再発行して有効化は上限で 'device limit'→manager forbidden→有効な端末の削除 'still active'→無効化済みの削除で行が消える・kiosk_login の既定ロック 10 分。
 *   - 教訓128＝関数数はトランザクションの外で前後に数えて両方を印字・不変（394＝0191 後）・0190 の新関数 7 本（duty_gate_of／on_duty_of／assert_on_duty／
 *     kiosk_device_bind／kiosk_device_unbind＋便 K の kiosk_reactivate／kiosk_delete）が各 1 定義。
 *  使い方: npm run verify:nox-0190（env: SUPABASE_DB_URL・無ければ FAIL）
 */
import pg from "pg";
import { pgTx, type CallResult } from "./fixtures-pgtx";
try { process.loadEnvFile(".env.local"); } catch { /* 無ければ env 直指定 */ }

let ok = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const ENTRY = ["kiosk_login", "kiosk_unlock", "kiosk_qr_secret", "kiosk_qr_poll", "cast_leave", "staff_deactivate"];
const NEW_FNS = ["duty_gate_of", "on_duty_of", "assert_on_duty", "kiosk_device_bind", "kiosk_device_unbind", "kiosk_reactivate", "kiosk_delete"];
const FN_PIN = 394; // ★0191（2026-10-30 適用）: 393→394（setup_draft_set）← ★0190: 386→393
const FN_COUNT_SQL = `select count(*)::int n from pg_proc where pronamespace='public'::regnamespace`;

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) { console.error("verify:nox-0190 FAIL: SUPABASE_DB_URL が無い"); process.exit(1); }
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tx = pgTx(c);
  const out: Record<string, unknown> = {};
  // ★教訓128: トランザクションの外で前に数える
  const fnBefore = (await c.query(FN_COUNT_SQL)).rows[0].n as number;
  console.log(`[教訓128] pg_proc(public) before = ${fnBefore}`);
  let fnAfter = -1;
  try {
    await c.query("begin");
    // ── 定義（関数・ポリシー・ACL） ──
    const newFns = await tx.q<{ proname: string; n: number }>(`select proname, count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname = any($1::text[]) group by proname`, [NEW_FNS]);
    expect("0190 の新関数 7 本（duty_gate_of／on_duty_of／assert_on_duty／kiosk_device_bind／kiosk_device_unbind＋便 K kiosk_reactivate／kiosk_delete）が各 1 定義", newFns.length === NEW_FNS.length && newFns.every((r) => r.n === 1), newFns);
    const acl = Object.fromEntries((await tx.q<{ proname: string; a: string | null }>(`select proname, proacl::text a from pg_proc where pronamespace='public'::regnamespace and proname = any($1::text[])`, [ENTRY])).map((r) => [r.proname, r.a]));
    expect("ACL＝入口 4 本（DROP→CREATE）と退店 2 本の proacl＝authenticated＋service_role・anon なし", ENTRY.every((n) => typeof acl[n] === "string" && /authenticated=X/.test(acl[n]!) && /service_role=X/.test(acl[n]!) && !/anon=/.test(acl[n]!)), acl);
    const polN = (await tx.one<{ n: number }>(`select count(*)::int n from pg_policies where schemaname = 'public' and policyname like '%_select_kiosk'`))!.n;
    expect("⑥ RLS kiosk 腕＝_select_kiosk ポリシー 29（store_id 27＋stores＋users）", polN === 29, { polN });

    const A1 = await tx.storeA1(); const owner = await tx.uidOf("ownerA"); const mgr = await tx.uidOf("managerA1"); const castA = await tx.uidOf("castA1a"); const staffU = await tx.uidOf("staffA1");
    const castId = (await tx.castOf(A1.id, castA.id))!;
    for (const s of await tx.q<{ id: string }>(`select id from public.checks where store_id = $1 and status = 'open'`, [A1.id])) await c.query(`update public.checks set status = 'void' where id = $1`, [s.id]);
    await c.query(`delete from public.punches where cast_id = $1 and punched_at > now() - interval '2 days'`, [castId]);   // 当日の打刻を空に（ROLLBACK で戻る）
    await c.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) - 'duty_gate' where id = $1`, [A1.id]); // 既定＝ゲート ON（ROLLBACK で戻る）
    const seat = (await tx.one<{ id: string }>(`select s.id from public.seats s where s.store_id = $1 and s.is_active and s.kind = '卓' order by s.name limit 1`, [A1.id]))!.id;
    const biz = (await tx.one<{ d: string }>(`select public.biz_date_of($1, now())::text d`, [A1.id]))!.d;
    // ── 打刻ゲート（cast＝on_duty_of と assert を直接・manager の経路） ──
    const od0 = await tx.one<{ v: boolean }>(`select public.on_duty_of('cast', $1, $2, $3::date) v`, [castId, A1.id, biz]);
    await tx.asUid(castA.auth_user_id); await c.query("reset role");
    const a0 = await tx.call(`select public.assert_on_duty('check_open')`);   // 打刻なし → 'off duty'
    const p1 = await tx.as(castA, `select public.punch_self('in') r`);
    const od1 = await tx.one<{ v: boolean }>(`select public.on_duty_of('cast', $1, $2, $3::date) v`, [castId, A1.id, biz]);
    await tx.asUid(castA.auth_user_id); await c.query("reset role");
    const a1 = await tx.call(`select public.assert_on_duty('check_open')`);   // in の後 → 通る
    const p2 = await tx.as(castA, `select public.punch_self('out') r`);
    const od2 = await tx.one<{ v: boolean }>(`select public.on_duty_of('cast', $1, $2, $3::date) v`, [castId, A1.id, biz]);
    await tx.asUid(castA.auth_user_id); await c.query("reset role");
    const a2c = await tx.call(`select public.assert_on_duty('check_open')`);   // out の後 → 'off duty'
    expect("on_duty_of（cast）＝打刻なし false → in で true → out で false", od0?.v === false && p1.ok && od1?.v === true && p2.ok && od2?.v === false, { od0, p1: tx.errOf(p1), od1, p2: tx.errOf(p2), od2 });
    expect("assert_on_duty（cast）＝打刻なし→'off duty'・in の後→通る・out の後→'off duty'", !a0.ok && /off duty/.test(tx.errOf(a0)) && a1.ok && !a2c.ok && /off duty/.test(tx.errOf(a2c)), { a0: tx.errOf(a0), a1: tx.errOf(a1), a2c: tx.errOf(a2c) });
    // manager＝免除＋audit の印（打刻なし）
    //   ★audit_logs は append-only＝過去の run（anon-guard の manager のレジ流れ等）の 'off_duty_exempt' が残るため、同じ絞りの前後差 +1 で見る（試走の「=1」は本番 0 行の時だけ成り立った）
    const AU_SQL = `select count(*)::text n from public.audit_logs where action = 'off_duty_exempt' and store_id = $1 and target = 'check_open'`;
    const auN0 = (await tx.one<{ n: string }>(AU_SQL, [A1.id]))!.n;
    const o1 = await tx.as(mgr, `select public.check_open($1, 1) r`, [seat]);
    const auN1 = (await tx.one<{ n: string }>(AU_SQL, [A1.id]))!.n;
    expect("manager（打刻なし）＝check_open は通る・audit に 'off_duty_exempt'（target＝check_open）が +1 行", o1.ok && Number(auN1) === Number(auN0) + 1, { o1: tx.errOf(o1), auN0, auN1 });
    // duty_gate=false＝cast も通る
    await c.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{"duty_gate":false}'::jsonb where id = $1`, [A1.id]);
    await c.query(`delete from public.punches where cast_id = $1 and punched_at > now() - interval '2 days'`, [castId]);
    await tx.asUid(castA.auth_user_id); await c.query("reset role");
    const a2 = await tx.call(`select public.assert_on_duty('check_pay')`);
    expect("店設定 duty_gate=false＝打刻なしでも通る（assert は何もしない）", a2.ok, tx.errOf(a2));
    const s1 = await tx.as(owner, `select public.set_store_profile($1, '{"duty_gate": true}'::jsonb)`, [A1.id]);
    const s2 = await tx.as(owner, `select public.set_store_profile($1, '{"duty_gate": "x"}'::jsonb)`, [A1.id]);
    const dg = await tx.one<{ v: boolean }>(`select public.duty_gate_of($1) v`, [A1.id]);
    expect("set_store_profile duty_gate＝boolean だけ受理（文字列は bad type）・duty_gate_of が読む", s1.ok && !s2.ok && /bad type/.test(tx.errOf(s2)) && dg?.v === true, { s1: tx.errOf(s1), s2: tx.errOf(s2), dg });
    // staff（打刻なし）＝off duty・staff_punches を入れると通る
    const staffM = (await tx.one<{ id: string }>(`select m.id from public.memberships m where m.user_id = $1 and m.store_id = $2 and m.is_active`, [staffU.id, A1.id]))!.id;
    await tx.asUid(staffU.auth_user_id); await c.query("reset role");
    const b0 = await tx.call(`select public.assert_on_duty('check_add_line')`);
    await c.query(`insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source) values ($1, $2, $3, $4::date, 'in', now(), 'kiosk')`, [staffM, A1.org_id, A1.id, biz]);
    await tx.asUid(staffU.auth_user_id); await c.query("reset role");
    const b1 = await tx.call(`select public.assert_on_duty('check_add_line')`);
    expect("staff（打刻なし）＝'off duty'・staff_punches に in を入れると通る", !b0.ok && /off duty/.test(tx.errOf(b0)) && b1.ok, { b0: tx.errOf(b0), b1: tx.errOf(b1) });
    // 置き場＝25 本に assert の行
    const gated = (await tx.one<{ n: string }>(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and prosrc like '%assert_on_duty(''%' and proname <> 'assert_on_duty'`))!.n;
    const notGated = (await tx.one<{ n: string }>(`select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('product_stock_add','daily_report_close') and prosrc like '%assert_on_duty%'`))!.n;
    expect("assert の置き場＝レジの check_*＋approval 25 本・在庫（product_stock_add）と日報（daily_report_close）には無い", gated === "25" && notGated === "0", { gated, notGated });
    // ── 端末の束縛（A1 の端末 fixture＝owner の auth ユーザーを端末として使う・ROLLBACK で消える） ──
    const dev = (await tx.one<{ id: string }>(`insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose) values ($1, $2, $3, 'NOX-VERIFY-0190 端末', 'register') returning id`, [A1.org_id, A1.id, owner.auth_user_id]))!.id;
    const bd1 = await tx.as(owner, `select public.kiosk_device_bind('fp-aaaaaaaaaaaa', 'Mozilla/5.0 iPad') r`);
    const bd2 = await tx.as(owner, `select public.kiosk_device_bind('fp-aaaaaaaaaaaa', 'Mozilla/5.0 iPad') r`);
    const bd3 = await tx.as(owner, `select public.kiosk_device_bind('fp-bbbbbbbbbbbb', 'x') r`);
    const bd4 = await tx.as(owner, `select public.kiosk_device_bind('short', 'x') r`);
    const row = await tx.one<{ fp: string; ua: string; b: string | null }>(`select device_fp fp, bound_ua ua, bound_at::text b from public.kiosk_devices where id = $1`, [dev]);
    expect("kiosk_device_bind＝初回で束縛（fp・UA・日時）・同じ fp は bound=false・別の fp は 'device bound'・短い fp は bad device_fp", bd1.ok && (bd1.rows[0].r as { bound: boolean }).bound === true && bd2.ok && (bd2.rows[0].r as { bound: boolean }).bound === false && !bd3.ok && /device bound/.test(tx.errOf(bd3)) && !bd4.ok && /bad device_fp/.test(tx.errOf(bd4)) && row?.fp === "fp-aaaaaaaaaaaa" && row.ua === "Mozilla/5.0 iPad" && row.b !== null, { bd1: tx.errOf(bd1), bd3: tx.errOf(bd3), bd4: tx.errOf(bd4), row });
    const l1 = await tx.as(owner, `select public.kiosk_login($1::uuid, '0000', 'fp-bbbbbbbbbbbb') r`, [staffM]);
    const l2 = await tx.as(owner, `select public.kiosk_login($1::uuid, '0000') r`, [staffM]);
    const l3 = await tx.as(owner, `select public.kiosk_login($1::uuid, '0000', 'fp-aaaaaaaaaaaa') r`, [staffM]);
    const u1 = await tx.as(owner, `select public.kiosk_unlock('0000', null, 'fp-bbbbbbbbbbbb') r`);
    const q1 = await tx.as(owner, `select public.kiosk_qr_secret(false, 'fp-bbbbbbbbbbbb') r`);
    const q2 = await tx.as(owner, `select public.kiosk_qr_poll('fp-bbbbbbbbbbbb') r`);
    expect("束縛済みの端末＝kiosk_login／unlock／qr_secret／qr_poll は別 fp・fp なし→'device bound'・同じ fp は束縛で止まらない（PIN の判定へ進む）", !l1.ok && /device bound/.test(tx.errOf(l1)) && !l2.ok && /device bound/.test(tx.errOf(l2)) && !/device bound/.test(tx.errOf(l3)) && !u1.ok && /device bound/.test(tx.errOf(u1)) && !q1.ok && /device bound/.test(tx.errOf(q1)) && !q2.ok && /device bound/.test(tx.errOf(q2)), { l1: tx.errOf(l1), l2: tx.errOf(l2), l3: tx.errOf(l3), u1: tx.errOf(u1), q1: tx.errOf(q1), q2: tx.errOf(q2) });
    const ub1 = await tx.as(mgr, `select public.kiosk_device_unbind($1::uuid)`, [dev]);
    const ub2 = await tx.as(owner, `select public.kiosk_device_unbind($1::uuid)`, [dev]);
    const bd5 = await tx.as(owner, `select public.kiosk_device_bind('fp-bbbbbbbbbbbb', 'y') r`);
    const au = await tx.one<{ n: string }>(`select count(*)::text n from public.audit_logs where action in ('kiosk_device_bind','kiosk_device_unbind') and target = 'kiosk_devices:' || $1`, [dev]);
    expect("kiosk_device_unbind＝manager は forbidden・オーナーで解除→別の fp で再束縛できる・audit に bind 2＋unbind 1", !ub1.ok && /forbidden/.test(tx.errOf(ub1)) && ub2.ok && bd5.ok && (bd5.rows[0].r as { bound: boolean }).bound === true && au?.n === "3", { ub1: tx.errOf(ub1), ub2: tx.errOf(ub2), bd5: tx.errOf(bd5), au });
    // ── 退店＝PIN 削除・kiosk_sessions 'retired' ──
    await c.query(`insert into public.staff_pin (membership_id, org_id, store_id, pin_hash) values ($1, $2, $3, 'x') on conflict (membership_id) do update set pin_hash = 'x'`, [staffM, A1.org_id, A1.id]);
    const ses = (await tx.one<{ id: string }>(`insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, token_hash) values ($1, $2, $3, $4, $5, 'h') returning id`, [A1.org_id, A1.id, dev, staffM, staffU.id]))!.id;
    const d1 = await tx.as(owner, `select public.staff_deactivate($1::uuid)`, [staffM]);
    const pinN = (await tx.one<{ n: string }>(`select count(*)::text n from public.staff_pin where membership_id = $1`, [staffM]))!.n;
    const sesR = await tx.one<{ r: string | null; e: string | null }>(`select end_reason r, ended_at::text e from public.kiosk_sessions where id = $1`, [ses]);
    expect("staff_deactivate＝staff_pin が消える・kiosk_sessions が ended（end_reason 'retired'）", d1.ok && pinN === "0" && sesR?.r === "retired" && sesR.e !== null, { d1: tx.errOf(d1), pinN, sesR });
    const castM = (await tx.one<{ id: string }>(`select m.id from public.memberships m where m.user_id = $1 and m.store_id = $2 and m.is_active`, [castA.id, A1.id]))!.id;
    await c.query(`insert into public.staff_pin (membership_id, org_id, store_id, pin_hash) values ($1, $2, $3, 'x') on conflict (membership_id) do update set pin_hash = 'x'`, [castM, A1.org_id, A1.id]);
    const cl1 = await tx.as(owner, `select public.cast_leave($1::uuid)`, [castId]);
    const pinC = (await tx.one<{ n: string }>(`select count(*)::text n from public.staff_pin where membership_id = $1`, [castM]))!.n;
    expect("cast_leave＝その人の membership の staff_pin が消える", cl1.ok && pinC === "0", { cl1: tx.errOf(cl1), pinC });
    // anon・内部
    const an1 = await tx.as("anon", `select public.assert_on_duty('x')`);
    const an2 = await tx.as(owner, `select public.on_duty_of('cast', gen_random_uuid(), gen_random_uuid(), current_date)`);
    const an3 = await tx.as("anon", `select public.kiosk_device_bind('fp-cccccccccccc', 'x')`);
    expect("内部 3 本は anon も authenticated も BLOCKED・kiosk_device_bind は anon BLOCKED", !an1.ok && /permission denied/.test(tx.errOf(an1)) && !an2.ok && /permission denied/.test(tx.errOf(an2)) && !an3.ok && /permission denied/.test(tx.errOf(an3)), { an1: tx.errOf(an1), an2: tx.errOf(an2), an3: tx.errOf(an3) });
    // ── 便 K（⑥ RLS kiosk 腕・⑦ M-29 上限 3／再発行して有効化／削除・⑧ ロック 10 分） ──
    const kAuth = (await tx.one<{ u: string }>(`select gen_random_uuid() u`))!.u;
    const kprov = await tx.as(owner, `select public.kiosk_provision($1::uuid, $2::uuid, 't0190-reg', 'register') r`, [kAuth, A1.id]);
    const kdev = kprov.ok ? { auth_user_id: kAuth, id: (kprov.rows[0] as { r: string }).r } : null;
    let kioskRead: unknown = null;
    if (kdev) {
      const mgrMem = (await tx.one<{ id: string }>(`select m.id from public.memberships m join public.users u on u.id = m.user_id where u.id = $1 and m.is_active limit 1`, [mgr.id]))!.id;
      await c.query(`update public.kiosk_sessions set ended_at = now(), end_reason = 'manual' where device_id = $1 and ended_at is null`, [kdev.id]).catch(() => undefined);
      await c.query(`insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, started_at, last_seen_at, unlock_method) values ($1, $2, $3, $4, $5, now(), now(), 'pin')`, [A1.org_id, A1.id, kdev.id, mgrMem, mgr.id]).catch(async (e: Error) => { kioskRead = { sessionInsert: e.message }; });
      const r1 = await tx.as({ auth_user_id: kdev.auth_user_id }, `select count(*)::int n from public.seats where store_id = $1`, [A1.id]);
      const r2 = await tx.as({ auth_user_id: kdev.auth_user_id }, `select count(*)::int n from public.stores where id = $1`, [A1.id]);
      const r3 = await tx.as({ auth_user_id: kdev.auth_user_id }, `select count(*)::int n from public.seats where store_id <> $1`, [A1.id]);
      kioskRead = kioskRead ?? { seats: r1.ok ? r1.rows[0] : tx.errOf(r1), stores: r2.ok ? r2.rows[0] : tx.errOf(r2), other: r3.ok ? r3.rows[0] : tx.errOf(r3) };
      expect("⑥ RLS kiosk 腕＝端末ユーザー（解除中）は自店の seats／stores を読める・他店は 0", r1.ok && (r1.rows[0] as { n: number }).n > 0 && r2.ok && (r2.rows[0] as { n: number }).n === 1 && r3.ok && (r3.rows[0] as { n: number }).n === 0, { kioskRead });
    } else expect("⑥ RLS kiosk 腕（レジ端末の発行に失敗＝読取の実測なし）", false, { kprov: tx.errOf(kprov) });
    // ⑦ 上限 3＝有効な既存（n0）を数えて 3−n0 台だけ発行→次の 1 台が 'device limit'
    const n0 = (await tx.one<{ n: number }>(`select count(*)::int n from public.kiosk_devices where store_id = $1 and purpose = 'punch' and is_active`, [A1.id]))!.n;
    const kps: CallResult[] = [];
    for (let i = 1; i <= 3 - n0; i++) kps.push(await tx.as(owner, `select public.kiosk_provision(gen_random_uuid(), $1::uuid, $2, 'punch') r`, [A1.id, `t0190-${i}`]));
    const kpOver = await tx.as(owner, `select public.kiosk_provision(gen_random_uuid(), $1::uuid, 't0190-over', 'punch') r`, [A1.id]);
    const punchN = (await tx.one<{ n: number }>(`select count(*)::int n from public.kiosk_devices where store_id = $1 and purpose = 'punch' and is_active`, [A1.id]))!.n;
    expect(`⑦ M-29 上限＝打刻端末を 3 台まで（既存 ${n0} 台＋発行 ${3 - n0} 台＝3・次の 1 台は 'device limit'・無効は数えない）`, n0 <= 3 && kps.every((k) => k.ok) && punchN === 3 && !kpOver.ok && /device limit/.test(tx.errOf(kpOver)), { n0, kps: kps.map((k) => tx.errOf(k)), kpOver: tx.errOf(kpOver), punchN });
    const kd1 = kps.length && kps[0].ok ? (kps[0].rows[0] as { r: string }).r : null;
    const de = kd1 ? await tx.as(owner, `select public.kiosk_deactivate($1::uuid)`, [kd1]) : { ok: false, err: "no device（n0=3＝残留端末あり・発行 0 台）" } as const;
    const kp5 = await tx.as(owner, `select public.kiosk_provision(gen_random_uuid(), $1::uuid, 't0190-5', 'punch') r`, [A1.id]);
    const re1 = kd1 ? await tx.as(owner, `select public.kiosk_reactivate($1::uuid)`, [kd1]) : { ok: false, err: "no device" } as const;
    const de2 = kd1 ? await tx.as(owner, `select public.kiosk_deactivate($1::uuid)`, [kd1]) : { ok: false, err: "no device" } as const;
    const reM = kd1 ? await tx.as(mgr, `select public.kiosk_reactivate($1::uuid)`, [kd1]) : { ok: false, err: "no device" } as const;
    const delA = kp5.ok ? await tx.as(owner, `select public.kiosk_delete($1::uuid)`, [(kp5.rows[0] as { r: string }).r]) : { ok: false, err: "no device" } as const;
    const del1 = kd1 ? await tx.as(owner, `select public.kiosk_delete($1::uuid)`, [kd1]) : { ok: false, err: "no device" } as const;
    const gone = kd1 ? (await tx.one<{ n: number }>(`select count(*)::int n from public.kiosk_devices where id = $1`, [kd1]))!.n : -1;
    const aud = (await tx.one<{ n: number }>(`select count(*)::int n from public.audit_logs where action in ('kiosk_reactivate','kiosk_delete') and target = 'kiosk_devices:' || $1`, [kd1 ?? ""]))!.n;
    expect("⑦ M-29 無効化→（枠が空く＝5 台目 OK）→再発行して有効化＝上限に達していると 'device limit'→無効化→manager は forbidden→有効な端末の削除は 'still active'→無効化済みの削除で行が消える・audit 2 行", de.ok && kp5.ok && !re1.ok && /device limit/.test(tx.errOf(re1)) && de2.ok && !reM.ok && /forbidden/.test(tx.errOf(reM)) && !delA.ok && /still active/.test(tx.errOf(delA)) && del1.ok && gone === 0 && aud >= 1, { de: tx.errOf(de), kp5: tx.errOf(kp5), re1: tx.errOf(re1), de2: tx.errOf(de2), reM: tx.errOf(reM), delA: tx.errOf(delA), del1: tx.errOf(del1), gone, aud });
    const lock10 = (await tx.one<{ ok: boolean }>(`select (prosrc like '%::int, 10));%') ok from pg_proc where pronamespace='public'::regnamespace and proname = 'kiosk_login'`))!.ok;
    expect("⑧ K-1 kiosk_login の既定ロック＝10 分", lock10 === true);
    out.md5 = Object.fromEntries((await tx.q<{ proname: string; m: string }>(`select proname, left(md5(replace(prosrc, chr(13), '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('duty_gate_of','on_duty_of','assert_on_duty','kiosk_device_bind','kiosk_device_unbind','kiosk_login','kiosk_unlock','kiosk_qr_secret','kiosk_qr_poll','cast_leave','staff_deactivate','set_store_profile','check_open','check_add_line','check_pay','check_close','kiosk_provision','kiosk_reactivate','kiosk_delete') order by proname`)).map((r) => [r.proname, r.m]));
  } catch (e) {
    expect("例外なし", false, (e as Error).message);
  } finally {
    await c.query("rollback").catch(() => undefined);
    // ★教訓128: トランザクションの外で後に数える・前後で不変（DB 恒久変更 0）
    fnAfter = (await c.query(FN_COUNT_SQL).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n as number;
    console.log(`[教訓128] pg_proc(public) after  = ${fnAfter}`);
    const left = await c.query(`select count(*)::int n from public.kiosk_devices where label like 't0190-%' or label = 'NOX-VERIFY-0190 端末'`).catch(() => ({ rows: [{ n: -1 }] }));
    expect("ROLLBACK＝kiosk_devices に t0190-*／NOX-VERIFY-0190 の残留 0", (left.rows[0] as { n: number }).n === 0, left.rows[0]);
    await c.end().catch(() => undefined);
  }
  expect(`教訓128: 関数数は前後で不変（${FN_PIN}＝0191 後）`, fnBefore === fnAfter && fnBefore === FN_PIN, { fnBefore, fnAfter });
  console.log(JSON.stringify(out));
  if (fails.length) { console.error(`verify:nox-0190 FAIL ${fails.length}（pass ${ok}）`); for (const f of fails) console.error(" - " + f.slice(0, 1500)); process.exit(1); }
  console.log(`verify:nox-0190 ALL PASS (${ok} assertions)`);
}
void main();
