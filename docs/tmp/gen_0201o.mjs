// gen_0201o.mjs（2026-11-17 夜・相談役 Y3a・起草だけ＝試走も手貼りもしない）
//   本番の set_store_profile の定義（docs/tmp/live_set_store_profile_1118.sql＝read_ssp_1118.cjs で読取・sha16 183457019763471c）に
//   店の報酬の軸 reward_axis（'sales'／'pt'／'pay_rate'／null＝キーを消す＝今のフラグからの導出に戻る）を 1 キー足すだけの差し替えを作る。
//   使い方: node docs/tmp/gen_0201o.mjs → docs/tmp/0201o_store_reward_axis.sql と sha256 を出す
import fs from "node:fs";
import { createHash } from "node:crypto";
const SRC = "docs/tmp/live_set_store_profile_1118.sql";
const live = fs.readFileSync(SRC, "utf8");
const sha16 = createHash("sha256").update(live).digest("hex").slice(0, 16);
if (sha16 !== "183457019763471c") throw new Error(`live の定義が読み取り時と違う: ${sha16}`);
const nl = "\n";
let body = live;
// ① 白名単に 1 キー（sys_* の行の直後）
const keyLine = "                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）";
if (body.split(keyLine).length !== 2) throw new Error("白名単の行が 1 か所でない");
body = body.replace(keyLine, keyLine + nl + "                             'reward_axis',                                                               -- ★0201o（相談役 Y3a）: 店の報酬の軸");
// ② 宣言に 1 行
const declLine = "  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）";
if (body.split(declLine).length !== 2) throw new Error("宣言の行が 1 か所でない");
body = body.replace(declLine, declLine + nl + "  v_reward_axis   text;      -- ★0201o: reward_axis（null＝キーを消す）");
// ③ sys_point_slide の塊の直後に reward_axis の塊（同じ 4 行型・値は 3 択か null）
const spLine = "    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);";
const lines = body.split(nl); const iSp = lines.findIndex((l) => l.startsWith(spLine));
if (iSp < 0 || lines.filter((l) => l.startsWith(spLine)).length !== 1 || !/^  end if;/.test(lines[iSp + 1])) throw new Error("sys_point_slide の塊の終わりが 1 か所でない");
const block = [
  "",
  "  if p_patch ? 'reward_axis' then                                                                   -- ★0201o（相談役 Y3a）: 店の報酬の軸（売上／ポイント／報酬率）",
  "    if jsonb_typeof(p_patch->'reward_axis') not in ('string','null') then raise exception 'bad type'; end if;",
  "    v_reward_axis := p_patch->>'reward_axis';",
  "    if v_reward_axis is not null and v_reward_axis not in ('sales','pt','pay_rate') then raise exception 'bad reward_axis'; end if;",
  "    v_before   := v_before || jsonb_build_object('reward_axis', v_settings->'reward_axis');",
  "    v_after    := v_after  || jsonb_build_object('reward_axis', v_reward_axis);",
  "    v_settings := case when v_reward_axis is null then v_settings - 'reward_axis' else jsonb_set(v_settings, '{reward_axis}', to_jsonb(v_reward_axis), true) end;",
  "  end if;",
  "",
].join(nl);
lines.splice(iSp + 2, 0, ...block.split(nl)); body = lines.join(nl);
// ★v2（2026-11-18 相談役 D）: 同じ関数を何度も差し替えないよう 2 つを同乗＝kiosk_features に inventory・report の鍵（boolean・無い鍵は今までどおり）／biz_type に 'host'
{
  const kfOld = "if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;";
  if (body.split(kfOld).length !== 2) throw new Error("kiosk_features の行が 1 か所でない");
  body = body.replace(kfOld, "if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift','inventory','report') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;   -- ★0201o（相談役 D）: inventory・report を足す（無い鍵は今までどおり）");
  const bzOld = "if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;";
  if (body.split(bzOld).length !== 2) throw new Error("biz_type の行が 1 か所でない");
  body = body.replace(bzOld, "if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar','host') then raise exception 'bad biz_type'; end if;   -- ★0201o（相談役 D）: host（ホストクラブ）を足す");
}
const head = [
  "-- 0201o_store_reward_axis v2（2026-11-18 作り直し・相談役 D）（v1＝2026-11-17 夜 起草・相談役 Y3a）。貼るのは相談役の合図の後。",
  "--   翻訳元＝なし（NOX 固有）。表の定義は変えない＝set_store_profile 1 本の差し替え：① 白名単に reward_axis（'sales'／'pt'／'pay_rate'／null）② kiosk_features に inventory・report の鍵 ③ biz_type に 'host'。",
  "--   関数の数・表の数は変えない（450 のまま・0201n の後なら 451 のまま）・表 122。0201n（register_cast_roster＝新設・casts／daily_reports の方針）とは関数が重ならない＝順は問わない（数の期待だけ直す）。",
  `--   元＝本番の pg_get_functiondef（読取 2026-11-17・sha16 ${sha16}）＝生成器 docs/tmp/gen_0201o.mjs。ACL は create or replace で保たれる（authenticated・service_role に EXECUTE）。`,
  "--   これだけでは計算は変わらない：店の軸を読む側（lib/nox/store-systems.ts rewardAxisOf）と、CANON を当てるプランの選び方",
  "--   （lib/nox/payroll/rules-0175-collect.ts＝今はプランの reward_axis が 'pay_rate' のものだけ）を広げるのは client 便（計算の入口に触れる＝別に判断）。",
  "--",
  "-- 検証クエリ（貼った後に別で流す）：",
  "--   select 'nox-project-proof', count(*) from public.orgs;",
  "--   select position('''reward_axis''' in prosrc) > 0 as has_key, position('bad reward_axis' in prosrc) > 0 as has_check from pg_proc where proname = 'set_store_profile';",
  "--   select proacl::text from pg_proc where proname = 'set_store_profile';   -- {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} のまま",
  "--   （全部の期待値は docs/tmp/0201o_verify.sql）",
  "begin;",
  "set local lock_timeout = '10s';",
  "",
].join(nl);
const out = head + body.replace(/\s*$/, "") + ";" + nl + nl + "commit;" + nl;
fs.writeFileSync("docs/tmp/0201o_store_reward_axis.sql", out);
console.log("0201o sha256", createHash("sha256").update(out).digest("hex"), "bytes", Buffer.byteLength(out), "commit の数", out.split(/^commit;$/m).length - 1);
