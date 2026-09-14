/*
 * verify:nox-d45 — D45 入金方法別照合（mig0143・裁定 D45-1〜8）の係留。
 *   npm run verify:nox-d45（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *   走数外（f0 では 46 段目に連結）。
 *
 * 観点（相談役ブロック 2026-09-14・9/11 設計案 ①〜⑩）:
 *  ① daily_report_aggregate の返り jsonb に ar_collected_card／ar_collected_other の 2 キーが存在
 *  ② cash 回収のみの日は 2 キーとも 0（ar_collected は cash 合計）
 *  ③ card 回収 1 件を入れると ar_collected_card に反映・ar_collected（cash）は不変
 *  ④ other も同様（card も不変）
 *  ⑤ daily_report_close で 2 列が凍結され aggregate と一致
 *  ⑥ close の diff が card／other 回収の前後で同値（理論在高に入らない＝diff = counted − (float + cash + ar_collected − expense − payout)）
 *  ⑦ daily_report_reclose で 2 列が再凍結（card 2,000→2,500・other 3,000→0→3,000）・diff 不変
 *  ⑧ 既存列（cash／card_gross／card_tax／uri／other／drink_sales／slips／guests／ar_collected）が close→reclose の前後で不変
 *  ⑨ anon で daily_report_aggregate が BLOCKED（permission denied for function）
 *  ⑩ 後始末後に当該 ar_collections 0 行・receivable 0 行・daily_reports（A1・X）0 行＝行数が元に戻る
 *
 * fixture（reopen と同流儀・すべて verify org A・finally で全消し・money 非接触＝golden 不変）:
 *   - 締めの無い日 X（2026-05-01・A1。rls の F1e（今日／明日）・reopen の 2026-03／04 とは無関係）
 *   - receivables 1 行（A1・amount 6,000・open）を admin insert → ar_collections を pg 直結／admin で直 insert
 *     （cash 1,000 → card 2,000 → other 3,000。受領 RPC は通さない＝集計側だけを見る）
 *   - daily_reports（X）は daily_report_close（manager A1・RPC）で作り finally で delete
 *   - reopen_flow が ON の環境では reclose 前に report_reopen を挟む（flag off なら不要）
 *   - audit_logs は開始時刻以降・org A・本 suite が発火させる action のみ delete
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null | undefined, s: string) => !!e?.message?.includes(s);

const X = "2026-05-01";            // 締めの無い日（fixture）
const CUTOFF = "06:00";
const COUNTED = 10_000;            // 実査（理論在高＝0 + cash + ar_cash − 0 − 0）
const NOTE = "NOX-VERIFY-D45";
const REASON = "NOX-VERIFY d45";
const ACTIONS = ["daily_report_close", "daily_report_reclose", "report_reopen"];
type Agg = Record<string, number>;
type Row = Record<string, unknown>;
const FROZEN = ["cash", "card_gross", "card_tax", "uri", "other", "drink_sales", "slips", "guests", "ar_collected"];

async function main() {
  const t0 = new Date().toISOString();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const mgr = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  {
    const { error } = await mgr.auth.signInWithPassword({ email: FIXTURE_USERS.managerA1.email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ managerA1 サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
  }
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Row>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  const { data: sA1 } = await admin.from("stores").select("id, org_id, card_tax_rate").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string, orgA = sA1!.org_id as string, taxRate = sA1!.card_tax_rate as number;
  const { data: uM } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const mgrUserId = uM!.id as string;
  const flagOn = (await q<{ f: boolean }>(`select public.flag_enabled('reopen_flow', $1) as f`, [storeA1]))[0].f;

  let recvId: string | null = null;
  const arIds: string[] = [];
  const reportsBefore = (await q<{ n: number }>(`select count(*)::int as n from public.daily_reports where store_id = $1`, [storeA1]))[0].n;

  async function teardown() {
    if (arIds.length) await admin.from("ar_collections").delete().in("id", arIds);
    if (recvId) { await admin.from("ar_collections").delete().eq("receivable_id", recvId); await admin.from("receivables").delete().eq("id", recvId); }
    await admin.from("daily_reports").delete().eq("store_id", storeA1).eq("biz_date", X);
    await db.query(`delete from public.audit_logs where org_id = $1 and at >= $2 and action = any($3)`, [orgA, t0, ACTIONS]);
  }
  await admin.from("daily_reports").delete().eq("store_id", storeA1).eq("biz_date", X); // 前回の取り残し

  const agg = async (): Promise<Agg> => (await q<{ v: Agg }>(`select public.daily_report_aggregate($1, $2::date, $3, $4) as v`, [storeA1, X, CUTOFF, taxRate]))[0].v;
  const report = async () => (await admin.from("daily_reports").select("*").eq("store_id", storeA1).eq("biz_date", X).single()).data as Row;
  const collect = async (method: "cash" | "card" | "other", amount: number) => {
    const { data, error } = await admin.from("ar_collections").insert({
      org_id: orgA, store_id: storeA1, receivable_id: recvId, cast_id: null, customer_id: null, biz_date: X, amount, method, note: NOTE,
      idem_key: randomUUID(), created_by: mgrUserId,
    }).select("id").single();
    if (error) throw new Error(`ar_collections insert(${method}): ${error.message}`);
    arIds.push(data!.id as string);
    return data!.id as string;
  };
  const expectedDiff = (a: Agg) => COUNTED - (0 + a.cash + a.ar_collected - 0 - 0);
  // reopen_flow ON の環境では reclose の前に解除が要る（OFF なら reclose 直呼び）
  const reclose = async (reportId: string): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (flagOn) {
      const { error } = await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: X, p_reason: REASON });
      if (error) return { data: null, error };
    }
    const { data, error } = await mgr.rpc("daily_report_reclose", { p_report_id: reportId, p_force: true, p_idem_key: randomUUID() });
    return { data, error };
  };

  try {
    // ── fixture: receivable 1 行 ──
    {
      const { data, error } = await admin.from("receivables").insert({ org_id: orgA, store_id: storeA1, amount: 6000 }).select("id").single();
      if (error) throw new Error("receivables insert: " + error.message);
      recvId = data!.id as string;
      const pre = await q<{ n: number }>(`select count(*)::int as n from public.ar_collections where store_id = $1 and biz_date = $2`, [storeA1, X]);
      check("d45(fx) 準備: 締めの無い日 X に ar_collections 0 行・receivable 1 行を作成", pre[0].n === 0 && !!recvId, `ar rows ${pre[0].n}`);
    }

    // ── ①② aggregate: 2 キー存在・cash のみは 0 ──
    const a0 = await agg();
    check("d45(①-1) ★aggregate の返り jsonb に ar_collected_card／ar_collected_other の 2 キーが存在",
      Object.prototype.hasOwnProperty.call(a0, "ar_collected_card") && Object.prototype.hasOwnProperty.call(a0, "ar_collected_other"), Object.keys(a0).join(","));
    check("d45(①-2) 既存キー（cash／card／uri／other／drink_sales／ar_collected／card_tax）は健在",
      ["cash", "card", "uri", "other", "drink_sales", "ar_collected", "card_tax", "open_checks", "slips", "guests", "dohan_checks"].every((k) => k in a0), Object.keys(a0).join(","));
    check("d45(②-0) 回収 0 件: ar_collected／card／other すべて 0", a0.ar_collected === 0 && a0.ar_collected_card === 0 && a0.ar_collected_other === 0, JSON.stringify(a0));
    await collect("cash", 1000);
    const a1 = await agg();
    check("d45(②-1) ★cash 回収 1,000 のみ: ar_collected=1,000・card=0・other=0", a1.ar_collected === 1000 && a1.ar_collected_card === 0 && a1.ar_collected_other === 0, JSON.stringify(a1));

    // ── ③④ card／other の反映・cash 不変 ──
    await collect("card", 2000);
    const a2 = await agg();
    check("d45(③-1) ★card 回収 2,000 を追加: ar_collected_card=2,000", a2.ar_collected_card === 2000, JSON.stringify(a2));
    check("d45(③-2) ★ar_collected（cash）は 1,000 のまま不変・other 0", a2.ar_collected === 1000 && a2.ar_collected_other === 0, JSON.stringify(a2));
    const otherId = await collect("other", 3000);
    const a3 = await agg();
    check("d45(④-1) ★other 回収 3,000 を追加: ar_collected_other=3,000", a3.ar_collected_other === 3000, JSON.stringify(a3));
    check("d45(④-2) ★ar_collected（cash）1,000・card 2,000 は不変", a3.ar_collected === 1000 && a3.ar_collected_card === 2000, JSON.stringify(a3));
    check("d45(④-3) cash／card／uri／other（決済）は回収を入れても不変（回収は payments 非依存）",
      a3.cash === a0.cash && a3.card === a0.card && a3.uri === a0.uri && a3.other === a0.other, JSON.stringify({ a0, a3 }));

    // ── ⑤⑥ close: 2 列凍結・diff は card／other 非加算 ──
    const K = randomUUID();
    const { data: rid, error: eC } = await mgr.rpc("daily_report_close", {
      p_store_id: storeA1, p_biz_date: X, p_expense: 0, p_cash_payout: 0, p_cash_float: 0, p_counted_cash: COUNTED, p_note: NOTE, p_force: true, p_idem_key: K,
    });
    check("d45(⑤-0) ★daily_report_close（manager A1・p_idem_key）が通り日報 id を返す", !eC && typeof rid === "string", eC?.message ?? String(rid));
    const r1 = await report();
    check("d45(⑤-1) ★凍結 2 列＝aggregate と一致（card 2,000／other 3,000）", r1.ar_collected_card === a3.ar_collected_card && r1.ar_collected_other === a3.ar_collected_other && r1.ar_collected_card === 2000 && r1.ar_collected_other === 3000,
      JSON.stringify({ card: r1.ar_collected_card, other: r1.ar_collected_other }));
    check("d45(⑤-2) 凍結 ar_collected（cash）=1,000＝aggregate と一致", r1.ar_collected === 1000 && r1.ar_collected === a3.ar_collected, String(r1.ar_collected));
    const d1 = r1.diff as number;
    check("d45(⑥-1) ★close の diff ＝ counted −（float + cash + ar_collected − expense − payout）＝card／other を含まない",
      d1 === expectedDiff(a3), JSON.stringify({ diff: d1, expected: expectedDiff(a3), a3 }));
    check("d45(⑥-2) ★diff は card／other 回収が無い場合の式と同値（回収 5,000 のうち理論在高に入るのは cash 1,000 のみ）",
      d1 === COUNTED - (a1.cash + 1000) && d1 !== COUNTED - (a3.cash + 1000 + 2000 + 3000), JSON.stringify({ diff: d1 }));
    // 冪等: 同一 idem の再 close は id を返し行は 1 つ
    const { data: rid2, error: eC2 } = await mgr.rpc("daily_report_close", {
      p_store_id: storeA1, p_biz_date: X, p_expense: 0, p_cash_payout: 0, p_cash_float: 0, p_counted_cash: COUNTED, p_note: NOTE, p_force: true, p_idem_key: K,
    });
    const n1 = (await q<{ n: number }>(`select count(*)::int as n from public.daily_reports where store_id = $1 and biz_date = $2`, [storeA1, X]))[0].n;
    check("d45(⑤-3) 同一 idem の再 close は冪等（同 id・行 1）", !eC2 && rid2 === rid && n1 === 1, eC2?.message ?? JSON.stringify({ rid2, n1 }));

    // ── ⑦⑧ reclose: 再凍結・diff 不変・既存列不変 ──
    const frozen1 = Object.fromEntries(FROZEN.map((k) => [k, r1[k]]));
    // card を 2,000→2,500（差替）・other を 3,000→0（削除）
    await admin.from("ar_collections").delete().eq("id", otherId);
    arIds.splice(arIds.indexOf(otherId), 1);
    await collect("card", 500);
    const a4 = await agg();
    check("d45(⑦-0) 準備: card 2,500・other 0 に変更（aggregate 反映・cash 1,000 不変）", a4.ar_collected_card === 2500 && a4.ar_collected_other === 0 && a4.ar_collected === 1000, JSON.stringify(a4));
    const rc1 = await reclose(rid as string);
    check("d45(⑦-1) ★daily_report_reclose が通る" + (flagOn ? "（reopen_flow ON＝report_reopen 経由）" : "（reopen_flow OFF＝直呼び）"), !rc1.error && rc1.data === rid, rc1.error?.message ?? String(rc1.data));
    const r2 = await report();
    check("d45(⑦-2) ★再凍結: card 2,500・other 0（aggregate と一致）", r2.ar_collected_card === 2500 && r2.ar_collected_other === 0, JSON.stringify({ card: r2.ar_collected_card, other: r2.ar_collected_other }));
    check("d45(⑦-3) ★reclose 後も diff 不変（card 増・other 減は理論在高に効かない）", r2.diff === d1 && r2.reclosed_count === 1, JSON.stringify({ d1, diff: r2.diff, n: r2.reclosed_count }));
    await collect("other", 3000);
    const rc2 = await reclose(rid as string);
    const r3 = await report();
    check("d45(⑦-4) ★other 3,000 を戻して再 reclose: other 3,000 に再凍結・card 2,500・diff 不変", !rc2.error && r3.ar_collected_other === 3000 && r3.ar_collected_card === 2500 && r3.diff === d1 && r3.reclosed_count === 2,
      rc2.error?.message ?? JSON.stringify({ other: r3.ar_collected_other, card: r3.ar_collected_card, diff: r3.diff, n: r3.reclosed_count }));
    const frozen3 = Object.fromEntries(FROZEN.map((k) => [k, r3[k]]));
    check("d45(⑧-1) ★既存列（cash／card_gross／card_tax／uri／other／drink_sales／slips／guests／ar_collected）は close→reclose×2 の前後で不変",
      JSON.stringify(frozen1) === JSON.stringify(frozen3), JSON.stringify({ frozen1, frozen3 }));
    check("d45(⑧-2) 既存列は aggregate の値と一致（cash／card／uri／other／drink_sales）",
      r3.cash === a4.cash && r3.card_gross === a4.card && r3.uri === a4.uri && r3.other === a4.other && r3.drink_sales === a4.drink_sales, JSON.stringify({ r3: frozen3, a4 }));

    // ── ⑨ anon BLOCKED ──
    {
      const { error } = await anon.rpc("daily_report_aggregate", { p_store_id: storeA1, p_biz_date: X, p_cutoff_hm: CUTOFF, p_tax_rate: taxRate });
      check("d45(⑨-1) ★anon の daily_report_aggregate は BLOCKED（permission denied for function）", has(error, "permission denied for function"), error?.message ?? "通ってしまった");
      const acl = await q<{ acl: string }>(`select proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname='daily_report_aggregate'`);
      check("d45(⑨-2) proacl は postgres のみ（内部専用のまま・0143 で不変）", acl.length === 1 && acl[0].acl === "{postgres=X/postgres}", JSON.stringify(acl));
    }
    // ── 列定義（0143 の器）──
    {
      const cols = await q<{ column_name: string; is_nullable: string; column_default: string }>(
        `select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='daily_reports' and column_name in ('ar_collected_card','ar_collected_other') order by 1`);
      check("d45(器) daily_reports.ar_collected_card／_other は NOT NULL default 0", cols.length === 2 && cols.every((c) => c.is_nullable === "NO" && c.column_default === "0"), JSON.stringify(cols));
      const chk = await q<{ n: number }>(`select count(*)::int as n from pg_constraint where conrelid='public.daily_reports'::regclass and conname in ('daily_reports_ar_collected_card_check','daily_reports_ar_collected_other_check')`);
      check("d45(器) CHECK (>= 0) 2 本", chk[0].n === 2, `got ${chk[0].n}`);
    }
  } finally {
    await teardown();
  }
  // ── ⑩ 後始末 ──
  {
    const left = await q<{ ar: number; rv: number; dr: number; total: number }>(
      `select (select count(*) from public.ar_collections where store_id = $1 and biz_date = $2)::int as ar,
              (select count(*) from public.receivables where id = $3)::int as rv,
              (select count(*) from public.daily_reports where store_id = $1 and biz_date = $2)::int as dr,
              (select count(*) from public.daily_reports where store_id = $1)::int as total`, [storeA1, X, recvId]);
    check("d45(⑩-1) ★掃除: 当該 ar_collections 0 行・receivable 0 行・daily_reports（X）0 行", left[0].ar === 0 && left[0].rv === 0 && left[0].dr === 0, JSON.stringify(left[0]));
    check("d45(⑩-2) ★daily_reports（A1）の行数が開始時と同数", left[0].total === reportsBefore, `${reportsBefore} → ${left[0].total}`);
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-d45 ALL PASS (${pass} assertions)`);
  console.log("D45 入金方法別照合(0143): aggregate 2 キー / cash のみ 0 / card・other 反映と cash 不変 / close 凍結 2 列＋diff 非加算 / reclose 再凍結＋diff 不変 / 既存列不変 / anon BLOCKED / 掃除");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
