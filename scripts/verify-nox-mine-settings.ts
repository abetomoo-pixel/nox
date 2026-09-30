/*
 * verify:nox-mine-settings — mig0160 ★5（裁定326-1／326-7／追補1-4・起票96・2026-09-30）: /mine の店設定 setter set_store_mine_settings の係留（最小段・便 P160-3）。
 *   npm run verify:nox-mine-settings（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0。
 *
 *  ms(1) 8 キーの白名単＋enum: 8 キー全部を一度に merge できる（既存キーは保持）・bad key／bad payslip_visibility／bad shift_request_mode／bad type（contract_ack は boolean）／bad patch（{}・null）
 *  ms(2) 権限: manager 自店は可・他店（A2）は forbidden・staff（can_crm）は forbidden・cast は forbidden・他 org の manager は forbidden・audit 'set_store_mine_settings' が 1 行増える
 *  ms(0) fixture・ROLLBACK 後に settings_json 不変
 *  逆テスト 1 本（手動・1 回）: ms(1-2) の期待語 'bad key' を 'bad kex' にする→赤・戻して緑。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  const { one, errOf, as, uidOf } = pgTx(db);
  try {
    const A1 = await one<{ id: string; org_id: string; s: Record<string, unknown> | null }>("select id, org_id, settings_json s from public.stores where name='NOX-VERIFY-A1'");
    const A2 = await one<{ id: string }>("select id from public.stores where name='NOX-VERIFY-A2'");
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), crm = await uidOf("staffCrmOnA1"), cast = await uidOf("castA1a"), mgrB = await uidOf("managerB1");
    check("ms(0-1) fixture: A1／A2／owner-a／manager-a1／staff-crm／cast-a1a／manager-b1", !!A1 && !!A2 && !!owner && !!mgr && !!crm && !!cast && !!mgrB);
    const before = JSON.stringify(A1.s);
    const settings = async () => (await one<{ s: Record<string, unknown> }>("select settings_json s from public.stores where id=$1", [A1.id])).s;
    const nAudit = async () => (await one<{ n: number }>("select count(*)::int n from public.audit_logs where org_id=$1 and action='set_store_mine_settings'", [A1.org_id])).n;
    const call = (who: { auth_user_id: string }, store: string, patch: unknown) => as(who, "select public.set_store_mine_settings($1, $2::jsonb)", [store, JSON.stringify(patch)]);
    const FULL = { payslip_visibility: "net_only", drink_claim: "on", punch_correction_request: "on", ranking: "on", ranking_show_others: "off", reservation_request: "on", shift_request_mode: "off_only", contract_ack: true };
    await db.query("begin");
    try {
      const a0 = await nAudit();
      // (1) 8 キー
      const r1 = await call(mgr, A1.id, FULL);
      const s1 = await settings();
      check("ms(1-1) manager 自店: 8 キーを一度に merge（値は enum どおり・既存キー okuri_mode 等は保持）・audit +1", r1.ok && Object.entries(FULL).every(([k, v]) => s1[k] === v) && Object.keys(A1.s ?? {}).every((k) => k in s1) && (await nAudit()) === a0 + 1, errOf(r1) + JSON.stringify(s1));
      const r2 = await call(mgr, A1.id, { payslip_visibility: "detail" });
      const s2 = await settings();
      check("ms(1-2) 1 キーだけの patch は他 7 キーを保持（payslip_visibility→detail・drink_claim は on のまま）", r2.ok && s2.payslip_visibility === "detail" && s2.drink_claim === "on" && s2.shift_request_mode === "off_only" && s2.contract_ack === true, errOf(r2));
      const bk = await call(mgr, A1.id, { okuri_mode: "flat" });
      check("ms(1-3) 白名単外のキー（okuri_mode）→ 'bad key'（他 setter の領分に触れない）", !bk.ok && bk.err.includes("bad key"), errOf(bk));
      const bv = await call(mgr, A1.id, { payslip_visibility: "all" });
      const bm = await call(mgr, A1.id, { shift_request_mode: "wish" });
      const bt = await call(mgr, A1.id, { contract_ack: "true" });
      const bd = await call(mgr, A1.id, { drink_claim: true });
      check("ms(1-4) enum 外 → 'bad payslip_visibility'／'bad shift_request_mode'・型違い（contract_ack 文字列・drink_claim boolean）→ 'bad type'", !bv.ok && bv.err.includes("bad payslip_visibility") && !bm.ok && bm.err.includes("bad shift_request_mode") && !bt.ok && bt.err.includes("bad type") && !bd.ok && bd.err.includes("bad type"), [errOf(bv), errOf(bm), errOf(bt), errOf(bd)].join(" | "));
      const be = await call(mgr, A1.id, {});
      const bn = await as(mgr, "select public.set_store_mine_settings($1, null)", [A1.id]);
      const ba = await call(mgr, A1.id, ["ranking"]);
      check("ms(1-5) {}／null／配列 → 'bad patch'", !be.ok && be.err.includes("bad patch") && !bn.ok && bn.err.includes("bad patch") && !ba.ok && ba.err.includes("bad patch"), [errOf(be), errOf(bn), errOf(ba)].join(" | "));
      // (2) 権限
      const a1 = await nAudit();
      const oA2 = await call(owner, A2.id, { ranking: "off" });
      const mA2 = await call(mgr, A2.id, { ranking: "off" });
      const st = await call(crm, A1.id, { ranking: "off" });
      const ca = await call(cast, A1.id, { ranking: "off" });
      const mb = await call(mgrB, A1.id, { ranking: "off" });
      check("ms(2-1) owner は他店 A2 も可・manager-a1 の A2 は forbidden・staff（can_crm）／cast／他 org manager は forbidden（audit は owner の 1 行だけ増える）",
        oA2.ok && !mA2.ok && mA2.err.includes("forbidden") && !st.ok && st.err.includes("forbidden") && !ca.ok && ca.err.includes("forbidden") && !mb.ok && mb.err.includes("forbidden") && (await nAudit()) === a1 + 1,
        [errOf(oA2), errOf(mA2), errOf(st), errOf(ca), errOf(mb)].join(" | "));
      const an = await as("anon", "select public.set_store_mine_settings($1, $2::jsonb)", [A1.id, JSON.stringify({ ranking: "off" })]);
      check("ms(2-2) anon は permission denied for function", !an.ok && an.err.includes("permission denied for function"), errOf(an));
    } finally {
      await db.query("rollback");
    }
    check("ms(0-2) ROLLBACK 後: A1 の settings_json 不変（残留 0）", JSON.stringify(await settings()) === before);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-mine-settings ALL PASS (${pass} assertions)`);
  console.log("/mine 店設定(0160 ★5・裁定326-1／326-7／追補1-4): 8 キー merge・1 キー保持・bad key/enum/type/patch・owner 全店・manager 自店・staff/cast/他org forbidden・anon BLOCKED・ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
