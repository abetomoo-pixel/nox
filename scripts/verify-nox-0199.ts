/**
 * verify:nox-0199 — 0199（2026-11-10 Agoora 手貼り・検証 9 行一致・関数 422／表 120 不変・sha16 a68669f112662a19）＝★1 裁定459／M-114（set_store_profile の白名単に line_notify）＋★2 裁定466／M-125（kiosk_person_claim に cast ∧ can_register ∧ 店 ≥2）の恒久回帰。
 *  (1) フラグ＝MIG_0199_APPLIED=true・override
 *  (2) 収蔵＝supabase/migrations/0199_line_notify.sql（sha16・commit; 1 回・lock_timeout）＋client（M-114 の保存＝4 鍵明示／M-125 の cookie・layout）
 *  (3) live（読取）＝docs/tmp/0199_verify.sql の 9 行が期待値どおり（Agoora の返りと同値）・2 関数の md5
 *  (4) live（BEGIN…ROLLBACK＝DB 変更 0）＝try_0199.mjs の 15 段を写す（★1 4 鍵／1 鍵／知らない鍵／boolean 以外／object 以外／{}／manager／bad key／audit・★2 cast の claim 3 段＋staff／owner）
 */
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { MIG_0199_APPLIED, mig0199On, __set0199ForTest } from "../lib/nox/rules-0175/flag";
import { LINE_NOTIFY_KINDS, lineNotifyPatchOf } from "../lib/nox/line/notify-kinds";
import { kioskPersonSessionAllowedOf, parseKioskPersonCookie } from "../lib/nox/kiosk/person-session";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
const fb = (x: R) => !x.ok && /forbidden/.test(x.err);
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// (1)
check("0199(1-1) MIG_0199_APPLIED=true（2026-11-10 手貼り・verify 9 行一致）・override", (MIG_0199_APPLIED as boolean) === true && mig0199On() === true);
__set0199ForTest(false); check("0199(1-2) __set0199ForTest(false) で mig0199On() は false・cast の本人セッションは不可に戻る", mig0199On() === false && kioskPersonSessionAllowedOf("cast") === false); __set0199ForTest(null);
// (2)
const mig = fs.readFileSync("supabase/migrations/0199_line_notify.sql");
const sha16 = createHash("sha256").update(mig).digest("hex").slice(0, 16);
const migText = mig.toString("utf8");
check("0199(2-1) 収蔵＝sha16 a68669f112662a19・954 行・begin〜commit 1 回・lock_timeout・★1 line_notify の白名単＋guard・★2 cast 枝", sha16 === "a68669f112662a19" && migText.split("\n").length === 955 && (migText.match(/^commit;$/gm) ?? []).length === 1 && migText.includes("set local lock_timeout = '10s';") && migText.includes("'line_notify'];") && migText.includes("raise exception 'bad line_notify'") && migText.includes("v_mem.role = 'cast' and coalesce(v_mem.can_register, false)"), sha16);
check("0199(2-2) M-114 純関数＝lineNotifyPatchOf は 4 鍵を常に明示（原則7）・true 以外は false", J(lineNotifyPatchOf({ notice: true, remind: true })) === J({ line_notify: { notice: true, shift_published: false, shift_changed: false, remind: true } }) && J(lineNotifyPatchOf({})) === J({ line_notify: { notice: false, shift_published: false, shift_changed: false, remind: false } }) && LINE_NOTIFY_KINDS.length === 4);
{
  const lp = src("app/(manage)/master/line-config-panel.tsx");
  check("0199(2-3) M-114 client＝店舗設定 › LINE 連携の種類ごとの保存（管理者だけ・デモ不可・set_store_profile の p_patch＝lineNotifyPatchOf・errJa・保存後に再読込）", lp.includes("const notifyEditable = isOwner && !isDemo && mig0199On();") && lp.includes('const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: lineNotifyPatchOf(notify) });') && lp.includes("if (error) { setErr(errJa(error.message)); return; }") && lp.includes("setMsg(LINE_NOTIFY_SAVED_MSG); await load();") && lp.includes('disabled={!notifyEditable || busy} onChange={(e) => setNotify((n) => ({ ...n, [k]: e.target.checked }))}') && lp.includes('data-line-notify-save="1"') && lp.includes('data-line-notify-editable={notifyEditable ? "1" : "0"}'));
  const sid = randomUUID(), did = randomUUID();
  check("0199(2-4) M-125 cookie の解読＝cast も通す（owner は捨てる）・layout＝本人セッションの cast は /register だけ・ナビ＝レジ 1 つ", J(parseKioskPersonCookie(`${sid}:${did}:cast`)) === J({ sessionId: sid, deviceId: did, role: "cast" }) && parseKioskPersonCookie(`${sid}:${did}:owner`) === null && src("app/(manage)/layout.tsx").includes('const kioskPersonCast = mig0196On() && mig0199On() && role === "cast"') && src("app/(manage)/layout.tsx").includes('items: kioskPersonCast ? [{ href: "/register", label: "レジ" }]'));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const pc = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await pc.connect();
  try {
    // (3) 9 行
    const rows = (await pc.query(src("docs/tmp/0199_verify.sql"))).rows as { k: string; v: string }[];
    const exp: Record<string, string> = {
      "fn count (expect = before = 422 after 0198 / 419 before)": "427" /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */, "set_store_profile count (expect 1)": "1", "whitelist has line_notify (expect yes)": "yes", "bad line_notify guard (expect yes)": "yes",
      "set_store_profile anon/authenticated exec (expect 0/1)": "0/1", "kiosk_person_claim cast branch (expect yes)": "yes", "kiosk_person_claim anon/authenticated/service_role exec (expect 0/0/1 = route の service_role だけ)": "0/0/1",
    };
    const bad = rows.filter((r) => exp[r.k] !== undefined && exp[r.k] !== r.v).map((r) => `${r.k}=${r.v}`);
    const ln = rows.find((r) => r.k.startsWith("no store has line_notify yet"))?.v ?? "";
    check("0199(3-1) 検証 9 行＝期待値どおり（Agoora の返り 2026-11-10 と同値・line_notify を持つ店は手貼り直後 0・client の保存で増える＝整数）", rows.length === 9 && bad.length === 0 && /^\d+$/.test(ln), { n: rows.length, bad, ln });
    const md = (await pc.query(`select proname, left(md5(replace(prosrc, chr(13), '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_profile','kiosk_person_claim') order by 1`)).rows as { proname: string; m: string }[];
    check("0199(3-2) 2 関数の prosrc md5＝手貼り直後の live（2026-11-10）", md.length === 2 && md[0].m === "bb2f83f6" && md[1].m === "f4347735" /* ★0200: 287f6800→f4347735 */, md);
    // (4) BEGIN…ROLLBACK
    const cnt = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
    const before = await cnt();
    await pc.query("begin");
    try {
      const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0] as { id: string; org_id: string };
      const mem = async (role: string) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active order by m.id limit 1`, [st.id, role])).rows[0] as { id: string; user_id: string; auth_user_id: string };
      const owner = await mem("owner"), manager = await mem("manager");
      const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<R> => {
        await pc.query("savepoint a");
        try {
          await pc.query("set local role authenticated");
          await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
          const r = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: r.rows };
        } catch (err) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, err: (err as Error).message }; }
      };
      const lnOf = async () => (await pc.query(`select settings_json->'line_notify' v from public.stores where id=$1`, [st.id])).rows[0].v as Record<string, unknown> | null;
      // ★1
      let r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J(lineNotifyPatchOf({ shift_published: true, remind: true }))]);
      { const v = await lnOf(); check("0199(4-1) ★1 owner＝client の patch（4 鍵明示）＝ok・settings_json.line_notify に保存", r.ok && !!v && v.notice === false && v.shift_published === true && v.shift_changed === false && v.remind === true && Object.keys(v).length === 4, r.ok ? v : r.err); }
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: { notice: true } })]);
      check("0199(4-2) ★1 1 鍵だけ＝ok・object は置換（欠けた鍵は client の既定）", r.ok && J(await lnOf()) === J({ notice: true }), r.ok ? await lnOf() : r.err);
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: { notice: true, publish: true } })]); check("0199(4-3) ★1 知らない鍵＝'bad line_notify'", !r.ok && /bad line_notify/.test(r.err), r.ok ? "ok" : r.err);
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: { notice: "yes" } })]); check("0199(4-4) ★1 boolean 以外＝'bad line_notify'", !r.ok && /bad line_notify/.test(r.err), r.ok ? "ok" : r.err);
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: true })]); check("0199(4-5) ★1 object 以外＝'bad line_notify'", !r.ok && /bad line_notify/.test(r.err), r.ok ? "ok" : r.err);
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: {} })]); check("0199(4-6) ★1 空の object＝ok（client は既定で動く）", r.ok && J(await lnOf()) === "{}", r.ok ? "ok" : r.err);
      r = await as(manager, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notify: { notice: true } })]); check("0199(4-7) ★1 manager＝forbidden（店ポリシーは owner 限定）", fb(r), r.ok ? "ok" : r.err);
      r = await as(owner, `select public.set_store_profile($1, $2::jsonb)`, [st.id, J({ line_notifyx: { notice: true } })]); check("0199(4-8) ★1 白名単に無い鍵＝'bad key'", !r.ok && /bad key/.test(r.err), r.ok ? "ok" : r.err);
      const au = (await pc.query(`select count(*)::int n from public.audit_logs where action='set_store_profile' and target='stores:' || $1::text and after_json ? 'line_notify'`, [st.id])).rows[0].n as number;
      check("0199(4-9) ★1 audit に line_notify（ok の 3 回）", au >= 3, au);
      // ★2
      const castMem = (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='cast' and m.is_active and u.auth_user_id is not null order by m.id limit 1`, [st.id])).rows[0] as { id: string; user_id: string } | undefined;
      const kUid = randomUUID(); const kr = await as(manager, `select public.kiosk_provision($1, $2, 'NOX-VERIFY-0199 端末') id`, [kUid, st.id]); const devId = kr.ok ? (kr.rows[0].id as string) : null;
      check("0199(4-10) 試走用の端末", kr.ok && !!devId, kr.ok ? "ok" : kr.err);
      if (castMem && devId) {
        await pc.query(`update public.kiosk_devices set device_fp='fp0199', bound_at=now() where id=$1`, [devId]);
        const mkSession = async (mid: string, uid: string) => (await pc.query(`insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, unlock_method) values ($1, $2, $3, $4, $5, 'pin') returning id`, [st.org_id, st.id, devId, mid, uid])).rows[0].id as string;
        const claim = async (): Promise<{ ok: true; j: { ok?: boolean; role?: string } } | { ok: false; err: string }> => { await pc.query("savepoint k"); try { const x = await pc.query(`select public.kiosk_person_claim($1, 'fp0199') j`, [kUid]); await pc.query("release savepoint k"); return { ok: true, j: x.rows[0].j }; } catch (e) { await pc.query("rollback to savepoint k"); return { ok: false, err: (e as Error).message }; } };
        const endAll = async () => pc.query(`update public.kiosk_sessions set ended_at=now() where device_id=$1 and ended_at is null`, [devId]);
        const setStore = async (n: number) => pc.query(`update public.stores set settings_json = jsonb_set(coalesce(settings_json,'{}'::jsonb), '{sys_cast_register}', $2::jsonb) where id=$1`, [st.id, String(n)]);
        await pc.query(`update public.memberships set can_register=false where id=$1`, [castMem.id]); await setStore(2);
        await mkSession(castMem.id, castMem.user_id); let r2 = await claim(); check("0199(4-11) ★2 cast（can_register=false・店 2）＝forbidden", !r2.ok && /forbidden/.test(r2.err), r2.ok ? "ok" : r2.err); await endAll();
        await pc.query(`update public.memberships set can_register=true where id=$1`, [castMem.id]); await setStore(1);
        await mkSession(castMem.id, castMem.user_id); r2 = await claim(); check("0199(4-12) ★2 cast（can_register・店 1＝注文のみ）＝forbidden", !r2.ok && /forbidden/.test(r2.err), r2.ok ? "ok" : r2.err); await endAll();
        await setStore(2);
        await mkSession(castMem.id, castMem.user_id); r2 = await claim();
        check("0199(4-13) ★2 cast（can_register・店 2＝会計まで）＝ok・role cast・person_role=cast・audit kiosk_person_claim", r2.ok && r2.j.ok === true && r2.j.role === "cast" && (await pc.query(`select person_role from public.kiosk_sessions where device_id=$1 and person_auth_session order by started_at desc limit 1`, [devId])).rows[0].person_role === "cast", r2.ok ? r2.j : r2.err); await endAll();
        const stf = (await pc.query(`select m.id, m.user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='staff' and m.is_active and u.auth_user_id is not null limit 1`, [st.id])).rows[0] as { id: string; user_id: string } | undefined;
        if (stf) { await mkSession(stf.id, stf.user_id); r2 = await claim(); check("0199(4-14) ★2 staff は従来どおり ok", r2.ok && r2.j.role === "staff", r2.ok ? "ok" : r2.err); await endAll(); } else check("0199(4-14) staff（auth あり）が A1 に無い", false);
        await mkSession(owner.id, owner.user_id); r2 = await claim(); check("0199(4-15) ★2 owner は従来どおり forbidden（管理者は通常ログイン）", !r2.ok && /forbidden/.test(r2.err), r2.ok ? "ok" : r2.err); await endAll();
      } else check("0199(4-11〜15) cast membership（auth あり）と端末", false);
      const mid = await cnt(); check("0199(4-16) tx 内も関数 422・表 120（作り直し 2＝関数数不変）", mid.f === 427 && mid.t === 121 /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */, mid);
    } finally { await pc.query("rollback"); }
    const after = await cnt();
    check("0199(4-17) ROLLBACK＝DB 変更 0（関数 422・表 120）", after.f === before.f && after.t === before.t && after.f === 427 /* ★0200（2026-11-10 手貼り）: 422→427・表 120→121 */, after);
  } finally { await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0199 ALL PASS (${pass} assertions)`);
})();
