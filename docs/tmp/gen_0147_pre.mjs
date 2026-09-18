// docs/tmp/0147_pre.md を生成（読取のみ）: live の set_store_profile 逐語＋mig0144 原文＋調査結果
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const f = (await q("select pg_get_functiondef(p.oid) def, md5(p.prosrc) md5src, md5(pg_get_functiondef(p.oid)) md5def, p.proacl::text acl, pg_get_function_identity_arguments(p.oid) args, p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_store_profile'"))[0];
const defLines = f.def.split("\n");
const ln = (re) => defLines.map((l, i) => (re.test(l) ? i + 1 : null)).filter(Boolean);
const col = await q("select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='stores' and column_name='settings_json'");
const pol = await q("select policyname, cmd, roles::text roles, qual, with_check from pg_policies where schemaname='public' and tablename='stores'");
const rls = await q("select relrowsecurity, relforcerowsecurity from pg_class where oid='public.stores'::regclass");
const grants = await q("select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='stores' group by grantee order by grantee");
const sj = await q("select name, (select jsonb_object_agg(k, jsonb_typeof(settings_json->k)) from jsonb_object_keys(coalesce(settings_json,'{}'::jsonb)) k) types from public.stores order by name");
const ncols = (await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='stores'"))[0].n;
const setters = await q("select proname, md5(pg_get_functiondef(oid)) m from pg_proc where pronamespace='public'::regnamespace and proname like 'set\\_store\\_%' order by proname");
const money = await q("select proname, md5(pg_get_functiondef(oid)) m from pg_proc where pronamespace='public'::regnamespace and proname in ('check_pay','check_close','check_void') order by proname");
const nfn = (await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace"))[0].n;
await db.end();
const mig = fs.readFileSync("supabase/migrations/0144_store_profile_setter.sql", "utf8");
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

const md = `# 0147_pre（読取のみ・${now} JST・HEAD 5ab47b8＝origin/main・変更なし）

0147＝set_store_profile の白名単を 8 → 20 キーへ拡張する補正 mig（裁定269-1／270-3）の起草前調査。

---

## 1. set_store_profile の live 逐語（pg_get_functiondef）

- 署名: \`set_store_profile(${f.args})\` ・ SECURITY DEFINER ・ proconfig=${JSON.stringify(f.proconfig)}
- **md5(prosrc)=\`${f.md5src}\`** ／ md5(pg_get_functiondef)=\`${f.md5def}\`
- proacl（live）: \`${f.acl}\`（anon なし・PUBLIC なし・authenticated と service_role に X）
- 白名単の列挙行＝pg_get_functiondef の **${ln(/v_keys\s+text\[\]/)[0]}〜${ln(/'shift_cast_confirm'\]/)[0]} 行目**（\`v_keys text[] := array[...]\`）。白名単外拒否＝${ln(/if not \(v_k = any\(v_keys\)\)/)[0]} 行目（\`raise exception 'bad key'\`）。
- 型検証の書き方（キーごと・行番号は functiondef 内）:
  - text（列側）: name ${ln(/jsonb_typeof\(p_patch->'name'\)/)[0]} 行目 \`if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;\` → trim → 長さ 1..50 'bad name'／short ${ln(/jsonb_typeof\(p_patch->'short'\)/)[0]} 行目（長さ ≤20 'bad short'・空は null）
  - text（json 側）: store_code ${ln(/jsonb_typeof\(p_patch->'store_code'\)/)[0]} 行目（≤20 'bad store_code'）／display_name ${ln(/jsonb_typeof\(p_patch->'display_name'\)/)[0]} 行目（≤50 'bad display_name'）→ \`v_settings := jsonb_set(v_settings, '{key}', to_jsonb(v), true)\`
  - bool（列側）: ext_shimei_enabled ${ln(/jsonb_typeof\(p_patch->'ext_shimei_enabled'\)/)[0]} 行目／dohan_auto_hon ${ln(/jsonb_typeof\(p_patch->'dohan_auto_hon'\)/)[0]} 行目 \`if jsonb_typeof(p_patch->'x') <> 'boolean' then raise exception 'bad type'; end if; v := (p_patch->>'x')::boolean;\`
  - bool（json 側）: show_open_status ${ln(/jsonb_typeof\(p_patch->'show_open_status'\)/)[0]} 行目／shift_cast_confirm ${ln(/jsonb_typeof\(p_patch->'shift_cast_confirm'\)/)[0]} 行目 → before は \`coalesce(v_settings->>'x', '') = 'true'\`・after は to_jsonb(bool)
  - **int／enum の前例は本関数に無い**（8 キーは text 4・boolean 4）。
- 書込＝${ln(/^\s*update public\.stores set/)[0]} 行目からの 1 回の update（patch に無い列は \`case when p_patch ? 'x' then v else 現値 end\`・settings_json は v_settings 丸ごと）。監査＝${ln(/audit_log_write\('set_store_profile'/)[0]} 行目 \`perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);\`
- revoke／grant の署名行（mig0144 逐語・pg_get_functiondef には含まれない）:
  \`\`\`sql
  revoke execute on function public.set_store_profile(uuid, jsonb) from public, anon;
  grant  execute on function public.set_store_profile(uuid, jsonb) to authenticated, service_role;
  \`\`\`

\`\`\`sql
${f.def}
\`\`\`

## 2. 「store_profile 表」＝実体は public.stores（別表は無い）

- information_schema に \`%store_profile%\` の表は **0 件**。設定の器は stores.settings_json（列数 ${ncols}）。
- settings_json 列: ${JSON.stringify(col[0])}（jsonb・NOT NULL・既定 '{}'::jsonb・**CHECK なし**＝キーの型は RPC 側で守る）
- stores の CHECK は列側の 21 本（business_tax_status／round_mode／time_mode／time_per 等の enum は \`check (col in (...))\`）＝settings_json には及ばない。
- RLS: relrowsecurity=${rls[0].relrowsecurity}・force=${rls[0].relforcerowsecurity}。policy は 1 本のみ（逐語）:
${pol.map((p) => `  - \`${p.policyname}\` cmd=${p.cmd} roles=${p.roles} using=\`${p.qual}\` with_check=${p.with_check ?? "null"}`).join("\n")}
- grant: ${grants.map((g) => `${g.grantee}=${g.privs}`).join(" ／ ")}（authenticated は SELECT のみ＝client から update する経路は無い・書込は RPC 経由のみ）。

