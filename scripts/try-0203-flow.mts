/*
 * try-0203-flow — 2 店の会社の通し（書込を伴う所）を BEGIN … ROLLBACK で通す（相談役 11/23 12:00 の ■2-d・本番に残さない・f0 の走行中は流さない）。
 *  0203 の本体（begin／commit を外す）→ 運営が店を足す（ops_store_add・1 店目から写すもの 5 つ）
 *  → 1 店目のプランの名前を変える（名前で探さない確かめ・■2-b）→ オーナーが 2 店目の初期設定を確定（画面と同じ順＝store_copy_settings → applyCopyToPlan → stripOrgLevelKeys → 計画の rpc を順に）
 *  → 完了の後のキャストの登録（castPlanOf＝基本・体験入店）→ 確かめ → rollback。
 *  画面の execute() と同じ部品（lib の純関数）で計画を作り、rpc はオーナーの JWT で 1 本ずつ呼ぶ（route＝スタッフ・端末は使わない計画にする）。
 *  使い方: npx tsx scripts/try-0203-flow.mts
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { applyType, buildV5Plan, castPlanOf, v5DefaultState, type V5Ctx, type V5Step } from "../lib/nox/setup/v5";
import { applyCopyToPlan, copiedPlanIdsOf, stripOrgLevelKeys } from "../lib/nox/setup/copy-plan";
import { STORE_COPY_PARTS } from "../lib/nox/ops/store-add";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };

const raw = fs.readFileSync("supabase/migrations/0203_multi_store.sql", "utf8");
const lines = raw.split(/\r?\n/);
const bi = lines.findIndex((l) => l.trim() === "begin;");
const ci = lines.map((l) => l.trim()).lastIndexOf("commit;");
const body = lines.slice(bi + 1, ci).join("\n");
if (bi < 0 || ci < 0 || ci <= bi) throw new Error("begin; と commit; の行が見つからない");
if (/^\s*commit\s*;/im.test(body) || /^\s*rollback\s*;/im.test(body) || /^\s*begin\s*;/im.test(body)) throw new Error("本体の中に begin／commit／rollback がある＝送らない");

const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await db.connect();
const log: string[] = [];
try {
  await db.query("begin");
  const tx = pgTx(db);
  const proof = await tx.one<{ n: number }>("select count(*)::int n from public.orgs"); console.log(`proof nox-project-proof ${proof.n}`);
  await db.query(body);

  // PostgREST と同じく名前つきの引数で呼ぶ＝引数の名前が合う版を選び、型を付けて渡す
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

  await tx.q("update stores set settings_json = coalesce(settings_json, '{}'::jsonb) || $1::jsonb where name = 'NOX-VERIFY-A1'", [JSON.stringify({ invoice_reg_no: "T1234567890123", receipt_footer: "1 店目の下の文" })]); // 写す値が空振りしないように（この試走の中だけ）
  const A1 = await tx.one<{ id: string; org_id: string; sj: Record<string, unknown> }>("select id, org_id, settings_json sj from stores where name = 'NOX-VERIFY-A1'");
  const owner = { auth_user_id: (await tx.one<{ a: string }>("select auth_user_id a from users where email = 'nox-verify-owner-a@example.com'")).a };
  const op = (await tx.one<{ id: string } | undefined>("select auth_user_id id from ops_operators limit 1"))?.id;
  if (!op) throw new Error("ops_operators が空");
  const countsOf = async (sid: string) => tx.one<Record<string, number>>(`select ${["seats", "products", "product_categories", "pricing_rules", "pricing_categories", "comp_plans", "comp_plan_components", "store_business_hours", "cast_ranks", "casts", "custom_back_defs", "penalty_config", "notices"].map((t) => `(select count(*)::int from public.${t} where store_id = $1) ${t}`).join(", ")}`, [sid]);
  const a1Before = await countsOf(A1.id);
  const a1SjBefore = JSON.stringify(A1.sj);

  // 1) 運営が店を足す（写すもの 5 つ）
  const add = await tx.call("select public.ops_store_add($1, $2, 'NOX-VERIFY-A3（通し）', 'cabaret', $3, $4::text[]) j", [op, A1.org_id, A1.id, [...STORE_COPY_PARTS]]);
  check("1 店を足す（運営）", add.ok, tx.errOf(add));
  const sid = add.ok ? (add.rows[0].j as { store_id: string }).store_id : "";
  const dr = await tx.one<{ d: { copy?: { from?: string; parts?: string[] } } | null }>("select data d from setup_drafts where store_id = $1", [sid]);
  check("1 下書きに写すものだけ（行は写していない）", dr?.d?.copy?.from === A1.id && (dr?.d?.copy?.parts ?? []).length === 5 && Object.values(await countsOf(sid)).every((n) => n === 0), [dr, await countsOf(sid)]);

  // 2) 1 店目のプランの名前を変える（■2-b＝名前で探さない確かめ）
  const plansA1 = await tx.q<{ id: string; name: string }>("select id, name from comp_plans where store_id = $1 order by created_at, id", [A1.id]);
  await tx.q("update comp_plans set name = name || '（改名）' where store_id = $1", [A1.id]);
  // 初期設定で作った店と同じ形（有効なプラン 2 つ＝基本→体験入店の順）にする（NOX-VERIFY-A1 は有効なプランが 1 つ＝2 つ目を有効に・この試走の中だけ）
  if (plansA1.length >= 2) await tx.q("update comp_plans set is_active = true where id = $1", [plansA1[1].id]);
  const defA1 = typeof A1.sj?.default_plan_id === "string" ? (A1.sj.default_plan_id as string) : null;

  // 3) オーナーが 2 店目の初期設定を確定（画面の execute() と同じ順）
  const S = applyType(v5DefaultState("2026-11-23"), "cabaret");
  S.shop.name = "NOX-VERIFY-A3（通し）"; S.shop.addr = "東京都"; S.payroll.okuriFlatBase = 1000; S.staff = []; S.devReg = false; S.timeMode = "manual";
  const ctx: V5Ctx = { storeId: sid, setupDone: false, lockedType: "cabaret", deviceIdemKey: "00000000-0000-4000-8000-000000000001", staffIdemKeys: [],
    current: { round_unit: 1, round_mode: "down", time_mode: "fixed", time_per: "table", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } };
  const planAll = buildV5Plan(S, ctx);
  const cp = await rpcAs(owner, "store_copy_settings", { p_src: A1.id, p_dst: sid, p_parts: [...STORE_COPY_PARTS] });
  check("3 写し（オーナー・確定の最初）", cp.ok, cp.ok ? undefined : cp.err);
  const ids = copiedPlanIdsOf(cp.ok ? cp.data : null);
  // 画面と同じ＝写した後の 2 店目の登録番号と領収書の下の文を読んで、領収書の段に渡す（setup-wizard の execute）
  const sjCopied = (await tx.as(owner, "select settings_json sj from public.stores where id = $1", [sid]));
  const sjC = (sjCopied.ok ? (sjCopied.rows[0]?.sj ?? {}) : {}) as Record<string, unknown>;
  const copiedReceipt = { invoice_reg_no: typeof sjC.invoice_reg_no === "string" ? sjC.invoice_reg_no : null, receipt_footer: typeof sjC.receipt_footer === "string" ? sjC.receipt_footer : null };
  const steps = stripOrgLevelKeys(applyCopyToPlan(planAll.steps, [...STORE_COPY_PARTS], copiedReceipt));
  const groups = [...new Set(steps.map((s) => s.group))];
  check("3 写した群の段は飛ばす（料金・商品・商品のバックの上書き・待遇・営業時間）・店舗設定の群は版 2 で店ごとの鍵を書く段（店舗設定・領収書の住所）だけ残る", !groups.some((g) => ["pricing", "products", "overrides", "comp", "hours"].includes(String(g))) && planAll.steps.some((x) => x.group === "overrides") && steps.filter((x) => x.group === "settings").map((x) => x.rpc).join(",") === "set_store_profile,set_store_receipt_profile", { groups, settings: steps.filter((x) => x.group === "settings").map((x) => x.rpc) });
  const created: Record<string, unknown> = {}; let ran = 0, skipped = 0; const errs: string[] = [];
  const runSteps = async (xs: V5Step[]) => {
    const cnt = await countsOf(sid); // 画面と同じ＝件数は始めに 1 回だけ読む
    for (const st of xs) {
      if (st.api || st.argsOf) { skipped++; log.push(`skip（route／商品の上書き）: ${st.label}`); continue; }
      if (!st.rpc) continue;
      if ((st.guard === "seats_empty" && cnt.seats > 0) || (st.guard === "products_empty" && cnt.products > 0) || (st.guard === "plans_empty" && cnt.comp_plans > 0) || (st.guard === "rules_empty" && cnt.pricing_rules > 0)) { skipped++; log.push(`skip（既存あり）: ${st.label}`); continue; }
      const args = { ...(st.args ?? {}) } as Record<string, unknown>;
      if (st.useResult) { const v = created[st.useResult.from]; if (typeof v !== "string") { skipped++; continue; } args[st.useResult.as] = v; }
      const r = await rpcAs(owner, st.rpc, args);
      if (!r.ok) { errs.push(`${st.label}（${st.rpc}）: ${r.err}`); break; }
      created[st.key] = r.data; ran++; log.push(`ok: ${st.label}`);
    }
  };
  await runSteps(steps);
  check("3 計画の rpc がすべて通る（オーナー）", errs.length === 0, { errs, ran, skipped });
  const st2 = await tx.one<{ sj: Record<string, unknown>; pd: number | null }>("select settings_json sj, pay_day pd from stores where id = $1", [sid]);
  check("3 2 店目は初期設定済みになる", st2.sj?.setup_done === true, st2.sj?.setup_done);
  const a1Sj = (await tx.one<{ sj: Record<string, unknown> }>("select settings_json sj from stores where id = $1", [A1.id])).sj;
  check("3 1 店目の行と店の設定は変わらない（混ざらない）", JSON.stringify(await countsOf(A1.id)) === JSON.stringify(a1Before) && JSON.stringify(a1Sj) === a1SjBefore, [a1Before, await countsOf(A1.id)]);
  const cmpKeys = ["slide_apply", "settlement_presets", "sys_norms", "sys_penalties", "trial_guarantee_days", "sales_basis", "biz_cutoff_hm", "receipt_footer"];
  const nz = (v: unknown) => (v === "" ? null : v ?? null); // 領収書の段は空を "" で書く（set_store_receipt_profile）＝無いのと同じに数える
  const diff = cmpKeys.filter((k) => JSON.stringify(nz(st2.sj?.[k])) !== JSON.stringify(nz(A1.sj?.[k])));
  check("3 写した店の設定を初期設定の段が上書きしない（待遇・店舗設定の鍵が 1 店目と同じ）", diff.length === 0, diff.map((k) => ({ k, a1: A1.sj?.[k] ?? null, a3: st2.sj?.[k] ?? null })));
  const pb = await tx.one<{ d: number }>("select count(*)::int d from (select name, back_mode, back_value, unit4_json::text u, price, hon_pt from products where store_id = $1 except select name, back_mode, back_value, unit4_json::text, price, hon_pt from products where store_id = $2) x", [A1.id, sid]);
  check("3 写した商品の値段とバックは 1 店目のまま（雛形で上書きしない）", pb.d === 0, pb);
  const own = await tx.one<{ uv: boolean; addr: string | null; reg: string | null; foot: string | null; a1reg: string | null; a1foot: string | null }>("select d.use_vip uv, d.settings_json->>'receipt_address' addr, d.settings_json->>'invoice_reg_no' reg, d.settings_json->>'receipt_footer' foot, s.settings_json->>'invoice_reg_no' a1reg, s.settings_json->>'receipt_footer' a1foot from stores d, stores s where d.id = $1 and s.id = $2", [sid, A1.id]);
  check("3 版 2 店ごとの鍵は 2 店目の入力（VIP 席の有無・領収書の住所）・登録番号と下の文は 1 店目の写し", own.uv === (S.seats.vip > 0) && own.addr === "東京都" && own.reg === "T1234567890123" && own.a1reg === own.reg && own.foot === "1 店目の下の文" && own.a1foot === own.foot, own);
  const rnd = await tx.one<{ u: number; m: string; e: boolean }>("select punch_round_unit u, punch_round_mode m, punch_enforce e from stores where id = $1", [sid]);
  check("3 版 3 2 店目は丸めない（1 分）で始まる（写さない・初期設定の既定も 1 分）・打刻の強制は 2 店目の入力（既定はソフト）", rnd.u === 1 && rnd.e === false, rnd);
  const org = await tx.one<{ pd: number | null }>("select pay_day pd from orgs where id = $1", [A1.org_id]);
  const pds = await tx.q<{ pd: number | null }>("select distinct pay_day pd from stores where org_id = $1", [A1.org_id]);
  check("3 支払日は会社の値のまま（店で書かない）・会社の全店で同じ", pds.length === 1 && pds[0].pd === org.pd, { org: org.pd, stores: pds });

  // 4) 完了の後のキャストの登録＝基本・体験入店に結ぶ（ID の付け替えの対応・1 店目で名前を変えてある）
  const map = (cp.ok ? ((cp.data as { plans?: { src: string; dst: string }[] }).plans ?? []) : []);
  const dstOf = (src: string | null | undefined) => map.find((m) => m.src === src)?.dst ?? null;
  const wantBasic = dstOf(defA1 ?? plansA1[0]?.id), wantTrial = dstOf(plansA1.find((p) => p.id !== (defA1 ?? plansA1[0]?.id))?.id);
  check("4 結ぶ先＝基本は写したときの対応（1 店目の既定または最初のプラン）・体験入店は結ばない（版 2 の ■3＝オーナーが選ぶ）", !!ids && ids.basic === wantBasic && ids.trial === null && !!wantBasic && !!wantTrial, { ids, wantBasic, wantTrial, n: map.length });
  const names = await tx.q<{ id: string; name: string }>("select id, name from comp_plans where store_id = $1", [sid]);
  check("4 写したプランの名前は 1 店目の今の名前（改名のまま＝名前では見つからない形）", names.length === plansA1.length && names.every((n) => n.name.endsWith("（改名）")) && !names.some((n) => n.name === "基本プラン" || n.name === "体験入店"), names.map((n) => n.name));
  created.__ = null;
  const castSteps = [...castPlanOf({ g: "通し在籍", n: "", st: "在籍", kind: "委託", plan: "基本プラン", tel: "", mail: "", pin: "739182", dist: "mid", inv: false, birthday: "2000-01-01" }, sid, { basic: ids?.basic ?? null, trial: wantTrial /* 完了の画面でオーナーが選んだ形 */ }, false),
    ...castPlanOf({ g: "通し体入", n: "", st: "体入", kind: "委託", plan: "体験入店", tel: "", mail: "", pin: "418257", dist: "mid", inv: false, birthday: "2000-01-01" }, sid, { basic: ids?.basic ?? null, trial: wantTrial /* 完了の画面でオーナーが選んだ形 */ }, false)];
  await runSteps(castSteps);
  check("4 キャストの登録の rpc が通る", errs.length === 0, errs);
  const cpl = await tx.q<{ g: string; plan: string; store: string }>("select c.name g, cp.plan_id::text plan, p.store_id::text store from casts c join cast_plan cp on cp.cast_id = c.id join comp_plans p on p.id = cp.plan_id where c.store_id = $1 order by 1", [sid]);
  const pOf = (g: string) => cpl.find((x) => x.g === g);
  check("4 在籍＝基本の写し・体入＝オーナーが選んだプラン（どちらも 2 店目のプラン）", pOf("通し在籍")?.plan === wantBasic && pOf("通し体入")?.plan === wantTrial && cpl.every((x) => x.store === sid), cpl);
  check("4 1 店目の行は最後まで変わらない", JSON.stringify(await countsOf(A1.id)) === JSON.stringify(a1Before), await countsOf(A1.id));
} finally {
  await db.query("rollback").catch(() => undefined);
  await db.end();
}
fs.writeFileSync("docs/tmp/try_0203_flow_log.txt", log.join("\n") + "\n");
if (fails.length) { console.error(`try-0203-flow FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`try-0203-flow OK ${pass} checks（BEGIN … ROLLBACK・本番に残さない・段 ${log.length}）`);
