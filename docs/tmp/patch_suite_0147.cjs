// B-1／B-2: scripts/verify-nox-store-profile.ts を 20 キー化（各 old は 1 回一致を assert）
const fs = require("fs");
const P = "scripts/verify-nox-store-profile.ts";
let s = fs.readFileSync(P, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const rep = (oldS, newS) => {
  const o = oldS.split("\n").join(eol), n = newS.split("\n").join(eol);
  const c = s.split(o).length - 1;
  if (c !== 1) throw new Error(`old が ${c} 回一致: ${oldS.slice(0, 60)}`);
  s = s.replace(o, n);
};
// ヘッダ文言
rep(` * verify:nox-store-profile — mig0144 set_store_profile（店舗設定の統合 setter・白名単 8 キー patch 型）の係留。`,
    ` * verify:nox-store-profile — mig0144 set_store_profile（店舗設定の統合 setter・白名単 8 キー patch 型）の係留。
 *   ★mig0147（裁定269-1／270-3・2026-09-17）: 白名単 8→20 キー（biz_type／billing_mode＝enum text・setup_done＋sys_* 9＝boolean）。
 *     ①②⑨-2 を 20 キー化し、⑤ に enum 未知値（'bad biz_type'／'bad billing_mode'）・enum 非 string／制度キー非 boolean（'bad type'）、
 *     fx-2／⑩-4 に既存店の setup_done=true（0147 の埋め戻し・finally 後も残る）を追加。`);
// KEYS／JSON_KEYS
rep(`const KEYS = ["name", "short", "ext_shimei_enabled", "dohan_auto_hon", "store_code", "display_name", "show_open_status", "shift_cast_confirm"] as const;
const JSON_KEYS = ["store_code", "display_name", "show_open_status", "shift_cast_confirm"] as const;`,
    `// ★0147: 白名単 20 キー（既存 8＋enum 2＋boolean 10）
const NEW_ENUM = ["biz_type", "billing_mode"] as const;
const NEW_BOOL = ["setup_done", "sys_hourly", "sys_backs", "sys_sales_rate", "sys_points", "sys_sales_slide", "sys_point_slide", "sys_norms", "sys_penalties", "sys_bonus"] as const;
const KEYS = ["name", "short", "ext_shimei_enabled", "dohan_auto_hon", "store_code", "display_name", "show_open_status", "shift_cast_confirm", ...NEW_ENUM, ...NEW_BOOL] as const;
const JSON_KEYS = ["store_code", "display_name", "show_open_status", "shift_cast_confirm", ...NEW_ENUM, ...NEW_BOOL] as const;`);
// teardown back に 12 キー
rep(`      show_open_status: jsonOf(row0).show_open_status === true,
      shift_cast_confirm: jsonOf(row0).shift_cast_confirm === true,
    };`,
    `      show_open_status: jsonOf(row0).show_open_status === true,
      shift_cast_confirm: jsonOf(row0).shift_cast_confirm === true,
      // ★0147: boolean 10 は実行前値（無ければ false を書いた後に下の absent 削除でキーごと消す）・enum 2 は実行前にあったときだけ戻す
      ...Object.fromEntries(NEW_BOOL.map((k) => [k, jsonOf(row0)[k] === true])),
      ...Object.fromEntries(NEW_ENUM.filter((k) => typeof jsonOf(row0)[k] === "string").map((k) => [k, jsonOf(row0)[k]])),
    };`);
// fx-2: 既存店 A1 の setup_done=true
rep(`    check("sp(fx) 準備: A1 の実行前値を控えた（name 非空）", typeof row0.name === "string" && row0.name.length > 0, JSON.stringify(row0));`,
    `    check("sp(fx) 準備: A1 の実行前値を控えた（name 非空）", typeof row0.name === "string" && row0.name.length > 0, JSON.stringify(row0));
    check("sp(fx-2) ★0147 埋め戻し: 既存店 A1 の settings_json.setup_done が true（貼付時の UPDATE）", jsonOf(row0).setup_done === true, JSON.stringify(jsonOf(row0)));`);
// ① one に 12 キー
rep(`      ["shift_cast_confirm", true, (r) => jsonOf(r).shift_cast_confirm],
    ];`,
    `      ["shift_cast_confirm", true, (r) => jsonOf(r).shift_cast_confirm],
      // ★0147: 12 キー受理
      ["biz_type", "snack", (r) => jsonOf(r).biz_type],
      ["billing_mode", "mixed", (r) => jsonOf(r).billing_mode],
      ["setup_done", false, (r) => jsonOf(r).setup_done],
      ["sys_hourly", true, (r) => jsonOf(r).sys_hourly],
      ["sys_backs", true, (r) => jsonOf(r).sys_backs],
      ["sys_sales_rate", true, (r) => jsonOf(r).sys_sales_rate],
      ["sys_points", true, (r) => jsonOf(r).sys_points],
      ["sys_sales_slide", true, (r) => jsonOf(r).sys_sales_slide],
      ["sys_point_slide", true, (r) => jsonOf(r).sys_point_slide],
      ["sys_norms", true, (r) => jsonOf(r).sys_norms],
      ["sys_penalties", true, (r) => jsonOf(r).sys_penalties],
      ["sys_bonus", true, (r) => jsonOf(r).sys_bonus],
    ];`);
// ⑨-1 は直前の 1 キー呼び出し＝最後の要素が sys_bonus になるため文言と期待を差し替え
rep(`      check("sp(⑨-1) ★1 キー呼び出しの audit: before/after のキーは patch のキーだけ（shift_cast_confirm・before false→after true）",
        rows.length === 1 && Object.keys(b).join() === "shift_cast_confirm" && Object.keys(a).join() === "shift_cast_confirm" && b.shift_cast_confirm === false && a.shift_cast_confirm === true`,
    `      check("sp(⑨-1) ★1 キー呼び出しの audit: before/after のキーは patch のキーだけ（★0147: 末尾は sys_bonus・before false→after true）",
        rows.length === 1 && Object.keys(b).join() === "sys_bonus" && Object.keys(a).join() === "sys_bonus" && b.sys_bonus === false && a.sys_bonus === true`);
// ② all に 12 キー・⑨-2 8→20
rep(`    const all = { name: "NOX-VERIFY-A1 改2", short: "A1b", ext_shimei_enabled: false, dohan_auto_hon: false, store_code: "C2", display_name: "D2", show_open_status: false, shift_cast_confirm: false };`,
    `    const all = { name: "NOX-VERIFY-A1 改2", short: "A1b", ext_shimei_enabled: false, dohan_auto_hon: false, store_code: "C2", display_name: "D2", show_open_status: false, shift_cast_confirm: false,
      // ★0147: 12 キー（enum は別値・boolean は ① と逆）
      biz_type: "lounge", billing_mode: "table", setup_done: true, sys_hourly: false, sys_backs: false, sys_sales_rate: false, sys_points: false, sys_sales_slide: false, sys_point_slide: false, sys_norms: false, sys_penalties: false, sys_bonus: false };
    const NEW_ALL_OK = (j: Record<string, unknown>) => j.biz_type === "lounge" && j.billing_mode === "table" && j.setup_done === true && NEW_BOOL.slice(1).every((k) => j[k] === false);`);
rep(`      check("sp(②) ★8 キーまとめ書きで全部反映", !error && r.name === all.name && r.short === all.short && r.ext_shimei_enabled === false && r.dohan_auto_hon === false
        && j.store_code === "C2" && j.display_name === "D2" && j.show_open_status === false && j.shift_cast_confirm === false, error?.message ?? JSON.stringify(r));`,
    `      check("sp(②) ★20 キーまとめ書きで全部反映（★0147）", !error && r.name === all.name && r.short === all.short && r.ext_shimei_enabled === false && r.dohan_auto_hon === false
        && j.store_code === "C2" && j.display_name === "D2" && j.show_open_status === false && j.shift_cast_confirm === false && NEW_ALL_OK(j), error?.message ?? JSON.stringify(r));`);
rep(`      check("sp(⑨-2) まとめ書きの audit: before/after とも 8 キー", rows.length === 1 && Object.keys(rows[0].b).length === 8 && Object.keys(rows[0].a).length === 8, JSON.stringify(rows[0]));`,
    `      check("sp(⑨-2) まとめ書きの audit: before/after とも 20 キー（★0147: 8→20）", rows.length === 1 && Object.keys(rows[0].b).length === 20 && Object.keys(rows[0].a).length === 20, JSON.stringify(rows[0]));`);
// ④-7 未知キー（制度風の綴り違い）
rep(`      const e6 = (await set(owner, "x")).error;
      check("sp(④-6) 文字列は bad patch", has(e6, "bad patch"), e6?.message ?? "通ってしまった");`,
    `      const e6 = (await set(owner, "x")).error;
      check("sp(④-6) 文字列は bad patch", has(e6, "bad patch"), e6?.message ?? "通ってしまった");
      const e7 = (await set(owner, { sys_unknown: true })).error;
      check("sp(④-7) ★0147 後も白名単外キー（sys_unknown）は従来どおり bad key", has(e7, "bad key"), e7?.message ?? "通ってしまった");`);
// ⑤ enum／制度キーの型と未知値
rep(`      const e3 = (await set(owner, { ext_shimei_enabled: 1 })).error;
      check("sp(⑤-3) ext_shimei_enabled に数値は bad type", has(e3, "bad type"), e3?.message ?? "通ってしまった");`,
    `      const e3 = (await set(owner, { ext_shimei_enabled: 1 })).error;
      check("sp(⑤-3) ext_shimei_enabled に数値は bad type", has(e3, "bad type"), e3?.message ?? "通ってしまった");
      // ★0147
      const e4 = (await set(owner, { biz_type: 1 })).error;
      check("sp(⑤-4) ★enum キー biz_type に非 string は bad type（enum 検証より先）", has(e4, "bad type"), e4?.message ?? "通ってしまった");
      const e5 = (await set(owner, { biz_type: "cabare" })).error;
      check("sp(⑤-5) ★biz_type 未知値は bad biz_type", has(e5, "bad biz_type"), e5?.message ?? "通ってしまった");
      const e6 = (await set(owner, { billing_mode: "split" })).error;
      check("sp(⑤-6) ★billing_mode 未知値は bad billing_mode", has(e6, "bad billing_mode"), e6?.message ?? "通ってしまった");
      const e7 = (await set(owner, { sys_norms: "true" })).error;
      check("sp(⑤-7) ★制度キー sys_norms に非 boolean は bad type", has(e7, "bad type"), e7?.message ?? "通ってしまった");`);
// ⑩-4 finally 後に setup_done が残っている
rep(`    check("sp(⑩-3) audit_logs の本 suite 行は 0", rows[0].n === 0, \`left \${rows[0].n}\`);`,
    `    check("sp(⑩-3) audit_logs の本 suite 行は 0", rows[0].n === 0, \`left \${rows[0].n}\`);
    check("sp(⑩-4) ★0147: finally 後も A1 の setup_done=true が残る（実行前からあるキーは absent 削除の対象外）", jsonOf(r).setup_done === true, JSON.stringify(jsonOf(r)));`);
// 末尾 console 文言
rep(`  console.log("店舗設定 setter(0144): 8 キー個別 / まとめ書き /`, `  console.log("店舗設定 setter(0144＋0147): 20 キー個別 / まとめ書き / enum 未知値・非 string / 制度キー非 boolean / setup_done 埋め戻し /`);
fs.writeFileSync(P, s);
console.log("patched", eol === "\r\n" ? "CRLF" : "LF");
