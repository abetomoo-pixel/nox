/**
 * verify:nox-0201d — 0201d（2026-11-13 Agoora 手貼り・sha16 c519f42084e29b01・522 行・検証 18 行一致・関数 447→449・表 122）のフラグ true 便（画面の便 2）。
 *   裁定478＝臨時営業／臨時休業を営業日で持つ・price_dow・当日の臨時営業の登録（register_special_open）・check_open の門・卓がある営業日は変更も取消もできない。
 *  (1) フラグ＝MIG_0201D_APPLIED=true・override
 *  (2) 収蔵＝supabase/migrations/0201d_special_open.sql（sha16・行数・begin;／commit; 1 回ずつ・lock_timeout）
 *  (3) 純関数＝固定の文（相談役）・specialOpenStepOf（店長以上は問う・キャストとスタッフは案内）・料金の曜日の候補・一覧の 1 行・errJa・開卓の見込みの曜日
 *  (4) client の結線＝開卓のモーダル（register_special_open → 開卓のやり直し）・特別日の p_price_dow・消すを出さない日・月報の印・見込みの priceDow
 *  (5) live（BEGIN…ROLLBACK＝DB 変更 0）＝NOX-VERIFY-A1 の今日の営業日を定休にして：店長の開卓は 'needs special open'・登録の権限（スタッフ／キャスト／別の会社の店長／anon）・
 *      定休の曜日は 'bad price dow'・登録→開卓が通る・同じ曜日は同じ id・卓がある日の変更と取消は 'day has checks'・過去の日は 'past day'・臨時休業は 'closed day'・料金の曜日（biz_minutes_of）
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { MIG_0201D_APPLIED, mig0201dOn, __set0201dForTest } from "../lib/nox/rules-0175/flag";
import { specialOpenStepOf, priceDowChoicesOf, specialDayLineOf, priceDowLabelOf, SPECIAL_OPEN_ASK, SPECIAL_OPEN_DOW_ASK, SPECIAL_OPEN_STAFF, SPECIAL_CLOSED_NOTE } from "../lib/nox/business-hours-special";
import { errJa } from "../lib/nox/errors";
import { openEstimateOf, type EstimateRule } from "../lib/nox/register/open-estimate";
import { loadEnvOrExit } from "./fixtures-f0";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
check("0201d(1-1) MIG_0201D_APPLIED=true（2026-11-13 手貼り・検証 18 行一致）・override", (MIG_0201D_APPLIED as boolean) === true && mig0201dOn() === true);
__set0201dForTest(false); check("0201d(1-2) __set0201dForTest(false) で mig0201dOn() は false", mig0201dOn() === false); __set0201dForTest(null);
// (2)
{
  const mig = fs.readFileSync("supabase/migrations/0201d_special_open.sql");
  const sha16 = createHash("sha256").update(mig).digest("hex").slice(0, 16);
  const L = mig.toString("utf8").replace(/\r/g, "").split("\n");
  const b = L.indexOf("begin;");
  check("0201d(2-1) 収蔵＝sha16 c519f42084e29b01・522 行・begin;／commit; 1 回ずつ・begin の直後に lock_timeout（教訓128／132）",
    sha16 === "c519f42084e29b01" && L.filter((l) => l === "begin;").length === 1 && L.filter((l) => l === "commit;").length === 1 && L[b + 1] === "set local lock_timeout = '10s';", { sha16, lines: L.length });
}
// (3) 純関数
check("0201d(3-1) 固定の文（相談役 ■4 b）", SPECIAL_OPEN_ASK === "今日は定休日です。臨時営業にしますか？" && SPECIAL_OPEN_DOW_ASK === "料金は何曜日と同じにしますか？"
  && SPECIAL_OPEN_STAFF === "今日は定休日です。店長に臨時営業の設定を頼んでください。" && SPECIAL_CLOSED_NOTE === "今日は臨時休業です。");
check("0201d(3-2) specialOpenStepOf＝定休日：店長以上は問う・キャストとスタッフは案内／臨時休業：店長以上は問う（closed）・他は「今日は臨時休業です。」／他の失敗は null",
  JSON.stringify(specialOpenStepOf("needs special open", true)) === JSON.stringify({ kind: "ask", closed: false })
  && JSON.stringify(specialOpenStepOf("needs special open", false)) === JSON.stringify({ kind: "note", text: SPECIAL_OPEN_STAFF })
  && JSON.stringify(specialOpenStepOf("closed day", true)) === JSON.stringify({ kind: "ask", closed: true })
  && JSON.stringify(specialOpenStepOf("closed day", false)) === JSON.stringify({ kind: "note", text: SPECIAL_CLOSED_NOTE })
  && specialOpenStepOf("day closed", true) === null && specialOpenStepOf("off duty", true) === null && specialOpenStepOf(null, true) === null);
check("0201d(3-3) 料金の曜日の候補＝定休でない曜日（行の無い曜日は営業）", JSON.stringify(priceDowChoicesOf([{ dow: 0, is_closed: true }, { dow: 1, is_closed: false }, { dow: 3, is_closed: true }])) === JSON.stringify([1, 2, 4, 5, 6]));
check("0201d(3-4) 一覧の 1 行＝「料金＝土曜と同じ」・price_dow 無しは今までどおり・臨時休業には付けない",
  specialDayLineOf({ day: "2026-11-15", kind: "open", open_hm: "20:00", close_hm: "25:00", note: null, price_dow: 6 }) === "11/15 特別営業 20:00〜翌01:00・料金＝土曜と同じ"
  && specialDayLineOf({ day: "2026-11-15", kind: "open", open_hm: "20:00", close_hm: "25:00", note: null }) === "11/15 特別営業 20:00〜翌01:00"
  && specialDayLineOf({ day: "2026-11-15", kind: "closed", open_hm: null, close_hm: null, note: null, price_dow: 6 }) === "11/15 臨時休業"
  && priceDowLabelOf(6) === "土曜の料金" && priceDowLabelOf(null) === "" && priceDowLabelOf(7) === "");
check("0201d(3-5) errJa＝6 語（'day closed' の締め済みとは別）",
  errJa("needs special open") === SPECIAL_OPEN_STAFF && errJa("closed day") === SPECIAL_CLOSED_NOTE && errJa("day closed") === "この営業日は締め済みです"
  && !errJa("not closed day").startsWith("処理できません") && !errJa("bad price dow").startsWith("処理できません") && !errJa("past day").startsWith("処理できません") && !errJa("day has checks").startsWith("処理できません"));
{
  // 日曜 21:00 JST（2026-11-15）・土曜だけのセット 5,000／毎日 3,000（優先 2）
  const rules: EstimateRule[] = [
    { id: "sat", fee_kind: "set", amount: 5000, duration_min: 60, seat_kind: null, dow_mask: 1 << 5, time_from_min: null, time_to_min: null, category_id: null, billing_unit: "person", priority: 1 },
    { id: "all", fee_kind: "set", amount: 3000, duration_min: 60, seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, category_id: null, billing_unit: "person", priority: 2 },
  ];
  const store = { set_fee: 1000, set_min: 60, time_per: "person", service_rate: 0, round_unit: 1, round_mode: "floor", business_tax_status: "exempt", price_display: "incl" };
  const now = new Date("2026-11-15T12:00:00Z");
  const base = { store, rules, seatKind: null, categoryId: null, people: 1, ruleId: null, now };
  check("0201d(3-6) 開卓の見込み＝priceDow 6（土）で土曜のセット・省略／null は日曜のまま（毎日のセット）",
    openEstimateOf({ ...base, priceDow: 6 }).setUnit === 5000 && openEstimateOf(base).setUnit === 3000 && openEstimateOf({ ...base, priceDow: null }).setUnit === 3000);
}
// (4) client の結線
{
  const rb = src("app/(manage)/register/register-board.tsx"), sp = src("components/nox/special-days-panel.tsx"), mr = src("app/(manage)/report/month-report.tsx");
  check("0201d(4-1) 開卓のモーダル＝check_open の失敗で specialOpenStepOf（フラグ）・問いは register_special_open → confirmOpenSeat のやり直し・案内はモーダルの中",
    rb.includes("const sp = specialOpenStepOf(error.message, isManagerUp);") && rb.includes('supabase.rpc("register_special_open", { p_store_id: storeId, p_price_dow: dow })')
    && /setTodayPriceDow\(dow\); setSpAsk\(null\); setSpNote\(null\);\n\s+await confirmOpenSeat\(\);/.test(rb) && rb.includes('data-special-open-note="1"') && rb.includes("data-special-open-dow={d}"));
  check("0201d(4-2) 開卓の見込み＝今日の営業日の臨時営業の料金の曜日を priceDow で渡す", rb.includes("priceDow: mig0201dOn() ? todayPriceDow : null"));
  check("0201d(4-3) 特別日＝p_price_dow（特別営業のときだけ）・料金の曜日のチップ・卓がある今日は「消す」を出さない",
    sp.includes('p_price_dow: kind === "open" ? priceDow : null') && sp.includes('data-special-price-dow="1"') && sp.includes("!(mig0201dOn() && lockedDays.has(r.day))"));
  check("0201d(4-4) 月報の印＝price_dow を読む・「臨時営業（土曜の料金）」", mr.includes('"day, kind, price_dow"') && mr.includes('data-month-special="1"'));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-0201d" });
  await c.connect();
  try {
    const cnt = async () => (await c.query("select (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int f, (select count(*) from pg_tables where schemaname='public')::int t")).rows[0] as { f: number; t: number };
    const before = await cnt();
    check("0201d(5-0) live＝関数 449・表 122", before.f === 449 && before.t === 122, before);
    await c.query("begin");
    try {
      await c.query("set local lock_timeout = '5s'"); await c.query("set local statement_timeout = '30s'");
      const as = async (uid: string | null, sql: string, params: unknown[] = [], role = "authenticated") => {
        await c.query("savepoint a");
        try {
          await c.query("select set_config('request.jwt.claims', $1, true)", [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""]);
          await c.query(`set local role ${role}`);
          const r = await c.query(sql, params);
          await c.query("reset role"); await c.query("release savepoint a");
          return { ok: true as const, rows: r.rows as Record<string, unknown>[], err: "" };
        } catch (e) { await c.query("rollback to savepoint a"); await c.query("reset role"); return { ok: false as const, rows: [] as Record<string, unknown>[], err: (e as Error).message }; }
      };
      const st = (await c.query("select s.id, s.org_id from public.stores s join public.orgs o on o.id=s.org_id where s.name='NOX-VERIFY-A1' and o.name='NOX-VERIFY-A'")).rows[0] as { id: string; org_id: string };
      const who = async (store: string, role: string) => ((await c.query("select u.auth_user_id a from public.memberships m join public.users u on u.id=m.user_id join public.stores s on s.id=m.store_id where s.name=$1 and m.role=$2 and m.is_active and u.is_active and u.auth_user_id is not null limit 1", [store, role])).rows[0] as { a: string } | undefined)?.a ?? null;
      const mgr = await who("NOX-VERIFY-A1", "manager"), staff = await who("NOX-VERIFY-A1", "staff"), a2mgr = ((await c.query("select u.auth_user_id a from public.memberships m join public.users u on u.id=m.user_id join public.stores s on s.id=m.store_id join public.orgs o on o.id=s.org_id where o.name='NOX-VERIFY-B' and m.role in ('manager','owner') and m.is_active and u.is_active and u.auth_user_id is not null order by m.role limit 1")).rows[0] as { a: string } | undefined)?.a ?? null; // 別の会社の店長（A2 に店長がいない）
      const castU = ((await c.query("select u.auth_user_id a from public.casts ca join public.users u on u.id=ca.user_id where ca.store_id=$1 and ca.is_active and u.auth_user_id is not null limit 1", [st.id])).rows[0] as { a: string } | undefined)?.a ?? null;
      const bizd = ((await c.query("select public.biz_date_of($1, now())::text d", [st.id])).rows[0] as { d: string }).d;
      const dow = ((await c.query("select extract(dow from $1::date)::int w", [bizd])).rows[0] as { w: number }).w;
      const other = (dow + 1) % 7; // 料金の曜日（営業にする）
      // 今日の営業日の曜日を定休に・料金の曜日は営業に・今日の特別日を消す（tx の中だけ）
      await c.query("insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm) values ($1,$2,$3,true,null,null) on conflict (store_id, dow) do update set is_closed = true", [st.org_id, st.id, dow]);
      await c.query("insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm) values ($1,$2,$3,false,'19:00','25:00') on conflict (store_id, dow) do update set is_closed = false, open_hm = '19:00', close_hm = '25:00'", [st.org_id, st.id, other]);
      await c.query("delete from public.store_special_days where store_id=$1 and day=$2::date", [st.id, bizd]);
      // 開いていない卓
      const seat = ((await c.query("select s.id from public.seats s where s.store_id=$1 and s.is_active and not exists (select 1 from public.checks ch where ch.seat_id=s.id and ch.status='open') and not exists (select 1 from public.check_seats cs join public.checks ch on ch.id=cs.check_id where cs.seat_id=s.id and ch.status='open') limit 1", [st.id])).rows[0] as { id: string } | undefined)?.id;
      check("0201d(5-1) 前提＝A1 の店長・スタッフ・キャスト・別の会社の店長・空いた卓", !!mgr && !!staff && !!castU && !!a2mgr && !!seat, { mgr: !!mgr, staff: !!staff, castU: !!castU, a2mgr: !!a2mgr, seat: !!seat });
      if (mgr && seat) {
        const open = (u: string) => as(u, "select public.check_open($1, null, 'free') id", [seat]);
        const r1 = await open(mgr);
        check("0201d(5-2) 定休日・登録なし＝店長の開卓は 'needs special open'", !r1.ok && /needs special open/.test(r1.err), r1.err);
        for (const [label, u, re] of [["スタッフ", staff, /forbidden/], ["キャスト", castU, /forbidden/], ["別の会社の店長", a2mgr, /forbidden/]] as const) {
          if (!u) continue;
          const x = await as(u, "select public.register_special_open($1, $2) id", [st.id, other]);
          check(`0201d(5-3) 登録＝${label}は拒否`, !x.ok && re.test(x.err), x.ok ? "通ってしまった" : x.err);
        }
        const an = await as(null, "select public.register_special_open($1, $2) id", [st.id, other], "anon");
        check("0201d(5-4) 登録＝anon は permission denied", !an.ok && /permission denied/.test(an.err), an.err);
        const bad = await as(mgr, "select public.register_special_open($1, $2) id", [st.id, dow]);
        check("0201d(5-5) 定休の曜日を料金にすると 'bad price dow'", !bad.ok && /bad price dow/.test(bad.err), bad.err);
        const reg = await as(mgr, "select public.register_special_open($1, $2) id", [st.id, other]);
        const reg2 = await as(mgr, "select public.register_special_open($1, $2) id", [st.id, other]);
        const sd = (await c.query("select kind, price_dow, open_hm, close_hm from public.store_special_days where store_id=$1 and day=$2::date", [st.id, bizd])).rows[0] as { kind: string; price_dow: number; open_hm: string; close_hm: string } | undefined;
        check("0201d(5-6) 登録＝臨時営業・料金の曜日・その曜日の営業時間・同じ曜日は同じ id", reg.ok && reg2.ok && reg.rows[0].id === reg2.rows[0].id && sd?.kind === "open" && sd?.price_dow === other && sd?.open_hm === "19:00" && sd?.close_hm === "25:00", { reg: reg.err, sd });
        const bm = (await c.query("select biz_dow from public.biz_minutes_of($1, now())", [st.id])).rows[0] as { biz_dow: number };
        check("0201d(5-7) 料金の曜日＝biz_minutes_of の曜日が (price_dow + 6) % 7", bm.biz_dow === (other + 6) % 7, { bm, other });
        const r2 = await open(mgr);
        check("0201d(5-8) 登録のあと＝店長の開卓が通る", r2.ok && typeof r2.rows[0].id === "string", r2.err);
        const chg = await as(mgr, "select public.set_store_special_day($1, $2::date, 'closed', null, null, null, null)", [st.id, bizd]);
        const rm = await as(mgr, "select public.remove_store_special_day($1, $2::date)", [st.id, bizd]);
        check("0201d(5-9) 卓がある営業日＝種類の変更と取消は 'day has checks'", !chg.ok && /day has checks/.test(chg.err) && !rm.ok && /day has checks/.test(rm.err), { chg: chg.err, rm: rm.err });
        const past = await as(mgr, "select public.set_store_special_day($1, ($2::date - 1), 'open', '20:00', '25:00', null, $3)", [st.id, bizd, other]);
        check("0201d(5-10) 過去の営業日＝'past day'", !past.ok && /past day/.test(past.err), past.err);
        // 臨時休業（別の空いた卓・特別日を closed に直接）
        await c.query("update public.store_special_days set kind='closed', open_hm=null, close_hm=null, price_dow=null where store_id=$1 and day=$2::date", [st.id, bizd]);
        const seat2 = ((await c.query("select s.id from public.seats s where s.store_id=$1 and s.is_active and s.id<>$2 and not exists (select 1 from public.checks ch where ch.seat_id=s.id and ch.status='open') and not exists (select 1 from public.check_seats cs join public.checks ch on ch.id=cs.check_id where cs.seat_id=s.id and ch.status='open') limit 1", [st.id, seat])).rows[0] as { id: string } | undefined)?.id;
        if (seat2) {
          const r3 = await as(mgr, "select public.check_open($1, null, 'free') id", [seat2]);
          check("0201d(5-11) 臨時休業の営業日＝'closed day'", !r3.ok && /closed day/.test(r3.err), r3.err);
        } else check("0201d(5-11) 臨時休業の確かめに 2 つ目の空いた卓", false);
      }
    } finally { await c.query("rollback"); }
    const after = await cnt();
    check("0201d(5-12) ROLLBACK＝DB 変更 0（関数・表の数が同じ）", after.f === before.f && after.t === before.t, { before, after });
  } finally { await c.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0201d ALL PASS (${pass} assertions)`);
})();
