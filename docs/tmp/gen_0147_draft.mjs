// パス 1: supabase/migrations/0147_store_settings_keys.sql を起草（docs/tmp/0147_live_def.sql＝pg_get_functiondef 122 行を逐語写経・変更行に ★）
import fs from "node:fs";
import crypto from "node:crypto";
const live = fs.readFileSync("docs/tmp/0147_live_def.sql", "utf8").replace(/\r\n/g, "\n").split("\n");
while (live[live.length - 1] === "") live.pop();
if (live.length !== 122) throw new Error(`live def lines ${live.length} (expect 122)`);
const mig0144 = fs.readFileSync("supabase/migrations/0144_store_profile_setter.sql", "utf8");
const revokeLine = mig0144.split("\n").find((l) => l.startsWith("revoke execute on function public.set_store_profile"));
const grantLine = mig0144.split("\n").find((l) => l.startsWith("grant  execute on function public.set_store_profile"));
if (!revokeLine || !grantLine) throw new Error("0144 revoke/grant lines not found");

const BOOL_KEYS = ["setup_done", "sys_hourly", "sys_backs", "sys_sales_rate", "sys_points", "sys_sales_slide", "sys_point_slide", "sys_norms", "sys_penalties", "sys_bonus"];
const varOf = (k) => `v_${k.replace(/^sys_/, "s_")}`; // setup_done→v_setup_done / sys_hourly→v_s_hourly

const out = [];
const stars = []; // {star, note}
const push = (line, star) => { out.push(line); if (star) stars.push({ star, line: out.length, text: line }); };

