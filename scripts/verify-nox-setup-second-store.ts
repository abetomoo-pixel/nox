/*
 * verify:nox-setup-second-store — 2026-11-24（相談役の便【1】・READY docs/tmp/setup_consent_1124）: 2 店目の初期設定の確定を、人のセッション（オーナーの JWT）で最後まで通す。
 *  BEGIN … ROLLBACK（本番に残さない・f0 の走行中だけ流す＝ほかの便と同じ）。NOX-VERIFY-A に店を足し（運営の ops_store_add＝1 店目から写すもの 5 つ）、画面の execute() と同じ部品で計画を作って 1 段ずつ呼ぶ。
 *  形をいくつも混ぜて「店ごとの前提が 2 店目に無くて止まる所」を洗う：既定（丸め 1 分）／丸め 15 分＋同意／丸め 15 分で同意なし（止まる形＝英字の理由は日本語の 1 行）／打刻・スライド・給与の期・送り・ノルマ・キオスクを既定でない形に。
 *  try-0203-flow（既定の形だけ＝丸め 1 分）が見逃した所（consent required）の再発止め。
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { applyType, buildV5Plan, v5DefaultState, v5Checks, PUNCH_ROUND_CONSENT_VERSION, PUNCH_ROUND_CONSENT_REQUIRED, punchRoundConsentMissingOf, type V5Ctx, type V5State, type V5Step } from "../lib/nox/setup/v5";
import { applyCopyToPlan, stripOrgLevelKeys } from "../lib/nox/setup/copy-plan";
import { STORE_COPY_PARTS } from "../lib/nox/ops/store-add";
import { errJa } from "../lib/nox/errors";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// 純関数（DB 前）
{
  const S = applyType(v5DefaultState("2026-11-24"), "cabaret");
  check("(0) 既定（丸め 1 分）は同意が要らない・版を送らない＝今と同じ", !punchRoundConsentMissingOf(S) && S.punch.round === 1);
  S.punch.round = 15;
  check("(0) 丸め 15 分で同意なし＝要確認（STEP 7）に 1 行・確定に進めない", punchRoundConsentMissingOf(S) && v5Checks(S).some((w) => w[0] === 6 && w[1] === PUNCH_ROUND_CONSENT_REQUIRED));
  S.punch.consent = true;
  check("(0) 同意あり＝要確認から消える", !punchRoundConsentMissingOf(S) && !v5Checks(S).some((w) => w[1] === PUNCH_ROUND_CONSENT_REQUIRED));
  check("(0) 英字の理由 consent required は日本語の 1 行（だれが何をすればよいか）", /^勤務時間の丸めを使うには、オーナーが丸めの同意に/.test(errJa("consent required")));
}

type Variant = { key: string; tweak: (S: V5State) => void; expectFail?: RegExp; after?: (sid: string) => Promise<void> };

async function main(): Promise<void> {
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await db.connect();
try {
  await db.query("begin");
  const tx = pgTx(db);
  const proof = await tx.one<{ n: number }>("select count(*)::int n from public.orgs");
  check("(1) 貼り先証明（会社の数が読める）", proof.n > 0, proof);
  const sigCache = new Map<string, { names: string[]; types: string[]; nreq: number }[]>();
  const sigsOf = async (fn: string) => {
    if (!sigCache.has(fn)) sigCache.set(fn, (await tx.q<{ names: string[]; types: string[]; nargs: number; ndef: number }>(
      "select coalesce(p.proargnames[1:p.pronargs], '{}') names, array(select format_type(t, null) from unnest(p.proargtypes) with ordinality u(t, o) order by o) types, p.pronargs nargs, p.pronargdefaults ndef from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [fn]))
      .map((r) => ({ names: r.names, types: r.types, nreq: r.nargs - r.ndef })));
    return sigCache.get(fn)!;
  };
  const rpcAs = async (who: { auth_user_id: string }, fn: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const sig = (await sigsOf(fn)).find((s) => keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.nreq).every((n) => keys.includes(n)));
    if (!sig) return { ok: false as const, err: `no signature: ${fn}(${keys.join(",")})` };
    const params = keys.map((k) => { const t = sig.types[sig.names.indexOf(k)]; const v = args[k]; return v === null || v === undefined ? null : t === "jsonb" || t === "json" ? JSON.stringify(v) : v; });
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${sig.types[sig.names.indexOf(k)]}`).join(", ")}) r`;
    const r = await tx.as(who, sql, params);
    return r.ok ? { ok: true as const, data: r.rows[0]?.r } : { ok: false as const, err: r.err };
  };
  const A1 = await tx.one<{ id: string; org_id: string }>("select id, org_id from stores where name = 'NOX-VERIFY-A1'");
  const owner = { auth_user_id: (await tx.one<{ a: string }>("select auth_user_id a from users where email = 'nox-verify-owner-a@example.com'")).a };
  const op = (await tx.one<{ id: string } | undefined>("select auth_user_id id from ops_operators limit 1"))?.id;
  if (!op) throw new Error("ops_operators が空");
  const a1Round = await tx.one<{ u: number; n: number }>("select punch_round_unit u, (select count(*)::int from punch_round_consents where store_id = $1) n from stores where id = $1", [A1.id]);
  const countsOf = async (sid: string) => tx.one<Record<string, number>>(`select ${["seats", "products", "pricing_rules", "comp_plans", "store_business_hours", "casts"].map((t) => `(select count(*)::int from ${t} where store_id = $1) ${t}`).join(", ")}`, [sid]);
  const a1Before = await countsOf(A1.id);

  const runVariant = async (v: Variant, i: number) => {
    const name = `NOX-VERIFY-A9（2 店目の通し ${i + 1}・${v.key}）`.slice(0, 40);
    const add = await tx.call("select public.ops_store_add($1, $2, $3, 'cabaret', $4, $5::text[]) j", [op, A1.org_id, name, A1.id, [...STORE_COPY_PARTS]]);
    if (!add.ok) { check(`(${v.key}) 店を足す（運営）`, false, tx.errOf(add)); return; }
    const sid = (add.rows[0].j as { store_id: string }).store_id;
    const S = applyType(v5DefaultState("2026-11-24"), "cabaret");
    S.shop.name = name; S.shop.addr = "東京都"; S.payroll.okuriFlatBase = 1000; S.staff = []; S.devReg = false; S.timeMode = "manual";
    v.tweak(S);
    const ctx: V5Ctx = { storeId: sid, setupDone: false, lockedType: "cabaret", deviceIdemKey: "00000000-0000-4000-8000-000000000001", staffIdemKeys: [],
      current: { round_unit: 1, round_mode: "down", time_mode: "fixed", time_per: "table", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "none", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } as unknown as V5Ctx["current"] };
    const planAll = buildV5Plan(S, ctx);
    const cp = await rpcAs(owner, "store_copy_settings", { p_src: A1.id, p_dst: sid, p_parts: [...STORE_COPY_PARTS] });
    if (!cp.ok) { check(`(${v.key}) 写し`, false, cp.err); return; }
    const sjC = (await tx.as(owner, "select settings_json sj from public.stores where id = $1", [sid]));
    const sj = (sjC.ok ? (sjC.rows[0]?.sj ?? {}) : {}) as Record<string, unknown>;
    const steps = stripOrgLevelKeys(applyCopyToPlan(planAll.steps, [...STORE_COPY_PARTS], { invoice_reg_no: typeof sj.invoice_reg_no === "string" ? sj.invoice_reg_no : null, receipt_footer: typeof sj.receipt_footer === "string" ? sj.receipt_footer : null }));
    const created: Record<string, unknown> = {}; let ran = 0; let err: { at: number; label: string; rpc: string; e: string } | null = null;
    const cnt = await countsOf(sid);
    for (const [k, st] of (steps as V5Step[]).entries()) {
      if (st.api || st.argsOf || !st.rpc) continue;
      if ((st.guard === "seats_empty" && cnt.seats > 0) || (st.guard === "products_empty" && cnt.products > 0) || (st.guard === "plans_empty" && cnt.comp_plans > 0) || (st.guard === "rules_empty" && cnt.pricing_rules > 0)) continue;
      const args = { ...(st.args ?? {}) } as Record<string, unknown>;
      if (st.useResult) { const x = created[st.useResult.from]; if (typeof x !== "string") continue; args[st.useResult.as] = x; }
      const r = await rpcAs(owner, st.rpc, args);
      if (!r.ok) { err = { at: k, label: st.label, rpc: st.rpc, e: r.err ?? "" }; break; }
      created[st.key] = r.data; ran++;
    }
    if (v.expectFail) {
      check(`(${v.key}) 止まる所と理由＝${v.expectFail}・日本語の 1 行`, !!err && v.expectFail.test(err.e) && /[ぁ-ん]/.test(errJa(err.e)) && !/consent required/.test(errJa(err.e)), err);
      return;
    }
    check(`(${v.key}) 計画の rpc がすべて通る（オーナーの JWT・2 店目）`, err === null && ran > 10, { err, ran });
    const done = await tx.one<{ d: unknown }>("select settings_json->'setup_done' d from stores where id = $1", [sid]);
    check(`(${v.key}) 2 店目は初期設定済みになる`, done.d === true, done);
    if (v.after) await v.after(sid);
  };

  const variants: Variant[] = [
    { key: "既定", tweak: () => {} },
    { key: "丸め15分と同意", tweak: (S) => { S.punch.round = 15; S.punch.consent = true; },
      after: async (sid) => {
        const r = await tx.one<{ u: number; v: string | null; n: number }>("select s.punch_round_unit u, (select consent_version from punch_round_consents c where c.store_id = s.id order by created_at desc limit 1) v, (select count(*)::int from punch_round_consents c where c.store_id = s.id) n from stores s where s.id = $1", [sid]);
        check("(丸め15分と同意) 店の丸めは 15 分・同意の行が 1 つ（版 v1）", r.u === 15 && r.v === PUNCH_ROUND_CONSENT_VERSION && r.n === 1, r);
      } },
    { key: "丸め15分で同意なし", tweak: (S) => { S.punch.round = 15; S.punch.consent = false; }, expectFail: /consent required/ },
    { key: "打刻しない店と丸め30分", tweak: (S) => { S.punch.how = "store"; S.punch.round = 30; S.punch.consent = true; } },
    { key: "打刻はどこでも・ハード", tweak: (S) => { S.punch.how = "any"; S.punch.judge = "hard"; } },
    { key: "pt スライド・半月", tweak: (S) => { S.pay.slide = "point"; S.payroll.period = "half"; S.slidePeriod = "half"; } },
    { key: "日払い・ノルマ・ボーナス", tweak: (S) => { S.payroll.period = "daily"; S.pay.norma = true; S.pay.bonus = true; } },
    { key: "キオスクとキャストの会計", tweak: (S) => { S.reg.kiosk = true; S.reg.castReg = "pay"; S.reg.staffDisc = "limit"; S.punch.how = "device"; S.devReg = false; } },
  ];
  for (const [i, v] of variants.entries()) {
    await db.query("savepoint v"); // 形ごとに戻す（1 つの失敗が次の形を止めない）
    try { await runVariant(v, i); } catch (e) { check(`(${v.key}) 例外`, false, e instanceof Error ? e.message : String(e)); }
    await db.query("rollback to savepoint v");
  }
  check("(9) 1 店目の行と丸めは最後まで変わらない（混ざらない）", JSON.stringify(await countsOf(A1.id)) === JSON.stringify(a1Before) && (await tx.one<{ u: number }>("select punch_round_unit u from stores where id = $1", [A1.id])).u === a1Round.u, { a1Before, after: await countsOf(A1.id) });
} finally {
  await db.query("rollback").catch(() => undefined);
  await db.end();
}
}

void main().then(() => {
if (fails.length) { console.log(`verify:nox-setup-second-store FAIL ${fails.length}（pass ${pass}）`); for (const f of fails) console.log(" - " + f); process.exit(1); }
console.log(`verify:nox-setup-second-store OK (${pass} checks)`);
}).catch((e) => { console.error(e); process.exit(1); });
