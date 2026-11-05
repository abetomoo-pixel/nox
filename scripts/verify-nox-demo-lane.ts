/*
 * verify:nox-demo-lane — デモデータ便（裁定451 ①／454・2026-11-05）の live の確かめ（本番のデモ 6 店＝reset の後に単走・f0 には入れない＝reset 前は赤になるため）。読取だけ。
 *  (1) ACE の延長パターン 3 本（60／13,000 既定・VIP 延長 60／18,000 seat_kind VIP・週末通常 60／15,000）・stores.ext_fee＝60／13,000
 *  (2) ACE の開栓済み＝VIP 席の伝票は ext_rule_id＝VIP 延長・18,000／60（hook）・A3（卓）は 13,000／60＝凍結メニューの既定と一致（見積＝会計の式は verify:nox-m70 が担保）
 *  (3) ひなの＝availability 7 行（金 不可・他 可 20:00〜翌01:00）＋terms 週 5／あい＝cast_id の行（月 不可）／ほかの 5 店＝代表 1 人（水 相談）／ACE の日曜＝定休日（M-92 の表示の前提）
 *  使い方: npm run verify:nox-demo-lane（.env.local の SUPABASE_DB_URL）
 */
import pg from "pg";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const J = JSON.stringify;
async function main(): Promise<void> {
  let dbUrl = process.env.SUPABASE_DB_URL; if (!dbUrl) { try { process.loadEnvFile(".env.local"); } catch { /* no env */ } dbUrl = process.env.SUPABASE_DB_URL; }
  if (!dbUrl) { console.log("skipped: SUPABASE_DB_URL なし"); return; }
  const pc = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await pc.connect(); await pc.query("begin read only");
  try {
    const q = async <T = Record<string, unknown>>(s: string, p: unknown[] = []): Promise<T[]> => (await pc.query(s, p)).rows as T[];
    const ace = (await q<{ id: string; ext_min: number; ext_fee: number }>(`select s.id, s.ext_min, s.ext_fee from public.stores s join public.orgs o on o.id=s.org_id where o.is_demo and s.name='CLUB ACE'`))[0];
    check("dl(1-1) ACE の stores.ext_min／ext_fee＝60／13,000（裁定454 の 1）", !!ace && ace.ext_min === 60 && ace.ext_fee === 13000, ace);
    const ext = await q<{ name: string; dur: number; amount: number; seat_kind: string | null; def: boolean; dow_mask: number }>(`select name, duration_min dur, amount, seat_kind, is_default_ext def, dow_mask from public.pricing_rules where store_id=$1 and fee_kind='extension' and is_active order by name`, [ace.id]);
    check("dl(1-2) ACE の延長パターン＝VIP 延長 60／18,000（VIP・月〜木）・平日通常 延長 60 分 60／13,000（既定・月〜木）・週末通常 延長 60／15,000（金土）＝単位は店内で 60", J(ext.map((r) => [r.name, r.dur, r.amount, r.seat_kind, r.def, r.dow_mask])) === J([["VIP 延長", 60, 18000, "VIP", false, 15], ["平日通常 延長 60 分", 60, 13000, null, true, 15], ["週末通常 延長", 60, 15000, null, false, 48]]), ext);
    const open = await q<{ seat: string; kind: string; ext_min: number; ext_fee: number; rule_name: string | null; snap: string }>(`select se.name seat, se.kind, c.ext_min, c.ext_fee, pr.name rule_name, (select string_agg(m->>'label', '|' order by ord) from jsonb_array_elements(coalesce(c.ext_menu_snap,'[]'::jsonb)) with ordinality as x(m, ord)) snap from public.checks c join public.seats se on se.id=c.seat_id left join public.pricing_rules pr on pr.id=c.ext_rule_id where c.store_id=$1 and c.status='open' order by se.name`, [ace.id]);
    const vip = open.filter((o) => o.kind === "VIP"), a3 = open.find((o) => o.seat === "A3");
    check("dl(2-1) VIP-1（VIP 席）の開栓済み＝ext_rule_id＝VIP 延長・18,000／60・凍結メニューに VIP 延長（hook）", vip.length >= 1 && vip.every((o) => o.rule_name === "VIP 延長" && o.ext_fee === 18000 && o.ext_min === 60 && o.snap.includes("VIP 延長")), vip);
    check("dl(2-2) A3（卓）の開栓済み＝13,000／60（平日通常の既定と一致＝作り直し不要）・凍結メニューは 卓 の行だけ（VIP 延長なし）", !!a3 && a3.ext_fee === 13000 && a3.ext_min === 60 && a3.snap === "平日通常 延長 60 分|週末通常 延長", a3);
    const hin = await q<{ dow: number; avail: string; f: number | null; t: number | null }>(`select a.dow, a.avail, a.from_min f, a.to_min t from public.availability a join public.casts c on c.id=a.cast_id where c.store_id=$1 and c.name='ひなの' and a.membership_id is not null order by a.dow`, [ace.id]);
    check("dl(3-1) ひなの＝membership の行 7（金 不可・他 可 20:00〜翌01:00＝1200〜1500）", hin.length === 7 && hin.every((r) => (r.dow === 5 ? r.avail === "ng" && r.f === null : r.avail === "ok" && r.f === 1200 && r.t === 1500)), hin);
    const hinT = await q<{ w: number | null }>(`select at.week_days_target w from public.availability_terms at join public.casts c on c.id=at.cast_id where c.store_id=$1 and c.name='ひなの' and at.membership_id is not null`, [ace.id]);
    check("dl(3-2) ひなの＝terms 週 5 日", hinT.length === 1 && hinT[0].w === 5, hinT);
    const ai = await q<{ dow: number; avail: string; mid: string | null }>(`select a.dow, a.avail, a.membership_id mid from public.availability a join public.casts c on c.id=a.cast_id where c.store_id=$1 and c.name='あい' order by a.dow`, [ace.id]);
    check("dl(3-3) あい（アカウント未発行）＝cast_id の行 7（membership null・月 不可・他 可）", ai.length === 7 && ai.every((r) => r.mid === null && (r.dow === 1 ? r.avail === "ng" : r.avail === "ok")), ai);
    const others = await q<{ name: string; n: number; ask: number }>(`select s.name, count(*)::int n, count(*) filter (where a.avail='ask' and a.dow=3)::int ask from public.availability a join public.stores s on s.id=a.store_id join public.orgs o on o.id=s.org_id where o.is_demo and s.name<>'CLUB ACE' group by s.name order by s.name`);
    check("dl(3-4) ほかの 5 店＝代表 1 人×7 行（水 相談）", others.length === 5 && others.every((o) => o.n === 7 && o.ask === 1), others);
    const sun = await q<{ is_closed: boolean }>(`select is_closed from public.store_business_hours where store_id=$1 and dow=0`, [ace.id]);
    check("dl(3-5) ACE の日曜＝定休日（M-92 の「定休日」表示の前提）", sun.length === 1 && sun[0].is_closed === true, sun);
  } finally { await pc.query("rollback"); await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-demo-lane ALL PASS (${pass} assertions)`);
}
void main();
