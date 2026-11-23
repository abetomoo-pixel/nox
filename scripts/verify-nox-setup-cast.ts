/*
 * verify:nox-setup-cast — 起票143（相談役 11/23 16:40 の ■1）: 初期設定の完了の画面のキャストの登録。
 *  (A) 純関数：契約区分の開始日＝今月の 1 日（JST）・月の 1 日／15 日／末日（JST の夜）とも・直す前の形（今日の UTC の日付）は月の 1 日にならない＝DB が断る形
 *      失敗したときの文＝日本語の 1 行（だれの・どの段で）・英字の理由を出さない（段が出しうる 20 語すべて）
 *  (B) DB（pg 直結・BEGIN … ROLLBACK＝本番に残さない）：1 日／15 日／末日の now で作った計画をオーナーで流す＝キャストの行・契約区分・プラン・PIN が全部入る。
 *      直す前の形（15 日・末日・1 日の朝）は契約区分で 'bad valid_from' に止まり、キャストの行だけが残る（赤）。
 *      押し直し＝済んだ段を飛ばして続きから（画面の runSteps と同じ決まり）で、同じ名前の行は 1 つのまま。
 *  (C) 下書き（NOX-VERIFY-A1・行を作って最後に消す＝verify:nox-payroll と同じ形）：今月の途中で登録した人（プランの開始日＝登録した日）の当月の下書きが、
 *      登録したプランの時給で計算され（wage・timePay）、契約区分（委託／雇用）が下書きの入力に入る。
 *  (D) 画面の形：契約区分の開始日・日本語の 1 行・押し直しの引き継ぎ。
 *  使い方: npm run verify:nox-setup-cast（SUPABASE_DB_URL・NEXT_PUBLIC_SUPABASE_URL・SUPABASE_SECRET_KEY・SEED_PASSWORD）
 */
import fs from "node:fs";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pgTx } from "./fixtures-pgtx";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { castPlanOf, monthStartJstOf, type V5Cast, type V5Step } from "../lib/nox/setup/v5";
import { castStepErrJa, castStepFailTextOf, CAST_STEP_UNKNOWN } from "../lib/nox/setup/cast-errors";
import { resolvePayrollWindow } from "../lib/nox/payroll/window";
import { collectPeriod } from "../lib/nox/payroll/collect";
import { computePayrollDraft } from "../lib/nox/payroll/core";
import { bizDateOf } from "../lib/nox/biz-date";

const env = loadEnvOrExit(["SUPABASE_DB_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD"]);
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const PREFIX = "NOX-VERIFY-起票143";

// ── (A) 純関数 ──
const D1 = new Date("2026-10-31T15:30:00Z"), D15 = new Date("2026-11-15T03:00:00Z"), DEND = new Date("2026-11-30T14:50:00Z"); // JST 11/01 00:30・11/15 12:00・11/30 23:50
check("(A) 開始日＝今月の 1 日（JST）＝1 日の朝・15 日・末日の夜とも 2026-11-01", [D1, D15, DEND].every((d) => monthStartJstOf(d) === "2026-11-01"), [D1, D15, DEND].map(monthStartJstOf));
const oldValid = (d: Date) => d.toISOString().slice(0, 10);
const firstOfMonth = (v: string) => /^\d{4}-\d{2}-01$/.test(v);
check("(A) 直す前の形（今日の UTC の日付）は 15 日・末日・1 日の朝とも月の 1 日にならない（DB は給与期の初日だけ受ける）", [D1, D15, DEND].every((d) => !firstOfMonth(oldValid(d))), [D1, D15, DEND].map(oldValid));
const cast = (g: string, st: "在籍" | "体入", kind: "委託" | "雇用", pin: string): V5Cast => ({ g, n: "", st, kind, plan: st === "体入" ? "体験入店" : "基本プラン", tel: "", mail: "", pin, dist: "mid", inv: false, birthday: "1998-04-04" });
const empArg = (steps: V5Step[]) => (steps.find((s) => s.rpc === "set_cast_employment")?.args as { p_valid_from?: string } | undefined)?.p_valid_from;
check("(A) 計画の契約区分の段は今月の 1 日を渡す（now を渡せる）", [D1, D15, DEND].every((d) => empArg(castPlanOf(cast("x", "在籍", "委託", "739182"), "s", { basic: "p", trial: null }, false, d)) === "2026-11-01"));
const RAISES = ["forbidden", "billing locked", "bad name", "bad real name", "bad birthday", "bad kind", "under 18", "bad employment", "bad valid_from", "period finalized", "bad args", "bad tier", "bad pin", "not found", "inactive cast", "pin weak", "pin taken", "bad overrides", "plan inactive", "bad pay_rule for employment"];
const RPCS = ["cast_create", "set_cast_employment", "set_cast_plan", "set_cast_pin", "set_cast_okuri_tier"];
const ascii = RPCS.flatMap((r) => RAISES.map((m) => ({ r, m, ja: castStepErrJa(r, m) }))).filter((x) => /[A-Za-z]/.test(x.ja.replace(/PIN/g, ""))); // 「PIN」は画面の語（英字の理由ではない）
check(`(A) 段が出しうる語 ${RAISES.length} × 段 ${RPCS.length} のどれも英字を出さない（知らない語も日本語の 1 行）`, ascii.length === 0 && !/[A-Za-z]/.test(castStepErrJa("set_cast_pin", "zz unknown").replace(/PIN/g, "")) && castStepErrJa(null, "zz") === CAST_STEP_UNKNOWN, ascii.slice(0, 5));
check("(A) 1 行＝だれの・どの段で・理由（日本語）・作れた段があれば続きからと添える", castStepFailTextOf("ひなの", "ひなの の契約区分（委託）", "set_cast_employment", "bad valid_from", true) === "ひなの の登録が「ひなの の契約区分（委託）」で止まりました：契約区分の開始日は給与期の初日（月の 1 日）だけです（直してもう一度押すと、この段から続けます）");

