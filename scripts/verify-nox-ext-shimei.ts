/*
 * verify:nox-ext-shimei — ★0217（起票167・相談役 11/26 の便 L1・2026-11-26 14:42:01 CC 適用）延長指名料の額（店で一律の 1 つ）。
 *  (1) 純関数：今の額＝有効な ext_shimei の行の並びが一番上・欄は 1 円以上（0 と空は「金額を入れてください」）・例外の日本語
 *  (2) 画面の配線：旗の後ろで「指名・同伴料金」の枠に ExtShimeiCard（ON のときだけ額の欄・中央の保存・未設定の 1 行）・「セット・延長」の枠の ON／OFF は旗 false の時だけ
 *  (3) 本番の定義で BEGIN … ROLLBACK（NOX-VERIFY-A1・A1 のデータは残さない）：オーナーが額を書く＝条件なしの 1 行・延長で本指名 1 人に 1 行（場内と終わった指名は付かない）・
 *      OFF で付かない・額 0 なら 0 円の行が付く（DB は 0 を通す＝画面が止める）・set_pricing_rule は ext_shimei を断るまま・権限
 *  使い方: npm run verify:nox-ext-shimei（env: SUPABASE_DB_URL・無ければ FAIL）
 */
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { extShimeiAmountOf, extShimeiInputErrOf, extShimeiErrJa, EXT_SHIMEI_EMPTY_JA, EXT_SHIMEI_UNSET_JA, EXT_SHIMEI_DESC, EXT_SHIMEI_AUTO_NOTE } from "../lib/nox/pricing/ext-shimei";
import { MIG_0217_APPLIED, mig0217On } from "../lib/nox/rules-0175/flag";
import { HOURLY_AFTER_SAVE_JA } from "../lib/nox/payroll/hourly-bands";
try { process.loadEnvFile(".env.local"); } catch { /* 無ければ env 直指定 */ }

let ok = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };

// (1) 純関数
const R = (o: Partial<{ fee_kind: string; is_active: boolean; amount: number; priority: number; created_at: string; id: string }>) => ({ fee_kind: "ext_shimei", is_active: true, amount: 1000, priority: 1, created_at: "2026-11-26T00:00:00Z", id: "a", ...o });
expect("(1-1) 額＝有効な ext_shimei の行の並びが一番上・止めた行と別の種類は数えない・行が無ければ null",
  extShimeiAmountOf([R({ amount: 2000, priority: 5, id: "b" }), R({ amount: 1500, priority: 1, id: "c" })]) === 1500
  && extShimeiAmountOf([R({ is_active: false }), R({ fee_kind: "hon_shimei" })]) === null && extShimeiAmountOf([]) === null);
expect("(1-2) 欄＝1 円以上の整数（0・空・小数は「金額を入れてください」・100 万は上限）",
  extShimeiInputErrOf("") === EXT_SHIMEI_EMPTY_JA && extShimeiInputErrOf("0") === EXT_SHIMEI_EMPTY_JA && extShimeiInputErrOf("1") === null && extShimeiInputErrOf("999999") === null
  && extShimeiInputErrOf("1000000") !== null && EXT_SHIMEI_EMPTY_JA === "金額を入れてください");
expect("(1-3) 例外の日本語（bad amount・billing locked・forbidden）と未設定の 1 行", ["bad amount", "billing locked", "forbidden"].every((m) => extShimeiErrJa(m) !== m) && EXT_SHIMEI_UNSET_JA === "金額が未設定です");
expect("(1-4) 説明の文は「料金適用ルールの延長指名料」の案内をやめた・自動延長の店の 1 行", !EXT_SHIMEI_DESC.includes("料金適用ルール") && EXT_SHIMEI_DESC.includes("本指名 1 人につき") && EXT_SHIMEI_AUTO_NOTE === "自動で延長する店では、今は加算しません");

