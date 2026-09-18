/*
 * gen_0140_day_closed_gate.cjs — mig0140（締め済み営業日の関所）生成スクリプト（★準備のみ・まだ実行しない）
 *   実行: NODE_PATH=./node_modules node docs/tmp/gen_0140_day_closed_gate.cjs
 *   入力: live（SUPABASE_DB_URL）の pg_get_functiondef（課金ゲート内蔵の check_* 書込 RPC 16 本）
 *   出力: supabase/migrations/0140_day_closed_gate.sql（begin〜commit・create or replace 16 本＋proof）
 *   前提: 0138（＋0139 補正）で public.assert_day_open(p_store_id uuid, p_biz_date date) が存在し、store_id null では何もしない（null-guard）。
 *   規則（C③-15）:
 *     伝票行あり 15 本 … `select * into v_chk from public.checks …;` の直後に
 *       `  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));`
 *     check_open        … 課金ゲート行の直後に
 *       `  perform public.assert_day_open(v_store, public.biz_date_of(v_store, now()));`
 *   機械確認: 各関数とも (a) 挿入前に 'assert_day_open' を含まない (b) 挿入位置の行がちょうど 1 本 (c) 挿入後の行数＝挿入前＋1
 *             (d) 挿入行を取り除くと元の本文と一字一致（ゲート行の逐語は不変＝段47-1 形 f の一致数は動かない）。
 *   ★v_chk が null（伝票なし）の場合は `if v_chk.id is null … forbidden` より前に評価されるため、assert_day_open 側の store_id null-guard で素通りし、直後の forbidden がそのまま効く。
 */
const fs = require("fs");
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { Client } = require("pg");

const TARGETS = [
  "check_add_line", "check_add_seat", "check_close", "check_dohan_add", "check_extension_add", "check_line_set_group",
  "check_move_seat", "check_open", "check_pay", "check_remove_line", "check_remove_seat", "check_set_nominations",
  "check_set_people", "check_shimei_add", "check_time_charge_apply", "check_void",
];
const GATE = /^\s*if not public\.billing_writable_of\((v_org|public\.auth_org_id\(\))\) then raise exception 'billing locked'; end if;\s*$/;
const SEL = /^\s*select \* into v_chk from public\.checks where id = (p_check_id|v_line\.check_id);\s*$/;
const LINE_CHK = "  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));";
const LINE_OPEN = "  perform public.assert_day_open(v_store, public.biz_date_of(v_store, now()));";

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const proof = await c.query("select count(*)::int as n from public.orgs");
  const out = [];
  out.push("-- 0140_day_closed_gate.sql  (C層③ 関所・裁定 C③-2/C③-15・設計書 v1 §2.2)");
  out.push("-- 前提: 0138 適用済み(public.assert_day_open(uuid, date)・store_id null は no-op)。");
  out.push("-- 内容: 課金ゲート内蔵の check_* 書込 RPC 16 本へ関所 1 行を挿入(本文は他に一字も変えない・ACL は create or replace で保持)。");
  out.push("-- 生成: docs/tmp/gen_0140_day_closed_gate.cjs が live pg_get_functiondef から機械生成(各関数 +1 行のみを assert)。");
  out.push(`-- 生成時 proof: select 'nox-project-proof', count(*) from public.orgs → ${proof.rows[0].n}`);
  out.push("-- 手貼り: SQL Editor で Ctrl+A → Run。末尾 proof で assert_day_open 参照 16 / 形 f 一致数 不変 を確認。");
  out.push("begin;\n");
  const report = [];
  for (const name of TARGETS) {
    const r = await c.query("select pg_get_functiondef(oid) as d from pg_proc where pronamespace='public'::regnamespace and proname=$1", [name]);
    if (r.rowCount !== 1) throw new Error(`${name}: 定義が ${r.rowCount} 件`);
    const def = r.rows[0].d;
    if (def.includes("assert_day_open")) throw new Error(`${name}: 既に assert_day_open を含む（適用済みか）`);
    const lines = def.split("\n");
    const isOpen = name === "check_open";
    const idx = lines.map((l, i) => ((isOpen ? GATE : SEL).test(l) ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 1) throw new Error(`${name}: 挿入位置の行が ${idx.length} 本（期待 1）`);
    if (!isOpen && !lines.some((l) => GATE.test(l))) throw new Error(`${name}: ゲート行が見つからない`);
    const at = idx[0];
    const ins = isOpen ? LINE_OPEN : LINE_CHK;
    const next = [...lines.slice(0, at + 1), ins, ...lines.slice(at + 1)];
    // 機械確認 (c)(d)
    if (next.length !== lines.length + 1) throw new Error(`${name}: 行数が +1 ではない`);
    const back = next.filter((_, i) => i !== at + 1).join("\n");
    if (back !== def) throw new Error(`${name}: 挿入行を除くと元と一致しない`);
    out.push(`-- ---------- ${name}（挿入: L${at + 2}・${isOpen ? "ゲート行の直後" : "select v_chk の直後"}）----------`);
    out.push(next.join("\n") + ";\n");
    report.push({ name, insertAfterLine: at + 1, before: lines.length, after: next.length });
  }
  out.push("commit;\n");
  out.push("-- ---------- 検証(1結果セット) ----------");
  out.push("select 'nox-project-proof' as k, count(*)::text as v from public.orgs");
  out.push("union all select 'assert_day_open_callers', count(*)::text from pg_proc");
  out.push("  where pronamespace='public'::regnamespace and proname <> 'assert_day_open' and prosrc like '%assert_day_open%'");
  out.push("union all select 'callers_are_targets', string_agg(proname, ',' order by proname) from pg_proc");
  out.push("  where pronamespace='public'::regnamespace and proname <> 'assert_day_open' and prosrc like '%assert_day_open%'");
  out.push("union all select 'gate_shape_f', count(*)::text from pg_proc");
  out.push("  where pronamespace='public'::regnamespace and (prosrc like '%if not public.billing_writable_of(v_org) then raise exception ''billing locked''; end if;%'");
  out.push("     or prosrc like '%if not public.billing_writable_of(public.auth_org_id()) then raise exception ''billing locked''; end if;%');");
  out.push("-- 期待: proof=3 / assert_day_open_callers=16 / callers_are_targets=16 本の実名(check_add_line,…,check_void) / gate_shape_f=0138 適用後の値と同じ(関所行はゲート行を変えない)");
  fs.writeFileSync("supabase/migrations/0140_day_closed_gate.sql", out.join("\n"));
  console.table(report);
  console.log("wrote supabase/migrations/0140_day_closed_gate.sql");
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
