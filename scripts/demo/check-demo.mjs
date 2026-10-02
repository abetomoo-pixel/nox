// ★裁定328（便 D1-2・2026-10-02）: 生成 payload（docs/demo/payload/<store>.json）の突合＝Postgres 直結の 1 トランザクション内で
//   仮の demo org（NOX-DEMO-<CODE>・is_demo=true）と users 4 を作り → demo_org_reset('wipe' → 分割 'load'・lib/nox/demo/seed.ts の splitPayload と同じ分割）→
//   golden を照合 → ROLLBACK（DB 恒久変更 0）。
//   golden（docs/demo/gen_plan.md §4）: 代表伝票 6 件の total（check_group_due＝checks.total＝expected）とバック・月次売上 43,740,000（店別・Σ daily_reports ±1%）・
//   日次売上 ±1%・ランキング（get_cast_ranking の売上順）・在庫（opening＋received−sold＝closing）・売掛残・NOIR シャンパン本数・payload サイズ（1 MB 超は分割）。
//   報酬参考 13,648,300 は payroll（D2 の正規経路）＝本便では「給与の前提数（指名回数・ドリンク本数）」の充足だけを出す。
//   実行: npx tsx scripts/demo/check-demo.mjs [--store=noir]（.ts の lib を import するため tsx）。結果＝docs/demo/check_20261002.md（追記ではなく上書き）。
import { Client } from "pg";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { buildPayloadFromRecording, splitPayload, payloadBytes, PAYLOAD_MAX_BYTES } from "../../lib/nox/demo/seed.ts";
import { addDays, bizDateOf } from "../../lib/nox/biz-date.ts";
process.loadEnvFile(".env.local");

const only = process.argv.find((a) => a.startsWith("--store="))?.slice(8) ?? null;
const SRC = JSON.parse(fs.readFileSync("docs/demo/source/20261001/nox_demo_all.json", "utf8"));
const D = (k) => SRC.datasets[k].records;
const GEN = JSON.parse(fs.readFileSync("docs/demo/payload/_report.json", "utf8"));
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 240000 });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const one = async (s, p = []) => (await q(s, p))[0];
const out = []; const md = [];
const ok = (store, label, cond, detail = "") => { out.push({ store, label, ok: !!cond, detail }); md.push(`| ${store} | ${cond ? "OK" : "**NG**"} | ${label} | ${String(detail).slice(0, 160)} |`); if (!cond) console.log("NG", store, label, detail); };
const yen = (n) => Number(n).toLocaleString();

