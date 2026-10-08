// ★裁定328（便 D1-1・2026-10-02）: デモ環境の生成器＝docs/demo/source/20261001/nox_demo_all.json → 6 org（店）の payload（docs/demo/payload/<store>.json）。
//   実行: npx tsx scripts/demo/gen-demo.mjs（lib の .ts を import するため tsx）。DB は触らない（純生成）。突合は scripts/demo/check-demo.mjs（BEGIN…ROLLBACK）。
//   方針（docs/demo/gen_plan.md・mapping_20261001.md）:
//     - ID 固定: source_id → uuid（sha1 v5 風・docs/demo/ids.json に書き出す）。再生時は org ごとに remapUuid（lib/nox/demo/seed.ts）＝毎回同じ。
//     - 日付: 固定日付を持たない。先月＝{ $m: -1, d }（R の前月の同じ日・dateshift）・当日＝{ $rel: 0, t }・開始在庫など＝{ $rel: -N }。
//     - 率: bps → 整数 %。価格: 税・サ料前の単価をそのまま（price_display 'tax_excluded'・round_unit 1・round_mode 'down'・tax_rounding 'floor'）。
//     - 保留 5 項目（多段ボーナス・指名ボーナス・pt 自動付与・新人保証の自動切替・スライド適用日）は投入しない（スライドは値のみ・pt は products.hon_pt を保持）。
//     - 代表伝票 6 件と 48 ヘッダは固定行（代表＝order_items の明細そのまま・ヘッダ＝「飲食代」1 行で gross に合わせる）。
//     - 先月の伝票は日次目標（daily_sales_targets）に ±1% で合わせて生成（構造行＝セット／延長／指名／キャストドリンク／シャンパン／在庫商品 → 残差は汎用商品で埋める）。
//     - 当日（$rel 0）＝open 伝票 31（partial 10 行＋補完）・予約 7＋cast 申請 1・確定シフト 47＋in 打刻・キープ・在庫注意。
//     - 給与（payroll_runs／payslips）は投入しない＝D2 で正規経路（afterResetHooks）。daily_reports は凍結値（生成値）で入れる。
//   checks.total は lib/nox/check-calc.ts の groupDueFull（check_group_due の鏡像）で計算＝再生後の三点一致を check-demo が確認する。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { groupDueFull } from "../../lib/nox/check-calc.ts";

