/*
 * verify:nox-store-profile — mig0144 set_store_profile（店舗設定の統合 setter・白名単 8 キー patch 型）の係留。
 *   ★mig0147（裁定269-1／270-3・2026-09-17）: 白名単 8→20 キー（biz_type／billing_mode＝enum text・setup_done＋sys_* 9＝boolean）。
 *     ①②⑨-2 を 20 キー化し、⑤ に enum 未知値（'bad biz_type'／'bad billing_mode'）・enum 非 string／制度キー非 boolean（'bad type'）、
 *     fx-2／⑩-4 に既存店の setup_done=true（0147 の埋め戻し・finally 後も残る）を追加。
 *   npm run verify:nox-store-profile（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *   走数外（f0 では 47 段目に連結）。
 *
 * 観点（相談役ブロック 2026-09-14 ①〜⑩）:
 *  ① owner で 8 キーを 1 つずつ書ける（name／short／ext_shimei_enabled／dohan_auto_hon／store_code／display_name／show_open_status／shift_cast_confirm）
 *  ② まとめ書き（8 キー同時）で全部反映
 *  ③ patch に無いキーは不変（列も settings_json の既存キーも）
 *  ④ 白名単外キー → bad key／空 patch・null・非 object（配列・文字列）→ bad patch
 *  ⑤ 型違い（name に数値・show_open_status に文字列）→ bad type
 *  ⑥ 長さ: name 空・空白のみ・51 字 → bad name／short 21 字 → bad short／store_code 21 字 → bad store_code／display_name 51 字 → bad display_name
 *  ⑦ short に空文字 → 列が null
 *  ⑧ 権限: manager・cast は forbidden／他 org の store（B1）は forbidden／anon は BLOCKED
 *  ⑨ audit_logs に action='set_store_profile' が成功 1 回につき 1 行・before/after のキーは patch に含まれたキーだけ
 *  ⑩ 後始末で元の値に戻し、列と settings_json のキー集合が実行前と一致
 *
 * fixture: A1 店。実行前の name／short／2 列／settings_json を控え、finally で **同じ RPC 経路**で元の値へ戻す。
 *   ★settings_json の 4 新規キーは RPC では削除できない（set のみ）。実行前に無かったキーだけ、
 *     値を RPC で既定へ戻した後に admin で `settings_json - keys` を 1 回だけ実行してキー集合を復元する（値の復元は RPC 経路）。
 *   audit_logs は開始時刻以降・org A・action='set_store_profile' のみ delete。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null | undefined, s: string) => !!e?.message?.includes(s);

// ★0147: 白名単 20 キー（既存 8＋enum 2＋boolean 10）。★0151（裁定287-4／289）: +slide_apply（enum text 'next'|'current'）＝21 キー。
// ★0154（裁定294-7）: +settlement_presets（配列 ≤10・要素 {code,name,amount,basis,target}）＝22 キー（KEYS には足さない＝形が配列のため sp(⑤-10) で個別に係留）
const NEW_ENUM = ["biz_type", "billing_mode", "slide_apply"] as const;
const NEW_BOOL = ["setup_done", "sys_hourly", "sys_backs", "sys_sales_rate", "sys_points", "sys_sales_slide", "sys_point_slide", "sys_norms", "sys_penalties", "sys_bonus"] as const;
const KEYS = ["name", "short", "ext_shimei_enabled", "dohan_auto_hon", "store_code", "display_name", "show_open_status", "shift_cast_confirm", ...NEW_ENUM, ...NEW_BOOL] as const;
const JSON_KEYS = ["store_code", "display_name", "show_open_status", "shift_cast_confirm", ...NEW_ENUM, ...NEW_BOOL] as const;
type Row = { name: string; short: string | null; ext_shimei_enabled: boolean; dohan_auto_hon: boolean; settings_json: Record<string, unknown> };
const SEL = "name, short, ext_shimei_enabled, dohan_auto_hon, settings_json";

async function main() {
  const t0 = new Date().toISOString();
  const mk = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = mk();
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = mk();
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const cast = await signIn("castA1a");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sB1 } = await admin.from("stores").select("id").eq("name", STORE_B1).single();
  const storeA1 = sA1!.id as string, orgA = sA1!.org_id as string, storeB1 = sB1!.id as string;
  const read = async (): Promise<Row> => (await admin.from("stores").select(SEL).eq("id", storeA1).single()).data as Row;
  const set = (c: ReturnType<typeof mk>, patch: unknown, store = storeA1) => c.rpc("set_store_profile", { p_store_id: store, p_patch: patch });
  const row0 = await read();
  const keys0 = Object.keys(row0.settings_json ?? {}).sort();
  const jsonOf = (r: Row) => (r.settings_json ?? {}) as Record<string, unknown>;
  let okCalls = 0; // 成功した RPC 呼び出し数（⑨ の期待）

  async function teardown() {
    // 値は同じ RPC 経路で戻す（列 4＋json 4）
    const back: Record<string, unknown> = {
      name: row0.name, short: row0.short ?? "", ext_shimei_enabled: row0.ext_shimei_enabled, dohan_auto_hon: row0.dohan_auto_hon,
      store_code: typeof jsonOf(row0).store_code === "string" ? jsonOf(row0).store_code : "",
      display_name: typeof jsonOf(row0).display_name === "string" ? jsonOf(row0).display_name : "",
      show_open_status: jsonOf(row0).show_open_status === true,
      shift_cast_confirm: jsonOf(row0).shift_cast_confirm === true,
      // ★0147: boolean 10 は実行前値（無ければ false を書いた後に下の absent 削除でキーごと消す）・enum 2 は実行前にあったときだけ戻す
      ...Object.fromEntries(NEW_BOOL.map((k) => [k, jsonOf(row0)[k] === true])),
      ...Object.fromEntries(NEW_ENUM.filter((k) => typeof jsonOf(row0)[k] === "string").map((k) => [k, jsonOf(row0)[k]])),
    };
    const { error } = await set(owner, back);
    if (error) console.error(`[store-profile teardown] set_store_profile 復元: ${error.message}`);
    // 実行前に無かった json キーだけ落としてキー集合を復元（値の復元は上の RPC・ここはキー削除のみ）
    const absent = JSON_KEYS.filter((k) => !(k in jsonOf(row0)));
    if (absent.length) await db.query(`update public.stores set settings_json = settings_json - $2::text[] where id = $1`, [storeA1, absent]);
    await db.query(`delete from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile'`, [orgA, t0]);
  }

  try {
    check("sp(fx) 準備: A1 の実行前値を控えた（name 非空）", typeof row0.name === "string" && row0.name.length > 0, JSON.stringify(row0));
    check("sp(fx-2) ★0147 埋め戻し: 既存店 A1 の settings_json.setup_done が true（貼付時の UPDATE）", jsonOf(row0).setup_done === true, JSON.stringify(jsonOf(row0)));

    // ── ① 1 キーずつ ──
    const one: Array<[typeof KEYS[number], unknown, (r: Row) => unknown]> = [
      ["name", "NOX-VERIFY-A1 改", (r) => r.name],
      ["short", "A1改", (r) => r.short],
      ["ext_shimei_enabled", true, (r) => r.ext_shimei_enabled],
      ["dohan_auto_hon", true, (r) => r.dohan_auto_hon],
      ["store_code", "A1-CODE", (r) => jsonOf(r).store_code],
      ["display_name", "検証A1 表示名", (r) => jsonOf(r).display_name],
      ["show_open_status", true, (r) => jsonOf(r).show_open_status],
      ["shift_cast_confirm", true, (r) => jsonOf(r).shift_cast_confirm],
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
      // ★0151: slide_apply（enum text）
      ["slide_apply", "next", (r) => jsonOf(r).slide_apply],
    ];
    // ★0154（裁定294-7）sp(⑤-10): settlement_presets＝配列 ≤10・要素の形（欠損キー・target 4 値・amount 整数 ≥0）・'bad type'・空配列可
    {
      const presets = [{ code: "late", name: "遅刻", amount: 0, basis: "契約 §5", target: "late" }, { code: "absent", name: "当欠", amount: 0, basis: "契約 §5", target: "absent" }, { code: "early", name: "早退", amount: 0, basis: "契約 §5", target: "early" }];
      const e1 = (await set(owner, { settlement_presets: presets })).error;
      const j1 = jsonOf(await read());
      const bad = [
        { settlement_presets: Array.from({ length: 11 }, (_, i) => ({ ...presets[0], code: "c" + i })) },
        { settlement_presets: [{ code: "x", name: "x", amount: 0, basis: "x" }] },
        { settlement_presets: [{ ...presets[0], target: "x" }] },
        { settlement_presets: [{ ...presets[0], amount: -1 }] },
        { settlement_presets: [{ ...presets[0], amount: 1.5 }] },
        { settlement_presets: { code: "x" } },
        { settlement_presets: [{ ...presets[0], code: " " }] },
      ];
      const badRes: string[] = [];
      for (const p of bad) badRes.push((await set(owner, p)).error?.message ?? "(通った)");
      const e2 = (await set(owner, { settlement_presets: [] })).error;
      if (!e1 && !e2) okCalls += 2;
      check("sp(⑤-10) ★0154 settlement_presets: 3 件受理（保存 3・要素の形が保たれる）・11 件／target 欠落／target 'x'／負／小数／非配列／code 空は 'bad type'・空配列可", !e1 && Array.isArray(j1.settlement_presets) && (j1.settlement_presets as unknown[]).length === 3 && badRes.every((m) => m.includes("bad type")) && !e2, `${e1?.message ?? "ok"} / ${badRes.join(" / ")} / ${e2?.message ?? "ok"}`);
    }
    for (const [k, v, get] of one) {
      const { error } = await set(owner, { [k]: v });
      if (!error) okCalls++;
      const r = await read();
      check(`sp(①) owner が ${k} だけを書ける → 反映`, !error && get(r) === v, error?.message ?? JSON.stringify(get(r)));
    }
    // ⑨ 用: 直前の 1 キー呼び出し（shift_cast_confirm）の audit 行
    {
      const { rows } = await db.query(`select before_json as b, after_json as a, target, store_id from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile' order by at desc limit 1`, [orgA, t0]);
      const b = rows[0]?.b ?? {}, a = rows[0]?.a ?? {};
      check("sp(⑨-1) ★1 キー呼び出しの audit: before/after のキーは patch のキーだけ（★0151: 末尾は slide_apply・before ''（未設定＝RPC は '' を控える）→after 'next'）",
        rows.length === 1 && Object.keys(b).join() === "slide_apply" && Object.keys(a).join() === "slide_apply" && (b.slide_apply === "" || b.slide_apply === null) && a.slide_apply === "next"
          && rows[0].target === `stores:${storeA1}` && rows[0].store_id === storeA1, JSON.stringify(rows[0]));
    }

    // ── ② まとめ書き ──
    const all = { name: "NOX-VERIFY-A1 改2", short: "A1b", ext_shimei_enabled: false, dohan_auto_hon: false, store_code: "C2", display_name: "D2", show_open_status: false, shift_cast_confirm: false,
      // ★0147: 12 キー（enum は別値・boolean は ① と逆）
      biz_type: "lounge", billing_mode: "table", setup_done: true, sys_hourly: false, sys_backs: false, sys_sales_rate: false, sys_points: false, sys_sales_slide: false, sys_point_slide: false, sys_norms: false, sys_penalties: false, sys_bonus: false,
      slide_apply: "current" }; // ★0151
    const NEW_ALL_OK = (j: Record<string, unknown>) => j.biz_type === "lounge" && j.billing_mode === "table" && j.slide_apply === "current" && j.setup_done === true && NEW_BOOL.slice(1).every((k) => j[k] === false);
    {
      const { error } = await set(owner, all);
      if (!error) okCalls++;
      const r = await read();
      const j = jsonOf(r);
      check("sp(②) ★21 キーまとめ書きで全部反映（★0147＋0151 slide_apply）", !error && r.name === all.name && r.short === all.short && r.ext_shimei_enabled === false && r.dohan_auto_hon === false
        && j.store_code === "C2" && j.display_name === "D2" && j.show_open_status === false && j.shift_cast_confirm === false && NEW_ALL_OK(j), error?.message ?? JSON.stringify(r));
      const { rows } = await db.query(`select before_json as b, after_json as a from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile' order by at desc limit 1`, [orgA, t0]);
      check("sp(⑨-2) まとめ書きの audit: before/after とも 21 キー（★0147: 8→20・★0151: 21）", rows.length === 1 && Object.keys(rows[0].b).length === 21 && Object.keys(rows[0].a).length === 21, JSON.stringify(rows[0]));
    }

    // ── ③ patch に無いキーは不変 ──
    {
      const before = await read();
      const { error } = await set(owner, { store_code: "C3" });
      if (!error) okCalls++;
      const after = await read();
      const jb = { ...jsonOf(before) }, ja = { ...jsonOf(after) };
      delete jb.store_code; delete ja.store_code;
      check("sp(③) ★store_code だけの patch: 列 4 つと settings_json の他キー（既存キー含む）は不変・store_code のみ C3",
        !error && jsonOf(after).store_code === "C3" && JSON.stringify(jb) === JSON.stringify(ja)
          && after.name === before.name && after.short === before.short && after.ext_shimei_enabled === before.ext_shimei_enabled && after.dohan_auto_hon === before.dohan_auto_hon,
        error?.message ?? JSON.stringify({ before, after }));
      check("sp(③-2) 実行前からあった settings_json のキーは残っている", keys0.every((k) => k in jsonOf(after)), `keys0=${keys0.join(",")} now=${Object.keys(jsonOf(after)).join(",")}`);
    }

    // ── ④ 白名単外・bad patch ──
    {
      const e1 = (await set(owner, { foo: 1 })).error;
      check("sp(④-1) 白名単外キー foo は bad key", has(e1, "bad key"), e1?.message ?? "通ってしまった");
      const e2 = (await set(owner, { name: "x", foo: 1 })).error;
      check("sp(④-2) 正しいキーに白名単外キーが混ざっても bad key（黙って無視しない）", has(e2, "bad key"), e2?.message ?? "通ってしまった");
      const e3 = (await set(owner, {})).error;
      check("sp(④-3) 空 patch は bad patch", has(e3, "bad patch"), e3?.message ?? "通ってしまった");
      const e4 = (await set(owner, null)).error;
      check("sp(④-4) null は bad patch", has(e4, "bad patch"), e4?.message ?? "通ってしまった");
      const e5 = (await set(owner, [1, 2])).error;
      check("sp(④-5) 配列は bad patch", has(e5, "bad patch"), e5?.message ?? "通ってしまった");
      const e6 = (await set(owner, "x")).error;
      check("sp(④-6) 文字列は bad patch", has(e6, "bad patch"), e6?.message ?? "通ってしまった");
      const e7 = (await set(owner, { sys_unknown: true })).error;
      check("sp(④-7) ★0147 後も白名単外キー（sys_unknown）は従来どおり bad key", has(e7, "bad key"), e7?.message ?? "通ってしまった");
    }

    // ── ⑤ 型違い ──
    {
      const e1 = (await set(owner, { name: 1 })).error;
      check("sp(⑤-1) name に数値は bad type", has(e1, "bad type"), e1?.message ?? "通ってしまった");
      const e2 = (await set(owner, { show_open_status: "true" })).error;
      check("sp(⑤-2) show_open_status に文字列は bad type", has(e2, "bad type"), e2?.message ?? "通ってしまった");
      const e3 = (await set(owner, { ext_shimei_enabled: 1 })).error;
      check("sp(⑤-3) ext_shimei_enabled に数値は bad type", has(e3, "bad type"), e3?.message ?? "通ってしまった");
      // ★0147
      const e4 = (await set(owner, { biz_type: 1 })).error;
      check("sp(⑤-4) ★enum キー biz_type に非 string は bad type（enum 検証より先）", has(e4, "bad type"), e4?.message ?? "通ってしまった");
      const e5 = (await set(owner, { biz_type: "cabare" })).error;
      check("sp(⑤-5) ★biz_type 未知値は bad biz_type", has(e5, "bad biz_type"), e5?.message ?? "通ってしまった");
      const e6 = (await set(owner, { billing_mode: "split" })).error;
      check("sp(⑤-6) ★billing_mode 未知値は bad billing_mode", has(e6, "bad billing_mode"), e6?.message ?? "通ってしまった");
      const e7 = (await set(owner, { sys_norms: "true" })).error;
      check("sp(⑤-7) ★制度キー sys_norms に非 boolean は bad type", has(e7, "bad type"), e7?.message ?? "通ってしまった");
      // ★0151（裁定287-4）: slide_apply は 'next'|'current' のみ・非 string は bad type
      const e8 = (await set(owner, { slide_apply: "x" })).error;
      check("sp(⑤-8) ★slide_apply 未知値は bad slide_apply（0151）", has(e8, "bad slide_apply"), e8?.message ?? "通ってしまった");
      const e9 = (await set(owner, { slide_apply: 1 })).error;
      check("sp(⑤-9) ★slide_apply に非 string は bad type（0151）", has(e9, "bad type"), e9?.message ?? "通ってしまった");
    }

    // ── ⑥ 長さ ──
    {
      const e1 = (await set(owner, { name: "" })).error;
      const e2 = (await set(owner, { name: "   " })).error;
      const e3 = (await set(owner, { name: "あ".repeat(51) })).error;
      const ok50 = (await set(owner, { name: "あ".repeat(50) })).error; if (!ok50) okCalls++;
      check("sp(⑥-1) name 空・空白のみ・51 字は bad name（50 字は通る）", has(e1, "bad name") && has(e2, "bad name") && has(e3, "bad name") && !ok50,
        [e1, e2, e3, ok50].map((e) => e?.message ?? "ok").join(" / "));
      const e4 = (await set(owner, { short: "あ".repeat(21) })).error;
      check("sp(⑥-2) short 21 字は bad short", has(e4, "bad short"), e4?.message ?? "通ってしまった");
      const e5 = (await set(owner, { store_code: "a".repeat(21) })).error;
      check("sp(⑥-3) store_code 21 字は bad store_code", has(e5, "bad store_code"), e5?.message ?? "通ってしまった");
      const e6 = (await set(owner, { display_name: "あ".repeat(51) })).error;
      check("sp(⑥-4) display_name 51 字は bad display_name", has(e6, "bad display_name"), e6?.message ?? "通ってしまった");
      const rNow = await read();
      check("sp(⑥-5) 拒否された呼び出しは何も書かない（short／store_code／display_name は直前の値のまま）",
        rNow.short === "A1b" && jsonOf(rNow).store_code === "C3" && jsonOf(rNow).display_name === "D2", JSON.stringify(rNow));
    }

    // ── ⑦ short 空文字 → null ──
    {
      const { error } = await set(owner, { short: "" });
      if (!error) okCalls++;
      const r = await read();
      check("sp(⑦) ★short に空文字 → 列が null", !error && r.short === null, error?.message ?? JSON.stringify(r.short));
      const { rows } = await db.query(`select before_json as b, after_json as a from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile' order by at desc limit 1`, [orgA, t0]);
      check("sp(⑨-3) short の audit: before 'A1b' → after null（キーは short だけ）", rows.length === 1 && Object.keys(rows[0].b).join() === "short" && rows[0].b.short === "A1b" && rows[0].a.short === null, JSON.stringify(rows[0]));
    }

    // ── ⑧ 権限 ──
    {
      const eM = (await set(mgr, { name: "x" })).error;
      check("sp(⑧-1) ★manager は forbidden（owner 限定）", has(eM, "forbidden"), eM?.message ?? "通ってしまった");
      const eC = (await set(cast, { name: "x" })).error;
      check("sp(⑧-2) ★cast は forbidden", has(eC, "forbidden"), eC?.message ?? "通ってしまった");
      const eB = (await set(owner, { name: "x" }, storeB1)).error;
      check("sp(⑧-3) ★他 org の store（B1）は forbidden", has(eB, "forbidden"), eB?.message ?? "通ってしまった");
      const eA = (await set(anon, { name: "x" })).error;
      check("sp(⑧-4) anon は BLOCKED（permission denied for function）", has(eA, "permission denied for function"), eA?.message ?? "通ってしまった");
      const rB = (await admin.from("stores").select("name").eq("id", storeB1).single()).data;
      check("sp(⑧-5) B1 の name は不変", rB?.name === STORE_B1, String(rB?.name));
    }

    // ── ⑨ audit 行数 ──
    {
      const { rows } = await db.query(`select count(*)::int as n from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile'`, [orgA, t0]);
      check(`sp(⑨-4) ★audit_logs の set_store_profile 行数 = 成功呼び出し数（${okCalls}）＝拒否は残さない`, rows[0].n === okCalls, `got ${rows[0].n}`);
    }
  } finally {
    await teardown();
  }
  // ── ⑩ 後始末 ──
  {
    // ★0154（sp(⑤-10)）: settlement_presets キーは setter では消せない（白名単の値を書くだけ）＝admin で実行前の settings_json に戻してからキー集合を比べる
    await admin.from("stores").update({ settings_json: jsonOf(row0) }).eq("id", storeA1);
    const r = await read();
    check("sp(⑩-1) ★列 4 つが実行前の値へ復元（RPC 経路）", r.name === row0.name && r.short === row0.short && r.ext_shimei_enabled === row0.ext_shimei_enabled && r.dohan_auto_hon === row0.dohan_auto_hon, JSON.stringify({ row0, r }));
    check("sp(⑩-2) ★settings_json のキー集合と値が実行前と一致", JSON.stringify(jsonOf(r)) === JSON.stringify(jsonOf(row0)) && Object.keys(jsonOf(r)).sort().join() === keys0.join(), JSON.stringify({ before: jsonOf(row0), after: jsonOf(r) }));
    const { rows } = await db.query(`select count(*)::int as n from public.audit_logs where org_id = $1 and at >= $2 and action = 'set_store_profile'`, [orgA, t0]);
    check("sp(⑩-3) audit_logs の本 suite 行は 0", rows[0].n === 0, `left ${rows[0].n}`);
    check("sp(⑩-4) ★0147: finally 後も A1 の setup_done=true が残る（実行前からあるキーは absent 削除の対象外）", jsonOf(r).setup_done === true, JSON.stringify(jsonOf(r)));
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-store-profile ALL PASS (${pass} assertions)`);
  console.log("店舗設定 setter(0144＋0147＋0151): 21 キー個別 / まとめ書き / enum 未知値・非 string / 制度キー非 boolean / setup_done 埋め戻し / 無いキー不変 / bad key・bad patch / bad type / 長さ 4 種 / short 空→null / manager・cast・他 org forbidden＋anon BLOCKED / audit 1 行=1 呼び出し・キーは patch 分だけ / 復元");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