// (2) 配線
const board = fs.readFileSync("app/(manage)/master/pricing/pricing-board.tsx", "utf8");
const card = fs.readFileSync("app/(manage)/master/pricing/ext-shimei-card.tsx", "utf8");
expect("(2-1) 旗 MIG_0217_APPLIED は true（0217 の適用の後）", (MIG_0217_APPLIED as boolean) === true && mig0217On() === true);
const iDohan = board.indexOf('flagKey="dohan_auto_hon"'), iCard = board.indexOf("<ExtShimeiCard "), iOld = board.indexOf('flagKey="ext_shimei_enabled"');
expect("(2-2) 料金マスタ：延長指名は「指名・同伴料金」の枠の中（同伴の本指名自動付与の下・旗の後ろ）・「セット・延長」の枠の ON／OFF は旗 false の時だけ",
  iDohan > 0 && iCard > iDohan && /\{mig0217On\(\) && \([\s\S]{0,200}<ExtShimeiCard /.test(board.slice(iDohan, iCard + 20)) && iOld > iCard && /\{!mig0217On\(\) && <div/.test(board.slice(iOld - 300, iOld)));
expect("(2-3) カード：ON のときだけ額の欄・未設定の 1 行・保存は中央（nox-actions）で set_ext_shimei_fee・欄の検査を先に",
  card.includes("{on && (") && card.includes("saved == null &&") && card.includes('className="nox-actions"') && card.includes('rpc("set_ext_shimei_fee"')
  && card.indexOf("extShimeiInputErrOf(val)") < card.indexOf('rpc("set_ext_shimei_fee"'));
// ★相談役 11/26 の便 L2: 新しいプランの「基本・保証」に一言
const plan = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-editor.tsx", "utf8");
expect("(2-4) 待遇プラン：保存の前（draft.id が無い）に「保存すると、時間帯の時給を設定できます」・保存の後は時間帯の枠",
  HOURLY_AFTER_SAVE_JA === "保存すると、時間帯の時給を設定できます" && plan.includes("hourlyBandsOn() && !draft.id && isOwner && (") && plan.includes("{HOURLY_AFTER_SAVE_JA}") && plan.includes("hourlyBandsOn() && draft.id && isOwner && <HourlyBandsEditor"));
const migSql = fs.readFileSync("supabase/migrations/0217_ext_shimei_fee.sql", "utf8");
expect("(2-5) 収蔵＝0217 の本体（begin;／commit; 1 回ずつ・set_ext_shimei_fee）", (migSql.match(/^begin;/gm) ?? []).length === 1 && (migSql.match(/^commit;/gm) ?? []).length === 1 && migSql.includes("create or replace function public.set_ext_shimei_fee(p_store_id uuid, p_amount integer)"));

// (3) 本番の定義で BEGIN … ROLLBACK
async function live() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) { fails.push("SUPABASE_DB_URL が無い"); return; }
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tx = pgTx(c);
  try {
    await c.query("begin");
    await c.query("set local lock_timeout = '5s'");
    const O = await tx.uidOf("ownerA"), M = await tx.uidOf("managerA1");
    const A1 = await tx.storeA1();
    const rows = () => tx.q<{ amount: number; is_active: boolean; seat_kind: string | null; dow_mask: number | null; time_from_min: number | null; category_id: string | null }>("select amount, is_active, seat_kind, dow_mask, time_from_min, category_id from public.pricing_rules where store_id = $1 and fee_kind = 'ext_shimei'", [A1.id]);
    const before = await rows();
    const set = (who: { auth_user_id: string } | "anon", amount: number | null) => tx.as(who, "select public.set_ext_shimei_fee($1, $2) id", [A1.id, amount]);
    let r = await set(O, 1000); const rs = await rows();
    expect("(3-1) オーナーが額を書く＝有効な ext_shimei の行は条件なしの 1 行・1,000 円", r.ok && rs.filter((x) => x.is_active).length === 1 && rs.filter((x) => x.is_active)[0].amount === 1000
      && [rs[0].seat_kind, rs[0].dow_mask, rs[0].time_from_min, rs[0].category_id].every((v) => v === null), { before: before.length, rs, err: tx.errOf(r) });
    r = await set(M, 1500);
    expect("(3-2) 自店の店長も書ける（同じ 1 行を直す）", r.ok && (await rows()).filter((x) => x.is_active).length === 1 && (await rows()).filter((x) => x.is_active)[0].amount === 1500, tx.errOf(r));
    const an = await set("anon", 1000), neg = await set(O, -1);
    expect("(3-3) anon は permission denied for function・-1 は bad amount", !an.ok && /permission denied for function/.test(an.err) && !neg.ok && /bad amount/.test(neg.err), [tx.errOf(an), tx.errOf(neg)]);
    // 伝票：手動の店・延長指名 ON
    await tx.q("update public.stores set time_mode = 'manual', ext_fee = 2000, ext_min = 30, set_min = 60, set_fee = 5000, time_per = 'table', ext_shimei_enabled = true where id = $1", [A1.id]);
    await tx.q("update public.pricing_rules set is_active = false where store_id = $1 and fee_kind in ('set', 'extension')", [A1.id]);
    await set(O, 1000);
    const seat = await tx.one<{ id: string }>("select id from public.seats where store_id = $1 and is_active and not exists (select 1 from public.checks c where c.seat_id = seats.id and c.status = 'open') order by id limit 1", [A1.id]);
    const op = await tx.as(M, "select public.check_open($1::uuid, 2) id", [seat.id]);
    if (!op.ok) throw new Error("開卓できない " + op.err);
    const chk = String(op.rows[0].id);
    const casts = await tx.q<{ id: string }>("select id from public.casts where org_id = $1 order by (store_id = $2) desc, id limit 3", [A1.org_id, A1.id]);
    await tx.q("insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan) values ($1,$2,$3,$4,1,0,'hon',false), ($1,$2,$3,$5,1,1,'hon',false), ($1,$2,$3,$6,1,2,'jonai',false)", [A1.org_id, A1.id, chk, casts[0].id, casts[1].id, casts[2].id]);
    const ls = () => tx.q<{ fee_kind: string; line_total: number; cast_id: string | null }>("select fee_kind, line_total, cast_id from public.check_lines where check_id = $1 and fee_kind in ('extension', 'ext_shimei') order by sort_order", [chk]);
    let x = await tx.as(M, "select public.check_extension_add($1) id", [chk]);
    let l = await ls();
    expect("(3-4) 延長を押す＝延長 1 行と延長指名料 2 行（本指名 2 人に 1,000 円ずつ・場内は付かない）", x.ok && l.filter((y) => y.fee_kind === "extension").length === 1 && l.filter((y) => y.fee_kind === "ext_shimei").length === 2 && l.filter((y) => y.fee_kind === "ext_shimei").every((y) => y.line_total === 1000), l);
    await tx.q("update public.check_nominations set ended_at = now() where check_id = $1 and cast_id = $2", [chk, casts[1].id]);
    x = await tx.as(M, "select public.check_extension_add($1) id", [chk]); l = await ls();
    expect("(3-5) 本指名が 1 人終わった後＝延長指名料は 1 行だけ増える（2＋1）", x.ok && l.filter((y) => y.fee_kind === "ext_shimei").length === 3, l.map((y) => y.fee_kind));
    await set(O, 0);
    x = await tx.as(M, "select public.check_extension_add($1) id", [chk]); l = await ls();
    expect("(3-6) 額 0（画面は止める・DB は通す）＝延長指名料 0 円の行が 1 行付く", x.ok && l.filter((y) => y.fee_kind === "ext_shimei").length === 4 && l[l.length - 1].fee_kind === "ext_shimei" && l[l.length - 1].line_total === 0, l.slice(-2));
    await tx.q("update public.stores set ext_shimei_enabled = false where id = $1", [A1.id]);
    x = await tx.as(M, "select public.check_extension_add($1) id", [chk]); l = await ls();
    expect("(3-7) OFF＝延長だけ増え延長指名料は増えない", x.ok && l.filter((y) => y.fee_kind === "ext_shimei").length === 4 && l.filter((y) => y.fee_kind === "extension").length === 4, l.map((y) => y.fee_kind));
    const sp = await tx.as(O, "select public.set_pricing_rule(null, $1, 'ext_shimei', null, null, null, null, null, 1000, null, 1, true, 'VERIFY', 'taxable_10', null, null, false)", [A1.id]);
    expect("(3-8) set_pricing_rule(ext_shimei) は bad fee kind のまま", !sp.ok && /bad fee kind/.test(sp.err), tx.errOf(sp));
  } catch (e) { fails.push(`live のエラー ${String((e as Error).message).slice(0, 300)}`); }
  finally { await c.query("rollback").catch(() => undefined); await c.end().catch(() => undefined); }
}

void live().then(() => {
  if (fails.length) { console.error(fails.map((f) => `  FAIL: ${f}`).join("\n")); console.error(`verify:nox-ext-shimei FAIL ${fails.length} / pass ${ok}`); process.exit(1); }
  console.log(`verify:nox-ext-shimei ALL PASS (${ok} assertions)`);
});