const SRC = JSON.parse(fs.readFileSync("docs/demo/source/20261001/nox_demo_all.json", "utf8"));
const D = (k) => SRC.datasets[k].records;
const OUT_DIR = "docs/demo/payload";
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── ID（固定・決定的）──
const ids = {};
const uid = (key) => {
  if (ids[key]) return ids[key];
  const h = createHash("sha1").update(`nox-demo-src:${key}`).digest("hex");
  const u = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
  ids[key] = u; return u;
};
// 決定的な乱数（店コード＋連番）
function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const STORES = D("stores").map((s) => ({ ...s, code: s.store_code.toLowerCase() }));
const pad = (n) => String(n).padStart(2, "0");
const hms = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}:00`;
const dayOf = (ymd) => Number(ymd.slice(8, 10));
const isodow = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; }; // 1 月 … 7 日（source の曜日）
const M = (d, t) => (t ? { $m: -1, d, t } : { $m: -1, d });
const TODAY = (t) => ({ $rel: 0, t });
const CLASS = { drink: "drink", champagne: "champ", bottle: "bottle", food: "food", other: "other" };
const SEAT_KIND = { normal: "卓", vip: "VIP", counter: "カウンター" };
const dowMaskOf = (iso) => iso.reduce((m, d) => m | (1 << (d - 1)), 0); // bit＝isodow−1（0 月…6 日）

const report = { stores: {}, ids: 0 };
// ── 行補完（NOT NULL 列）: created_at／updated_at＝行の日付（started_at／biz_date／date／at／punched_at／paid_at）か先月 1 日・boolean／数値／uuid／text の default を解釈 ──
const COLS = JSON.parse(fs.readFileSync("docs/demo/columns_20261002.json", "utf8")).columns;
function completeRows(table, rows, keyOf) {
  const cols = COLS[table]; if (!cols) throw new Error(`columns 未知: ${table}`);
  return rows.map((r, i) => {
    const o = { ...r };
    const dateLike = o.started_at ?? o.biz_date ?? o.date ?? o.at ?? o.punched_at ?? o.paid_at ?? o.reserved_at ?? o.opened_at ?? o.created_at ?? { $m: -1, d: 1, t: "12:00:00" };
    const ts = (v) => (v && typeof v === "object" && ("t" in v) ? v : v && typeof v === "object" ? { ...v, t: "12:00:00" } : v);
    for (const c of cols) {
      if (o[c.c] !== undefined) continue;
      if (c.n) { o[c.c] = null; continue; }
      const d = c.d ?? "";
      if (c.t === "uuid") o[c.c] = uid(`${table}:${keyOf ? keyOf(r, i) : i}:${c.c}`);
      else if (/timestamp/.test(c.t)) o[c.c] = ts(dateLike);
      else if (c.t === "date") o[c.c] = dateLike && typeof dateLike === "object" ? { ...dateLike, t: undefined } : dateLike;
      else if (c.t === "boolean") o[c.c] = /true/.test(d);
      else if (/int|numeric|double/.test(c.t)) o[c.c] = Number((d.match(/-?\d+(\.\d+)?/) ?? [0])[0]);
      else if (c.t === "jsonb") { const jm = d.match(/^'([\s\S]*)'::jsonb$/); let jv = null; if (jm) { try { jv = JSON.parse(jm[1]); } catch { jv = null; } } o[c.c] = jv ?? (d.startsWith("'[]'") ? [] : {}); } // ★0164: default の実値（{cash,card,emoney,qr}／{self,proxy,kiosk}）を写す
      else if (c.t === "text") { const m = d.match(/^'([^']*)'::text/); o[c.c] = m ? m[1] : ""; }
      else if (c.t === "ARRAY") o[c.c] = [];
      else o[c.c] = null;
      if (o[c.c] && typeof o[c.c] === "object" && "t" in o[c.c] && o[c.c].t === undefined) delete o[c.c].t;
    }
    return o;
  });
}
const staffUsers = {}; // person_id（代表スタッフ）→ users.id（店の staff ユーザー）

for (const st of STORES) {
  const code = st.code, S = st.store_id, rand = rng(code);
  const orgId = uid(`org:${code}`), storeId = uid(`store:${S}`);
  const users = { owner: uid(`user:${code}:owner`), manager: uid(`user:${code}:manager`), staff: uid(`user:${code}:staff`), cast: uid(`user:${code}:cast`), kiosk: uid(`auth:${code}:kiosk`) };
  const T = {}; const push = (t, row) => { (T[t] ??= []).push({ org_id: orgId, ...row }); return row; };
  const tax = { service_rate: st.service_bps / 100, round_unit: 1, round_mode: "down", business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor" };
  const due = (lines) => groupDueFull(lines.map((l) => ({ line_total: l.line_total, kind: l.kind, tax_category: "taxable_10" })), tax);

  // ── マスタ ──
  const rules = D("pricing_rules").filter((r) => r.store_id === S);
  const mainRule = rules.find((r) => r.seat_type !== "vip" && r.is_active) ?? rules[0];
  const ranks = D("nomination_ranks").filter((r) => r.store_id === S);
  const defRank = ranks.find((r) => r.rank_name === "default") ?? ranks[0] ?? null;
  const cal = D("september_business_calendar").filter((r) => r.store_id === S);
  const closedDows = [1, 2, 3, 4, 5, 6, 7].filter((dw) => cal.filter((r) => isodow(r.business_date) === dw).every((r) => !r.is_open));
  const openDays = cal.filter((r) => r.is_open).map((r) => r.business_date).sort();
  const openHm = mainRule.start_minute >= 1140 ? hms(mainRule.start_minute).slice(0, 5) : "19:00";
  const closeMin = 1500; // 翌 01:00（30 時間制）
  // ★X-13-9（便 X-13a・2026-10-08）: 機能の公開＝会社の既定（store_id null）で「スタッフシフト」「締め解除フロー」を ON（flag_enabled は店舗行→org 行→false）
  for (const key of ["staff_shift", "reopen_flow"]) push("feature_flags", { id: uid(`flag:${code}:${key}`), store_id: null, key, enabled: true, updated_by: null });
  push("stores", {
    id: storeId, name: st.store_name, short: st.store_code, open_time: openHm,
    settings_json: { biz_type: ({ MUSE: "snack", LUNA: "cabaret", NOIR: "cabaret", ACE: "cabaret", LILY: "girlsbar", NEST: "bar" })[st.store_code], biz_cutoff_hm: "06:00", setup_done: true, billing_mode: "table",
      sys_hourly: true, sys_backs: true, sys_sales_rate: false, sys_points: st.store_code === "NOIR", sys_sales_slide: st.store_code === "ACE", sys_point_slide: false, sys_norms: true, sys_penalties: false, sys_bonus: false,
      slide_apply: "current", receipt_address: "東京都新宿区歌舞伎町 1-1-1（デモ）", receipt_tel: "03-0000-0000", receipt_footer: "飲食代", okuri_base_amount: 1000,
      payslip_visibility: "detail", reservation_request: "on", drink_claim: "on", ranking: "on", shift_request_mode: "shift" },
    hon_fee: defRank?.main_charge_yen ?? 0, jonai_fee: defRank?.inhouse_charge_yen ?? 0, dohan_fee: defRank?.accompanied_charge_yen ?? 0, service_rate: tax.service_rate, card_tax_rate: 0,
    round_unit: 1, round_mode: "down", set_min: mainRule.set_minutes || 60, set_fee: mainRule.set_price_yen, ext_min: mainRule.extension_minutes || 30, ext_fee: mainRule.extension_price_yen,
    time_mode: "manual", time_per: "person", business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "registered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null,
    receivable_policy: st.receivables_enabled_demo ? "customer_only" : "disabled", dohan_auto_hon: true, ext_shimei_enabled: false,
  });
  const memb = (role, user, extra = {}) => push("memberships", { id: uid(`memb:${code}:${role}`), user_id: user, store_id: storeId, role, is_active: true, can_register: role !== "cast", can_crm: role !== "cast", can_shift: role !== "cast", can_view_backs: role !== "cast", can_close: role !== "cast", can_reopen: role === "owner" || role === "manager", ...extra });
  // memberships は org_id 列なし（demo_org_reset の例外）＝org_id を外す
  memb("owner", users.owner); memb("manager", users.manager); memb("staff", users.staff); memb("cast", users.cast);
  T.memberships = T.memberships.map(({ org_id: _o, ...r }) => r);
  for (const r of ranks) push("cast_ranks", { id: uid(`rank:${r.rank_id}`), store_id: storeId, name: r.rank_name === "default" ? "標準" : r.rank_name, sort_order: ranks.indexOf(r) + 1, is_active: true });
  const cats = D("categories").filter((c) => c.store_id === S);
  for (const c of cats) push("product_categories", { id: uid(`cat:${c.category_id}`), store_id: storeId, name: c.display_name, sort_order: c.sort_order, is_active: true });
  const prods = D("products").filter((p) => p.store_id === S);
  const PRODUCT = {};
  prods.forEach((p, i) => {
    const unit4 = p.back_mode === "by_nomination" ? { hon: p.back_main_yen, jonai: p.back_inhouse_yen, dohan: p.back_accompanied_yen, free: p.back_free_yen } : null;
    const row = { id: uid(`prod:${p.product_id}`), store_id: storeId, type: CLASS[p.accounting_class] ?? "other", category: p.display_category_name, name: p.product_name, price: p.selling_price_yen,
      back_mode: p.back_mode === "percentage" ? "rate" : "unit4", back_value: p.back_mode === "percentage" ? p.back_rate_bps / 100 : (p.back_mode === "none" ? 0 : null),
      unit4_json: p.back_mode === "none" ? { hon: 0, jonai: 0, dohan: 0, free: 0 } : unit4, hon_pt: p.nomination_points_per_unit ?? 0, is_active: true, reorder_point: p.reorder_point ?? null,
      track_stock: true, /* ★X-13-8（0166）: 列が無い間は jsonb_populate_recordset が無視・適用後は NOT NULL を満たす。false の銘柄は X-13b */
      category_id: uid(`cat:${p.display_category_id}`), back_exempt_from_split: !!p.cast_drink_exclude_from_shared_sales && !(p.nomination_points_per_unit > 0), sort_order: i + 1, tax_category: "taxable_10" };
    if (row.back_mode === "rate") row.unit4_json = null; else row.back_value = null;
    push("products", row);
    if (p.cost_yen != null) push("product_costs", { product_id: row.id, store_id: storeId, cost: p.cost_yen });
    PRODUCT[p.product_id] = { ...p, row };
  });
  const backOf = (pid, nom, qty) => { const p = PRODUCT[pid]; if (!p) return 0; if (p.back_mode === "percentage") return Math.floor(p.selling_price_yen * qty * (p.back_rate_bps / 10000)); if (p.back_mode === "none") return 0; const u = { main: p.back_main_yen, inhouse: p.back_inhouse_yen, accompanied: p.back_accompanied_yen, free: p.back_free_yen }; return (u[nom] ?? p.back_free_yen) * qty; };
  const tables = D("tables").filter((t) => t.store_id === S);
  tables.forEach((t, i) => push("seats", { id: uid(`seat:${t.table_id}`), store_id: storeId, name: t.display_name, kind: SEAT_KIND[t.seat_type] ?? "卓", sort_order: i + 1, is_active: t.is_active }));
  const seatByLabel = Object.fromEntries(tables.map((t) => [t.display_name, uid(`seat:${t.table_id}`)]));
  // 料金適用ルール（set／extension・曜日 dow_mask・時間帯は深夜跨ぎを切り捨て）
  for (const r of rules) {
    const from = r.start_minute % 1440, to = r.end_minute_exclusive > 1440 || r.start_minute === 0 ? null : Math.min(r.end_minute_exclusive - 1, 1439);
    const win = to == null ? { p_from: null, p_to: null } : { p_from: from, p_to: to };
    const base = { store_id: storeId, seat_kind: r.seat_type === "vip" ? "VIP" : null, dow_mask: dowMaskOf(r.iso_weekdays), time_from_min: win.p_from, time_to_min: win.p_to, rank_id: null, priority: r.priority, is_active: r.is_active, tax_category: "taxable_10", category_id: null, billing_unit: "person" };
    if (r.set_minutes) push("pricing_rules", { id: uid(`rule:${r.pricing_rule_id}:set`), ...base, fee_kind: "set", amount: r.set_price_yen, duration_min: r.set_minutes, name: `${r.display_group}` });
    else push("pricing_rules", { id: uid(`rule:${r.pricing_rule_id}:set`), ...base, fee_kind: "set", amount: r.set_price_yen, duration_min: 60, name: `${r.display_group}` });
    if (r.extension_price_yen) push("pricing_rules", { id: uid(`rule:${r.pricing_rule_id}:ext`), ...base, fee_kind: "extension", amount: r.extension_price_yen, duration_min: r.extension_minutes || 30, name: `${r.display_group} 延長` });
    if (r.vip_surcharge_yen) push("pricing_rules", { id: uid(`rule:${r.pricing_rule_id}:vip`), ...base, seat_kind: "VIP", fee_kind: "vip_charge", amount: r.vip_surcharge_yen, duration_min: null, name: "VIP 加算" });
  }
  for (const r of ranks) {
    push("pricing_rules", { id: uid(`rank:${r.rank_id}:hon`), store_id: storeId, fee_kind: "hon_shimei", seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: uid(`rank:${r.rank_id}`), amount: r.main_charge_yen, duration_min: null, priority: 100, is_active: true, name: `本指名（${r.rank_name === "default" ? "標準" : r.rank_name}）`, tax_category: "taxable_10", category_id: null, billing_unit: null });
    push("pricing_rules", { id: uid(`rank:${r.rank_id}:jonai`), store_id: storeId, fee_kind: "jonai_shimei", seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: uid(`rank:${r.rank_id}`), amount: r.inhouse_charge_yen, duration_min: null, priority: 100, is_active: true, name: `場内指名（${r.rank_name === "default" ? "標準" : r.rank_name}）`, tax_category: "taxable_10", category_id: null, billing_unit: null });
  }
  const plans = D("compensation_plans").filter((p) => p.store_id === S);
  const slide = D("sales_slide_tiers").filter((t) => t.store_id === S && t.tier > 0).map((t) => ({ at: t.daily_sales_threshold_yen, wage: t.hourly_yen }));
  for (const p of plans) push("comp_plans", { id: uid(`plan:${p.plan_id}`), store_id: storeId, name: p.plan_name, base: p.base_hourly_yen, hon_back: p.main_reward_yen, jonai_back: p.inhouse_reward_yen, dohan_back: p.accompanied_reward_yen,
    sales_slide: p.sales_slide ? slide : [], point_slide: [], is_active: true, hon_back_mode: "per_count", hon_back_rate: null, jonai_back_mode: "per_count", jonai_back_rate: null, dohan_back_mode: "per_count", dohan_back_rate: null, product_back_mode: "product_rule", product_back_rate: null, product_back_fixed: null, product_back_fixed_hon: null, product_back_fixed_jonai: null, product_back_fixed_free: null });
  const people = D("people").filter((p) => p.store_id === S);
  const castsSrc = people.filter((p) => p.system_role_candidate === "cast" || p.system_role_candidate === "needs_confirmation");
  { const repStaff = people.find((p) => p.system_role_candidate === "staff" && p.display_name === ({ MUSE: "田中", LUNA: "山本", NOIR: "鈴木", ACE: "小林", LILY: "松本", NEST: "中村" })[st.store_code]) ?? people.find((p) => p.system_role_candidate === "staff"); if (repStaff) staffUsers[repStaff.person_id] = users.staff; }
  const repCast = castsSrc.find((c) => c.display_name === ({ MUSE: "さおり", LUNA: "みさき", NOIR: "あべ", ACE: "ひなの", LILY: "みく", NEST: "ケン" })[st.store_code]) ?? castsSrc[0];
  const CAST = {};
  for (const c of castsSrc) {
    const id = uid(`cast:${c.person_id}`);
    push("casts", { id, store_id: storeId, user_id: c === repCast ? users.cast : null, name: c.display_name, kind: c.business_role, employment: "委託", is_active: true, joined_on: c.joined_on ? M(dayOf(c.joined_on)) : null, left_on: null, rank_id: c.rank_id ? uid(`rank:${c.rank_id}`) : (defRank ? uid(`rank:${defRank.rank_id}`) : null) });
    const pa = D("person_plan_assignments").filter((a) => a.person_id === c.person_id && !a.valid_to).pop() ?? D("person_plan_assignments").find((a) => a.person_id === c.person_id);
    const planId = uid(`plan:${pa?.plan_id ?? c.plan_id ?? plans[0].plan_id}`);
    push("cast_plan", { id: uid(`castplan:${c.person_id}`), cast_id: id, store_id: storeId, plan_id: planId, overrides_json: {}, valid_from: { $rel: -400 }, valid_to: null });
    push("cast_tax_profiles", { cast_id: id, store_id: storeId, mode: "委託", invoice: "免税", reg_no: null });
    CAST[c.person_id] = { ...c, id };
  }
  const castIds = castsSrc.map((c) => c.person_id);
  const custs = D("customers").filter((c) => c.store_id === S);
  for (const c of custs) push("customers", { id: uid(`cust:${c.customer_id}`), store_id: storeId, name: c.display_name, cast_id: c.relationship_person_id && CAST[c.relationship_person_id] ? CAST[c.relationship_person_id].id : null, grade: c.customer_label === "VIP" ? "vip" : null, memo: c.notes ?? null, is_active: true });
  const custId = (cid) => (cid ? uid(`cust:${cid}`) : null);
  // 営業時間（曜日）: closedDows は isodow → NOX dow（0 日…6 土）
  for (let dow = 0; dow <= 6; dow++) { const iso = dow === 0 ? 7 : dow; const closed = closedDows.includes(iso); push("store_business_hours", { id: uid(`bh:${code}:${dow}`), store_id: storeId, dow, is_closed: closed, open_hm: closed ? null : openHm, close_hm: closed ? null : hms(closeMin).slice(0, 5) }); }
  const monthly = D("monthly_sales_targets").find((m) => m.store_id === S);
  push("store_sales_targets", { id: uid(`sst:${code}:prev`), store_id: storeId, period: { $m: -1, d: 1, fmt: "ym" }, sales_target: monthly.stated_monthly_gross_yen });
  push("store_sales_targets", { id: uid(`sst:${code}:cur`), store_id: storeId, period: { $m: 0, d: 1, fmt: "ym" }, sales_target: monthly.stated_monthly_gross_yen });
  const cmt = D("cast_monthly_targets").filter((r) => r.store_id === S);
  for (const r of cmt) if (CAST[r.person_id]) for (const [k, m] of [["prev", -1], ["cur", 0]]) push("cast_quotas", { id: uid(`quota:${r.person_id}:${k}`), store_id: storeId, cast_id: CAST[r.person_id].id, month: { $m: m, d: 1 }, hon: r.main_count_target || null, jonai: r.inhouse_count_target || null, dohan: r.accompanied_count_target || null, sales: r.sales_target_yen || null });
  push("kiosk_devices", { id: uid(`kiosk:${code}`), store_id: storeId, auth_user_id: users.kiosk, label: `${st.store_name} 打刻端末`, is_active: true, purpose: "punch" });
  push("notices", { id: uid(`notice:${code}`), store_id: storeId, title: "デモ環境へようこそ", body: `${st.store_name} のデモです。入力内容は毎日 06:05 に初期状態へ戻ります。`, audience: "all", pinned: true, until: null, created_by: users.owner, created_at: { $rel: -7, t: "12:00:00" } });
  // キープ・売掛（開始残高）
  for (const b of D("bottle_keep_snapshots").filter((b) => b.store_id === S)) push("bottle_keeps", { id: uid(`keep:${b.bottle_keep_id}`), store_id: storeId, customer_id: custId(b.customer_id), product_id: uid(`prod:${b.product_id}`), opened_at: { $rel: -Math.max(1, Math.round((Date.parse("2026-10-01") - Date.parse(b.opened_on)) / 86400000)), t: "22:00:00" }, status: "active", remaining_pct: b.remaining_percent_estimate, bottle_name: PRODUCT[b.product_id]?.product_name ?? null, last_used_at: b.last_used_on ? { $rel: -Math.max(1, Math.round((Date.parse("2026-10-01") - Date.parse(b.last_used_on)) / 86400000)), t: "22:30:00" } : null, note: null });
  const arOpen = D("receivable_opening_snapshots").filter((r) => r.store_id === S);
  // ── 代表伝票 6 件（固定）＋ 48 ヘッダ ──
  const orders = D("orders").filter((o) => o.store_id === S);
  const items = D("order_items");
  const payEx = D("payment_examples");
  const exp = D("expected_results");
  const checksByDay = {}; // 'd' → [check ids]（日次集計用）
  let seq = 0;
  function emitCheck({ key, seatId, people, nomType, customerId, dayNum, startMin, lines, noms, payments, status = "closed", openToday = false, backsByCast = {} }) {
    const id = uid(`check:${key}`); seq++;
    const total = due(lines);
    const t0 = hms(startMin); const closeMin2 = startMin + 60 + Math.floor(rand() * 90);
    const started_at = openToday ? TODAY(t0) : M(dayNum, t0);
    const closed_at = status === "closed" ? (openToday ? TODAY(hms(closeMin2)) : M(dayNum, hms(closeMin2))) : null;
    push("checks", { id, store_id: storeId, seat_id: seatId, status, started_at, people, nom_type: nomType, customer_id: customerId, merged_into: null, total, service_rate: tax.service_rate, round_unit: 1, round_mode: "down",
      close_idem_key: status === "closed" ? uid(`idem:${key}`) : null, closed_at, voided_at: null, voided_by: null, void_reason: null, created_by: users.staff, created_at: started_at, updated_at: closed_at ?? started_at,
      set_min: st.store_code === "MUSE" ? 90 : 60, set_fee: mainRule.set_price_yen, ext_min: 30, ext_fee: mainRule.extension_price_yen, time_per: "person", dohan_fee: defRank?.accompanied_charge_yen ?? null, ext_menu_snap: null,
      business_tax_status: "taxable", price_display: "tax_excluded", tax_rounding: "floor", category_id: null, category_name: null, set_rule_id: null, set_rule_name: mainRule.display_group, set_unit: "person", ext_unit: "person", vip_charge_fee: null, vip_charge_unit: null, merge_idem_key: null });
    lines.forEach((l, i) => push("check_lines", { id: uid(`line:${key}:${i}`), store_id: storeId, check_id: id, product_id: l.product_id ?? null, kind: l.kind, pay_group: "A", name_snapshot: l.name, unit_price_snapshot: l.unit, qty: l.qty, line_total: l.line_total, back_snapshot: l.back ?? null, sort_order: i + 1, created_at: started_at, time_auto: l.kind === "set", fee_kind: l.fee_kind ?? null, cast_id: l.cast_id ?? null, block_no: null, tax_category: "taxable_10", idem_key: null, customer_id: null }));
    const nomsU = []; for (const n of noms ?? []) if (!nomsU.some((x) => x.cast_id === n.cast_id)) nomsU.push(n); // 同一伝票・同一キャストは 1 行（unique）
    nomsU.forEach((n, i) => push("check_nominations", { id: uid(`nom:${key}:${i}`), store_id: storeId, check_id: id, cast_id: n.cast_id, ratio_weight: 1, position: i + 1, created_at: started_at, nom_kind: n.kind, is_dohan: !!n.dohan, ended_at: null }));
    for (const [castId, b] of Object.entries(backsByCast)) push("check_cast_backs", { id: uid(`back:${key}:${castId}`), store_id: storeId, check_id: id, cast_id: castId, drink_back: b.drink ?? 0, champ_back: b.champ ?? 0, bottle_back: b.bottle ?? 0, hon_pt_alloc: b.pt ?? 0, created_at: closed_at ?? started_at, source_mode: "product_rule", product_sales_base: b.base ?? 0, calculated_back_amount: (b.drink ?? 0) + (b.champ ?? 0) + (b.bottle ?? 0) });
    (payments ?? []).forEach((p, i) => { push("payments", { id: uid(`pay:${key}:${i}`), store_id: storeId, check_id: id, pay_group: "A", method: p.method, amount: p.amount, tendered: p.method === "cash" ? p.amount : null, idem_key: uid(`payidem:${key}:${i}`), by_user_id: users.staff, paid_at: closed_at, method_detail: null });
      if (p.method === "ar") push("receivables", { id: uid(`ar:${key}:${i}`), store_id: storeId, check_id: id, customer_id: customerId, cast_id: null, amount: p.amount, deduct_from_cast: false, status: "open", created_at: closed_at, updated_at: closed_at, deduct_period: null, deducted_amount: 0, consent_at: null, consent_by: null, due: null, collected_amount: 0 }); });
    if (!openToday) (checksByDay[dayNum] ??= []).push({ id, total, people, payments: payments ?? [], lines, noms: noms ?? [] });
    return { id, total };
  }
  const nomStatusKind = { main: "hon", inhouse: "jonai", accompanied: "dohan", free: null };
  for (const o of orders) {
    const its = items.filter((i) => i.order_id === o.order_id).sort((a, b) => a.line_number - b.line_number);
    const lines = []; const noms = []; const backs = {};
    for (const it of its) {
      if (it.line_type === "fee") {
        const kind = it.charge_type === "fee_set" ? "set" : it.charge_type === "fee_extension" ? "time" : "charge";
        const fee_kind = ({ fee_set: "set", fee_extension: "extension", fee_main: "hon_shimei", fee_inhouse: "jonai_shimei", fee_accompanied: "dohan", fee_vip: "vip_charge" })[it.charge_type] ?? null;
        lines.push({ kind, fee_kind, name: it.description, unit: it.unit_price_yen, qty: it.quantity, line_total: it.line_subtotal_yen, cast_id: it.recipient_person_id ? CAST[it.recipient_person_id].id : null });
        if (it.nomination_status === "main" || it.nomination_status === "inhouse") noms.push({ cast_id: CAST[it.recipient_person_id].id, kind: nomStatusKind[it.nomination_status], dohan: false });
      } else {
        const p = PRODUCT[it.product_id];
        const cast = it.recipient_person_id ? CAST[it.recipient_person_id].id : null;
        lines.push({ kind: p.row.type, product_id: p.row.id, name: it.description, unit: it.unit_price_yen, qty: it.quantity, line_total: it.line_subtotal_yen, cast_id: cast, back: it.quantity ? it.product_back_yen / it.quantity : null });
        if (cast && it.product_back_yen) { const b = (backs[cast] ??= { drink: 0, champ: 0, bottle: 0, base: 0, pt: 0 }); b[p.row.type === "champ" ? "champ" : p.row.type === "bottle" ? "bottle" : "drink"] += it.product_back_yen; b.base += it.line_subtotal_yen; b.pt += (p.nomination_points_per_unit ?? 0) * it.quantity; }
      }
    }
    const total = due(lines); const ex = exp.find((e) => e.order_id === o.order_id);
    if (total !== ex.expected_total_yen) throw new Error(`代表伝票 ${o.order_id}: groupDueFull ${total} ≠ expected ${ex.expected_total_yen}`);
    const pays = payEx.filter((p) => p.order_id === o.order_id).map((p) => ({ method: p.method, amount: p.amount_yen }));
    if (o.receivable_amount_yen) pays.push({ method: "ar", amount: o.receivable_amount_yen });
    const tbl = tables.find((t) => t.display_name === o.table_label) ?? tables[0];
    const mins = Number(o.opened_at.slice(11, 13)) * 60 + Number(o.opened_at.slice(14, 16));
    emitCheck({ key: o.order_id, seatId: uid(`seat:${tbl.table_id}`), people: o.guest_count, nomType: noms.some((n) => n.kind === "hon") ? "hon" : noms.length ? "jonai" : "free", customerId: custId(o.customer_id), dayNum: dayOf(o.business_date), startMin: mins, lines, noms, payments: pays, backsByCast: backs });
  }
  // 48 ヘッダ: 「飲食代」1 行で gross に合わせる（整数解の探索・±2 円まで許容）
  const solveSub = (gross) => { let best = null; const sv = tax.service_rate; for (let s = Math.floor(gross / (1 + sv / 100) / 1.1) - 3; s <= Math.ceil(gross / (1 + sv / 100) / 1.1) + 3; s++) { const g = due([{ kind: "other", line_total: s }]); const diff = Math.abs(g - gross); if (!best || diff < best.diff) best = { s, g, diff }; } return best; };
  const headers = D("baseline_day_header_targets").filter((h) => h.store_id === S && !orders.some((o) => o.order_id === h.order_id));
  let hdrDiff = 0;
  for (const h of headers) {
    const sol = solveSub(h.gross_amount_target_yen); hdrDiff += sol.diff;
    const mins = Number(h.opened_at.slice(11, 13)) * 60 + Number(h.opened_at.slice(14, 16));
    const castName = (h.source_assignee_names ?? "").split(/[、,・]/)[0]; const cast = castsSrc.find((c) => c.display_name === castName);
    emitCheck({ key: h.order_id, seatId: uid(`seat:${tables[seq % tables.length].table_id}`), people: h.guests, nomType: "free", customerId: null, dayNum: dayOf(h.business_date), startMin: mins < 360 ? mins + 1440 : mins,
      lines: [{ kind: "other", name: "飲食代", unit: sol.s, qty: 1, line_total: sol.s, cast_id: cast ? cast.id ?? CAST[cast.person_id].id : null }], noms: [], payments: [{ method: "cash", amount: sol.g }] });
  }

  // ── 先月の生成（日次目標 ±1%・予算配分）──
  //   優先順＝①日次／月次売上 ±1%（golden）②指名回数（cast_quotas の月目標）③在庫商品の販売数（在庫 golden）④キャストドリンク⑤キャスト別シャンパン。
  //   セット（人数分）を先に置き、日ごとの残予算に収まる順で②〜⑤のキュー項目を配る。収まらなかった項目は leftover に数える（パッケージ側の目標が
  //   NOX の人数単価と両立しない店＝NOIR／ACE の在庫・シャンパンは縮む＝check-demo の報告に出す）。最後に汎用商品で ±0.5% に寄せる。
  const dailyT = D("daily_sales_targets").filter((r) => r.store_id === S && r.is_open);
  const tOf = (ymd) => dailyT.find((r) => r.business_date === ymd)?.target_gross_sales_yen ?? 0;
  const wOf = (ymd) => Math.max(1, tOf(ymd)); // 伝票数＝日次目標に比例（セットだけで目標を超えないように）
  const sumW = openDays.reduce((a, d) => a + wOf(d), 0);
  const nByDay = Object.fromEntries(openDays.map((d) => [d, Math.max(1, Math.round((monthly.visit_groups_target * wOf(d)) / sumW))]));
  let nTot = Object.values(nByDay).reduce((a, b) => a + b, 0);
  for (let i = 0; nTot !== monthly.visit_groups_target; i++) { const d = openDays[i % openDays.length]; if (nTot < monthly.visit_groups_target) { nByDay[d]++; nTot++; } else if (nByDay[d] > 1) { nByDay[d]--; nTot--; } }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const castDrinks = prods.filter((p) => p.back_mode === "by_nomination" && p.accounting_class === "drink");
  const generics = prods.filter((p) => p.back_mode === "none" && p.accounting_class !== "food" && !p.stock_tracking).sort((a, b) => a.selling_price_yen - b.selling_price_yen);
  const foods = prods.filter((p) => p.accounting_class === "food");
  const champTargets = D("noir_champagne_sales_targets").filter((r) => r.store_id === S);
  const invT = D("inventory_snapshot_targets").filter((r) => r.store_id === S);
  const soldBudget = {};
  for (const r of invT) soldBudget[r.product_id] = (soldBudget[r.product_id] ?? 0) + r.sold_units_target;
  for (const r of champTargets) soldBudget[r.product_id] = Math.max(soldBudget[r.product_id] ?? 0, r.quantity_target);
  for (const d of Object.keys(checksByDay)) for (const c of checksByDay[d]) for (const l of c.lines) if (l.product_id) { const pid = Object.keys(PRODUCT).find((k) => PRODUCT[k].row.id === l.product_id); if (pid && soldBudget[pid] != null) soldBudget[pid] = Math.max(0, soldBudget[pid] - l.qty); }
  const ruleFor = (ymd, min, seatType) => { const dw = isodow(ymd); const cands = rules.filter((r) => r.is_active && r.iso_weekdays.includes(dw) && (seatType === "vip" ? r.seat_type === "vip" : r.seat_type !== "vip") && min >= r.start_minute && min < r.end_minute_exclusive); return cands[0] ?? rules.find((r) => r.is_active && (seatType === "vip" ? r.seat_type === "vip" : r.seat_type !== "vip")) ?? mainRule; };
  const vipTables = tables.filter((t) => t.seat_type === "vip"), normTables = tables.filter((t) => t.seat_type !== "vip");
  const visits = D("customer_visit_targets").filter((v) => v.store_id === S);
  const custVisit = {}; for (const c of D("customer_monthly_targets").filter((c) => c.store_id === S)) custVisit[c.customer_id] = Math.max(0, (c.visits_target ?? 0) - visits.filter((v) => v.customer_id === c.customer_id).length);
  const custPool = shuffle(Object.entries(custVisit).flatMap(([cid, n]) => Array(n).fill(cid)));
  const grossOf = (c) => due(c.lines);
  const salesW = castIds.map((pid) => ({ pid, w: Math.max(1, cmt.find((r) => r.person_id === pid)?.sales_target_yen ?? 1) }));
  const pickServing = () => { const tot = salesW.reduce((a, x) => a + x.w, 0); let r = rand() * tot; for (const x of salesW) { r -= x.w; if (r <= 0) return CAST[x.pid].id; } return CAST[salesW[salesW.length - 1].pid].id; };
  // ① セットだけの伝票を全日に置く（人数 Σ＝guests_target・1 人基本＋余りを配る）
  const days = openDays.map((ymd) => ({ ymd, dNum: dayOf(ymd), target: dailyT.find((r) => r.business_date === ymd)?.target_gross_sales_yen ?? 0, fixed: (checksByDay[dayOf(ymd)] ?? []).reduce((a, c) => a + c.total, 0), checks: [] }));
  const allChecks = [];
  let gi = 0;
  for (const day of days) {
    const fixedN = (checksByDay[day.dNum] ?? []).length; const todo = day.fixed >= day.target * 0.99 ? 0 : Math.max(0, nByDay[day.ymd] - fixedN);
    const fixedVisits = visits.filter((v) => v.business_date === day.ymd);
    for (let i = 0; i < todo; i++) {
      const fv = fixedVisits[i] ?? null;
      const vip = vipTables.length > 0 && rand() < (vipTables.length / tables.length) * 0.7;
      const tbl = vip ? vipTables[i % vipTables.length] : normTables[i % normTables.length];
      const startMin = 1140 + Math.floor(rand() * 330);
      const rule = ruleFor(day.ymd, startMin, vip ? "vip" : "normal");
      const c = { key: `GEN-${code}-${day.dNum}-${i + 1}`, seatId: uid(`seat:${tbl.table_id}`), vip, people: 1, nomType: "free", serving: pickServing(), custSrc: fv ? fv.customer_id : null, dayNum: day.dNum, startMin, rule, lines: [], noms: [], backs: {}, fixedGross: fv ? fv.gross_amount_target_yen : null, fv, day };
      day.checks.push(c); allChecks.push(c); gi++;
    }
  }
  const fixedGuests = Object.values(checksByDay).flat().reduce((a, c) => a + (c.people ?? 0), 0);
  let extraGuests = Math.max(0, monthly.guests_target - fixedGuests - allChecks.length);
  for (const c of allChecks) {
    const r = c.rule; c.lines.push({ kind: "set", fee_kind: "set", name: `${r.display_group}${r.set_minutes ? ` セット（${r.set_minutes}分）` : ""}`, unit: r.set_price_yen, qty: c.people, line_total: r.set_price_yen * c.people });
    if (r.vip_surcharge_yen) c.lines.push({ kind: "charge", fee_kind: "vip_charge", name: "VIP 加算", unit: r.vip_surcharge_yen, qty: c.people, line_total: r.vip_surcharge_yen * c.people });
  }
  const dayGross = (day) => day.fixed + day.checks.reduce((a, c) => a + grossOf(c), 0);
  // 固定来店（LU-C001 の 7 件）は先に自分の gross へ（汎用商品で）＝再配分の前
  for (const c of allChecks) if (c.fixedGross) { let g = 0; while (grossOf(c) < c.fixedGross - 1200 && g++ < 30) { const gp = generics[Math.floor(rand() * Math.min(generics.length, 8))]; c.lines.push({ kind: PRODUCT[gp.product_id].row.type, product_id: PRODUCT[gp.product_id].row.id, name: gp.product_name, unit: gp.selling_price_yen, qty: 1, line_total: gp.selling_price_yen, cast_id: c.noms[0]?.cast_id ?? c.serving ?? null, back: null }); } }
  const remain = (day) => day.target - dayGross(day);
  // セットだけで日次目標を超える日は人数を 1 へ戻す（それでも超える分は報告）
  for (const day of days) { let g = 0; while (remain(day) < 0 && g++ < 200) { const c = day.checks.find((x) => x.people > 1); if (!c) break; c.people--; const sl = c.lines.find((l) => l.fee_kind === "set"); sl.qty = c.people; sl.line_total = sl.unit * c.people; const vl = c.lines.find((l) => l.fee_kind === "vip_charge"); if (vl) { vl.qty = c.people; vl.line_total = vl.unit * c.people; } } }
  for (const day of days) { let g = 0; while (remain(day) < 0 && g++ < 100) { const idx = day.checks.findIndex((x) => !x.fv); if (idx < 0) break; const c = day.checks.splice(idx, 1)[0];
    const dest = days.filter((d) => d !== day).sort((a, b) => remain(b) - remain(a))[0]; c.day = dest; c.dayNum = dest.dNum; c.key = `GEN-${code}-${dest.dNum}-mv${g}`;
    c.rule = ruleFor(dest.ymd, c.startMin, c.vip ? "vip" : "normal"); const sl = c.lines.find((l) => l.fee_kind === "set"); sl.unit = c.rule.set_price_yen; sl.line_total = sl.unit * sl.qty;
    sl.name = `${c.rule.display_group}${c.rule.set_minutes ? ` セット（${c.rule.set_minutes}分）` : ""}`; dest.checks.push(c); } }
  // ② 指名（固定来店は指定キャストの本指名）→ ③ 在庫商品 → ④ キャストドリンク → ⑤ シャンパン・延長（予算に収まる日へ）
  const nomQueue = []; const drinkQueue = []; const champQueue = [];
  for (const r of cmt) { if (!CAST[r.person_id]) continue; const cid = CAST[r.person_id].id;
    for (let i = 0; i < (r.accompanied_count_target ?? 0); i++) nomQueue.push({ cast: cid, kind: "hon", dohan: true, pid: r.person_id });
    for (let i = 0; i < (r.main_count_target ?? 0); i++) nomQueue.push({ cast: cid, kind: "hon", dohan: false, pid: r.person_id });
    for (let i = 0; i < (r.inhouse_count_target ?? 0); i++) nomQueue.push({ cast: cid, kind: "jonai", dohan: false, pid: r.person_id });
    for (let i = 0; i < (r.cast_drink_count_target ?? 0) + (r.shot_count_target ?? 0); i++) drinkQueue.push(cid);
    for (let i = 0; i < (r.champagne_count_target ?? 0); i++) champQueue.push(cid);
  }
  shuffle(nomQueue); shuffle(drinkQueue); shuffle(champQueue);
  const bottleList = []; for (const [pid, n] of Object.entries(soldBudget)) for (let i = 0; i < n; i++) bottleList.push(pid);
  bottleList.sort((a, b) => PRODUCT[b].selling_price_yen - PRODUCT[a].selling_price_yen); // 高い順に置く（置けなかった分は安いものから残る）
  const nomOfCast = (c, cid) => { const n = c.noms.find((x) => x.cast_id === cid); return n ? (n.dohan ? "accompanied" : n.kind === "hon" ? "main" : "inhouse") : "free"; };
  const addProd = (c, p, cast0, qty) => { const cast = cast0 ?? c.noms[0]?.cast_id ?? c.serving ?? null; const nom = nomOfCast(c, cast); const back = cast ? backOf(p.product_id, nom, qty) : 0; c.lines.push({ kind: p.row.type, product_id: p.row.id, name: p.product_name, unit: p.selling_price_yen, qty, line_total: p.selling_price_yen * qty, cast_id: cast, back: qty && back ? back / qty : null }); if (cast && back) { const b = (c.backs[cast] ??= { drink: 0, champ: 0, bottle: 0, base: 0, pt: 0 }); b[p.row.type === "champ" ? "champ" : p.row.type === "bottle" ? "bottle" : "drink"] += back; b.base += p.selling_price_yen * qty; b.pt += (p.nomination_points_per_unit ?? 0) * qty; } };
  const addNom = (c, n) => { const rk = ranks.find((r) => r.rank_id === CAST[n.pid]?.rank_id) ?? defRank; if (!rk) return false; const fee = n.kind === "hon" ? rk.main_charge_yen : rk.inhouse_charge_yen; c.lines.push({ kind: "charge", fee_kind: n.kind === "hon" ? "hon_shimei" : "jonai_shimei", name: n.kind === "hon" ? "本指名" : "場内指名", unit: fee, qty: 1, line_total: fee, cast_id: n.cast }); if (n.dohan) c.lines.push({ kind: "charge", fee_kind: "dohan", name: "同伴", unit: rk.accompanied_charge_yen, qty: 1, line_total: rk.accompanied_charge_yen, cast_id: n.cast }); c.noms.push({ cast_id: n.cast, kind: n.kind, dohan: n.dohan }); c.nomType = n.dohan ? "dohan" : n.kind === "hon" || c.nomType === "hon" || c.nomType === "dohan" ? (c.nomType === "dohan" ? "dohan" : "hon") : "jonai"; return true; };
  const costOf = (lines) => due(lines);
  const tryAdd = (fn, filter = () => true) => {
    // 残予算の大きい日から・その日の伝票を順に試す
    const cands = days.filter((d) => remain(d) > 0).sort((a, b) => remain(b) - remain(a));
    for (const day of cands) { const cs = shuffle(day.checks.filter(filter)); for (const c of cs) { const before = grossOf(c); const snap = { lines: c.lines.slice(), noms: c.noms.slice(), backs: JSON.parse(JSON.stringify(c.backs)), nomType: c.nomType }; if (!fn(c)) { continue; } if (grossOf(c) - before <= remain(day) + grossOf(c) - grossOf(c) && remain(day) >= 0) return true; c.lines = snap.lines; c.noms = snap.noms; c.backs = snap.backs; c.nomType = snap.nomType; } }
    return false;
  };
  // 固定来店の本指名
  for (const c of allChecks) if (c.fv && CAST[c.fv.nomination_person_id]) { const qi = nomQueue.findIndex((n) => n.pid === c.fv.nomination_person_id && n.kind === "hon" && !n.dohan); const n = qi >= 0 ? nomQueue.splice(qi, 1)[0] : { cast: CAST[c.fv.nomination_person_id].id, kind: "hon", dohan: false, pid: c.fv.nomination_person_id }; addNom(c, n); }
  const left = { noms: 0, bottles: 0, drinks: 0, champ: 0, ext: 0 };
  for (const n of nomQueue) { if (!tryAdd((c) => (c.noms.some((x) => x.cast_id === n.cast) ? false : addNom(c, n)), (c) => c.noms.length < 2 && (c.noms.length === 0 || (c.noms[0].kind === n.kind && c.noms[0].dohan === n.dohan)))) left.noms++; }
  for (const pid of bottleList) { const p = PRODUCT[pid]; if (!tryAdd((c) => { const cid = c.noms[0]?.cast_id ?? c.serving; if (p.accounting_class === "champagne") { const qi = champQueue.indexOf(cid); if (qi >= 0) champQueue.splice(qi, 1); } addProd(c, p, cid, 1); return true; })) left.bottles++; }
  for (const cid of drinkQueue) { const p = castDrinks[Math.floor(rand() * castDrinks.length)]; if (!p) { left.drinks++; continue; } if (!tryAdd((c) => { addProd(c, PRODUCT[p.product_id], cid, 1); return true; }, (c) => c.noms.length === 0 || c.noms.some((x) => x.cast_id === cid) || rand() < 0.3)) left.drinks++; }
  left.champ = champQueue.length;
  // 延長（35%・VIP 50%）＝予算の範囲で
  for (const c of shuffle(allChecks.slice())) { if (rand() < (c.vip ? 0.5 : 0.35)) { const r = c.rule; if (!r.extension_price_yen) continue; const line = { kind: "time", fee_kind: "extension", name: `延長${r.extension_minutes || 30}分`, unit: r.extension_price_yen, qty: c.people, line_total: r.extension_price_yen * c.people }; const before = grossOf(c); c.lines.push(line); if (grossOf(c) - before > remain(c.day)) { c.lines.pop(); left.ext++; } } }
  // ⑥ 人数の上積み（guests_target まで・予算に収まる伝票から・セット（と VIP 加算）の qty を増やす）
  { const order = shuffle(allChecks.slice()); for (let k = 0; extraGuests > 0 && k < order.length * 4; k++) { const c = order[k % order.length]; if (c.people >= 4) continue; const sl = c.lines.find((l) => l.fee_kind === "set"); const vl = c.lines.find((l) => l.fee_kind === "vip_charge"); const before = grossOf(c);
    c.people++; sl.qty = c.people; sl.line_total = sl.unit * c.people; if (vl) { vl.qty = c.people; vl.line_total = vl.unit * c.people; }
    if (grossOf(c) - before > remain(c.day)) { c.people--; sl.qty = c.people; sl.line_total = sl.unit * c.people; if (vl) { vl.qty = c.people; vl.line_total = vl.unit * c.people; } continue; } extraGuests--; } }
  // 固定来店は自分の gross へ・最後に汎用商品で日次 ±0.5% へ
  for (const day of days) {
    const free = day.checks.filter((c) => !c.fixedGross); let g = 0;
    while (remain(day) > day.target * 0.004 && free.length && g++ < 3000) { const need = remain(day); const cand = generics.filter((p) => p.selling_price_yen * 1.5 <= need); const p = PRODUCT[(cand.length ? cand[Math.floor(rand() * cand.length)] : generics[0]).product_id]; const c = free[g % free.length]; const qty = Math.max(1, Math.min(c.people, Math.floor(need / (p.selling_price_yen * 1.5) / 3))); addProd(c, p, null, qty); if (foods.length && rand() < 0.15) addProd(c, PRODUCT[foods[Math.floor(rand() * foods.length)].product_id], null, 1); }
    g = 0; while (remain(day) < -day.target * 0.006 && g++ < 3000) { const c = free.find((x) => x.lines.some((l) => l.product_id && !l.back)); if (!c) break; const idx = c.lines.findIndex((l) => l.product_id && !l.back); c.lines.splice(idx, 1); }
  }
  // ランキング（指名のない店）＝Σバックの順を参考（product_reward_target_yen）に揃える: 高い側のドリンク行を低い側へ移す
  if (!ranks.length) {
    const refOrder = D("ranking_reference").filter((r) => r.store_id === S && r.metric === "product_reward_target_yen").sort((a, b) => a.ordinal - b.ordinal).map((r) => CAST[r.person_id]?.id).filter(Boolean);
    // 既に emit 済みの固定行（代表伝票・ヘッダ＝closed）のバックも含める（get_cast_ranking は closed 全伝票の Σ）
    const fixedBacks = {}; for (const b of T.check_cast_backs ?? []) fixedBacks[b.cast_id] = (fixedBacks[b.cast_id] ?? 0) + b.drink_back + b.champ_back + b.bottle_back;
    const sumBack = () => { const m = { ...fixedBacks }; for (const c of allChecks) for (const [cid, b] of Object.entries(c.backs)) m[cid] = (m[cid] ?? 0) + b.drink + b.champ + b.bottle; return m; };
    if (process.env.GEN_DEBUG) console.log(code, "rank-fix before", JSON.stringify(Object.fromEntries(Object.entries(sumBack()).map(([k, v]) => [Object.values(CAST).find((c) => c.id === k)?.display_name, v]))), "refOrder", refOrder.length, "drinkLines", allChecks.reduce((a, c) => a + c.lines.filter((l) => l.back && l.kind === "drink").length, 0));
    let movesTotal = 0;
    for (let pass = 0; pass < 4000; pass++) {
      const bk = sumBack(); let moved = false;
      for (let i = 0; i + 1 < refOrder.length; i++) {
        const hi = refOrder[i], lo = refOrder[i + 1];
        if ((bk[hi] ?? 0) > (bk[lo] ?? 0) + 1000) continue; // 1,000 円の余白（同額の並びを避ける）
        // lo のドリンク行（back あり）を hi へ 1 本移す
        const c = allChecks.find((x) => x.noms.length === 0 && x.lines.some((l) => l.cast_id === lo && l.back && l.kind === "drink"));
        if (!c) continue;
        const l = c.lines.find((x) => x.cast_id === lo && x.back && x.kind === "drink"); const amt = l.back * l.qty;
        l.cast_id = hi; c.backs[lo].drink -= amt; c.backs[lo].base -= l.line_total; if (c.backs[lo].drink <= 0 && c.backs[lo].champ <= 0 && c.backs[lo].bottle <= 0) delete c.backs[lo];
        const b = (c.backs[hi] ??= { drink: 0, champ: 0, bottle: 0, base: 0, pt: 0 }); b.drink += amt; b.base += l.line_total; moved = true; movesTotal++;
      }
      if (!moved) break;
    }
    if (process.env.GEN_DEBUG) console.log(code, "rank-fix after", movesTotal, JSON.stringify(Object.fromEntries(Object.entries(sumBack()).map(([k, v]) => [Object.values(CAST).find((c) => c.id === k)?.display_name, v]))));
  }
  const perDayResult = [];
  for (const day of days) {
    let pi = 0;
    for (const c of day.checks) {
      const total = grossOf(c); pi++;
      const cust = c.custSrc ?? (custPool.length && rand() < 0.35 ? custPool.pop() : null);
      const r = (pi * 37 + day.dNum * 11) % 100;
      const pays = st.receivables_enabled_demo && cust && r >= 95 ? [{ method: "card", amount: Math.floor(total * 0.6) }, { method: "ar", amount: total - Math.floor(total * 0.6) }] : r >= 60 ? [{ method: "card", amount: total }] : [{ method: "cash", amount: total }];
      emitCheck({ key: c.key, seatId: c.seatId, people: c.people, nomType: c.nomType, customerId: custId(cust), dayNum: day.dNum, startMin: c.startMin, lines: c.lines, noms: c.noms, payments: pays, backsByCast: c.backs });
    }
    const dayRows = checksByDay[day.dNum] ?? [];
    const sum = (m) => dayRows.reduce((a, c) => a + c.payments.filter((p) => p.method === m).reduce((x, p) => x + p.amount, 0), 0);
    const gross = dayRows.reduce((a, c) => a + c.total, 0);
    perDayResult.push({ ymd: day.ymd, target: day.target, gross, diffPct: day.target ? Math.round(((gross - day.target) / day.target) * 10000) / 100 : 0, checks: dayRows.length });
    push("daily_reports", { id: uid(`dr:${code}:${day.dNum}`), store_id: storeId, biz_date: M(day.dNum), cash: sum("cash"), card_gross: sum("card"), card_tax: 0, uri: sum("ar"), other: 0,
      drink_sales: dayRows.reduce((a, c) => a + c.lines.filter((l) => l.product_id).reduce((x, l) => x + l.line_total, 0), 0), dohan_checks: dayRows.filter((c) => c.noms.some((n) => n.dohan)).length, slips: dayRows.length, guests: dayRows.reduce((a, c) => a + (c.people ?? 0), 0),
      open_checks_count: 0, expense: 0, cash_payout: 0, cash_float: 0, counted_cash: sum("cash"), diff: 0, note: null, biz_cutoff_hm: "06:00", card_tax_rate: 0, close_idem_key: uid(`dridem:${code}:${day.dNum}`), closed_by: users.manager, closed_at: M(day.dNum, "05:30:00"), reclosed_count: 0, created_at: M(day.dNum, "05:30:00"), updated_at: M(day.dNum, "05:30:00"), ar_collected: 0, ar_collected_card: 0, ar_collected_other: 0, referral_cash_payout: 0 });
  }
  const leftover = { ...left, custVisits: custPool.length, guestsShort: extraGuests };
  const invSold = {}; for (const d of Object.keys(checksByDay)) for (const c of checksByDay[d]) for (const l of c.lines) if (l.product_id) { const pid = Object.keys(PRODUCT).find((k) => PRODUCT[k].row.id === l.product_id); if (pid) invSold[pid] = (invSold[pid] ?? 0) + l.qty; }
  const invCheck = invT.map((r) => ({ product: r.product_name, target: r.sold_units_target, sold: invSold[r.product_id] ?? 0 }));
  const champCheck = champTargets.map((r) => ({ product: r.product_name, target: r.quantity_target, sold: invSold[r.product_id] ?? 0 }));
  const nomCheck = cmt.filter((r) => CAST[r.person_id]).map((r) => { const cid = CAST[r.person_id].id; let hon = 0, jonai = 0, dohan = 0; for (const d of Object.keys(checksByDay)) for (const c of checksByDay[d]) for (const n of c.noms) if (n.cast_id === cid) { if (n.dohan) dohan++; else if (n.kind === "hon") hon++; else jonai++; } return { cast: r.display_name, hon: [hon, r.main_count_target ?? 0], jonai: [jonai, r.inhouse_count_target ?? 0], dohan: [dohan, r.accompanied_count_target ?? 0] }; });
  // 打刻・シフト・出勤（hours_target ÷ 6h ≒ 出勤日数・開店 −30 分 in・+6h out）
  const openMin = Number(openHm.slice(0, 2)) * 60 + Number(openHm.slice(3, 5));
  for (const r of cmt) { const c = CAST[r.person_id]; if (!c) continue; const days = Math.min(openDays.length, Math.max(1, Math.round((r.hours_target ?? 0) / 6)));
    const step = openDays.length / days; const used = new Set();
    for (let i = 0; i < days; i++) { let idx = Math.min(openDays.length - 1, Math.round(i * step)); while (used.has(idx)) idx = (idx + 1) % openDays.length; used.add(idx); const ymd = openDays[idx]; const dNum = dayOf(ymd);
      const sIn = openMin - 30 + Math.floor(rand() * 20), sOut = sIn + 360 + Math.floor(rand() * 40);
      push("shifts", { id: uid(`shift:${r.person_id}:${dNum}`), store_id: storeId, cast_id: c.id, date: M(dNum), start_hm: hms(openMin).slice(0, 5), end_hm: `${pad(Math.floor((openMin + 360) / 60))}:${pad((openMin + 360) % 60)}`, status: "confirmed", wish_id: null, created_by: users.manager, created_at: M(dNum, "12:00:00"), updated_at: M(dNum, "12:00:00"), source: "manual", period_id: null, override_reason: null });
      push("attendance", { id: uid(`att:${r.person_id}:${dNum}`), store_id: storeId, cast_id: c.id, date: M(dNum), status: "shukkin", eta: null, reason: null, source: "self", created_at: M(dNum, hms(sIn)), updated_at: M(dNum, hms(sIn)) });
      push("punches", { id: uid(`punch:${r.person_id}:${dNum}:in`), store_id: storeId, cast_id: c.id, punched_at: M(dNum, hms(sIn)), type: "in", lat: null, lng: null, ip: null, within_geofence: null, source: "self", note: null, created_at: M(dNum, hms(sIn)), okuri: null });
      push("punches", { id: uid(`punch:${r.person_id}:${dNum}:out`), store_id: storeId, cast_id: c.id, punched_at: M(dNum, hms(sOut)), type: "out", lat: null, lng: null, ip: null, within_geofence: null, source: "self", note: null, created_at: M(dNum, hms(sOut)), okuri: null });
    } }
  // 在庫（開始＝先月 1 日の前日・入荷＝15 日）
  for (const r of invT) { push("stock_logs", { id: uid(`stock:${r.product_id}:open`), store_id: storeId, product_id: uid(`prod:${r.product_id}`), delta: r.opening_units, reason: "入荷", by_user_id: users.manager, at: { $m: -1, d: 1, t: "12:00:00" } });
    if (r.received_units_target) push("stock_logs", { id: uid(`stock:${r.product_id}:recv`), store_id: storeId, product_id: uid(`prod:${r.product_id}`), delta: r.received_units_target, reason: "入荷", by_user_id: users.manager, at: { $m: -1, d: 15, t: "12:00:00" } }); }
  // 売掛の開始残高（代表伝票由来は伝票の ar 支払いで起票済み＝それ以外）
  for (const a of arOpen) { if (a.source_order_id && orders.some((o) => o.order_id === a.source_order_id)) continue; const bal = a.opening_balance_yen; const paid = a.prior_received_aggregate_yen ?? 0;
    const dNum = a.originated_on ? dayOf(a.originated_on) : 5;
    push("receivables", { id: uid(`ar:${a.receivable_id}`), store_id: storeId, check_id: null, customer_id: custId(a.customer_id), cast_id: null, amount: a.principal_yen, deduct_from_cast: false, status: bal === 0 ? "collected" : "open", created_at: M(dNum, "23:00:00"), updated_at: M(dNum, "23:00:00"), deduct_period: null, deducted_amount: 0, consent_at: null, consent_by: null, due: null, collected_amount: paid });
    if (paid) push("ar_collections", { id: uid(`arc:${a.receivable_id}`), store_id: storeId, receivable_id: uid(`ar:${a.receivable_id}`), cast_id: null, customer_id: custId(a.customer_id), biz_date: M(Math.min(28, dNum + 7)), amount: paid, method: "cash", note: null, idem_key: uid(`arcidem:${a.receivable_id}`), created_by: users.manager, created_at: M(Math.min(28, dNum + 7), "23:30:00") }); }

  // ── 当日（$rel 0）のライブ状態 ──
  const liveHdr = D("open_order_header_targets").filter((o) => o.store_id === S);
  const liveLines = D("partial_open_order_line_targets");
  const tstate = D("table_state_targets").filter((t) => t.store_id === S);
  liveHdr.forEach((o, i) => {
    const tbl = tables.find((t) => t.table_id === o.table_id) ?? tables[i % tables.length];
    const ts = tstate.find((t) => t.table_id === o.table_id);
    const assigned = (ts?.assigned_person_ids ?? []).filter((p) => CAST[p]).map((p) => CAST[p].id);
    const lines = []; const noms = []; const backs = {};
    const pls = liveLines.filter((l) => l.order_id === o.order_id);
    const rule = ruleFor("2026-09-19", 1260, tbl.seat_type === "vip" ? "vip" : "normal");
    if (pls.length) for (const l of pls) {
      if (l.charge_type === "fee_set") lines.push({ kind: "set", fee_kind: "set", name: `${rule.display_group} セット`, unit: l.unit_price_yen, qty: l.quantity, line_total: l.unit_price_yen * l.quantity });
      else if (l.charge_type) lines.push({ kind: l.charge_type === "fee_extension" ? "time" : "charge", fee_kind: ({ fee_extension: "extension", fee_main: "hon_shimei", fee_inhouse: "jonai_shimei", fee_vip: "vip_charge" })[l.charge_type] ?? null, name: l.charge_type, unit: l.unit_price_yen, qty: l.quantity, line_total: l.unit_price_yen * l.quantity, cast_id: l.recipient_person_id && CAST[l.recipient_person_id] ? CAST[l.recipient_person_id].id : null });
      else { const p = PRODUCT[l.product_id]; const cast = l.recipient_person_id && CAST[l.recipient_person_id] ? CAST[l.recipient_person_id].id : null; const nom = l.nomination_status === "main" ? "main" : l.nomination_status === "inhouse" ? "inhouse" : "free"; const back = backOf(l.product_id, nom, l.quantity); lines.push({ kind: p.row.type, product_id: p.row.id, name: p.product_name, unit: l.unit_price_yen, qty: l.quantity, line_total: l.unit_price_yen * l.quantity, cast_id: cast, back: l.quantity ? back / l.quantity : null }); if (cast && back) { const b = (backs[cast] ??= { drink: 0, champ: 0, bottle: 0, base: 0, pt: 0 }); b.drink += back; b.base += l.unit_price_yen * l.quantity; } if (l.nomination_status === "main" && cast) noms.push({ cast_id: cast, kind: "hon", dohan: false }); }
    } else lines.push({ kind: "set", fee_kind: "set", name: `${rule.display_group} セット`, unit: rule.set_price_yen, qty: o.guest_count_target, line_total: rule.set_price_yen * o.guest_count_target });
    if (!noms.length && assigned.length && ranks.length && rand() < 0.5) { const rk = defRank; lines.push({ kind: "charge", fee_kind: "hon_shimei", name: "本指名", unit: rk.main_charge_yen, qty: 1, line_total: rk.main_charge_yen, cast_id: assigned[0] }); noms.push({ cast_id: assigned[0], kind: "hon", dohan: false }); }
    let guard = 0; while (due(lines) < o.gross_amount_target_yen - 1200 && guard++ < 40) { const g = generics[Math.floor(rand() * Math.min(generics.length, 6))] ?? generics[0]; const p = PRODUCT[g.product_id]; lines.push({ kind: p.row.type, product_id: p.row.id, name: p.product_name, unit: p.selling_price_yen, qty: 1, line_total: p.selling_price_yen, cast_id: null, back: null }); }
    const startMin = 1140 + (i * 17) % 150;
    emitCheck({ key: o.order_id, seatId: uid(`seat:${tbl.table_id}`), people: o.guest_count_target, nomType: noms.length ? "hon" : "free", customerId: custId(o.customer_id), dayNum: 0, startMin, lines, noms, payments: [], status: "open", openToday: true, backsByCast: {} });
  });
  for (const r of D("reservation_targets").filter((r) => r.store_id === S)) { const t = r.scheduled_at.slice(11, 19); const tbl = tables.find((x) => x.table_id === r.table_id);
    push("reservations", { id: uid(`res:${r.reservation_id}`), store_id: storeId, customer_id: custId(r.customer_id), cast_id: r.assigned_person_id && CAST[r.assigned_person_id] ? CAST[r.assigned_person_id].id : null, guest_name: null, reserved_at: TODAY(t), party_size: r.guest_count, nom_type: r.assigned_person_id ? "hon" : "free", status: "booked", memo: null, check_id: null, created_by: users.manager, created_at: { $rel: -1, t: "15:00:00" }, updated_at: { $rel: -1, t: "15:00:00" }, seat_id: null, stay: null, requested_by_cast: null, rejected_reason: null, decided_by: null, decided_at: null }); void tbl; }
  if (st.store_code === "NOIR") push("reservations", { id: uid(`res:${code}:pending`), store_id: storeId, customer_id: custId(custs[1]?.customer_id), cast_id: CAST[castIds[1]].id, guest_name: null, reserved_at: TODAY("23:30:00"), party_size: 2, nom_type: "hon", status: "pending", memo: "キャスト申請（デモ）", check_id: null, created_by: users.cast, created_at: { $rel: 0, t: "15:00:00" }, updated_at: { $rel: 0, t: "15:00:00" }, seat_id: null, stay: null, requested_by_cast: CAST[castIds[1]].id, rejected_reason: null, decided_by: null, decided_at: null });
  for (const s of D("shift_targets").filter((r) => r.store_id === S && r.planned_start_at && r.planned_end_at)) { const c = CAST[s.person_id]; if (!c) continue; const sh = s.planned_start_at.slice(11, 16), eh0 = s.planned_end_at.slice(11, 16); const eh = eh0 < sh ? `${pad(Number(eh0.slice(0, 2)) + 24)}${eh0.slice(2)}` : eh0;
    push("shifts", { id: uid(`shift:${s.person_id}:today`), store_id: storeId, cast_id: c.id, date: { $rel: 0 }, start_hm: sh, end_hm: eh, status: "confirmed", wish_id: null, created_by: users.manager, created_at: { $rel: -3, t: "12:00:00" }, updated_at: { $rel: -3, t: "12:00:00" }, source: "manual", period_id: null, override_reason: null });
    if (s.state_target === "on_duty_target") { const inT = `${pad(Number(sh.slice(0, 2)))}:${pad((Number(sh.slice(3, 5)) + 3) % 60)}:00`; push("attendance", { id: uid(`att:${s.person_id}:today`), store_id: storeId, cast_id: c.id, date: { $rel: 0 }, status: "shukkin", eta: null, reason: null, source: "self", created_at: TODAY(inT), updated_at: TODAY(inT) }); push("punches", { id: uid(`punch:${s.person_id}:today:in`), store_id: storeId, cast_id: c.id, punched_at: TODAY(inT), type: "in", lat: null, lng: null, ip: null, within_geofence: null, source: "self", note: null, created_at: TODAY(inT), okuri: null }); } }

  for (const t of Object.keys(T)) T[t] = completeRows(t, T[t], (r) => r.id ?? `${r.cast_id ?? ""}:${r.product_id ?? ""}:${r.store_id ?? ""}`);
  const meta = { cutoff: "06:00", store: code, users, generated_at: "2026-10-02", source: "docs/demo/source/20261001/nox_demo_all.json", notes: ["先月＝{$m:-1,d}（R の前月）", "当日＝{$rel:0,t}", "payroll は投入しない（D2 の正規経路）"] };
  const payload = { meta, tables: T };
  const json = JSON.stringify(payload);
  fs.writeFileSync(path.join(OUT_DIR, `${code}.json`), JSON.stringify(payload, null, 0) + "\n");
  const rows = Object.values(T).reduce((a, r) => a + r.length, 0);
  const monthGross = perDayResult.reduce((a, d) => a + d.gross, 0);
  const worst = perDayResult.reduce((a, d) => Math.max(a, Math.abs(d.diffPct)), 0);
  report.stores[code] = { bytes: Buffer.byteLength(json), rows, tables: Object.keys(T).length, checks: T.checks.length, lines: T.check_lines.length, monthGross, monthTarget: monthly.stated_monthly_gross_yen, monthDiffPct: Math.round(((monthGross - monthly.stated_monthly_gross_yen) / monthly.stated_monthly_gross_yen) * 10000) / 100, worstDayPct: worst, headerDiffYen: hdrDiff, leftover, inv: invCheck, champ: champCheck, noms: nomCheck, sha256: createHash("sha256").update(json).digest("hex") };
  console.log(code, JSON.stringify(report.stores[code]));
}
fs.writeFileSync("docs/demo/ids.json", JSON.stringify({ generated_at: "2026-10-02", note: "source_id → uuid（決定的・sha1 v5 風）。再生時は org ごとに remapUuid（lib/nox/demo/seed.ts）。", people: Object.fromEntries(Object.entries(ids).filter(([k]) => k.startsWith("cast:")).map(([k, v]) => [k.slice(5), v])), staff_users: staffUsers, users: Object.fromEntries(Object.entries(ids).filter(([k]) => k.startsWith("user:") || k.startsWith("auth:"))), all: ids }, null, 1) + "\n");
fs.writeFileSync("docs/demo/payload/_report.json", JSON.stringify(report, null, 1) + "\n");
console.log("ids", Object.keys(ids).length, "payload →", OUT_DIR);
