/*
 * verify:nox-punch-match-db — ★0154 (9) 打刻の修正申請の DB 段（SUPABASE_DB_URL・pg tx ROLLBACK＝残留 0）。
 *   2026-10-29（CI の直し・Agoora 確定 10/27（6））: verify-nox-punch-match（純関数＝CI の pure の組）から分離＝DB を要する検査は手元の f0 だけで回す（env が無いときに SKIP で 0 終了する形にはしない）。
 *   npm run verify:nox-punch-match-db（事前に seed:f0 済み・env: SUPABASE_DB_URL）
 *   逆テスト 1 本（手動・1 回）: pm(9-5) の期待 'not pending' を 'pending' に書き換える→赤・戻して緑（RPC 側は触らない）。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx, ymdAdd } from "./fixtures-pgtx";

let pass = 0;
const fails: string[] = [];

// ── (9) ★mig0154（裁定294-1〜4／295・2026-09-24）: 打刻の修正申請＝AG 突合 d3／d4 の移植（pg tx で JWT emulate → ROLLBACK＝残留 0）──
//   request（cast 本人／owner・manager）→ decide（approve＝punches update／insert／delete・reject＝decide_reason 必須）→ ack（本人のみ）。
//   逆テスト 1 本（手動・1 回）: pm(9-5) の期待 'not pending' を 'pending' に書き換える→赤・戻して緑（RPC 側は触らない）。
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
async function dbChecks() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const t = pgTx(db);
  try {
    const st = await t.storeA1();
    const owner = await t.uidOf("ownerA"), mgr = await t.uidOf("managerA1"), staffU = await t.uidOf("staffA1"), castA = await t.uidOf("castA1a"), castB = await t.uidOf("castA1b");
    const castAId = await t.castOf(st.id, castA.id), castBId = await t.castOf(st.id, castB.id);
    check("pm(9-0) fixture: A1／owner／manager／staff／cast A1a・A1b", !!st && !!owner && !!mgr && !!staffU && !!castAId && !!castBId);
    const snapSql = `select (select count(*)::int from public.punches where store_id=$1) pu, (select count(*)::int from public.punch_corrections where store_id=$1) pc, (select count(*)::int from public.payroll_runs where store_id=$1) pr, (select count(*)::int from public.audit_logs where org_id=$2) au`;
    const before = JSON.stringify(await t.one(snapSql, [st.id, st.org_id]));
    await db.query("begin");
    try {
      // fixture（pg・ROLLBACK で消える）: 確定済み run 2098-06（finalized）・2098-07（paid）＝'period finalized' 用・punches 2 本（営業日 bizToday−2）
      for (const [per, stt] of [["2098-06", "finalized"], ["2098-07", "paid"]]) {
        await db.query(`insert into public.payroll_runs (org_id, store_id, period, status, period_start, period_end, created_by) values ($1,$2,$3,$4,($3||'-01')::date,(($3||'-01')::date + interval '1 month' - interval '1 day')::date,$5)`, [st.org_id, st.id, per, stt, owner.id]);
      }
      const bizToday = (await t.one<{ d: string }>(`select public.staff_shift_biz_today($1)::text d`, [st.id])).d;
      const biz = ymdAdd(bizToday, -2);
      const inAt = biz + "T20:00:00+09:00", outAt = new Date(new Date(biz + "T00:00:00+09:00").getTime() + 26 * 3600e3).toISOString();
      const pIn = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'in','self') returning id`, [st.org_id, st.id, castAId, inAt])).id;
      const pOut = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'out','self') returning id`, [st.org_id, st.id, castAId, outAt])).id;
      const pInB = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'in','self') returning id`, [st.org_id, st.id, castBId, inAt])).id;
      check("pm(9-1) fixture: 営業日窓＝out（翌 02:00）も同じ営業日", (await t.one<{ d: string }>(`select public.biz_date_of($1, $2::timestamptz)::text d`, [st.id, outAt])).d === biz, biz);
      const newIn = biz + "T20:30:00+09:00";
      const r1 = await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5) id`, [castAId, pIn, biz, newIn, "遅れて打刻"]);
      const id1 = r1.ok ? (r1.rows[0].id as string) : "";
      const row1 = id1 ? await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [id1]) : null;
      check("pm(9-2) cast 本人の申請→pending 1 行（before_at＝元・after_at＝新・kind in・decided_at null）・punches は未変更", r1.ok && row1?.decision === "pending" && row1?.kind === "in" && row1?.decided_at === null && new Date(row1?.after_at as string).toISOString() === new Date(newIn).toISOString() && new Date((await t.one<{ punched_at: string }>(`select punched_at from public.punches where id=$1`, [pIn])).punched_at).toISOString() === new Date(inAt).toISOString(), t.errOf(r1));
      const e = [
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "  "]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castBId, pInB, biz, newIn, "x"]),
        await t.as(staffU, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,null,'2098-06-15'::date,'in','2098-06-15T21:00:00+09:00'::timestamptz,$2)`, [castAId, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, bizToday + "T21:00:00+09:00", "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,'out',$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,null,$2::date,'in',null,$3)`, [castAId, biz, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pInB, biz, newIn, "x"]),
      ].map(t.errOf);
      check("pm(9-3) 'reason required'／他人 'forbidden'／staff 非本人 'forbidden'／★0158（裁定315）確定済み期（2098-06 finalized）の申請は通る（pending 1 行）／窓外 'out of biz window'／kind 不一致 'bad type'／新規かつ削除 'invalid_input'／他人の punch 'punch not found'", JSON.stringify(e) === JSON.stringify(["reason required", "forbidden", "forbidden", "(no error)", "out of biz window", "bad type", "invalid_input", "punch not found"]), e.join(" / "));
      check("pm(9-4) pending の ack→'not decided'", t.errOf(await t.as(castA, `select public.punch_correction_ack($1,'confirmed')`, [id1])) === "not decided");
      const d1 = await t.as(mgr, `select public.punch_correction_decide($1,false,null)`, [id1]), d2 = await t.as(staffU, `select public.punch_correction_decide($1,true,null)`, [id1]), d3 = await t.as(castA, `select public.punch_correction_decide($1,true,null)`, [id1]);
      check("pm(9-5) rejected は理由必須 'reason required'・staff／cast の decide は 'forbidden'", t.errOf(d1) === "reason required" && t.errOf(d2) === "forbidden" && t.errOf(d3) === "forbidden", [d1, d2, d3].map(t.errOf).join(" / "));
      const au0 = (await t.one<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id=$1 and action in ('punch_correction_decide','punch_correction_apply')`, [st.org_id])).n;
      const d4 = await t.as(mgr, `select public.punch_correction_decide($1,true,null)`, [id1]);
      const row1b = await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [id1]);
      const pu1b = await t.one<{ punched_at: string; note: string }>(`select punched_at, note from public.punches where id=$1`, [pIn]);
      const au1 = (await t.one<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id=$1 and action in ('punch_correction_decide','punch_correction_apply')`, [st.org_id])).n;
      const auR = await t.one<{ reason: string }>(`select reason from public.audit_logs where org_id=$1 and action='punch_correction_apply' and target=$2`, [st.org_id, "punches:" + pIn]);
      check("pm(9-6) manager 承認→approved・decided_by＝manager・punches.punched_at＝after_at・note＝punch_correction:<id>・audit decide＋apply（apply の reason＝申請理由）", d4.ok && row1b.decision === "approved" && row1b.decided_by === mgr.id && new Date(pu1b.punched_at).toISOString() === new Date(newIn).toISOString() && pu1b.note === "punch_correction:" + id1 && au1 === au0 + 2 && auR?.reason === "遅れて打刻", t.errOf(d4));
      check("pm(9-7) 二度目の decide→'not pending'", t.errOf(await t.as(mgr, `select public.punch_correction_decide($1,true,null)`, [id1])) === "not pending");
      const a1 = await t.as(castA, `select public.punch_correction_ack($1,'confirmed')`, [id1]), a2 = await t.as(castA, `select public.punch_correction_ack($1,'x')`, [id1]), a3 = await t.as(castB, `select public.punch_correction_ack($1,'disputed')`, [id1]), a4 = await t.as(owner, `select public.punch_correction_ack($1,'confirmed')`, [id1]), a5 = await t.as(castA, `select public.punch_correction_ack($1,'disputed')`, [id1]);
      const ackRow = await t.one<{ ack: string; ack_at: string | null }>(`select ack, ack_at from public.punch_corrections where id=$1`, [id1]);
      check("pm(9-8) ack: 本人 confirmed→disputed 上書き可・'bad ack'・他人 'forbidden'・owner（cast 行なし）'no cast for caller'", a1.ok && t.errOf(a2) === "bad ack" && t.errOf(a3) === "forbidden" && t.errOf(a4) === "no cast for caller" && a5.ok && ackRow.ack === "disputed" && ackRow.ack_at !== null, [a1, a2, a3, a4, a5].map(t.errOf).join(" / "));
      const rej = await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5) id`, [castAId, pOut, biz, new Date(new Date(outAt).getTime() + 1800e3).toISOString(), "退勤も"]);
      const rejId = rej.ok ? (rej.rows[0].id as string) : "";
      const dj = await t.as(owner, `select public.punch_correction_decide($1,false,'確認できず')`, [rejId]);
      const rejRow = await t.one<{ decision: string; decided_by: string; decide_reason: string | null }>(`select decision, decided_by, decide_reason from public.punch_corrections where id=$1`, [rejId]);
      const drApp = await t.one<{ decide_reason: string | null }>(`select decide_reason from public.punch_corrections where id=$1`, [id1]);
      check("pm(9-9) owner 却下（理由あり）→rejected・punches 不変・decide_reason 保存（295-1）・approved（理由なし）は null", rej.ok && dj.ok && rejRow.decision === "rejected" && rejRow.decided_by === owner.id && rejRow.decide_reason === "確認できず" && drApp.decide_reason === null && new Date((await t.one<{ punched_at: string }>(`select punched_at from public.punches where id=$1`, [pOut])).punched_at).toISOString() === new Date(outAt).toISOString(), `${t.errOf(rej)} / ${t.errOf(dj)}`);
      const rlsDr = await t.as(castA, `select decide_reason from public.punch_corrections where id=$1`, [rejId]), rlsDrB = await t.as(castB, `select decide_reason from public.punch_corrections where id=$1`, [rejId]);
      check("pm(9-10) 本人は RLS 越しに decide_reason を読める・他 cast は 0 行（295-1）", rlsDr.ok && rlsDr.rows.length === 1 && rlsDr.rows[0].decide_reason === "確認できず" && rlsDrB.ok && rlsDrB.rows.length === 0);
      const an = [await t.as("anon", `select public.punch_correction_request($1,null,$2::date,'in',$3::timestamptz,'x')`, [castAId, biz, newIn]), await t.as("anon", `select public.punch_correction_decide($1,true,null)`, [id1]), await t.as("anon", `select public.punch_correction_ack($1,'confirmed')`, [id1]), await t.as("anon", `select public.punch_correction_apply($1,null)`, [id1]), await t.as(owner, `select public.punch_correction_apply($1,null)`, [id1])];
      check("pm(9-11) anon は 3 本とも permission denied・apply は anon／owner（authenticated）とも permission denied（内部専用）", an.every((x) => !x.ok && /permission denied/.test(x.err)), an.map(t.errOf).join(" / "));
      const rls = [await t.as(castA, `select count(*)::int n from public.punch_corrections`), await t.as(castB, `select count(*)::int n from public.punch_corrections`), await t.as(mgr, `select count(*)::int n from public.punch_corrections`), await t.as(staffU, `select count(*)::int n from public.punch_corrections`)].map((r) => (r.ok ? r.rows[0].n : r.err));
      check("pm(9-12) RLS: cast A1a＝自分の 3 行（★0158: 確定済み期の申請 1 行が増える）・cast A1b＝0・manager＝3・staff＝0", JSON.stringify(rls) === JSON.stringify([3, 0, 3, 0]), rls.join(" / "));
      // owner／manager 直接＝申請＝確定・1 行（新規 insert／削除）
      const newOut = new Date(new Date(outAt).getTime() + 3600e3).toISOString();
      const puN0 = (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n;
      const o1 = await t.as(owner, `select public.punch_correction_request($1,null,$2::date,'out',$3::timestamptz,$4) id`, [castAId, biz, newOut, "退勤忘れ"]);
      const o1row = o1.ok ? await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [o1.rows[0].id]) : null;
      const o1p = o1row?.punch_id ? await t.one<{ type: string; source: string; note: string; punched_at: string }>(`select type, source, note, punched_at from public.punches where id=$1`, [o1row.punch_id]) : null;
      check("pm(9-13) owner の新規申請→approved 1 行（decided_by＝owner・punch_id＝insert 行）・punches +1（type out・source manager・note punch_correction:<id>）", o1.ok && o1row?.decision === "approved" && o1row?.decided_by === owner.id && !!o1p && o1p.type === "out" && o1p.source === "manager" && o1p.note === "punch_correction:" + o1row?.id && new Date(o1p.punched_at).toISOString() === newOut && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n === puN0 + 1, t.errOf(o1));
      const o2 = await t.as(mgr, `select public.punch_correction_request($1,$2,$3::date,null,null,$4) id`, [castAId, pOut, biz, "重複"]);
      const o2row = o2.ok ? await t.one<{ punch_id: string | null; before_at: string | null; decision: string }>(`select punch_id, before_at, decision from public.punch_corrections where id=$1`, [o2.rows[0].id]) : null;
      check("pm(9-14) manager の削除申請→approved・punches −1（元 out 行が消える）・punch_id は SET NULL・before_at は残る（295-4）", o2.ok && o2row?.decision === "approved" && o2row?.punch_id === null && o2row?.before_at !== null && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where id=$1`, [pOut])).n === 0 && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n === puN0, t.errOf(o2));
      // ★0158（裁定315）: 確定済み・支払済み期の打刻修正は通る（凍結給与は不変）＝owner の申請は即 approved・punches に反映・その run の要対応（payroll_attentions）に 1 行
      const o15 = await t.as(owner, `select public.punch_correction_request($1,null,'2098-07-10'::date,'in','2098-07-10T20:00:00+09:00'::timestamptz,'x') id`, [castAId]);
      const at15 = o15.ok ? await t.q<{ kind: string; period: string; status: string; cid: string }>(`select a.kind, r.period, r.status, a.detail->>'correction_id' cid from public.payroll_attentions a join public.payroll_runs r on r.id = a.run_id where a.cast_id = $1`, [castAId]) : [];
      check("pm(9-15) ★0158: owner の支払済み期（2098-07 paid）の打刻修正は通る（approved）・payroll_attentions 1 行（kind post_finalize_punch・run 2098-07・correction_id 一致）・'period finalized' は出ない", o15.ok && at15.length === 1 && at15[0].kind === "post_finalize_punch" && at15[0].period === "2098-07" && at15[0].status === "paid" && at15[0].cid === (o15.rows[0].id as string), t.errOf(o15) + JSON.stringify(at15));
      await t.q(`delete from public.payroll_attentions where cast_id = $1`, [castAId]); // 後段の casts delete（295-7）の前に片付ける（payroll_attentions.cast_id は cascade しない）
      // casts delete で連鎖（295-7＝demo c_wipe の順 punches→casts）
      const castT = (await t.one<{ id: string }>(`insert into public.casts (org_id, store_id, name, employment) values ($1,$2,'NOX-VERIFY-pm 連鎖','委託') returning id`, [st.org_id, st.id])).id;
      const o4 = await t.as(owner, `select public.punch_correction_request($1,null,$2::date,'in',$3::timestamptz,'連鎖テスト') id`, [castT, biz, newIn]);
      await t.asPg();
      await db.query(`delete from public.punches where cast_id=$1`, [castT]);
      const pcMid = await t.one<{ n: number; withp: number }>(`select count(*)::int n, count(punch_id)::int withp from public.punch_corrections where cast_id=$1`, [castT]);
      await db.query(`delete from public.casts where id=$1`, [castT]);
      const pcN1 = (await t.one<{ n: number }>(`select count(*)::int n from public.punch_corrections where cast_id=$1`, [castT])).n;
      check("pm(9-16) punches delete→punch_id SET NULL（行は残る）・casts delete→punch_corrections が CASCADE で 0 行（295-7）", o4.ok && pcMid.n === 1 && pcMid.withp === 0 && pcN1 === 0, `${t.errOf(o4)} mid=${JSON.stringify(pcMid)} after=${pcN1}`);
    } finally {
      await db.query("rollback");
    }
    const after = JSON.stringify(await t.one(snapSql, [st.id, st.org_id]));
    check("pm(9-17) ROLLBACK 後の残留＝実行前と同値（punches／punch_corrections／runs／audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

dbChecks().then(() => {
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-punch-match-db ALL PASS (${pass} assertions)`);
}).catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