for (let i = 0; i < live.length; i++) {
  const l = live[i];
  const n = i + 1;
  // ★1 白名単: 11 行目の末尾 '];' → ',' にし 12 キーを追記
  if (n === 11 && /'shift_cast_confirm'\];$/.test(l)) {
    push(l.replace(/\];$/, ",") + "   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）", "★1");
    push(`                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）`, "★1");
    push(`                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1`, "★1");
    push(`                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus'];                 -- ★1`, "★1");
    continue;
  }
  // ★2/★3/★4 変数宣言: v_settings jsonb; の直後
  if (/^\s+v_settings jsonb;$/.test(l)) {
    push(l);
    push(`  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）`, "★2");
    push(`  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）`, "★3");
    for (const k of BOOL_KEYS) push(`  ${varOf(k).padEnd(10)} boolean;   -- ★4 0147: ${k}（show_open_status と同型）`, "★4");
    continue;
  }
  // ★2〜★4 検証ブロック: 「-- ── 1 回で書く」の直前に挿入
  if (/^\s+-- ── 1 回で書く/.test(l)) {
    push(`  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────`, "★2");
    push(`  if p_patch ? 'biz_type' then                                                                             -- ★2 0147`, "★2");
    push(`    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）`, "★2");
    push(`    v_biz := p_patch->>'biz_type';                                                                         -- ★2`, "★2");
    push(`    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）`, "★2");
    push(`    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2`, "★2");
    push(`    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2`, "★2");
    push(`    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2`, "★2");
    push(`  end if;                                                                                                  -- ★2`, "★2");
    push(``);
    push(`  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147`, "★3");
    push(`    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）`, "★3");
    push(`    v_bill := p_patch->>'billing_mode';                                                                    -- ★3`, "★3");
    push(`    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）`, "★3");
    push(`    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3`, "★3");
    push(`    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3`, "★3");
    push(`    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3`, "★3");
    push(`  end if;                                                                                                  -- ★3`, "★3");
    for (const k of BOOL_KEYS) {
      const v = varOf(k);
      push(``);
      push(`  if p_patch ? '${k}' then                                                                               -- ★4 0147: ${k}（show_open_status の 4 行型を写経）`, "★4");
      push(`    if jsonb_typeof(p_patch->'${k}') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4`, "★4");
      push(`    ${v} := (p_patch->>'${k}')::boolean;                                                                 -- ★4`, "★4");
      push(`    v_before   := v_before || jsonb_build_object('${k}',                                                  -- ★4`, "★4");
      push(`                    coalesce(v_settings->>'${k}', '') = 'true');                                          -- ★4`, "★4");
      push(`    v_after    := v_after  || jsonb_build_object('${k}', ${v});                                           -- ★4`, "★4");
      push(`    v_settings := jsonb_set(v_settings, '{${k}}', to_jsonb(${v}), true);                                  -- ★4`, "★4");
      push(`  end if;                                                                                                  -- ★4`, "★4");
    }
    push(``);
    push(l);
    continue;
  }
  push(l);
}
// 末尾 'end $function$' → 'end $function$;'（0144 と同じく文として閉じる）
if (out[out.length - 1] !== "end $function$") throw new Error("unexpected tail: " + out[out.length - 1]);
out[out.length - 1] = "end $function$;";
const fnStart = 0; // 関数本体は out[0..]
const header = `-- 0147_store_settings_keys.sql
-- 店舗設定 setter の白名単拡張（補正 mig）＝ set_store_profile の白名単 8 → 20 キー（裁定269-1／270-3・裁定234＝適用済み 0144 は書き換えず補正 mig を積む）
-- 起草: 相談役ブロック 2026-09-17（CC 写経・パス 1）。写経元＝live の pg_get_functiondef（docs/tmp/0147_pre.md §1・122 行・
--       貼付前 md5(prosrc)=07d114ff0b570462c3330b87497fc17c）を逐語で写し、変更行だけ行末に ★ を付けた（★1〜★5）。
--       enum 検証の写経元＝set_store_norm_config（mig0042:92 の \`not in (...) → raise 'bad shimei_scope'\`）。
--       boolean 検証の写経元＝本関数の show_open_status ブロック（jsonb_typeof 'boolean' → ::boolean → coalesce(...)='true' → jsonb_set）。
--
-- 目的（裁定269-1 逐語）:
--   店舗の「使う制度」9 フラグ（時給・最低保証／各種バック／売上歩合／ポイント制／売上スライド／ポイントスライド／ノルマ／罰金・控除／
--   達成ボーナス）＋業態（biz_type）＋会計方式（billing_mode）＋初期設定完了（setup_done）は store_profile.settings_json に置き、
--   set_store_profile の白名単を補正 mig（0147）で 12 キー拡張する。feature_flags には載せない（運用トグルと報酬制度を混ぜない）。
--   キー＝biz_type（enum text: cabaret/girlsbar/snack/lounge/bar）・billing_mode（enum text: table/individual/mixed）・setup_done（boolean）・
--   sys_hourly／sys_backs／sys_sales_rate／sys_points／sys_sales_slide／sys_point_slide／sys_norms／sys_penalties／sys_bonus（boolean 9）。
--   既存 stores 全行に setup_done=true を埋め戻す（新規店は '{}'＝false）。制度 9 の欠損は ON 扱い（isSystemOn は client 側・本 mig では触らない）。
--
-- 変更点（★）:
--   ★1 v_keys の array[...] に 12 キーを追記（既存 8 の順序・綴りは不変・11 行目の末尾 '];' を ',' に）
--   ★2 biz_type: jsonb_typeof 'string' 検証（text 4 キーの行型）→ enum 検証 'bad biz_type' → before/after/jsonb_set
--   ★3 billing_mode: 同型・'bad billing_mode'
--   ★4 setup_done＋制度 9: show_open_status の 4 行型を 10 回写経（変数 v_setup_done／v_s_*）
--   ★5 埋め戻し UPDATE（既存行のみ・冪等）: setup_done が 'true' でない行にだけ '{"setup_done":true}' を || で足す
--
-- 触らない（宣言）:
--   署名 (p_store_id uuid, p_patch jsonb)・SECURITY DEFINER・set search_path to 'public'・'billing locked' ゲート行・
--   owner 限定行・actor 導出（audit_log_write 内部）・audit 呼出（5 引数）・'bad key' 拒否行・既存 8 キーの検証行・1 回の update 文・
--   stores の列／CHECK／RLS（stores_select）／grant（authenticated=SELECT のみ）・他の set_store_* 11 本・money-core 3 本。
--
-- 忘れると赤になるもの（教訓84・既存 pin 3 本の走査対象を保つ）:
--   - verify:nox-billing 段47-1: 名前不変・'billing locked' 逐語行を残す＝対象 125／除外 116／全数 241 とも不変（md5 は見ていない）。
--   - verify:nox-grants G2b: revoke ... from public, anon を本 mig でも明示（proacl＝postgres／authenticated／service_role のみを保つ）。
--   - verify:nox-anon-guard 段31a: 署名 (uuid, jsonb) 不変＝probe set_store_profile(null, null) は従来どおり BLOCKED。
--   - verify:nox-store-profile（39 本）: 白名単 8 の pin（131 行 ⑨-2・128 行 fixture・110 行 KEYS）は別レーンで 20 キーへ改訂（本 mig の適用と同じレーン）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                           -- 3
--   -- 1) 署名 1 行 (uuid, jsonb)・md5(prosrc) が 07d114ff0b570462c3330b87497fc17c から変わっていること（意図どおり）
--   select proname, pg_get_function_identity_arguments(oid), md5(prosrc) from pg_proc
--     where pronamespace='public'::regnamespace and proname='set_store_profile';
--   -- 2) proacl（anon なし・PUBLIC なし・authenticated と service_role あり）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';
--   -- 3) 白名単 20 キー（prosrc に 12 キーが全て含まれる）
--   select (select count(*) from unnest(array['biz_type','billing_mode','setup_done','sys_hourly','sys_backs','sys_sales_rate','sys_points',
--     'sys_sales_slide','sys_point_slide','sys_norms','sys_penalties','sys_bonus']) k where prosrc like '%''' || k || '''%') as n
--     from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';                  -- 12
--   -- 4) 'billing locked' 行が残っている（billing 47-1）
--   select prosrc like '%billing locked%' from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';  -- t
--   -- 5) 他の set_store_* 11 本と money-core 3 本の md5 が貼付前（docs/tmp/0147_pre.md §7 の控え）と全一致
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname like 'set\\_store\\_%' and proname <> 'set_store_profile' order by proname;                    -- 11 行
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_pay','check_close','check_void') order by proname;
--   -- 6) 埋め戻し: 全店 setup_done=true・他キーは不変（貼付前の docs/tmp/0147_pre.md §4 と照合）
--   select name, settings_json->>'setup_done', (select string_agg(k, ',' order by k) from jsonb_object_keys(settings_json) k)
--     from public.stores order by name;                                                                     -- 全行 true
--   -- 7) stores の grant／policy／列数（30）が不変（0144 の 5)6) と同じ SQL）
--   -- 8) 動作（JWT 要）＝verify:nox-store-profile の改訂版で実施（12 キー受理／bad biz_type／bad billing_mode／制度に非 boolean は bad type／未知キーは bad key）。

begin;

-- ══════════════════════════════════════════════════════════════
-- set_store_profile（白名単つき patch setter・owner 限定）＝ live 定義の逐語写経＋★1〜★4
-- ══════════════════════════════════════════════════════════════
`;
const tail = `
${revokeLine}
${grantLine}

-- ══════════════════════════════════════════════════════════════
-- ★5 埋め戻し: 既存 stores 全行に setup_done=true（新規店は '{}'＝false のまま）。冪等＝既に 'true' の行は触らない
-- ══════════════════════════════════════════════════════════════
update public.stores
   set settings_json = settings_json || '{"setup_done":true}'::jsonb          -- ★5 0147
 where coalesce(settings_json->>'setup_done', '') <> 'true';                  -- ★5（既存行のみ・冪等）

commit;
`;
const headerLines = header.split("\n").length - 1; // header ends with "\n"
const sql = header + out.join("\n") + "\n" + tail;
fs.writeFileSync("supabase/migrations/0147_store_settings_keys.sql", sql);
const sha = crypto.createHash("sha256").update(sql).digest("hex");
const totalLines = sql.split("\n").length - 1;
// ★ 一覧（mig 内の行番号）
const migLines = sql.split("\n");
const starRows = [];
migLines.forEach((l, i) => { const m = l.match(/-- (★[1-5])/); if (m) starRows.push({ star: m[1], line: i + 1 }); });
const notes = `# 0147_draft_notes（パス 1・起草）

- ファイル: supabase/migrations/0147_store_settings_keys.sql（未追跡）
- sha256: ${sha}
- 行数: ${totalLines}（ヘッダ ${headerLines} 行＋関数 ${out.length} 行＋revoke/grant/UPDATE/commit）
- 写経元: docs/tmp/0147_live_def.sql（＝0147_pre.md §1 の pg_get_functiondef 122 行・貼付前 md5(prosrc) 07d114ff0b570462c3330b87497fc17c）
- 関数本体の行数: live 122 行 → ${out.length} 行（追加 ${out.length - 122} 行・削除 0・変更 1 行＝live 11 行目の末尾 '];'→','）

## ★ 一覧（mig 内の行番号）

| ★ | 内容 | 写経元 | mig の行 |
|---|---|---|---|
| ★1 | v_keys の array[...] に 12 キー追記（live 11 行目の '];'→','＋3 行） | live 10〜11 行（v_keys） | ${starRows.filter((r) => r.star === "★1").map((r) => r.line).join(", ")} |
| ★2 | biz_type: jsonb_typeof 'string'（text 4 キーの行型＝live ${live.findIndex((l) => l.includes("jsonb_typeof(p_patch->'store_code')")) + 1} 行）→ enum 検証（mig0042 0042_norm_expansion_okuri_base.sql:92 の \`not in (...) → raise\`）→ before/after/jsonb_set（live store_code ブロック） | 0042:92／live store_code ブロック | ${starRows.filter((r) => r.star === "★2").map((r) => r.line).join(", ")} |
| ★3 | billing_mode: ★2 と同型・'bad billing_mode' | 同上 | ${starRows.filter((r) => r.star === "★3").map((r) => r.line).join(", ")} |
| ★4 | setup_done＋制度 9 の boolean 検証（変数宣言 10 行＋ブロック 10×8 行） | live show_open_status ブロック（${live.findIndex((l) => l.includes("p_patch ? 'show_open_status'")) + 1}〜${live.findIndex((l) => l.includes("'{show_open_status}'")) + 2} 行） | ${(() => { const a = starRows.filter((r) => r.star === "★4").map((r) => r.line); return `${a[0]}〜${a[a.length - 1]}（${a.length} 行）`; })()} |
| ★5 | 埋め戻し UPDATE（既存行のみ・冪等） | 相談役ブロック逐語 | ${starRows.filter((r) => r.star === "★5").map((r) => r.line).join(", ")} |

## ★ 以外で live と違う行
- 関数末尾 \`end $function$\` → \`end $function$;\`（0144 と同じく文として閉じる・pg_get_functiondef は文末の ';' を含まない）。
`;
fs.writeFileSync("docs/tmp/0147_draft_notes.md", notes);
console.log("sha256", sha, "lines", totalLines, "fn lines", out.length, "stars", stars.length, "starRows", starRows.length);
