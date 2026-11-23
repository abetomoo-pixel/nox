/*
 * try-0204 — 段 3 の 3-1（0204a_people）と 3-2（0204b_person_mynumber）の試走（BEGIN … ROLLBACK＝本番に残さない・f0 の走行中は流さない＝casts の DDL が錠を取る）。
 *  教訓（0190 の事故）: 本体を送る前に先頭の begin; と末尾の commit; を外し、ほかに commit; が無いことを確かめる。
 *  NOX-VERIFY-A（A1・A2）で役ごとに通す。最後に必ず rollback。
 *  使い方（作業木）: npx tsx scripts/try-0204.mts
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";

const DIR = "C:/Users/abet/Dropbox/cloude/nox/docs/tmp/0204/";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const bodyOf = (file: string) => {
  const lines = fs.readFileSync(DIR + file, "utf8").split(/\r?\n/);
  const bi = lines.findIndex((l) => l.trim() === "begin;"), ci = lines.map((l) => l.trim()).lastIndexOf("commit;");
  if (bi < 0 || ci <= bi) throw new Error(`${file}: begin; と commit; の行が見つからない`);
  const body = lines.slice(bi + 1, ci).join("\n");
  if (/^\s*(commit|rollback|begin)\s*;/im.test(body)) throw new Error(`${file}: 本体の中に begin／commit／rollback がある＝送らない`);
  return body;
};
const A = bodyOf("0204a_people.sql"), B = bodyOf("0204b_person_mynumber.sql");
const fake = (ver: "nox1" | "nox2", seed: number) => `${ver}:k1:${Buffer.from(Array.from({ length: 40 }, (_, i) => (i * 7 + seed) % 256)).toString("base64")}`;

const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await db.connect();
try {
  await db.query("begin");
  const tx = pgTx(db);
  console.log(`proof nox-project-proof ${(await tx.one<{ n: number }>("select count(*)::int n from public.orgs")).n}`);
  const cnt = async () => tx.one<{ f: number; t: number }>("select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t");
  const c0 = await cnt();
  const snap0 = (await tx.one<{ m: string }>("select md5(string_agg(id::text || updated_at::text, ',' order by id)) m from public.casts")).m;
  const regs0 = (await tx.one<{ n: number }>("select count(*)::int n from public.cast_sensitive where mynumber_enc is not null")).n;
  check("本番の登録は 0 件（cast_sensitive の暗号文）", regs0 === 0, regs0);

  // ═══ 3-1（0204a） ═══
  await db.query(A);
  const c1 = await cnt();
  check("3-1 表 +1・関数 +2", c1.t - c0.t === 1 && c1.f - c0.f === 2, { c0, c1 });
  const fill = await tx.one<{ nul: number; p: number; c: number; shared: number; bad: number }>("select (select count(*)::int from casts where person_id is null) nul, (select count(*)::int from people) p, (select count(*)::int from casts) c, (select count(*)::int from (select person_id from casts group by 1 having count(*) > 1) x) shared, (select count(*)::int from casts c join people p on p.id = c.person_id where p.org_id <> c.org_id) bad");
  check("3-1 全キャスト行に人・人の数＝キャスト行の数・人を分け合わない・会社が同じ", fill.nul === 0 && fill.p === fill.c && fill.shared === 0 && fill.bad === 0, fill);
  check("3-1 埋めても casts.updated_at は変わらない", (await tx.one<{ m: string }>("select md5(string_agg(id::text || updated_at::text, ',' order by id)) m from public.casts")).m === snap0);

  const A1 = await tx.one<{ id: string; org_id: string }>("select id, org_id from stores where name = 'NOX-VERIFY-A1'");
  const A2 = await tx.one<{ id: string }>("select id from stores where name = 'NOX-VERIFY-A2'");
  const who = async (email: string) => tx.one<{ auth_user_id: string; id: string }>("select auth_user_id, id from users where email = $1", [email]);
  const owner = await who("nox-verify-owner-a@example.com"), mgr = await who("nox-verify-manager-a1@example.com"), castU = await who("nox-verify-cast-a1a@example.com");
  const castSelf = (await tx.one<{ id: string }>("select id from casts where user_id = $1 and is_active", [castU.id])).id;
  const castA1 = (await tx.one<{ id: string }>("select id from casts where store_id = $1 and is_active and id <> $2 order by created_at limit 1", [A1.id, castSelf]))?.id ?? castSelf;
  const castA2 = (await tx.one<{ id: string }>("select id from casts where store_id = $1 order by created_at limit 1", [A2.id])).id;

  const mk = await tx.as(owner, "select public.cast_create($1, '試走0204', '1995-05-05', null, null) id", [A1.id]);
  const newCast = mk.ok ? String(mk.rows[0].id) : "";
  const np = mk.ok ? await tx.one<{ pid: string | null; po: string }>("select c.person_id pid, p.org_id po from casts c join people p on p.id = c.person_id where c.id = $1", [newCast]) : null;
  check("3-1 cast_create（作り直していない）で足した行にも人ができる（同じ会社）", mk.ok && !!np?.pid && np?.po === A1.org_id, [tx.errOf(mk), np]);
  const ins = await tx.call("insert into public.casts (org_id, store_id, name, is_active) select org_id, store_id, name, is_active from jsonb_populate_recordset(null::public.casts, $1::jsonb) returning id, person_id", [JSON.stringify([{ org_id: A1.org_id, store_id: A1.id, name: "試走0204デモ形", is_active: true }])]);
  const insRow = ins.ok ? (ins.rows[0] as { id: string; person_id: string | null }) : null;
  check("3-1 デモの入れ直しの形（jsonb_populate_recordset・person_id なし）でも人ができる", ins.ok && !!insRow?.person_id, tx.errOf(ins));
  if (insRow) {
    await tx.q("delete from public.casts where id = $1", [insRow.id]);
    check("3-1 キャスト行を消すと、その人も消える（キャスト行がもう無い）", (await tx.one<{ n: number }>("select count(*)::int n from people where id = $1", [insRow.person_id])).n === 0);
  }
  const otherOrgPerson = (await tx.one<{ id: string } | undefined>("select p.id from people p where p.org_id <> $1 limit 1", [A1.org_id]))?.id;
  if (otherOrgPerson) { const x = await tx.call("update casts set person_id = $1 where id = $2", [otherOrgPerson, castA1]); check("3-1 ほかの会社の人は指せない（FK）", !x.ok && /casts_person_fk/.test(tx.errOf(x)), tx.errOf(x)); }
  const seeOf = async (w: Parameters<typeof tx.as>[0]) => { const r = await tx.as(w, "select count(*)::int n from public.people"); return r.ok ? Number(r.rows[0].n) : tx.errOf(r); };
  const orgN = (await tx.one<{ n: number }>("select count(*)::int n from casts where org_id = $1", [A1.org_id])).n;
  const a1N = (await tx.one<{ n: number }>("select count(*)::int n from casts where store_id = $1", [A1.id])).n;
  const so = await seeOf(owner), sm = await seeOf(mgr), sc = await seeOf(castU), sa = await seeOf("anon");
  check("3-1 people の読取＝オーナーは会社の全員・店長は自店の人・キャストは自分だけ・anon は不可", so === orgN && sm === a1N && sc === 1 && typeof sa === "string" && /permission denied/.test(sa), { so, orgN, sm, a1N, sc, sa });
  const tr = await tx.as(owner, "truncate public.people");
  check("3-1 authenticated は TRUNCATE できない（grant は SELECT だけ）", !tr.ok && /permission denied/.test(tx.errOf(tr)), tx.errOf(tr));

  // ═══ 3-2（0204b） ═══
  const before = await tx.q<{ proname: string; acl: string; args: string; ret: string }>("select proname, proacl::text acl, pg_get_function_identity_arguments(oid) args, pg_get_function_result(oid) ret from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_sensitive','get_cast_mynumber','get_cast_mynumber_masked','get_cast_sensitive','get_cast_sensitive_ext','cast_mynumber_discard','cast_mynumber_discard_status','cast_mynumber_discard_candidates') order by 1");
  await db.query(B);
  const c2 = await cnt();
  check("3-2 表 +1・関数の数は変わらない", c2.t - c1.t === 1 && c2.f === c1.f, { c1, c2 });
  const after = await tx.q<{ proname: string; acl: string; args: string; ret: string }>("select proname, proacl::text acl, pg_get_function_identity_arguments(oid) args, pg_get_function_result(oid) ret from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_sensitive','get_cast_mynumber','get_cast_mynumber_masked','get_cast_sensitive','get_cast_sensitive_ext','cast_mynumber_discard','cast_mynumber_discard_status','cast_mynumber_discard_candidates') order by 1");
  check("3-2 作り直した 8 本は引数・戻り値・ACL が今と同じ", before.length === 8 && JSON.stringify(before) === JSON.stringify(after), { before, after });

  const e2 = fake("nox2", 3), e1 = fake("nox1", 5);
  const s1 = await tx.as(owner, "select public.set_cast_sensitive($1, '本名テスト', '1990-01-01', $2)", [castA1, e2]);
  const pm1 = await tx.one<{ enc: string; aad: string | null; reg: string | null; pid: string } | undefined>("select pm.mynumber_enc enc, pm.aad_cast_id aad, pm.mynumber_registered_on::text reg, pm.person_id pid from person_mynumber pm join casts c on c.person_id = pm.person_id where c.id = $1", [castA1]);
  const cs1 = await tx.one<{ enc: string | null; rn: string }>("select mynumber_enc enc, real_name rn from cast_sensitive where cast_id = $1", [castA1]);
  check("3-2 nox2 の登録＝人の行に暗号文（AAD の印なし）・登録日・本名はキャスト行・cast_sensitive の暗号文は空", s1.ok && pm1?.enc === e2 && pm1?.aad === null && !!pm1?.reg && cs1.enc === null && cs1.rn === "本名テスト", [tx.errOf(s1), pm1, cs1]);
  const s2 = await tx.as(owner, "select public.set_cast_sensitive($1, null, null, $2)", [castSelf, e1]);
  const pm2 = await tx.one<{ aad: string | null } | undefined>("select pm.aad_cast_id aad from person_mynumber pm join casts c on c.person_id = pm.person_id where c.id = $1", [castSelf]);
  check("3-2 nox1（今の画面の形）も受ける＝暗号化に使ったキャストの ID を残す", s2.ok && pm2?.aad === castSelf, [tx.errOf(s2), pm2]);
  const bad1 = await tx.as(owner, "select public.set_cast_sensitive($1, null, null, '1234-5678-9012')", [castA1]);
  const bad2 = await tx.as(owner, "select public.set_cast_sensitive($1, null, null, $2)", [castA1, e2.replace("nox2", "nox3")]);
  check("3-2 平文は plaintext rejected・知らない版は bad ciphertext（今と同じ語）", !bad1.ok && /plaintext rejected/.test(tx.errOf(bad1)) && !bad2.ok && /bad ciphertext/.test(tx.errOf(bad2)), [tx.errOf(bad1), tx.errOf(bad2)]);
  const keep = await tx.as(owner, "select public.set_cast_sensitive($1, '本名2', '1990-01-01', null)", [castA1]);
  check("3-2 番号を送らない（null）更新は今の番号のまま", keep.ok && (await tx.one<{ enc: string }>("select pm.mynumber_enc enc from person_mynumber pm join casts c on c.person_id = pm.person_id where c.id = $1", [castA1])).enc === e2, tx.errOf(keep));
  const mOther = await tx.as(mgr, "select public.set_cast_sensitive($1, null, null, $2)", [castA2, e2]);
  const mOwn = await tx.as(mgr, "select public.set_cast_sensitive($1, '本名3', '1990-01-01', null)", [castA1]);
  const cSet = await tx.as(castU, "select public.set_cast_sensitive($1, null, null, $2)", [castSelf, e2]);
  check("3-2 書ける人は今と同じ（店長は自店だけ・キャストは不可）", !mOther.ok && /forbidden/.test(tx.errOf(mOther)) && mOwn.ok && !cSet.ok && /forbidden/.test(tx.errOf(cSet)), [tx.errOf(mOther), tx.errOf(mOwn), tx.errOf(cSet)]);
  const gs = await tx.as(owner, "select mynumber_set from public.get_cast_sensitive($1)", [castA1]);
  const gx = await tx.as(castU, "select public.get_cast_sensitive_ext($1) j", [castSelf]);
  const gxo = await tx.as(castU, "select public.get_cast_sensitive_ext($1) j", [castA1]);
  check("3-2 有無の読み（get_cast_sensitive・ext）は人の行から・本人は自分だけ", gs.ok && gs.rows[0]?.mynumber_set === true && gx.ok && (gx.rows[0].j as { mynumber_set: boolean }).mynumber_set === true && !gxo.ok && /forbidden/.test(tx.errOf(gxo)), [tx.errOf(gs), tx.errOf(gx), tx.errOf(gxo)]);
  const gm = await tx.call("select public.get_cast_mynumber($1, $2, $3) e", [A1.org_id, owner.id, castA1]);
  const gmx = await tx.call("select public.get_cast_mynumber(gen_random_uuid(), $1, $2) e", [owner.id, castA1]);
  check("3-2 get_cast_mynumber（service）は人の行の暗号文・ほかの会社は forbidden", gm.ok && gm.rows[0].e === e2 && !gmx.ok && /forbidden/.test(tx.errOf(gmx)), [tx.errOf(gm), tx.errOf(gmx)]);
  const mk1 = await tx.call("select public.get_cast_mynumber_masked($1, $2, $3) e", [A1.org_id, mgr.id, castA1]);
  const mk2 = await tx.call("select public.get_cast_mynumber_masked($1, $2, $3) e", [A1.org_id, mgr.id, castA2]);
  const mk3 = await tx.call("select public.get_cast_mynumber_masked($1, $2, $3) e", [A1.org_id, castU.id, castSelf]);
  const mk4 = await tx.call("select public.get_cast_mynumber_masked($1, $2, $3) e", [A1.org_id, castU.id, castA1]);
  check("3-2 末尾 4 桁の口の判定は今と同じ（自店の店長・本人は可・他店と他人は forbidden）", mk1.ok && mk1.rows[0].e === e2 && !mk2.ok && mk3.ok && mk3.rows[0].e === e1 && !mk4.ok, [tx.errOf(mk1), tx.errOf(mk2), tx.errOf(mk3), tx.errOf(mk4)]);
  const anonG = await tx.as("anon", "select public.get_cast_mynumber($1, $2, $3)", [A1.org_id, owner.id, castA1]);
  const authG = await tx.as(owner, "select public.get_cast_mynumber($1, $2, $3)", [A1.org_id, owner.id, castA1]);
  check("3-2 get_cast_mynumber は anon も authenticated も呼べない（ACL 不変）", !anonG.ok && /permission denied/.test(tx.errOf(anonG)) && !authG.ok && /permission denied/.test(tx.errOf(authG)), [tx.errOf(anonG), tx.errOf(authG)]);
  const sel = await tx.as(owner, "select count(*) from public.person_mynumber");
  check("3-2 person_mynumber は authenticated から読めない", !sel.ok && /permission denied/.test(tx.errOf(sel)), tx.errOf(sel));
  const d1 = await tx.call("update cast_sensitive set mynumber_enc = $1 where cast_id = $2", [e1, castA1]); // nox1＝0201f の形の CHECK は通る形で、移した後の CHECK に当たること
  const d2 = await tx.call("update person_mynumber set mynumber_enc = '123456789012' where person_id = $1", [pm1?.pid]);
  const d3 = await tx.call("update person_mynumber set mynumber_enc = $1, aad_cast_id = null where person_id = $2", [e1, pm1?.pid]);
  check("3-2 関数を通らない書込でも：cast_sensitive に暗号文は入らない・平文は入らない・nox1 は AAD の印が要る", !d1.ok && /cast_sensitive_mynumber_moved_check/.test(tx.errOf(d1)) && !d2.ok && /person_mynumber_(enc_form|aad)_check/.test(tx.errOf(d2)) && !d3.ok && /person_mynumber_aad_check/.test(tx.errOf(d3)), [tx.errOf(d1), tx.errOf(d2), tx.errOf(d3)]);
  const st0 = await tx.as(mgr, "select * from public.cast_mynumber_discard_status($1)", [castA1]);
  const dm = await tx.as(mgr, "select public.cast_mynumber_discard($1, '試走')", [castA1]);
  const dc = await tx.as(owner, "select public.cast_mynumber_discard($1, '試走の廃棄')", [castA1]);
  const st1 = await tx.as(mgr, "select * from public.cast_mynumber_discard_status($1)", [castA1]);
  const pm3 = await tx.one<{ enc: string | null; aad: string | null; m: string | null }>("select pm.mynumber_enc enc, pm.aad_cast_id aad, pm.mynumber_deletion_method m from person_mynumber pm where pm.person_id = $1", [pm1?.pid]);
  const dc2 = await tx.as(owner, "select public.cast_mynumber_discard($1, '二回目')", [castA1]);
  check("3-2 廃棄＝オーナーだけ・人の行を空に（印も外す）・状態は人の行から・二回目は no mynumber",
    st0.ok && st0.rows[0]?.has_mynumber === true && !dm.ok && /forbidden/.test(tx.errOf(dm)) && dc.ok && st1.ok && st1.rows[0]?.has_mynumber === false && !!st1.rows[0]?.mynumber_deleted_at && pm3.enc === null && pm3.aad === null && pm3.m === "overwrite_null" && !dc2.ok && /no mynumber/.test(tx.errOf(dc2)),
    [st0.rows?.[0], tx.errOf(dm), tx.errOf(dc), st1.rows?.[0], pm3, tx.errOf(dc2)]);
  const cand = await tx.as(owner, "select * from public.cast_mynumber_discard_candidates(null)");
  const candM = await tx.as(mgr, "select * from public.cast_mynumber_discard_candidates(null)");
  check("3-2 廃棄の候補＝オーナーは読める（人ごと）・店長は forbidden", cand.ok && !candM.ok && /forbidden/.test(tx.errOf(candM)), [tx.errOf(cand), tx.errOf(candM)]);
  // 人の行を残す（キャスト行を消しても番号の行がある人は消さない）
  if (newCast) {
    await tx.as(owner, "select public.set_cast_sensitive($1, null, null, $2)", [newCast, fake("nox2", 9)]);
    const pid = (await tx.one<{ p: string }>("select person_id p from casts where id = $1", [newCast])).p;
    await tx.q("delete from cast_sensitive where cast_id = $1", [newCast]);
    const del = await tx.call("delete from casts where id = $1", [newCast]);
    const left = await tx.one<{ p: number; m: number }>("select (select count(*)::int from people where id = $1) p, (select count(*)::int from person_mynumber where person_id = $1) m", [pid]);
    check("3-2 キャスト行を消しても、番号の行がある人は消さない（保存の期間）", del.ok && left.p === 1 && left.m === 1, [tx.errOf(del), left]);
  }
  const audit = await tx.one<{ n: number }>("select count(*)::int n from audit_logs where action in ('set_cast_sensitive','cast_mynumber_discard','read_cast_mynumber','read_cast_mynumber_masked','read_cast_sensitive') and at >= now()");
  check("3-2 書く・読むの監査は今と同じく残る（試走の中だけ）", audit.n >= 8, audit);
} finally {
  await db.query("rollback").catch(() => undefined);
  await db.end();
}
if (fails.length) { console.error(`try-0204 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`try-0204 OK ${pass} checks（0204a・0204b・BEGIN … ROLLBACK・本番に残さない）`);
