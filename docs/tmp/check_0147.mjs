// パス 2: 0147 起草の機械突合（a〜g・i の静的部分）
import fs from "node:fs";
const mig = fs.readFileSync("supabase/migrations/0147_store_settings_keys.sql", "utf8").replace(/\r\n/g, "\n");
const live = fs.readFileSync("docs/tmp/0147_live_def.sql", "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
const mig0144 = fs.readFileSync("supabase/migrations/0144_store_profile_setter.sql", "utf8").replace(/\r\n/g, "\n");
const res = [];
const ok = (k, cond, detail = "") => res.push(`${k}: ${cond ? "OK" : "NG"}${detail ? " — " + detail : ""}`);

// 関数本文の切り出し
const lines = mig.split("\n");
const fStart = lines.findIndex((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.set_store_profile"));
const fEnd = lines.findIndex((l, i) => i > fStart && l.startsWith("end $function$"));
const fn = lines.slice(fStart, fEnd + 1);
// a. ★ 行を除いた本文 vs live（末尾の ';' を除く）
const nonStar = fn.filter((l) => !l.includes("★")).map((l, i, arr) => (i === arr.length - 1 ? l.replace(/;$/, "") : l));
// 空行だけの差（★ ブロック間の区切り空行）を除く: ★ ブロック直前後に足した空行を除外するため、live と比較は「空行を除いた列」で行う
const strip = (a) => a.filter((l) => l.trim() !== "");
// live 11 行目（v_keys の末尾 '];'）は ★1 で意図的に ',' へ変えた行＝比較集合から外し、別 assert で '];'→',' だけの差であることを見る
const LIVE11 = live[10];
const star1 = fn.find((l) => l.includes("★1 0147: 末尾"));
ok("a0 ★1 の変更行＝live 11 行目の '];'→',' のみ（コメント以外の差なし）", !!star1 && star1.split("   -- ★1")[0] === LIVE11.replace(/\];$/, ","), star1 ? star1.trim().slice(0, 90) : "missing");
const A = strip(nonStar), B = strip(live.filter((_, i) => i !== 10));
let firstDiff = -1;
for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) { firstDiff = i; break; }
ok("a 非★行＝live と 1 文字も違わない（空行除く）", firstDiff === -1 && A.length === B.length, firstDiff === -1 ? `${A.length} 行一致` : `first diff at ${firstDiff + 1}: draft=${JSON.stringify(A[firstDiff])} live=${JSON.stringify(B[firstDiff])}`);
const addedBlank = nonStar.filter((l) => l.trim() === "").length - live.filter((l) => l.trim() === "").length;
ok("a' 非★の空行の増分（★ ブロック区切りのみ）", addedBlank >= 0, `+${addedBlank}`);

// b. revoke/grant が 0144 と同署名
const rv0144 = mig0144.split("\n").find((l) => l.startsWith("revoke execute on function public.set_store_profile"));
const gr0144 = mig0144.split("\n").find((l) => l.startsWith("grant  execute on function public.set_store_profile"));
const rv = lines.find((l) => l.startsWith("revoke execute on function public.set_store_profile"));
const gr = lines.find((l) => l.startsWith("grant  execute on function public.set_store_profile"));
ok("b revoke 行＝0144 逐語", rv === rv0144, rv);
ok("b grant 行＝0144 逐語", gr === gr0144, gr);
ok("b 順序＝関数 → revoke → grant → update", lines.indexOf(rv) > fEnd && lines.indexOf(gr) > lines.indexOf(rv) && lines.findIndex((l) => l.startsWith("update public.stores")) > lines.indexOf(gr));

// c. billing locked 逐語行
const gate = "  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;";
ok("c 'billing locked' ゲート行が逐語で残る", fn.includes(gate) && live.includes(gate));

// d. 署名不変
ok("d 署名 (p_store_id uuid, p_patch jsonb) 不変", fn[0] === live[0], fn[0]);
ok("d SECURITY DEFINER／search_path 不変", fn[3] === live[3] && fn[4] === live[4], `${fn[3]} / ${fn[4]}`);

// e. audit 呼出の引数数
const auditLine = fn.findIndex((l) => l.includes("perform public.audit_log_write('set_store_profile'"));
const auditCall = fn.slice(auditLine, auditLine + 2).join(" ");
const argsCount = auditCall.match(/audit_log_write\((.*)\);/)[1].split(",").length;
const liveAudit = live.slice(live.findIndex((l) => l.includes("perform public.audit_log_write('set_store_profile'")), live.findIndex((l) => l.includes("perform public.audit_log_write('set_store_profile'")) + 2).join(" ");
ok("e audit_log_write の引数数＝既存と同じ", argsCount === 5 && auditCall === liveAudit, `${argsCount} 引数（'set_store_profile', target, v_before, v_after, p_store_id）`);

// f. enum 検証が jsonb_typeof 'string' の後
for (const [k, errName] of [["biz_type", "bad biz_type"], ["billing_mode", "bad billing_mode"]]) {
  const t = fn.findIndex((l) => l.includes(`jsonb_typeof(p_patch->'${k}') <> 'string'`));
  const e = fn.findIndex((l) => l.includes(`raise exception '${errName}'`));
  const setL = fn.findIndex((l) => l.includes(`jsonb_set(v_settings, '{${k}}'`));
  ok(`f ${k}: typeof 'string'(${t + 1}) → enum '${errName}'(${e + 1}) → jsonb_set(${setL + 1}) の順`, t > 0 && e > t && setL > e);
  ok(`f ${k}: enum 値の並び`, /not in \('cabaret','girlsbar','snack','lounge','bar'\)/.test(fn[e]) || /not in \('table','individual','mixed'\)/.test(fn[e]), fn[e].trim());
}
// 12 キーそれぞれに検証ブロックがあり、白名単にも入っている
const KEYS = ["biz_type", "billing_mode", "setup_done", "sys_hourly", "sys_backs", "sys_sales_rate", "sys_points", "sys_sales_slide", "sys_point_slide", "sys_norms", "sys_penalties", "sys_bonus"];
const keysArr = fn.slice(fn.findIndex((l) => l.includes("v_keys")), fn.findIndex((l) => l.includes("'sys_bonus']"))+1).join(" ");
ok("f 白名単 array に 12 キー全部＋既存 8 キーの順序不変", KEYS.every((k) => keysArr.includes(`'${k}'`)) && /array\['name','short','ext_shimei_enabled','dohan_auto_hon',\s*'store_code','display_name','show_open_status','shift_cast_confirm',/.test(keysArr));
ok("f 12 キーとも `if p_patch ? 'k' then` ブロックと jsonb_set がある", KEYS.every((k) => fn.some((l) => l.includes(`if p_patch ? '${k}' then`)) && fn.some((l) => l.includes(`jsonb_set(v_settings, '{${k}}'`))));
// bool 10 キー: typeof 'boolean' 行
const BOOLS = KEYS.slice(2);
ok("f bool 10 キーとも jsonb_typeof 'boolean' 検証", BOOLS.every((k) => fn.some((l) => l.includes(`jsonb_typeof(p_patch->'${k}') <> 'boolean'`))));
// 変数宣言と使用の整合
const declared = fn.filter((l) => /^\s+v_[a-z_]+\s+(text|boolean|jsonb|uuid|record);/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
const used = [...new Set(fn.join("\n").match(/\bv_[a-z_]+\b/g))].filter((v) => !["v_org", "v_store", "v_keys", "v_k", "v_before", "v_after", "v_settings"].includes(v));
const undeclared = used.filter((v) => !declared.includes(v));
const dupDecl = declared.filter((v, i) => declared.indexOf(v) !== i);
ok("i 変数: 使用変数はすべて宣言済み・重複宣言なし", undeclared.length === 0 && dupDecl.length === 0, `undeclared=${undeclared.join(",") || "-"} dup=${dupDecl.join(",") || "-"} declared=${declared.length}`);
// if/end if 均衡
const ifs = fn.filter((l) => /^\s*if\b/.test(l) && !/end if;\s*(--.*)?$/.test(l.replace(/^\s*if.*?then\s*/, "")) ).length;
const oneLineIf = fn.filter((l) => /^\s*if\b.*\bthen\b.*\bend if;/.test(l)).length;
const endIfs = fn.filter((l) => /^\s*end if;/.test(l)).length;
const multiIf = fn.filter((l) => /^\s*if\b.*\bthen\s*(--.*)?$/.test(l)).length;
ok("i if／end if の均衡（複数行 if の数＝単独 end if; の数）", multiIf === endIfs, `multi-line if=${multiIf} end if;=${endIfs} one-line if=${oneLineIf}`);
// 括弧均衡（本文全体）
const body = fn.join("\n");
ok("i 丸括弧の均衡", (body.match(/\(/g) || []).length === (body.match(/\)/g) || []).length, `( ${(body.match(/\(/g) || []).length} ) ${(body.match(/\)/g) || []).length}`);
ok("i $function$ の対（2 個）・begin/commit 各 1", (mig.match(/\$function\$/g) || []).length === 2 && (mig.match(/^begin;$/m) || []).length === 1 && (mig.match(/^commit;$/m) || []).length === 1);
// g. UPDATE の冪等
const upd = lines.slice(lines.findIndex((l) => l.startsWith("update public.stores")), lines.findIndex((l) => l.startsWith("update public.stores")) + 3).join("\n");
ok("g UPDATE: set は || で他キー不変・where は setup_done<>'true' の行のみ（再実行で 0 行）", /settings_json \|\| '\{"setup_done":true\}'::jsonb/.test(upd) && /where coalesce\(settings_json->>'setup_done', ''\) <> 'true'/.test(upd));
ok("g UPDATE が関数定義・grant の後、commit の前", lines.findIndex((l) => l.startsWith("update public.stores")) < lines.findIndex((l) => l === "commit;"));

console.log(res.join("\n"));
console.log(`fn lines=${fn.length} star lines=${fn.filter((l) => l.includes("★")).length} nonStar=${nonStar.length} live=${live.length}`);