// ── (D) 画面の形 ──
const wiz = src("app/(manage)/setup/setup-wizard.tsx");
check("(D) 画面＝失敗の 1 行は castStepFailTextOf（英字の r.error をそのまま出さない）・赤（止まりました）", wiz.includes("setCastMsg(castStepFailTextOf(c.g, st?.label ?? \"登録\", st?.rpc ?? null, r.error, madeCast));") && !wiz.includes("の登録に失敗: ${r.error}") && (wiz.match(/\/失敗\|止まりました\/\.test\(castMsg\)/g) ?? []).length === 2);
check("(D) 画面＝押し直しは済んだ段を飛ばし、作れた段の結果を引き継ぐ（同じ名前の行を二重に作らない）", wiz.includes("const r = await runSteps(steps, { created0: resume?.created, skipKeys: resume?.done });") && wiz.includes("if (opts.skipKeys?.has(st.key))") && wiz.includes("const created: Record<string, unknown> = { ...(opts.created0 ?? {}) };") && wiz.includes("pendingCastRef.current.delete(c.g);"));
check("(D) 計画＝契約区分の開始日は monthStartJstOf(now)", src("lib/nox/setup/v5.ts").includes("p_valid_from: monthStartJstOf(now) } });"));

async function main() {
  // ── (B) DB（BEGIN … ROLLBACK） ──
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string });
  await db.connect();
  try {
    await db.query("begin");
    const tx = pgTx(db);
    const A1 = await tx.storeA1();
    const owner = await tx.uidOf("ownerA");
    const plan = (await tx.one<{ id: string }>("select id from comp_plans where store_id = $1 and is_active order by created_at limit 1", [A1.id])).id;
    const sigs = new Map<string, { names: string[]; types: string[]; nreq: number }[]>();
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      if (!sigs.has(fn)) sigs.set(fn, (await tx.q<{ names: string[]; types: string[]; nargs: number; ndef: number }>("select coalesce(p.proargnames[1:p.pronargs], '{}') names, array(select format_type(t, null) from unnest(p.proargtypes) with ordinality u(t, o) order by o) types, p.pronargs nargs, p.pronargdefaults ndef from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [fn])).map((r) => ({ names: r.names, types: r.types, nreq: r.nargs - r.ndef })));
      const keys = Object.keys(args); const sig = sigs.get(fn)!.find((s) => keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.nreq).every((n) => keys.includes(n)));
      if (!sig) return { ok: false as const, err: `no signature ${fn}` };
      const r = await tx.as(owner, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${sig.types[sig.names.indexOf(k)]}`).join(", ")}) r`, keys.map((k) => { const t = sig.types[sig.names.indexOf(k)]; const v = args[k]; return v == null ? null : t === "jsonb" ? JSON.stringify(v) : v; }));
      return r.ok ? { ok: true as const, data: r.rows[0]?.r } : { ok: false as const, err: r.err };
    };
    // 画面の runSteps と同じ決まり（useResult・済んだ段は飛ばす・作れた結果を引き継ぐ）
    const run = async (steps: V5Step[], created0: Record<string, unknown> = {}, skip: ReadonlySet<string> = new Set()) => {
      const created: Record<string, unknown> = { ...created0 };
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i]; if (skip.has(st.key) || !st.rpc) continue;
        const args = { ...(st.args ?? {}) } as Record<string, unknown>;
        if (st.useResult) { const v = created[st.useResult.from]; if (typeof v !== "string") continue; args[st.useResult.as] = v; }
        const r = await rpc(st.rpc, args);
        if (!r.ok) return { ok: false as const, at: i, err: r.err, created };
        created[st.key] = r.data;
      }
      return { ok: true as const, created };
    };
    const stateOf = async (name: string) => tx.one<{ n: number; emp: string | null; evf: string | null; plan: number; pin: number }>(`select count(*)::int n, max(c.employment) emp, max(c.employment_valid_from)::text evf,
      (select count(*)::int from cast_plan p join casts c2 on c2.id = p.cast_id where c2.name = $1 and c2.store_id = $2 and p.valid_to is null) plan,
      (select count(*)::int from cast_pin x join casts c3 on c3.id = x.cast_id where c3.name = $1 and c3.store_id = $2) pin from casts c where c.name = $1 and c.store_id = $2`, [name, A1.id]);
    const days: [string, Date][] = [["1 日の朝", D1], ["15 日", D15], ["末日の夜", DEND]];
    const PINS = ["582913", "917364", "264859", "835147", "691538", "473926", "358174"]; let pi = 0; // 店の中で重ならない PIN（pin taken を避ける）
    for (const [lbl, d] of days) {
      const g = `${PREFIX}-${lbl}`;
      const r = await run(castPlanOf(cast(g, "在籍", "委託", PINS[pi++]), A1.id, { basic: plan, trial: null }, false, d));
      const s = await stateOf(g);
      check(`(B) ${lbl}：キャストの行・契約区分（2026-11-01 から）・プラン・PIN が全部入る`, r.ok && s.n === 1 && s.emp === "委託" && s.evf === "2026-11-01" && s.plan === 1 && s.pin === 1, [r.ok ? "" : r.err, s]);
      const gOld = `${PREFIX}-旧-${lbl}`;
      const old = castPlanOf(cast(gOld, "在籍", "委託", PINS[pi++]), A1.id, { basic: plan, trial: null }, false, d).map((st) => st.rpc === "set_cast_employment" ? { ...st, args: { ...st.args, p_valid_from: oldValid(d) } } : st);
      const ro = await run(old); const so = await stateOf(gOld);
      check(`(B) 直す前の形（${lbl}・${oldValid(d)}）は赤＝契約区分で bad valid_from・キャストの行だけが残る`, !ro.ok && /bad valid_from/.test(ro.err) && old[ro.at].rpc === "set_cast_employment" && so.n === 1 && so.emp === null && so.plan === 0 && so.pin === 0, [ro, so]);
    }
    // 押し直し（■1-d）：PIN で止まる → 直して押し直す＝済んだ段は飛ばす・行は 1 つのまま
    const gR = `${PREFIX}-押し直し`;
    const st1 = castPlanOf(cast(gR, "在籍", "委託", "123456"), A1.id, { basic: plan, trial: null }, false, D15);
    const r1 = await run(st1);
    const failAt = r1.ok ? -1 : r1.at;
    const done = new Set(st1.slice(0, Math.max(0, failAt)).map((x) => x.key));
    const st2 = castPlanOf(cast(gR, "在籍", "委託", PINS[pi++]), A1.id, { basic: plan, trial: null }, false, D15);
    const r2 = await run(st2, r1.created, done);
    const s2 = await stateOf(gR);
    check("(B) 押し直し＝PIN で止まった人を直して押すと、済んだ段を飛ばして続きから（同じ名前の行は 1 つ・契約区分・プラン・PIN が入る）",
      !r1.ok && st1[failAt]?.rpc === "set_cast_pin" && /pin weak/.test(r1.err) && r2.ok && s2.n === 1 && s2.emp === "委託" && s2.plan === 1 && s2.pin === 1, [r1, s2]);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }

  // ── (C) 下書き（行を作って最後に消す） ──
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SECRET_KEY as string, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (key: "ownerA" | "managerA1") => { const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string, { auth: { autoRefreshToken: false, persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD as string }); if (error) throw new Error(`${key} サインイン失敗`); return c; };
  const owner = await signIn("ownerA"), manager = await signIn("managerA1");
  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeId = sA1!.id as string, orgId = sA1!.org_id as string;
  const teardown = async () => {
    const { data: cs } = await admin.from("casts").select("id").eq("store_id", storeId).like("name", `${PREFIX}%`);
    const ids = (cs ?? []).map((r) => r.id as string);
    if (ids.length) { for (const t of ["punches", "shifts", "attendance", "cast_plan", "cast_pin", "cast_sensitive", "cast_tax_profiles"]) await admin.from(t).delete().in("cast_id", ids); await admin.from("casts").delete().in("id", ids); }
    return ids.length;
  };
  const left0 = await teardown();
  try {
    const { data: pl } = await admin.from("comp_plans").select("id, base").eq("store_id", storeId).eq("is_active", true).order("created_at").limit(1).single();
    const planId = pl!.id as string, base = pl!.base as number;
    // ★2026-11-24（f0 の 2 本目が 0:14 に赤）: 勤務の日は「営業日の今日」（店の締めの時刻で切る）。下書きは営業日の今日より後の日を数えない（anomaly.ts）＝暦の JST の今日だと 0:00〜締めの時刻は翌日扱いで 0 円になる。
    const now = new Date();
    const calToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const { cutoffHm } = await resolvePayrollWindow(admin as SupabaseClient, storeId, calToday.slice(0, 7));
    const today = bizDateOf(now.toISOString(), cutoffHm);
    const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const period = today.slice(0, 7);
    const ids: Record<string, string> = {};
    for (const kind of ["委託", "雇用"] as const) {
      const steps = castPlanOf(cast(`${PREFIX}-${kind}`, "在籍", kind, kind === "委託" ? "739182" : "418257"), storeId, { basic: planId, trial: null }, false, now);
      const created: Record<string, unknown> = {};
      for (const st of steps) {
        if (!st.rpc) continue;
        const args = { ...(st.args ?? {}) } as Record<string, unknown>;
        if (st.useResult) args[st.useResult.as] = created[st.useResult.from];
        const { data, error } = await owner.rpc(st.rpc, args);
        if (error) throw new Error(`${st.label}: ${error.message}`);
        created[st.key] = data;
      }
      ids[kind] = created[`cast_${PREFIX}-${kind}`] as string;
      await admin.from("shifts").insert({ org_id: orgId, store_id: storeId, cast_id: ids[kind], date: today, start_hm: "20:00", end_hm: "25:00", status: "confirmed" });
      await admin.from("punches").insert([{ org_id: orgId, store_id: storeId, cast_id: ids[kind], punched_at: `${today}T20:00:00+09:00`, type: "in", source: "manager" }, { org_id: orgId, store_id: storeId, cast_id: ids[kind], punched_at: `${next}T01:00:00+09:00`, type: "out", source: "manager" }]);
    }
    const { data: cp } = await admin.from("cast_plan").select("cast_id, valid_from").in("cast_id", Object.values(ids));
    check(`(C) プランの開始日＝今月（営業日の月）の 1 日（${period}-01）＝0205 版 2 の日付なし（相談役 11/24 4:10 の ■4）・0:00〜締めの時刻も営業日の月`, (cp ?? []).length === 2 && (cp ?? []).every((r) => (r.valid_from as string) === `${period}-01`), cp);
    const win = await resolvePayrollWindow(admin as SupabaseClient, storeId, period);
    const col = await collectPeriod(admin as SupabaseClient, manager as SupabaseClient, storeId, win);
    const raw = (k: "委託" | "雇用") => col.casts.find((c) => c.castId === ids[k]);
    check("(C) 下書きの入力に、登録した契約区分が入る（委託・雇用）", raw("委託")?.employment === "委託" && raw("雇用")?.employment === "雇用", [raw("委託")?.employment, raw("雇用")?.employment]);
    const draft = await computePayrollDraft(admin as SupabaseClient, manager as SupabaseClient, storeId, period, { previewDefaults: true });
    const row = (k: "委託" | "雇用") => draft.rows.find((r) => r.castId === ids[k]);
    check(`(C) 当月の下書きは登録したプランの時給（${base} 円）で計算される＝5 時間で ${base * 5} 円（委託・雇用とも・プランなしの止まりが無い）`,
      [row("委託"), row("雇用")].every((r) => !!r && r.pay.wage === base && r.pay.timePay === base * 5) && !draft.blockers.some((b) => Object.values(ids).includes(b.castId) && b.reason === "no_plan"),
      [row("委託")?.pay.wage, row("委託")?.pay.timePay, row("雇用")?.pay.wage, row("雇用")?.pay.timePay, draft.blockers.filter((b) => Object.values(ids).includes(b.castId))]);
  } finally {
    const n = await teardown();
    const { count } = await admin.from("casts").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`);
    check(`(C) 後始末＝作った行を消した（前の残り ${left0}・消した ${n}）・残り 0`, (count ?? 0) === 0, count);
  }
}

void main().then(() => {
  if (fails.length) { console.error(`verify:nox-setup-cast FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-setup-cast OK ${pass} checks（起票143＝初期設定の完了の画面のキャストの登録）`);
}, (e) => { console.error(`verify:nox-setup-cast ERROR ${(e as Error).message}`); process.exit(1); });