## 3. mig 0144（写経元）原文

\`\`\`sql
${mig}
\`\`\`

## 4. settings_json の現在の中身（キーと型のみ・値は伏せる）

${sj.map((r) => `- ${r.name}: ${r.types ? JSON.stringify(r.types) : "{}（空）"}`).join("\n")}

（0144 ヘッダの「live 走査 17 種」は 9/14 時点の全キー種別。現在 live に載っているのは上の 4 種＝okuri_mode／biz_cutoff_hm／cast_register_enabled／（okuri_mode）。0144 の 4 新規キー store_code／display_name／show_open_status／shift_cast_confirm は suite が finally で \`settings_json - keys\` で消すため live には残っていない。）

## 5. 0147 で足す 12 キーの型（実装から逆算）

| キー | 型 | 検証の書き方（既存の前例） | 前例の所在 |
|---|---|---|---|
| biz_type | enum text 5 値 cabaret／girlsbar／snack／lounge／bar | \`if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if; v := p_patch->>'biz_type'; if v not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;\` | **set_store_profile 内に enum 前例なし**。enum の書き方は set_store_norm_config（mig0042:92）\`if p_shimei_scope is null or p_shimei_scope not in ('hon','hon_jonai') then raise exception 'bad shimei_scope'; end if;\` と set_store_pricing（mig0051:207）\`if p_round_mode is null or p_round_mode not in ('up','down','round') then raise exception 'bad pricing'; end if;\` が写経元。列側 enum は CHECK（stores_time_per_check 等）だが settings_json には CHECK が無いため RPC 内の \`not in (...)\` 1 行で守る |
| billing_mode | enum text 3 値 table／individual／mixed | 同上（'bad billing_mode'） | 同上 |
| setup_done | boolean | show_open_status と同一の 4 行（jsonb_typeof 'boolean' → ::boolean → before は \`coalesce(v_settings->>'setup_done','')='true'\` → jsonb_set） | set_store_profile ${ln(/jsonb_typeof\(p_patch->'show_open_status'\)/)[0]}〜 行目 |
| comp_hourly（時給・最低保証） | boolean | 同上 | 同上 |
| comp_backs（各種バック） | boolean | 同上 | 同上 |
| comp_sales_rate（売上歩合） | boolean | 同上 | 同上 |
| comp_points（ポイント制） | boolean | 同上 | 同上 |
| comp_sales_slide（売上スライド） | boolean | 同上 | 同上 |
| comp_point_slide（ポイントスライド） | boolean | 同上 | 同上 |
| comp_norm（ノルマ） | boolean | 同上 | 同上 |
| comp_penalty（罰金・控除） | boolean | 同上 | 同上 |
| comp_bonus（達成ボーナス） | boolean | 同上 | 同上 |

（キー名は仮置き＝裁定269-1 は 9 フラグの名前を定めていない。読み側の既定は 0144 ヘッダの流儀＝キー無しは false／''＝\`=== true\` 判定。269-3「既存設定を持つ cast がいる制度は OFF 不可」は RPC 内で cast_plan／cast_norms を数えるか client で止めるかを 0147 起草で決める＝本 RPC は今のところ他表を読まない。）

## 6. verify:nox-store-profile（f0 47 段目・39 本）の assertion 一覧と白名単の件数 pin

観点（suite ヘッダ逐語）: ① owner で 8 キーを 1 つずつ書ける／② まとめ書き（8 キー同時）で全部反映／③ patch に無いキーは不変／④ 白名単外キー → bad key・空 patch・null・非 object → bad patch／⑤ 型違い → bad type／⑥ 長さ 4 種／⑦ short に空文字 → 列が null／⑧ 権限（manager・cast・他 org forbidden・anon BLOCKED）／⑨ audit_logs の before/after／⑩ 後始末で元の値へ。

check 一覧（scripts/verify-nox-store-profile.ts・行番号）:
- 93 sp(fx) 準備: A1 の実行前値を控えた
- 110 sp(①) owner が {k} だけを書ける → 反映（8 キー分ループ＝8 本）
- 116 sp(⑨-1) 1 キー呼び出しの audit: before/after のキーは patch のキーだけ
- 128 sp(②) ★**8 キーまとめ書き**で全部反映
- 131 sp(⑨-2) まとめ書きの audit: before/after とも **8 キー**（\`Object.keys(rows[0].b).length === 8\`）
- 142 sp(③) store_code だけの patch: 列 4 つと settings_json の他キーは不変
- 146 sp(③-2) 実行前からあった settings_json のキーは残っている
- 152／154／156／158／160／162 sp(④-1〜6) bad key・bad key（混在）・bad patch（空／null／配列／文字列）
- 168／170／172 sp(⑤-1〜3) bad type（name 数値・show_open_status 文字列・ext_shimei_enabled 数値）
- 181／184／186／188／190 sp(⑥-1〜5) 長さ（bad name／bad short／bad store_code／bad display_name・拒否時は何も書かない）
- 199／201 sp(⑦)／sp(⑨-3) short 空→null と audit
- 207／209／211／213／215 sp(⑧-1〜5) manager／cast／他 org forbidden・anon BLOCKED・B1 不変
- 221 sp(⑨-4) audit_logs の set_store_profile 行数＝成功呼び出し数
- 229／230／232 sp(⑩-1〜3) 復元（列 4・settings_json キー集合・audit 0）

**白名単の件数を pin している行**（0147 で 8→20 にすると要改訂）:
- 128 行 \`check("sp(②) ★8 キーまとめ書きで全部反映", ...)\`（8 キーの patch \`all\` を送る＝件数そのものは assert していないが 8 キー固定の fixture）
- 131 行 \`check("sp(⑨-2) まとめ書きの audit: before/after とも 8 キー", rows.length === 1 && Object.keys(rows[0].b).length === 8 && Object.keys(rows[0].a).length === 8, ...)\` ← **8 を直接 assert**
- ヘッダ 2／7／8 行の「白名単 8 キー」「8 キーを 1 つずつ」「8 キー同時」（文言）
- 110 行の ① ループは KEYS 配列（8 要素）を回す＝12 キーを足すなら配列に追加（enum 2 キーは値の型が違うため ⑤ に 'bad biz_type'／'bad billing_mode' の負例を足す）。

## 7. 既存 pin への影響（教訓84・0147 は「再定義」で本数は増えない）

| pin | 走査対象に入るか | 0147 での扱い |
|---|---|---|
| 課金ゲート名簿（verify:nox-billing 段47-1） | **入る**。set_store_profile は正本 A8 に収載済み（docs/NOX_課金ゲート対象_v1.md:58／174）。判定は prosrc に 'billing locked' が含まれるか（116 行 対象 125・133 行 除外 116・140 行 live 全数＝A∪B・148 行 gated=125・167 行 述語参照 126・174 行 挿入行の形 125）。**md5 は見ていない**＝名前不変・\`if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;\` の逐語行を残せば本数・形とも不変（+0）。 | 再定義時にゲート行を残す（書き換えない） |
| B5 A2（verify:nox-payroll・許可列挙） | 入らない（payroll_finalize／reopen／mark_paid の 3 本固定） | 影響なし |
| verify:nox-grants | G2b「PUBLIC に EXECUTE がある SECURITY DEFINER 関数＝0」＝**入る**（proacl 走査）。G4／G4b／G4c の HELPERS／INTERNAL 列挙には無い | 再定義後に \`revoke ... from public, anon\` を必ず再実行（CREATE OR REPLACE は ACL を保つが、写経元 0144 どおり明示） |
| verify:nox-rls | 入らない（stores は SELECT の可視範囲のみ・policy 不変） | 影響なし |
| verify:nox-anon-guard | **入る**＝段31a F0039_PROBES に \`["set_store_profile", { p_store_id: null, p_patch: null }]\`（543 行）＝anon BLOCKED を能動 assert | 署名 (uuid, jsonb) を変えなければ不変 |
| verify:nox-store-profile | **入る**（上記 6・8 キー pin 2 箇所＋fixture） | 20 キーへ改訂＝suite 改修が要る（39→増） |
| md5 の pin | **無し**。scripts に set_store_profile の md5／prosrc を固定する assert は 0 件（grep）。money-core 3 本の md5 不変は 0144 ヘッダの検証手順（手貼り時の目視照合）であって suite ではない | 手貼り検証で「set_store_profile の md5 が変わる（意図どおり）・他 set_store_* 11 本と money-core 3 本の md5 不変」を控える |

現在の md5（貼付前控え・pg_get_functiondef 基準）:
${setters.map((s) => `- ${s.proname}: \`${s.m}\``).join("\n")}
money-core:
${money.map((s) => `- ${s.proname}: \`${s.m}\``).join("\n")}
public 関数の全数: ${nfn}（billing 段47-1 の live 全数＝正本 A∪B と一致している前提の現在値）。
`;
fs.writeFileSync("docs/tmp/0147_pre.md", md);
console.log("written", md.length, "chars; def lines", defLines.length);