try {
  await db.connect();
  const cutoff = "06:00";
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const [ty, tm] = bizToday.split("-").map(Number);
  const prevFirst = new Date(Date.UTC(ty, tm - 2, 1)); const prevPeriod = `${prevFirst.getUTCFullYear()}-${String(prevFirst.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevDays = new Date(Date.UTC(prevFirst.getUTCFullYear(), prevFirst.getUTCMonth() + 1, 0)).getUTCDate();
  md.push(`# デモ payload 突合（${new Date().toISOString().slice(0, 19)}Z・営業日 R＝${bizToday}・先月＝${prevPeriod}（${prevDays} 日）・BEGIN…ROLLBACK＝DB 恒久変更 0）`, "", "| 店 | 結果 | 項目 | 詳細 |", "|---|---|---|---|");
  const stores = D("stores").filter((s) => !only || s.store_code.toLowerCase() === only);
  const summary = {};
  for (const st of stores) {
    const code = st.store_code.toLowerCase(), S = st.store_id;
    const rec = JSON.parse(fs.readFileSync(`docs/demo/payload/${code}.json`, "utf8"));
    const bytes = Buffer.byteLength(JSON.stringify(rec.tables));
    await db.query("begin");
    try {
      // 仮 org（名前は一意制約を避けて乱数付き）＋ users 4（auth_user_id は FK なし＝乱数）
      const orgId = (await one(`insert into public.orgs (name, is_demo) values ($1, true) returning id`, [`NOX-DEMO-${st.store_code}-CHECK-${randomUUID().slice(0, 8)}`])).id;
      const userIds = {};
      for (const role of ["owner", "manager", "staff", "cast"]) userIds[role] = (await one(`insert into public.users (org_id, auth_user_id, email, name) values ($1, $2, $3, $4) returning id`, [orgId, randomUUID(), `demo-${code}-${role}-${randomUUID().slice(0, 6)}@nox-demo.local`, role])).id;
      userIds.kiosk = randomUUID();
      const built = buildPayloadFromRecording(orgId, bizToday, rec, userIds);
      if (!built.ok) throw new Error(`build: ${built.error}`);
      const chunks = splitPayload(built.payload);
      const t0 = Date.now();
      const w = await one(`select public.demo_org_reset($1, null, 'wipe') r`, [orgId]);
      const loadMs = [];
      for (let i = 0; i < chunks.length; i++) { const t = Date.now(); await q(`select public.demo_org_reset($1, $2::jsonb, 'load') r`, [orgId, JSON.stringify(chunks[i])]); loadMs.push(Date.now() - t); }
      const totalMs = Date.now() - t0;
      ok(code, `payload ${yen(bytes)} B（1 MB ${bytes > PAYLOAD_MAX_BYTES ? "超＝分割" : "以下"}）→ chunk ${chunks.length}（${chunks.map((c) => yen(payloadBytes(c))).join("／")} B）・wipe→load ${totalMs} ms（${loadMs.join("／")}）`, true, `rows ${built.rows}・表 ${built.tables}`);
      void w;
      const storeId = (await one(`select id from public.stores where org_id=$1`, [orgId])).id;
      // (1) 代表伝票＝check_group_due＝checks.total＝expected・バック
      for (const o of D("orders").filter((o) => o.store_id === S)) {
        const ex = D("expected_results").find((e) => e.order_id === o.order_id);
        const row = await one(`select c.id, c.total, public.check_group_due(c.id,'A') due, (select coalesce(sum(drink_back+champ_back+bottle_back),0) from public.check_cast_backs b where b.check_id=c.id)::int backs from public.checks c where c.store_id=$1 and c.people=$2 and c.total=$3 limit 1`, [storeId, o.guest_count, ex.expected_total_yen]);
        ok(code, `代表伝票 ${o.order_id}: total＝due＝expected ${yen(ex.expected_total_yen)}・商品バック ${yen(ex.expected_product_back_yen)}`, row && Number(row.total) === ex.expected_total_yen && Number(row.due) === ex.expected_total_yen && Number(row.backs) === ex.expected_product_back_yen, row ? `total ${row.total} due ${row.due} backs ${row.backs}` : "行なし");
      }
      // (1b) 全伝票の三点一致（total＝check_group_due）
      const mis = await one(`select count(*)::int n from public.checks c where c.store_id=$1 and c.status='closed' and c.total <> public.check_group_due(c.id,'A')`, [storeId]);
      const nchk = await one(`select count(*)::int n, sum(case when status='open' then 1 else 0 end)::int open from public.checks where store_id=$1`, [storeId]);
      ok(code, `全 closed 伝票で checks.total＝check_group_due（不一致 0）・伝票 ${nchk.n}（open ${nchk.open}）`, Number(mis.n) === 0, `不一致 ${mis.n}`);
      // (2) 月次売上（Σ daily_reports の cash+card+uri+other）＝目標 ±1%・日次 ±1%
      const mt = D("monthly_sales_targets").find((m) => m.store_id === S);
      const dr = await q(`select biz_date::text d, (cash+card_gross+uri+other)::bigint g, slips from public.daily_reports where store_id=$1 and to_char(biz_date,'YYYY-MM')=$2 order by biz_date`, [storeId, prevPeriod]);
      const monthGross = dr.reduce((a, r) => a + Number(r.g), 0);
      const mpct = ((monthGross - mt.stated_monthly_gross_yen) / mt.stated_monthly_gross_yen) * 100;
      ok(code, `月次売上 Σdaily_reports ${yen(monthGross)}＝目標 ${yen(mt.stated_monthly_gross_yen)} ±1%`, Math.abs(mpct) <= 1, `${mpct.toFixed(2)}%・日報 ${dr.length} 日`);
      const dt = D("daily_sales_targets").filter((r) => r.store_id === S && r.is_open);
      let worst = 0, worstD = "";
      for (const r of dt) { const d = Number(r.business_date.slice(8)); const row = dr.find((x) => Number(x.d.slice(8)) === Math.min(d, prevDays)); const g = row ? Number(row.g) : 0; const pct = ((g - r.target_gross_sales_yen) / r.target_gross_sales_yen) * 100; if (Math.abs(pct) > Math.abs(worst)) { worst = pct; worstD = r.business_date.slice(5); } }
      ok(code, `日次売上 ±1%（最大ずれ ${worst.toFixed(2)}% @${worstD}）`, Math.abs(worst) <= 1, `${dt.length} 日`);
      // (2b) 伝票の Σtotal（closed・先月）＝Σ daily_reports
      const sumChk = await one(`select coalesce(sum(total),0)::bigint s from public.checks where store_id=$1 and status='closed' and to_char(public.biz_date_of(store_id, started_at),'YYYY-MM')=$2`, [storeId, prevPeriod]);
      ok(code, `先月の closed 伝票 Σtotal＝Σdaily_reports（凍結値の整合）`, Number(sumChk.s) === monthGross, `${yen(sumChk.s)} vs ${yen(monthGross)}`);
      // (3) ランキング（売上順）＝生成の割当（cast 別 Σ check_lines.line_total of cast_id）と get_cast_ranking の順位列が同じか（owner を emulate）
      const owner = await one(`select auth_user_id from public.users where id=$1`, [userIds.owner]);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner.auth_user_id, role: "authenticated" })]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [owner.auth_user_id]);
      await db.query(`set local role authenticated`);
      let rk = null, rkErr = null;
      try { rk = await q(`select * from public.get_cast_ranking($1, $2)`, [storeId, prevPeriod]); } catch (e) { rkErr = e.message; }
      await db.query(`reset role`);
      ok(code, `get_cast_ranking(先月) が owner で読める（行 ${rk ? rk.length : 0}・列 ${rk && rk[0] ? Object.keys(rk[0]).join(",") : "-"}）`, !!rk && !rkErr, rkErr ?? "");
      // get_cast_ranking の順＝本指名数 → 指名合計 → バック（売上列は無い）。参考＝main_count_target（指名のある店）／product_reward_target_yen（指名のない店＝バック順）
      const metric = ["luna", "noir", "ace"].includes(code) ? "main_count_target" : "product_reward_target_yen";
      const rr = D("ranking_reference").filter((r) => r.store_id === S && r.metric === metric).sort((a, b) => a.ordinal - b.ordinal);
      if (rk && rk.length && rr.length) {
        const ours = rk.slice().sort((a, b) => Number(a.rank) - Number(b.rank)).map((r) => r.cast_name);
        const want = rr.map((r) => D("people").find((p) => p.person_id === r.person_id)?.display_name);
        const top3 = ours.slice(0, 3).join(">") === want.slice(0, 3).join(">");
        ok(code, `ランキング（NOX＝本指名数→指名合計→バック）上位 3＝参考 ${metric}（${want.slice(0, 3).join(">")}）`, top3, `NOX: ${ours.slice(0, 5).join(">")}`);
      }
      // (4) 在庫＝opening＋received−sold（30 商品）・NOIR シャンパン 108
      const inv = D("inventory_snapshot_targets").filter((r) => r.store_id === S);
      let invOk = 0, invNg = [];
      for (const r of inv) {
        const prod = await one(`select p.id, coalesce(sum(s.delta),0)::int stock, coalesce(sum(case when s.reason='sale' then -s.delta else 0 end),0)::int sold from public.products p left join public.stock_logs s on s.product_id=p.id where p.store_id=$1 and p.name=$2 group by p.id`, [storeId, r.product_name]);
        const soldGen = (GEN.stores[code].inv.find((x) => x.product === r.product_name) ?? {}).sold ?? null;
        if (prod && Number(prod.stock) === r.opening_units + r.received_units_target - Number(prod.sold)) invOk++; else invNg.push(`${r.product_name}: stock ${prod?.stock} sold ${prod?.sold}（生成 ${soldGen}・目標 ${r.sold_units_target}）`);
      }
      ok(code, `在庫 ${inv.length} 商品: product_stock＝opening＋received−sold（sale 行はトリガ再生成・二重なし）`, invNg.length === 0, invNg.join("; ") || `${invOk}/${inv.length}`);
      const invShort = inv.filter((r) => ((GEN.stores[code].inv.find((x) => x.product === r.product_name) ?? {}).sold ?? 0) < r.sold_units_target);
      ok(code, `在庫 sold＝目標（${inv.length} 商品）`, invShort.length === 0, invShort.length ? `不足 ${invShort.length}: ${invShort.map((r) => r.product_name).join("・")}（予算優先の縮小＝報告）` : "");
      if (code === "noir") { const ch = GEN.stores[code].champ; const sum = ch.reduce((a, x) => a + x.sold, 0); ok(code, `NOIR シャンパン 108 本（銘柄別 8）`, sum === 108 && ch.every((x) => x.sold === x.target), `生成 ${sum}/108: ${ch.map((x) => `${x.product} ${x.sold}/${x.target}`).join("・")}`); }
      // (5) 売掛残（顧客別 Σ(amount−collected)）
      const rb = D("receivable_balances").filter((r) => r.store_id === S);
      for (const r of rb) {
        const cname = D("customers").find((c) => c.customer_id === r.customer_id)?.display_name;
        const row = await one(`select coalesce(sum(r.amount - r.collected_amount - r.deducted_amount),0)::int bal from public.receivables r join public.customers c on c.id=r.customer_id where r.store_id=$1 and c.name=$2 and r.status<>'voided'`, [storeId, cname]);
        ok(code, `売掛残 ${cname}＝${yen(r.balance_yen)}`, row && Number(row.bal) === r.balance_yen, `NOX ${row?.bal}`);
      }
      // (6) 当日のライブ状態
      const live = await one(`select (select count(*)::int from public.checks where store_id=$1 and status='open') o, (select count(*)::int from public.reservations where store_id=$1 and status='booked') rb, (select count(*)::int from public.reservations where store_id=$1 and status='pending') rp, (select count(*)::int from public.shifts where store_id=$1 and date=$2::date and status='confirmed') sh, (select count(*)::int from public.punches where store_id=$1 and type='in' and punched_at >= ($2::date + time '06:00') at time zone 'Asia/Tokyo') pin`, [storeId, bizToday]);
      const oh = D("open_order_header_targets").filter((o) => o.store_id === S).length, rs = D("reservation_targets").filter((r) => r.store_id === S).length, sht = D("shift_targets").filter((r) => r.store_id === S && r.planned_start_at && D("people").some((p) => p.person_id === r.person_id && (p.system_role_candidate === "cast" || p.system_role_candidate === "needs_confirmation"))).length;
      ok(code, `当日: open 伝票 ${oh}・予約 ${rs}（＋NOIR pending 1）・確定シフト ${sht}・in 打刻＝on_duty`, Number(live.o) === oh && Number(live.rb) === rs && Number(live.sh) === sht && (code !== "noir" || Number(live.rp) === 1), JSON.stringify(live));
      // (7) 指名回数・ドリンク本数（給与の前提）＝生成レポート
      const ns = GEN.stores[code].noms.filter((x) => x.hon[0] < x.hon[1] || x.jonai[0] < x.jonai[1] || x.dohan[0] < x.dohan[1]);
      ok(code, `指名回数＝cast_monthly_targets（本指名／場内／同伴・全キャスト）`, ns.length === 0, ns.length ? `不足 ${ns.length} 名: ${ns.map((x) => `${x.cast} ${x.hon.join("/")}・${x.jonai.join("/")}・${x.dohan.join("/")}`).join("; ").slice(0, 200)}` : "");
      const lo = GEN.stores[code].leftover;
      md.push(`| ${code} | — | 配分の残（予算優先で置けなかった数） | 指名 ${lo.noms}・在庫商品 ${lo.bottles}・キャストドリンク ${lo.drinks}・キャスト別シャンパン ${lo.champ}・延長 ${lo.ext}・人数（guests_target 未達） ${lo.guestsShort} |`);
      summary[code] = { bytes, chunks: chunks.length, totalMs, monthPct: mpct.toFixed(2), worstDay: worst.toFixed(2) };
    } finally { await db.query("rollback"); }
    const leftOrg = await one(`select count(*)::int n from public.orgs where name like $1`, [`NOX-DEMO-${st.store_code}-CHECK-%`]);
    ok(code, "ROLLBACK 後に仮 org が残っていない", Number(leftOrg.n) === 0, `残 ${leftOrg.n}`);
  }
  const ng = out.filter((o) => !o.ok);
  md.push("", `## 集計: ${out.length} 段・NG ${ng.length}`, "", "| 店 | payload B | chunk | wipe→load ms | 月次ずれ % | 日次最大ずれ % |", "|---|---|---|---|---|---|");
  for (const [c, s] of Object.entries(summary)) md.push(`| ${c} | ${yen(s.bytes)} | ${s.chunks} | ${s.totalMs} | ${s.monthPct} | ${s.worstDay} |`);
  md.push("", "## 読み方", "- 「在庫 sold＝目標」「指名回数」「NOIR シャンパン 108」の NG は、パッケージの目標が NOX の人数単価（セット×人数）と同じ月次売上の中に収まらないための縮小（生成器の優先順＝売上 ±1% ＞ 指名 ＞ 在庫 ＞ キャストドリンク ＞ シャンパン）。D1 の報告で裁定を求める。", "- 報酬参考 13,648,300 は payroll（D2 の正規経路）で突合＝本便では対象外。");
  fs.writeFileSync("docs/demo/check_20261002.md", md.join("\n") + "\n");
  console.log(`check-demo: ${out.length} 段・NG ${ng.length} → docs/demo/check_20261002.md`);
  process.exit(ng.length ? 1 : 0);
} finally { await db.end().catch(() => {}); }
