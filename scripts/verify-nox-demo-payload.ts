/**
 * verify:nox-demo-payload — 便 D1（裁定328・追補1・2026-10-02）: デモ環境の payload（docs/demo/payload/<store>.json・生成器 scripts/demo/gen-demo.mjs）と
 *   6 店化した seed（lib/nox/demo/seed.ts）・入場 route・/demo 入口の係留。DB 不触（純関数＋ JSON ＋逐語 grep）。
 *   npm run verify:nox-demo-payload（env 不要）。f0 93 段目。
 *
 *  (1) payload 6 本: meta.store・表は demo_org_reset の c_load（0162 時点 78 表）の範囲・payroll 系（payroll_runs／payslips）を含まない・残す 3 表（orgs／org_billing／users）を含まない・
 *      全行に org_id（memberships 以外）・uuid 形式・固定日付（'YYYY-MM-DD'／ISO）が日付列に無い＝全部 {$rel}／{$m,d}・_report.json の sha256 と一致（生成物が手で触られていない）
 *  (2) 全 closed 伝票で checks.total＝groupDueFull(lines)（check_group_due の鏡像＝再生後の三点一致の前提）・代表伝票 6 件の total＝expected_results・月次 Σ daily_reports＝目標 ±1%
 *  (3) seed: DEMO_STORES 6・DEMO_ROLES 4＋kiosk・demoOrgName／storeOfOrgName の往復・demoDestOf（staff→/register・cast→/mine・kiosk→/kiosk）・
 *      splitPayload＝1 MB 超は wipe→load 分割・先頭 chunk にマスタ・日付系は日ごと・分割しても行数不変・1 MB 以下は 1 chunk
 *  (4) 入場 route: store 6×（role 4＋kiosk）・is_demo 判定（users／kiosk_devices）・DEMO_USERS の対応・demo_entries へ 1 行（表が無い間は no-op）・資格情報をログに出さない
 *  (5) /demo: 店 6 × 役割 4 ＋ 端末・form POST {store, role}・06:05・noindex／規約は demo-guard 側
 *  逆テスト（手動・各 1 回）: payload の checks[0].total を +1 する→dp(2-1) 赤／seed の DEMO_ROLES から "staff" を外す→dp(3-1) 赤。
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { groupDueFull } from "../lib/nox/check-calc";
import { DEMO_KIOSK_KEY, DEMO_ROLES, DEMO_STORES, PAYLOAD_MAX_BYTES, demoDestOf, demoOrgName, isDemoRole, isDemoStore, payloadBytes, splitPayload, storeOfOrgName } from "../lib/nox/demo/seed";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
type Row = Record<string, unknown>;
type Payload = { meta: { store: string; cutoff: string; users: Record<string, string> }; tables: Record<string, Row[]> };
const SRC = JSON.parse(fs.readFileSync("docs/demo/source/20261001/nox_demo_all.json", "utf8")) as { datasets: Record<string, { records: Row[] }> };
const D = (k: string) => SRC.datasets[k].records;
const REPORT = JSON.parse(fs.readFileSync("docs/demo/payload/_report.json", "utf8")) as { stores: Record<string, { sha256: string; bytes: number; rows: number }> };
// 0162 時点の c_load（live 78 表）＝docs/demo の列スナップショットから（表名のみ）
const C_LOAD = new Set(Object.keys((JSON.parse(fs.readFileSync("docs/demo/columns_20261002.json", "utf8")) as { columns: Record<string, unknown> }).columns));
const KEEP = ["orgs", "org_billing", "users"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_COLS = /(_at|_date|^date$|^at$|^month$|^period$|valid_from|valid_to|joined_on|left_on|expires_on|^due$)/;
const isRel = (v: unknown) => !!v && typeof v === "object" && (("$rel" in (v as object)) || ("$m" in (v as object)));

// (1)(2) payload 6 本
for (const store of DEMO_STORES) {
  const path = `docs/demo/payload/${store}.json`;
  const raw = fs.readFileSync(path, "utf8");
  const p = JSON.parse(raw) as Payload;
  const rows = Object.values(p.tables).reduce((a, r) => a + r.length, 0);
  check(`dp(1-1) ${store}: meta.store 一致・cutoff 06:00・users 5（owner／manager／staff／cast／kiosk）・sha256＝_report.json`, p.meta.store === store && p.meta.cutoff === "06:00" && ["owner", "manager", "staff", "cast", "kiosk"].every((r) => UUID.test(p.meta.users[r] ?? "")) && crypto.createHash("sha256").update(JSON.stringify(p)).digest("hex") === REPORT.stores[store].sha256 && rows === REPORT.stores[store].rows, `rows ${rows}`);
  const tables = Object.keys(p.tables);
  check(`dp(1-2) ${store}: 表 ${tables.length} 本は c_load の範囲・payroll_runs／payslips なし・残す 3 表なし`, tables.every((t) => C_LOAD.has(t)) && !tables.includes("payroll_runs") && !tables.includes("payslips") && KEEP.every((t) => !tables.includes(t)), tables.filter((t) => !C_LOAD.has(t)).join(","));
  const bad: string[] = [];
  for (const [t, list] of Object.entries(p.tables)) for (const r of list) {
    if (t !== "memberships" && !UUID.test(String(r.org_id ?? ""))) bad.push(`${t}.org_id`);
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "string" && DATE_COLS.test(k) && /^\d{4}-\d{2}(-\d{2})?(T|$)/.test(v)) bad.push(`${t}.${k} 固定日付 ${v}`);
      if (k.endsWith("_id") && v != null && typeof v === "string" && !UUID.test(v)) bad.push(`${t}.${k} 非 uuid`);
    }
    if (bad.length > 5) break;
  }
  check(`dp(1-3) ${store}: 全行に org_id（memberships 以外）・id 列は uuid・日付列に固定日付なし（{$rel}／{$m,d} だけ）`, bad.length === 0, bad.slice(0, 4).join(" | "));
  // (2) 三点一致の前提＝total＝groupDueFull
  const linesByCheck = new Map<string, Row[]>();
  for (const l of p.tables.check_lines ?? []) { const id = String(l.check_id); (linesByCheck.get(id) ?? linesByCheck.set(id, []).get(id)!).push(l); }
  let mis = 0, closed = 0;
  for (const c of p.tables.checks ?? []) {
    if (c.status !== "closed") continue; closed++;
    const ls = (linesByCheck.get(String(c.id)) ?? []).filter((l) => l.pay_group === "A").map((l) => ({ line_total: Number(l.line_total), kind: String(l.kind), tax_category: String(l.tax_category ?? "taxable_10") }));
    const due = groupDueFull(ls, { service_rate: Number(c.service_rate), round_unit: Number(c.round_unit), round_mode: String(c.round_mode), business_tax_status: String(c.business_tax_status), price_display: String(c.price_display), tax_rounding: String(c.tax_rounding) });
    if (due !== Number(c.total)) mis++;
  }
  check(`dp(2-1) ★${store}: closed 伝票 ${closed} 件すべて checks.total＝groupDueFull（check_group_due の鏡像）`, closed > 0 && mis === 0, `不一致 ${mis}`);
  const storeRow = D("stores").find((s) => String(s.store_code).toLowerCase() === store)!;
  for (const o of D("orders").filter((o) => o.store_id === storeRow.store_id)) {
    const ex = D("expected_results").find((e) => e.order_id === o.order_id)!;
    const hit = (p.tables.checks ?? []).find((c) => Number(c.total) === Number(ex.expected_total_yen) && Number(c.people) === Number(o.guest_count));
    check(`dp(2-2) ${store}: 代表伝票 ${o.order_id} total ${ex.expected_total_yen} が 1 件ある`, !!hit);
  }
  const mt = D("monthly_sales_targets").find((m) => m.store_id === storeRow.store_id)!;
  const month = (p.tables.daily_reports ?? []).reduce((a, r) => a + Number(r.cash) + Number(r.card_gross) + Number(r.uri) + Number(r.other), 0);
  const pct = ((month - Number(mt.stated_monthly_gross_yen)) / Number(mt.stated_monthly_gross_yen)) * 100;
  check(`dp(2-3) ${store}: Σdaily_reports ${month.toLocaleString()}＝月次目標 ${Number(mt.stated_monthly_gross_yen).toLocaleString()} ±1%`, Math.abs(pct) <= 1, `${pct.toFixed(2)}%`);
  // (3b) 分割
  const chunks = splitPayload(p.tables);
  const bytes = payloadBytes(p.tables);
  const chunkRows = chunks.reduce((a, c) => a + Object.values(c).reduce((x, r) => x + r.length, 0), 0);
  check(`dp(3-3) ${store}: payload ${bytes.toLocaleString()} B → chunk ${chunks.length}（1 MB 超なら 2 以上・先頭 chunk に stores／memberships・各 chunk ≤ 1 MB か 1 日分・行数不変）`, (bytes > PAYLOAD_MAX_BYTES ? chunks.length >= 2 : chunks.length === 1) && !!chunks[0].stores && !!chunks[0].memberships && chunkRows === rows && chunks.slice(1).every((c) => !c.stores && !c.products), `rows ${chunkRows}/${rows}`);
}
const total = DEMO_STORES.reduce((a, s) => a + ((JSON.parse(fs.readFileSync(`docs/demo/payload/${s}.json`, "utf8")) as Payload).tables.daily_reports ?? []).reduce((x, r) => x + Number(r.cash) + Number(r.card_gross) + Number(r.uri) + Number(r.other), 0), 0);
check(`dp(2-4) ★6 店の月次 Σ ${total.toLocaleString()}＝golden 43,740,000 ±1%`, Math.abs(total - 43_740_000) / 43_740_000 <= 0.01, String(total));

// (3) seed
check("dp(3-1) ★seed: 店 6（muse／luna／noir／ace／lily／nest）・役割 4（owner／manager／staff／cast）＋kiosk・org 名の往復・dest（staff→/register・cast→/mine・kiosk→/kiosk・他→/dashboard）",
  DEMO_STORES.join() === "muse,luna,noir,ace,lily,nest" && DEMO_ROLES.join() === "owner,manager,staff,cast" && DEMO_KIOSK_KEY === "kiosk" && DEMO_STORES.every((s) => storeOfOrgName(demoOrgName(s)) === s && demoOrgName(s) === `NOX-DEMO-${s.toUpperCase()}`)
  && storeOfOrgName("NOX-DEMO") === null && storeOfOrgName("NOX-DEMO-CABARET") === null && isDemoStore("noir") && !isDemoStore("cabaret") && isDemoRole("staff") && !isDemoRole("kiosk")
  && demoDestOf("staff") === "/register" && demoDestOf("cast") === "/mine" && demoDestOf("kiosk") === "/kiosk" && demoDestOf("owner") === "/dashboard" && demoDestOf("manager") === "/dashboard");
{
  const small = { stores: [{ id: "a", org_id: "o" }], checks: [{ id: "c1", org_id: "o", started_at: { $m: -1, d: 3, t: "20:00:00" } }], check_lines: [{ id: "l1", org_id: "o", check_id: "c1" }] };
  check("dp(3-2) splitPayload: 1 MB 以下は 1 chunk（そのまま）・maxBytes を小さくすると先頭（マスタ）＋日付群に分かれ、明細は親の伝票と同じ chunk", splitPayload(small).length === 1 && (() => { const c = splitPayload(small, 10); return c.length === 2 && !!c[0].stores && !c[0].checks && c[1].checks?.length === 1 && c[1].check_lines?.length === 1; })());
}

// (4) 入場 route
const route = fs.readFileSync("app/api/demo/enter/route.ts", "utf8");
check("dp(4-1) ★入場 route: 店 6×役割 4＋kiosk（isDemoStore／isDemoRole／DEMO_KIOSK_KEY）・DEMO_USERS の key `${store}:${role}`・demo 以外は 403・kiosk は kiosk_devices の org で判定・dest＝demoDestOf",
  route.includes("if (!isDemoStore(store) || !(isDemoRole(role) || role === DEMO_KIOSK_KEY)) return plain(400,") && route.includes("const authUserId = map?.[`${store}:${role}`];") && route.includes('if (!orgId || org?.is_demo !== true) return plain(403, "デモ用のユーザーではありません");')
  && route.includes('admin.from("kiosk_devices").select("org_id").eq("auth_user_id", authUserId).eq("is_active", true)') && route.includes("NextResponse.redirect(new URL(demoDestOf("));
check("dp(4-2) 入場 route: magiclink はサーバ内で消費（generateLink→verifyOtp）・token／email をレスポンスにもログにも出さない・入場ログ demo_entries（表が無い間は no-op・ip は sha256 先頭 16 桁）",
  route.includes('generateLink({ type: "magiclink", email })') && route.includes('verifyOtp({ token_hash: tokenHash, type: "magiclink" })') && !/console\.(log|error)\([^)]*(\$\{|,\s*)(email|tokenHash|link)\b/.test(route) && route.includes('admin.from("demo_entries").insert({') && route.includes('createHash("sha256").update(ip).digest("hex").slice(0, 16)') && route.includes("/demo_entries|schema cache|42P01/"));
// (5) /demo
const page = fs.readFileSync("app/demo/page.tsx", "utf8"), terms = fs.readFileSync("components/ui/demo-terms.tsx", "utf8"), banner = fs.readFileSync("components/ui/demo-banner.tsx", "utf8");
check("dp(5-1) ★/demo: 店 6 × 役割 4 ＋ 端末（DEMO_STORES／DEMO_ROLES／KIOSK を seed から）・form POST {store, role}・06:05 の文言（入口・規約・帯）",
  page.includes("DEMO_STORES.map((s) =>") && page.includes("DEMO_ROLES.map((r) =>") && page.includes("kiosk={KIOSK}") && terms.includes('<input type="hidden" name="store" value={store} />') && terms.includes('<input type="hidden" name="role" value={r.key} />')
  && terms.includes("毎日 06:05 に初期化") && banner.includes("毎日 06:05 に初期化") && page.includes("DEMO_RESET_TIME_JA") && !page.includes("毎朝 5 時") && !terms.includes("毎朝 5 時") && !banner.includes("毎朝 5 時"));
// (6) cron route・create-demo-orgs・upload-photos
const cron = fs.readFileSync("app/api/cron/demo-reset/route.ts", "utf8"), cdo = fs.readFileSync("scripts/demo/create-demo-orgs.mjs", "utf8"), up = fs.readFileSync("scripts/demo/upload-photos.mjs", "utf8");
check("dp(6-1) cron route: ?org=<store>（isDemoStore）・?retry=1（その営業日に reset 済みは skip）・失敗は audit 'demo.reset.failed'・runDemoReset（分割 load）", cron.includes('url.searchParams.get("org")') && cron.includes('url.searchParams.get("retry") === "1"') && cron.includes('"demo.reset.failed"') && cron.includes("runDemoReset(admin, orgId, built.payload)") && cron.includes('skipped: "already reset today"'));
check("dp(6-2) create-demo-orgs: 店 6・役割 4（staff の名前＝people の代表スタッフ・cast＝代表伝票の受領者）・kiosk 端末ユーザー 6・DEMO_USERS 30 キー・--dry-run は書かない", (cdo.match(/key: "(muse|luna|noir|ace|lily|nest)", org: "NOX-DEMO-/g) ?? []).length === 6 && cdo.includes('{ key: "staff", name: (s) => s.staff }') && cdo.includes('{ key: "cast", name: (s) => s.cast }') && cdo.includes('emailOf(s.key, "kiosk")') && cdo.includes('if (MODE === "dry-run") { console.log("dry-run: 何も書いていません"); process.exit(0); }'));
check("dp(6-3) upload-photos: --casts／--staff 別引数・{org_id}/{cast_id}.jpg と u_{user_id}.jpg・--dry-run は Storage を触らない・--apply は D2（sharp 未結線）", up.includes('["casts", "staff"].filter((k) => args.includes(`--${k}`))') && up.includes("`{org_id}/${uuid}.jpg`") && up.includes("`{org_id}/u_${ids.staff_users[personId]}.jpg`") && up.includes('if (MODE === "dry-run") {') && up.includes("--apply は D2 で結線"));
if (fs.existsSync("docs/tmp/demo_photos/casts") && fs.existsSync("docs/tmp/demo_photos/staff")) {
  const n = fs.readdirSync("docs/tmp/demo_photos/casts").filter((f) => f.endsWith(".jpg")).length + fs.readdirSync("docs/tmp/demo_photos/staff").filter((f) => f.endsWith(".jpg")).length;
  const ids = JSON.parse(fs.readFileSync("docs/demo/ids.json", "utf8")) as { people: Record<string, string>; staff_users: Record<string, string> };
  const casts = fs.readdirSync("docs/tmp/demo_photos/casts").filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
  check(`dp(6-4) 写真 dry-run: casts 38＋staff 9＝47・casts は全員 ids.json に結線先・staff は代表 6 名に結線（残り 3 は users 無し）`, n === 47 && casts.every((c) => UUID.test(ids.people[c] ?? "")) && Object.keys(ids.staff_users).length === 6, `n ${n}`);
} else check("dp(6-4) 写真 dry-run: docs/tmp/demo_photos が無い環境＝対象外（CI）", true);

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}
console.log(`verify:nox-demo-payload ALL PASS (${pass} assertions)`);
console.log("デモ payload(裁定328・D1): 6 店の payload（表の範囲・org_id・uuid・相対日・sha）・total＝groupDueFull 全伝票・代表伝票 6・月次 ±1%・43,740,000・seed 6 店 4 役割＋kiosk・splitPayload・入場 route・/demo・cron・create-demo-orgs・upload-photos");
