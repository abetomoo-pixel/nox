/* gen_0141_check_open_gate_fix.cjs（2026-09-10・C層③ 補正）
 *   入力: live（SUPABASE_DB_URL）の pg_get_functiondef('check_open')＝0140 適用済み（誤行 v_store 入り）
 *   出力: supabase/migrations/0141_check_open_gate_fix.sql（begin〜commit・create or replace 1 本＋proof）
 *   操作: (1) `perform public.assert_day_open(v_store, …)` の誤行（ちょうど 1 本）を削除
 *         (2) `if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;`（ちょうど 1 本）の直後に
 *             `  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));` を 1 行
 *   機械確認: (a) 挿入行を除くと 0140 適用前の live 本文（＝0140 ファイルの check_open から挿入行を除いたもの）と一字一致
 *             (b) perform assert_day_open 行がちょうど 1 (c) v_seat が declare 部に宣言済み (d) live の assert_day_open 呼出 16 不変
 */
const fs = require("fs");
const crypto = require("crypto");
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { Client } = require("pg");
const BAD = "  perform public.assert_day_open(v_store, public.biz_date_of(v_store, now()));";
const ANCHOR = "  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;";
const NEW = "  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));";
const OUT = "supabase/migrations/0141_check_open_gate_fix.sql";
const norm = (s) => s.replace(/\r/g, "");
const only = (lines, pred, what) => { const idx = lines.map((l, i) => (pred(l) ? i : -1)).filter((i) => i >= 0); if (idx.length !== 1) throw new Error(`${what}: ${idx.length} 本`); return idx[0]; };
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const proof = (await c.query("select count(*)::int as n from public.orgs")).rows[0].n;
  const r = await c.query("select pg_get_functiondef(oid) as d, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname='check_open'");
  if (r.rowCount !== 1) throw new Error("check_open 定義が " + r.rowCount + " 件");
  const live = r.rows[0].d;
  const lines = live.split("\n");
  // (1) 誤行削除
  const bi = only(lines, (l) => norm(l) === BAD, "誤行 v_store");
  lines.splice(bi, 1);
  // (2) 挿入
  const ai = only(lines, (l) => norm(l) === ANCHOR, "anchor(v_seat.id is null)");
  const eol = lines[ai].endsWith("\r") ? "\r" : "";
  lines.splice(ai + 1, 0, NEW + eol);
  const fixed = lines.join("\n").trimEnd();
  // 機械確認
  const body = (d) => d.split("\n").filter((l) => !/perform public\.assert_day_open\(/.test(l)).join("\n").trimEnd();  // 末尾の空行は比較対象外（pg_get_functiondef は改行で終わる）
  const f0140 = fs.readFileSync("supabase/migrations/0140_day_closed_gate.sql", "utf8");
  const s = f0140.indexOf("-- ---------- check_open（"); const e = f0140.indexOf("\n-- ---------- ", s + 1);
  const sec0140 = f0140.slice(f0140.indexOf("CREATE OR REPLACE", s), e);
  const def0140 = sec0140.replace(/\n;\s*$/, "").trimEnd();
  const pre0140 = body(def0140);           // 0140 適用前の live 本文（0140 が live から写した本文から挿入行を除く）
  const chk = {
    a_raw: body(fixed) === pre0140,
    a_norm: norm(body(fixed)) === norm(pre0140),
    a_live: norm(body(fixed)) === norm(body(live)),
    b_perform: fixed.split("\n").filter((l) => /perform public\.assert_day_open\(/.test(l)).length,
    b_new_at: fixed.split("\n").findIndex((l) => norm(l) === NEW) + 1,
    c_declared: /^\s*v_seat record/m.test(norm(fixed).split("\nbegin")[0]),
    c_no_vstore: !/v_store/.test(fixed),
    d_callers: (await c.query("select count(*)::int as n from pg_proc where pronamespace='public'::regnamespace and proname <> 'assert_day_open' and prosrc like '%assert_day_open%'")).rows[0].n,
    lines_live: live.trimEnd().split("\n").length, lines_fixed: fixed.split("\n").length,
    acl: r.rows[0].acl,
  };
  console.log(JSON.stringify(chk, null, 1));
  if (!chk.a_norm) { const A = norm(body(fixed)).split("\n"), B = norm(pre0140).split("\n"); console.log("len", A.length, B.length);
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) { console.log("first diff L" + (i + 1), JSON.stringify(A[i]), JSON.stringify(B[i])); break; } }
  if (!chk.a_raw || chk.b_perform !== 1 || !chk.c_declared || !chk.c_no_vstore || chk.d_callers !== 16 || chk.lines_live !== chk.lines_fixed) throw new Error("機械確認 NG");
  const out = [];
  out.push("-- 0141_check_open_gate_fix.sql  (C層③ 補正・裁定 C③-15 追記・教訓68・2026-09-10)");
  out.push("-- 前提: 0140 適用済み。0140 は書き換えない。");
  out.push("-- 内容: check_open の関所行の変数誤り(v_store は未宣言=開卓が全件 column \"v_store\" does not exist)を補正。");
  out.push("--       誤行(ゲート行直後の L28)を削除し、v_seat 確定後(`if v_seat.id is null … forbidden` の直後)に");
  out.push("--       `perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));` を 1 行。本文は他を一字も変えない。");
  out.push("-- 生成: docs/tmp/gen_0141_check_open_gate_fix.cjs が live pg_get_functiondef から機械生成(挿入行を除くと 0140 適用前の本文と一字一致を assert)。");
  out.push(`-- 生成時 proof: select 'nox-project-proof', count(*) from public.orgs → ${proof}`);
  out.push("-- 手貼り: SQL Editor で Ctrl+A → Run。末尾 proof で has_v_store=false / assert_day_open_callers=16 / open_perform=1 を確認。");
  out.push("begin;");
  out.push("");
  out.push(`-- ---------- check_open（削除: 旧 L28 の v_store 行 ／ 挿入: L${chk.b_new_at}・v_seat 確定の直後。ACL は create or replace で保持）----------`);
  out.push(fixed);
  out.push(";");
  out.push("");
  out.push("commit;");
  out.push("");
  out.push("-- ---------- 検証(1結果セット) ----------");
  out.push("select 'nox-project-proof' as k, count(*)::text as v from public.orgs");
  out.push("union all select 'has_v_store', (prosrc like '%v_store%')::text from pg_proc where pronamespace='public'::regnamespace and proname='check_open'");
  out.push("union all select 'open_perform', (select count(*) from regexp_matches(prosrc, 'perform public\\.assert_day_open\\(v_seat\\.store_id, public\\.biz_date_of\\(v_seat\\.store_id, now\\(\\)\\)\\);', 'g'))::text");
  out.push("  from pg_proc where pronamespace='public'::regnamespace and proname='check_open'");
  out.push("union all select 'assert_day_open_callers', count(*)::text from pg_proc");
  out.push("  where pronamespace='public'::regnamespace and proname <> 'assert_day_open' and prosrc like '%assert_day_open%'");
  out.push("union all select 'gate_shape_f', count(*)::text from pg_proc");
  out.push("  where pronamespace='public'::regnamespace and (prosrc like '%if not public.billing_writable_of(v_org) then raise exception ''billing locked''; end if;%'");
  out.push("     or prosrc like '%if not public.billing_writable_of(public.auth_org_id()) then raise exception ''billing locked''; end if;%');");
  out.push("-- 期待: proof=3 / has_v_store=false / open_perform=1 / assert_day_open_callers=16 / gate_shape_f=0140 適用後と同じ(123)");
  const text = out.join("\n") + "\n";
  fs.writeFileSync(OUT, text);
  const buf = fs.readFileSync(OUT);
  console.log("wrote", OUT, "bytes", buf.length, "sha256", crypto.createHash("sha256").update(buf).digest("hex"));
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
