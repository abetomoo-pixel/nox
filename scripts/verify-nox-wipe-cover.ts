/**
 * verify:nox-wipe-cover（★M-122・2026-11-09）: デモ reset の wipe が表の増加で落ちないための番人（Postgres 直結・SELECT だけ＝DB 変更 0）。
 *   (1) org_id を持つ public の全表が demo_org_reset の c_wipe ∪ c_keep ∪ route の PREWIPE ∪ KEEP_EXTRA に入っている（新しい表を足したら赤＝どこで消すか決める）
 *   (2) c_wipe にも c_keep にも無い表から、wipe で消える親（c_wipe の表）への no-action／restrict の FK は、すべて PREWIPE（または端末経由）で先に消える
 *   (3) PREWIPE と c_wipe の重なりなし・PREWIPE の表は実在する
 *   (4) デモ org（NOX-DEMO-*）で、c_wipe ∪ PREWIPE ∪ c_keep ∪ KEEP_EXTRA のどれにも無い表に行が無い（データ面でも「取り残し」が無い）＝(1) が緑なら空集合
 *   (5) 参考＝デモ org ごとの PREWIPE の行数（赤にしない＝次の reset で消える分）
 */
import pg from "pg";
import { DEMO_PREWIPE_TABLES, DEMO_PREWIPE_BY_DEVICE, DEMO_KEEP_EXTRA } from "../lib/nox/demo/prewipe";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const url = loadEnvOrExit(["SUPABASE_DB_URL"]).SUPABASE_DB_URL as string;
(async () => {
const pc = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await pc.connect(); await pc.query("begin read only");
try {
  const src = (await pc.query(`select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset'`)).rows[0]?.prosrc as string | undefined;
  check("wipe(0) demo_org_reset が live に在る", !!src);
  const arr = (name: string): string[] => { const m = (src ?? "").match(new RegExp(name + String.raw`\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]`)); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : []; };
  const wipe = arr("c_wipe"), keep = arr("c_keep");
  check("wipe(0-1) c_wipe／c_keep を読めた（c_keep＝orgs／org_billing／users）", wipe.length >= 80 && keep.join(",") === "orgs,org_billing,users", { wipe: wipe.length, keep });
  const tabs = (await pc.query(`select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).rows.map((r) => r.t as string);
  const orgTabs = new Set((await pc.query(`select table_name t from information_schema.columns where table_schema='public' and column_name='org_id'`)).rows.map((r) => r.t as string));
  const covered = new Set([...wipe, ...keep, ...DEMO_PREWIPE_TABLES, ...DEMO_KEEP_EXTRA]);
  const uncovered = tabs.filter((t) => orgTabs.has(t) && !covered.has(t));
  check("wipe(1) org_id を持つ全表が c_wipe ∪ c_keep ∪ PREWIPE ∪ KEEP_EXTRA に入っている（増えた表はここで赤）", uncovered.length === 0, uncovered);
  const fks = (await pc.query(`select c.conrelid::regclass::text child, c.confrelid::regclass::text parent, c.confdeltype d, a.attname col, c.conname
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey) where c.contype='f' and c.connamespace='public'::regnamespace`)).rows
    .map((r) => ({ child: (r.child as string).replace("public.", ""), parent: (r.parent as string).replace("public.", ""), d: r.d as string, col: r.col as string, con: r.conname as string }));
  const dbCovered = new Set([...wipe, ...keep]);
  const pre = new Set([...DEMO_PREWIPE_TABLES, ...DEMO_PREWIPE_BY_DEVICE]);
  const blockers = fks.filter((f) => !dbCovered.has(f.child) && wipe.includes(f.parent) && f.d !== "c" && f.d !== "n");
  const notHandled = blockers.filter((f) => !pre.has(f.child));
  check("wipe(2) c_wipe の親を no-action／restrict で参照する未カバーの子は、すべて route の PREWIPE（端末経由を含む）で先に消える", notHandled.length === 0, notHandled.map((f) => `${f.child}.${f.col}→${f.parent}`));
  check("wipe(2-1) 11/09 の原因＝availability_terms.updated_by → memberships（no action）は 0198 ★5 で c_wipe（memberships より前）・kiosk_qr_claims／kiosk_qr_keys は PREWIPE に在る", wipe.indexOf("availability_terms") >= 0 && wipe.indexOf("availability_terms") < wipe.indexOf("memberships") && pre.has("kiosk_qr_claims") && pre.has("kiosk_qr_keys"));
  const overlap = DEMO_PREWIPE_TABLES.filter((t) => wipe.includes(t) || keep.includes(t));
  const missing = [...DEMO_PREWIPE_TABLES, ...DEMO_PREWIPE_BY_DEVICE, ...DEMO_KEEP_EXTRA].filter((t) => !tabs.includes(t));
  check("wipe(3) PREWIPE と c_wipe／c_keep の重なりなし・PREWIPE／KEEP_EXTRA の表は実在する（0198 ★5 の手貼り後は重なった 6 表を PREWIPE から外す）", overlap.length === 0 && missing.length === 0, { overlap, missing });
  check("wipe(3-1) PREWIPE の表はすべて org_id を持つ（端末経由の表は device_id を持つ）", DEMO_PREWIPE_TABLES.every((t) => orgTabs.has(t)) && (await pc.query(`select count(*)::int n from information_schema.columns where table_schema='public' and column_name='device_id' and table_name = any($1)`, [DEMO_PREWIPE_BY_DEVICE])).rows[0].n === DEMO_PREWIPE_BY_DEVICE.length);
  const orgs = (await pc.query(`select id, name from public.orgs where is_demo = true order by name`)).rows as { id: string; name: string }[];
  check("wipe(4-0) デモ org が 6 つ", orgs.length === 6, orgs.map((o) => o.name));
  const leftovers: string[] = [];
  const info: string[] = [];
  for (const o of orgs) {
    for (const t of uncovered) { const n = (await pc.query(`select count(*)::int n from public.${t} where org_id=$1`, [o.id])).rows[0].n as number; if (n > 0) leftovers.push(`${o.name}:${t}=${n}`); }
    const parts: string[] = [];
    for (const t of DEMO_PREWIPE_TABLES) { const n = (await pc.query(`select count(*)::int n from public.${t} where org_id=$1`, [o.id])).rows[0].n as number; if (n > 0) parts.push(`${t} ${n}`); }
    info.push(`${o.name}: ${parts.join("・") || "0"}`);
  }
  check("wipe(4) デモ org で、どの一覧にも無い表に行が残っていない", leftovers.length === 0, leftovers);
  console.log("wipe(5) 参考＝PREWIPE の表の行数（次の reset で消える分）\n  " + info.join("\n  "));
} finally { await pc.query("rollback"); await pc.end(); }
if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-wipe-cover ALL PASS (${pass} assertions)`);
})();
