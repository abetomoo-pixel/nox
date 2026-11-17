/*
 * verify:nox-demo-frozen — B3（2026-11-16 相談役）: デモの初期化が定休日のシフトを消すのは今日以降の日だけ＝先月の確定済みの明細（凍結）と、DB の勤怠・シフトから計算し直した額が一致する。
 *   npm run verify:nox-demo-frozen。本番の DB は begin read only だけ（get_cast_sales は店長の claims で呼ぶ）・admin は select だけ＝書込なし。
 *  df(1) 純関数 closedDayRowsToDropOf＝今日以降・定休日の曜日の行だけ（過去の定休日の行は残す）。
 *  df(2) デモ 6 店の先月（finalized）の全明細＝computePayrollDraft（今のコード）の総支給・時間給と 1 円も違わない（手取りは確定の消し込みで変わる＝比べない）。
 *   ★push と reset の後に意味を持つ（reset の hook が新しいコードで動いた後の DB と凍結を比べる）。
 */
import fs from "node:fs";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { closedDayRowsToDropOf } from "../lib/nox/demo/seed";
import { computePayrollDraft } from "../lib/nox/payroll/core";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); }
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));

// df(1)
const rows = [{ id: "a", date: "2026-11-01" }, { id: "b", date: "2026-11-15" }, { id: "c", date: "2026-11-16" }, { id: "d", date: "2026-11-22" }, { id: "e", date: "2026-11-17" }];
check("df(1-1) 日曜（0）が定休日・今日 2026-11-16（月）＝今日以降の日曜 11/22 だけ消す・過去の 11/1・11/15 は残す・平日は残す", JSON.stringify(closedDayRowsToDropOf(rows, new Set([0]), "2026-11-16")) === JSON.stringify(["d"]));
check("df(1-2) 今日が定休日なら今日も消す", JSON.stringify(closedDayRowsToDropOf(rows, new Set([0]), "2026-11-15")) === JSON.stringify(["b", "d"]));
const seedSrc = fs.readFileSync("lib/nox/demo/seed.ts", "utf8");
check("df(1-3) hook は bizDate（今日の営業日）を渡し、消す行は closedDayRowsToDropOf だけで決める", seedSrc.includes("out.closedDays = await demoDropClosedDayShifts(admin, orgId, _bizDate)") && seedSrc.includes("const ids = closedDayRowsToDropOf((rows ?? []) as { id: string; date: string }[], dows, todayBiz);"));
check("df(1-4) ★2026-11-17: 帯と W 別規定（demoCanonBandsFor）は前月の締め（finalizePrevMonthForDemo）の前＝凍結に同伴の帯のバックが入る", seedSrc.indexOf("out.canon = await demoCanonBandsFor(admin, orgId)") > 0 && seedSrc.indexOf("out.canon = await demoCanonBandsFor(admin, orgId)") < seedSrc.indexOf("out.payroll = await finalizePrevMonthForDemo(admin, orgId, _bizDate)"));

// df(2)
async function main() {
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-cc-read" });
await db.connect(); await db.query("begin read only");
try {
  const today = (await db.query("select ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date::text d")).rows[0].d as string;
  const [y, m] = today.split("-").map(Number); const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const stores = (await db.query("select s.id, s.name from public.stores s join public.orgs o on o.id=s.org_id where o.name like 'NOX-DEMO-%' order by 2")).rows as { id: string; name: string }[];
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const diffs: string[] = []; let n = 0;
  for (const st of stores) {
    const frozen = (await db.query("select ps.cast_id::text cid, ps.net, (ps.breakdown_json->'pay'->>'gross')::int gross, (ps.breakdown_json->'pay'->>'timePay')::int tp from public.payslips ps join public.payroll_runs r on r.id=ps.run_id where r.store_id=$1 and r.period=$2 and r.status in ('finalized','paid')", [st.id, prev])).rows;
    if (frozen.length === 0) continue;
    const mgr = (await db.query("select u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role in ('manager','owner') and m.is_active order by (m.role='manager') desc limit 1", [st.id])).rows[0];
    const managerClient = { rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "get_cast_sales") return { data: null, error: { message: `unexpected rpc ${name}` } };
      await db.query("savepoint s");
      try {
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: mgr.auth_user_id, role: "authenticated" })]);
        await db.query("set local role authenticated");
        const r = await db.query("select * from public.get_cast_sales($1::uuid, $2::date, $3::date)", [args.p_store_id, args.p_from, args.p_to]);
        await db.query("reset role"); await db.query("release savepoint s");
        return { data: r.rows.map((x) => ({ ...x, biz_date: typeof x.biz_date === "string" ? x.biz_date : new Date(x.biz_date.getTime() - x.biz_date.getTimezoneOffset() * 60000).toISOString().slice(0, 10), sales: Number(x.sales), hon: Number(x.hon), jonai: Number(x.jonai), dohan: Number(x.dohan) })), error: null };
      } catch (e) { await db.query("rollback to savepoint s"); await db.query("reset role"); return { data: null, error: { message: (e as Error).message } }; }
    } } as unknown as SupabaseClient;
    const d = await computePayrollDraft(admin, managerClient, st.id, prev, { previewDefaults: false });
    for (const f of frozen) {
      n++;
      const r = d.rows.find((x) => x.castId === f.cid);
      const a = `${f.gross}/${f.tp}`, b = r ? `${r.pay.gross}/${r.pay.timePay}` : "行なし"; // 手取りは比べない＝確定のときに前借り・売掛・送りを消し込む（確定の後に計算し直すと控除が無い）
      if (a !== b) diffs.push(`${st.name} ${r?.castName ?? f.cid.slice(0, 8)} ${prev}: 凍結 ${a} → 計算 ${b}`);
    }
  }
  check(`df(2-1) デモの先月の確定済みの明細（${n} 枚）＝DB から計算し直した総支給・時間給と 1 円も違わない（手取りは確定の消し込みで変わるので比べない）`, n > 0 && diffs.length === 0, diffs);
} finally { await db.query("rollback"); await db.end(); }

}
main().then(() => {
if (fails.length) {
  console.error(`verify:nox-demo-frozen FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-frozen OK (${pass} checks)`);
console.log("B3: デモの定休日のシフトは今日以降だけ消す・先月の確定済みの明細と DB からの計算が一致");
}).catch((e) => { console.error(e); process.exit(1); });
