/*
 * verify:nox-referral — mig0148 ★5／★10 紹介料（裁定272-2・R11・案 Q）check_add_referral と check_group_due の referral 除外の係留。
 *   npm run verify:nox-referral（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 55 段目。
 *   Postgres 直結の 1 トランザクション内で JWT claims を emulate（payroll-adjust 段(5) と同型）→ 最後に ROLLBACK＝残留 0・snapshot 一致。
 *
 *  (1) check_add_referral → check_lines に kind='referral'・product_id null・qty 1・unit_price＝p_amount・cast_id＝紹介者・fee_kind null・idem_key
 *  (2) ★案 Q: checks.total（check_recalc→check_group_due）が referral 分だけ増えない（内税／外税とも）・税率別集計も不変
 *      ＝三面鏡: DB total ＝ groupDueFull（TS 鏡像・referral 行込みの入力）＝ referral 行を抜いた入力・receipt も合計不変で紹介料行を印字しない
 *  (3) idem 二重投入で 1 行のまま（同 id）・amount<=0／null は 'bad amount'・memo 空は「紹介料」・81 字は 'bad name'
 *  (4) 紹介者: 他店 cast は 'bad cast'・在籍外は 'inactive cast'・null は外部紹介として可
 *  (5) 'not open'・staff（can_register なし）／他店 manager は 'forbidden'・anon BLOCKED
 *  (6) pay.ts: DB の referral 行 Σ（紹介者別）を referralTotal に渡すと gross が 1:1 で増える（既存 T11 と接続）
 *  (7) audit: check_add_referral 1 行（target check_lines:<id>・after_json.kind='referral'）
 *  逆テスト 1 本（手動・1 回）: lib/nox/check-calc.ts の referral 除外を外す→re(2-3) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_B1, loadEnvOrExit } from "./fixtures-f0";
import { groupDueFull, type DueLine } from "../lib/nox/check-calc";
import { buildReceiptXml, type ReceiptInput, type ReceiptLine } from "../lib/nox/receipt";
import { payOf, type PayInput, type CompPlan } from "../lib/nox/pay";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const PLAN: CompPlan = { id: "p", name: "test", base: 3000, honBack: 1000, jonaiBack: 500, dohanBack: 2000, salesSlide: [], pointSlide: [] };
const BASE: PayInput = {
  cast: { hon: 2, jonai: 1, dohan: 0, days: 10, sales: 300_000 },
  daily: Array.from({ length: 10 }, (_, i) => ({ d: i + 1, hours: 5, sales: 30_000 })),
  plan: PLAN,
  productBack: { drink: 0, champ: 0, bottle: 0 },
  pointProducts: 0,
  customBackDefs: [],
  deductions: [],
  penalty: { fineAbsent: 10000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 },
  norm: { days: 0, dohan: 0 },
  fine: { absentN: 0, lateN: 0 },
  arDeduct: 0, advanceDeduct: 0, okuriDeduct: 0,
  periodDays: 30,
  extrasTotal: 0,
  taxMode: "委託",
};

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
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
  const asPg = async () => { await db.query("reset role"); };
  try {
    const st = await q<{ id: string; org_id: string; name: string }>(`select id, org_id, name from public.stores where name in ($1, $2)`, [STORE_A1, STORE_B1]);
    const A1 = st.find((s) => s.name === STORE_A1), B1 = st.find((s) => s.name === STORE_B1);
    const uidOf = async (key: keyof typeof FIXTURE_USERS) => (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0];
    const ownerA = await uidOf("ownerA"), managerB1 = await uidOf("managerB1"), staffA1 = await uidOf("staffA1");
    check("re(0-1) fixture: A1／B1／owner-a／manager-b1／staff-a1 が引ける", !!A1 && !!B1 && !!ownerA && !!managerB1 && !!staffA1);
    if (!A1 || !B1 || !ownerA || !managerB1 || !staffA1) throw new Error("fixture 解決失敗");
    const castA = (await q<{ id: string }>(`select id from public.casts where store_id = $1 and name = $2`, [A1.id, FIXTURE_USERS.castA1a.name]))[0]?.id;
    const castA2 = (await q<{ id: string }>(`select id from public.casts where store_id = $1 and name = $2`, [A1.id, FIXTURE_USERS.castA1b.name]))[0]?.id;
    const castOther = (await q<{ id: string }>(`select id from public.casts where store_id <> $1 order by name limit 1`, [A1.id]))[0]?.id ?? null; // 他店 cast（fixture に無ければ null＝不在 uuid のみで検証）
    check("re(0-2) fixture: A1 cast a／b が引ける", !!castA && !!castA2);
    if (!castA || !castA2) throw new Error("cast 解決失敗");

    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.checks where store_id = $1) c, (select count(*)::int from public.check_lines where store_id = $1) l,
      (select count(*)::int from public.seats where store_id = $1) s, (select count(*)::int from public.audit_logs where org_id = $2) au, (select count(*)::int from public.casts where is_active) ca`, [A1.id, A1.org_id]))[0]);
    const before = await snap();

    await db.query("begin");
    try {
      const seat = (await q<{ id: string }>(`insert into public.seats (org_id, store_id, name, kind, sort_order, is_active) values ($1,$2,'NOX-VERIFY-紹介卓','卓',9948,true) returning id`, [A1.org_id, A1.id]))[0].id;
      await asUid(ownerA.auth_user_id);
      const op = await call(`select public.check_open($1, null, 'free') as id`, [seat]);
      check("re(1-0) check_open（owner）", op.ok, errOf(op));
      const chk = op.ok ? (op.rows[0].id as string) : "";
      const c1 = await call(`select public.check_add_line($1, null, 1, 'custom', 'A', 'verify セット', 3000) as id`, [chk]);
      check("re(1-0b) custom 3000 を載せる", c1.ok, errOf(c1));
      await asPg();
      const totalOf = async () => (await q<{ total: number }>(`select total from public.checks where id = $1`, [chk]))[0].total;
      const linesOf = async () => q<DueLine & { kind: string; cast_id: string | null; name_snapshot: string; qty: number; unit_price_snapshot: number }>(`select line_total, kind, tax_category, cast_id, name_snapshot, qty, unit_price_snapshot from public.check_lines where check_id = $1 and pay_group = 'A' order by sort_order`, [chk]);
      const settingsOf = async () => (await q<{ service_rate: number; round_unit: number; round_mode: string; business_tax_status: string; price_display: string; tax_rounding: string }>(`select service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding from public.checks where id = $1`, [chk]))[0];
      const total0 = await totalOf();
      const lines0 = await linesOf();

      // ── (1) 紹介料行 ──
      const idem = randomUUID();
      await asUid(ownerA.auth_user_id);
      const r1 = await call(`select public.check_add_referral($1,$2,2000,'紹介: 検証',$3) as id`, [chk, castA, idem]);
      check("re(1-1) check_add_referral（owner・紹介者 cast a・2000・idem）→ uuid", r1.ok && typeof r1.rows[0].id === "string", errOf(r1));
      const refId = r1.ok ? (r1.rows[0].id as string) : "";
      await asPg();
      const line = (await q<{ kind: string; product_id: string | null; qty: number; unit_price_snapshot: number; line_total: number; cast_id: string; pay_group: string; fee_kind: string | null; idem_key: string; name_snapshot: string; back_snapshot: unknown; org_id: string; store_id: string }>(`select kind, product_id, qty, unit_price_snapshot, line_total, cast_id, pay_group, fee_kind, idem_key, name_snapshot, back_snapshot, org_id, store_id from public.check_lines where id = $1`, [refId]))[0];
      check("re(1-2) 行の形: kind='referral'・product_id null・qty 1・unit_price 2000・line_total 2000・pay_group A・fee_kind null・back null", line?.kind === "referral" && line?.product_id === null && line?.qty === 1 && line?.unit_price_snapshot === 2000 && line?.line_total === 2000 && line?.pay_group === "A" && line?.fee_kind === null && line?.back_snapshot === null, JSON.stringify(line));
      check("re(1-3) 紹介者 cast_id＝cast a・idem_key 保持・name_snapshot＝memo・org/store＝伝票", line?.cast_id === castA && line?.idem_key === idem && line?.name_snapshot === "紹介: 検証" && line?.org_id === A1.org_id && line?.store_id === A1.id, JSON.stringify(line));

      // ── (2) 案 Q: 伝票合計・課税額から除外（内税→外税）・三面鏡 ──
      const total1 = await totalOf();
      check(`re(2-1) ★内税: 紹介料 2000 を載せても checks.total 不変（${total0}）`, total1 === total0 && total0 > 0, `${total0} → ${total1}`);
      await db.query(`update public.checks set price_display = 'tax_excluded', business_tax_status = 'taxable' where id = $1`, [chk]);
      await db.query(`select public.check_recalc($1)`, [chk]);
      const totalEx = await totalOf();
      const linesEx = await linesOf();
      const sEx = await settingsOf();
      const mirrorAll = groupDueFull(linesEx, sEx);
      const mirrorNoRef = groupDueFull(linesEx.filter((l) => l.kind !== "referral"), sEx);
      check("re(2-2) ★外税: DB total ＝ TS 鏡像（referral 込み入力）＝ referral を抜いた入力（税率別集計も referral を含めない）", totalEx === mirrorAll && mirrorAll === mirrorNoRef && totalEx > total0, `db=${totalEx} ts=${mirrorAll} noRef=${mirrorNoRef} lines=${JSON.stringify(linesEx)}`);
      await db.query(`update public.checks set price_display = 'tax_included' where id = $1`, [chk]);
      await db.query(`select public.check_recalc($1)`, [chk]);
      const totalIn = await totalOf();
      const sIn = await settingsOf();
      check("re(2-3) ★内税に戻す: DB total ＝ TS 鏡像（referral 込み）＝ total0（案 Q の三面鏡・check-calc.ts）", totalIn === groupDueFull(linesEx, sIn) && totalIn === total0, `db=${totalIn} ts=${groupDueFull(linesEx, sIn)} total0=${total0}`);
      const rl: ReceiptLine[] = linesEx.map((l) => ({ name_snapshot: l.name_snapshot, qty: l.qty, unit_price_snapshot: l.unit_price_snapshot, line_total: l.line_total, kind: l.kind, tax_category: l.tax_category ?? undefined }));
      const xml = buildReceiptXml({
        store: { name: "NOX-VERIFY", address: "", tel: "", reg_no: "", footer: "" }, check: { id: chk, closed_at: "2097-01-01T00:00:00+09:00", nom_type: "free" },
        payGroup: "A", lines: rl, payments: [{ method: "cash", amount: totalIn, tendered: null }], serviceRate: sIn.service_rate, groupDue: totalIn, isReprint: false,
      } as ReceiptInput);
      check(`re(2-4) ★receipt.ts: 紹介料行を印字せず・合計 ¥${totalIn.toLocaleString()}・端数調整 行なし（順算と一致）`, !xml.includes("紹介: 検証") && xml.includes(`¥${totalIn.toLocaleString()}`) && !xml.includes("端数調整"), xml.slice(0, 400));

      // ── (3) idem・amount・memo ──
      await asUid(ownerA.auth_user_id);
      const r2 = await call(`select public.check_add_referral($1,$2,2000,'紹介: 検証',$3) as id`, [chk, castA, idem]);
      await asPg();
      const nRef = (await q<{ n: number }>(`select count(*)::int as n from public.check_lines where check_id = $1 and kind = 'referral'`, [chk]))[0].n;
      check("re(3-1) 同 idem 再送＝既存 id を返し行は 1 のまま", r2.ok && r2.rows[0].id === refId && nRef === 1, errOf(r2) + ` n=${nRef}`);
      await asUid(ownerA.auth_user_id);
      const z = await call(`select public.check_add_referral($1,$2,0,null,null)`, [chk, castA]);
      const neg = await call(`select public.check_add_referral($1,$2,-5,null,null)`, [chk, castA]);
      const nul = await call(`select public.check_add_referral($1,$2,null,null,null)`, [chk, castA]);
      check("re(3-2) amount 0／負／null は 'bad amount'", !z.ok && z.err === "bad amount" && !neg.ok && neg.err === "bad amount" && !nul.ok && nul.err === "bad amount", [z, neg, nul].map(errOf).join(" / "));
      const r3 = await call(`select public.check_add_referral($1,null,1500,'   ',null) as id`, [chk]);
      await asPg();
      const l3 = r3.ok ? (await q<{ name_snapshot: string; cast_id: string | null }>(`select name_snapshot, cast_id from public.check_lines where id = $1`, [r3.rows[0].id]))[0] : null;
      check("re(3-3) memo 空白＝名称「紹介料」・紹介者 null（外部紹介）で可", r3.ok && l3?.name_snapshot === "紹介料" && l3?.cast_id === null, errOf(r3) + " " + JSON.stringify(l3));
      await asUid(ownerA.auth_user_id);
      const long = await call(`select public.check_add_referral($1,null,100,$2,null)`, [chk, "あ".repeat(81)]);
      check("re(3-4) memo 81 字は 'bad name'", !long.ok && long.err === "bad name", errOf(long));

      // ── (4) 紹介者の検証 ──
      const bc = await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, randomUUID()]);
      const bc2 = castOther ? await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, castOther]) : null;
      check(`re(4-1) 存在しない cast${castOther ? "／他店の cast" : ""} は 'bad cast'`, !bc.ok && bc.err === "bad cast" && (bc2 === null || (!bc2.ok && bc2.err === "bad cast")), errOf(bc) + (bc2 ? " / " + errOf(bc2) : ""));
      await asPg();
      await db.query(`update public.casts set is_active = false, left_on = current_date where id = $1`, [castA2]); // casts_active_left_on_chk＝退店日必須
      await asUid(ownerA.auth_user_id);
      const ic = await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, castA2]);
      check("re(4-2) 在籍外（is_active=false）の cast は 'inactive cast'", !ic.ok && ic.err === "inactive cast", errOf(ic));
      await asPg();
      await db.query(`update public.casts set is_active = true, left_on = null where id = $1`, [castA2]);

      // ── (6) pay.ts 接続（既存 T11）: 紹介者別 Σ を referralTotal に ──
      const sumA = (await q<{ s: number }>(`select coalesce(sum(line_total), 0)::int as s from public.check_lines where check_id = $1 and kind = 'referral' and cast_id = $2`, [chk, castA]))[0].s;
      const p0 = payOf(BASE), p1 = payOf({ ...BASE, referralTotal: sumA });
      check(`re(6-1) 紹介者 cast a の referral Σ=${sumA} を referralTotal に渡すと gross が同額増える・PayResult.referralTotal 保持`, sumA === 2000 && p1.gross - p0.gross === sumA && p1.referralTotal === sumA, `Σ=${sumA} gross ${p0.gross}→${p1.gross}`);
      check("re(6-2) 外部紹介（cast_id null）の行は誰の gross にも載らない（cast 別 Σ の外）", (await q<{ s: number }>(`select coalesce(sum(line_total), 0)::int as s from public.check_lines where check_id = $1 and kind = 'referral' and cast_id is null`, [chk]))[0].s === 1500);

      // ── (7) audit ──
      const au = await q<{ action: string; store_id: string; kind: string | null }>(`select action, store_id, after_json->>'kind' as kind from public.audit_logs where target = $1`, ["check_lines:" + refId]);
      check("re(7-1) audit 1 行: action check_add_referral・store A1・after_json.kind='referral'", au.length === 1 && au[0].action === "check_add_referral" && au[0].store_id === A1.id && au[0].kind === "referral", JSON.stringify(au));

      // ── (5) not open・staff・他店 manager ──
      await asUid(staffA1.auth_user_id);
      const sf = await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, castA]);
      check("re(5-1) staff（can_register なし）は 'forbidden'", !sf.ok && sf.err === "forbidden", errOf(sf));
      await asUid(managerB1.auth_user_id);
      const mb = await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, castA]);
      check("re(5-2) 他 org の manager は 'forbidden'", !mb.ok && mb.err === "forbidden", errOf(mb));
      await asPg();
      await db.query(`update public.checks set status = 'closed', closed_at = now() where id = $1`, [chk]);
      await asUid(ownerA.auth_user_id);
      const no = await call(`select public.check_add_referral($1,$2,100,null,null)`, [chk, castA]);
      check("re(5-3) closed 伝票は 'not open'", !no.ok && no.err === "not open", errOf(no));
      await asPg();
      void lines0;
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("re(9-1) ROLLBACK 後の残留＝実行前と同値（A1 checks／lines／seats・org A audit・active casts）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("check_add_referral", { p_check_id: null, p_cast_id: null, p_amount: null, p_memo: null, p_idem_key: null });
  check("re(9-2) anon check_add_referral BLOCKED", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-referral ALL PASS (${pass} assertions)`);
  console.log("紹介料(0148 ★5／★10・案 Q): kind referral・product null・紹介者 cast / total 不変（内税・外税）＝DB＝groupDueFull＝receipt の三面鏡 / idem・bad amount・紹介料既定名・bad name / bad cast・inactive cast・外部紹介 null / forbidden・not open・anon / pay.ts referralTotal 1:1 / audit（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });
