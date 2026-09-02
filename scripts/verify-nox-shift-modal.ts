/*
 * verify:nox-shift-modal — 裁定112（mig0125）シフト作成モーダル v6 の器の係留。
 *   npm run verify:nox-shift-modal（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（設計書 v1 判断C/E/F）:
 *  (a) cast_unavailable_set/remove/list: owner/manager 可・他店 manager 拒否・upsert（同日再 set で
 *      reason 更新・行は増えない）・remove not found・remove 正常系・list bad range（逆転/93日超）
 *  (b) shift_set 不可ソフト拒否: 不可日 reason なし='unavailable'・reason あり=成功+override_reason 保存・
 *      不可でない日は reason 渡しても null 保存・update で不可でない日へ変更=reason null 化
 *  (c) 既存ガード残存: closed day ハード拒否・duplicate・旧6引数シグネチャの不存在（1本・pronargs=7）
 *  (d) shift_bulk_set_daily: 正常系（日別時刻）・skipped 3理由（closed/duplicate/unavailable）・
 *      dup date・63件 too many・空配列 no-op・不可日+reason=insert+override_reason 保存
 *  (e) RLS/grant 遮断: authenticated 実セッションの直接 select/insert が cast_unavailable_days に通らない
 *      （prosrc 緑≠実行時＝実 signIn で確認）
 *
 * 逆張り: SM_INVERT=1 で全 check の期待を反転＝全赤を実測（各 assert が落ち得ることの機械証明）。
 * fixture: NOX-VERIFY-sm* 命名・日付は 2031-05/2031-06 隔離・store A1 の business_hours は
 *   「dow=1∧is_closed」行を自浄（closed 行は CHECK で open/close null 必須＝マーカー不可。
 *   素の A1 は bh 0行が実測の姿で、閉行の残置は本スイート由来とみなせる）→snapshot→finally 復元。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const INV = process.env.SM_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// 2031-05 の曜日: 05-05/12=月・06/13=火・07/14=水・08/15=木・09/16=金・10=土
const DC = "2031-05-05";   // 月＝定休日（マーカー行で閉める）
const DC2 = "2031-05-12";  // 月＝定休日（bulk skip 用）
const D1 = "2031-05-06";   // 不可（reason テスト）
const D2 = "2031-05-07";   // 通常（a7 set→remove で最終的に不可でない）
const D3 = "2031-05-08";   // 通常（b4 移動先→duplicate）
const D4 = "2031-05-09"; const D5 = "2031-05-10"; const D6 = "2031-05-13"; // bulk 正常系
const D7 = "2031-05-14";   // 不可（bulk skip 用・owner が set）
const D8 = "2031-05-15";   // 不可（bulk+reason 用）
const D9 = "2031-05-16";   // bulk 混在の ok 行

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1");
  const owner = await signIn("ownerA");
  const mgrB = await signIn("managerB1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;

  const CAST = "NOX-VERIFY-smA";
  let castA = "";
  let bhSnapshot: Record<string, unknown>[] = [];

  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").eq("name", CAST);
    const ids = (cs ?? []).map((r) => r.id as string);
    if (ids.length) {
      await admin.from("shifts").delete().in("cast_id", ids);
      await admin.from("cast_unavailable_days").delete().in("cast_id", ids);
      const { error: eC } = await admin.from("casts").delete().in("id", ids);
      if (eC) console.error(`[sm teardown] casts delete 失敗（次 run 先頭で自浄）: ${eC.message}`);
    }
    // 本スイートが入れた定休日行（dow=1∧is_closed）を自浄（クラッシュ残置対応・素の A1 は bh 0行）
    await admin.from("store_business_hours").delete()
      .eq("store_id", storeA1).eq("dow", 1).eq("is_closed", true);
  }
  await teardown();

  // A1 の business_hours を snapshot（マーカー自浄後＝素の姿）→ finally で完全復元
  {
    const { data: bh } = await admin.from("store_business_hours")
      .select("org_id, store_id, dow, is_closed, open_hm, close_hm").eq("store_id", storeA1);
    bhSnapshot = (bh ?? []) as Record<string, unknown>[];
  }

  try {
    castA = (await admin.from("casts").insert({
      org_id: orgA, store_id: storeA1, name: CAST, is_active: true,
    }).select("id").single()).data!.id as string;
    // 月曜を定休日化（CHECK: closed 行は open/close null 必須）。既存 dow=1 行があれば upsert で置換
    const { error: eBh } = await admin.from("store_business_hours").upsert(
      { org_id: orgA, store_id: storeA1, dow: 1, is_closed: true, open_hm: null, close_hm: null },
      { onConflict: "store_id,dow" });
    if (eBh) throw new Error(`business_hours upsert: ${eBh.message}`);

    const unavailRows = async () =>
      (await admin.from("cast_unavailable_days").select("date, reason").eq("cast_id", castA).order("date")).data ?? [];
    const shiftOf = async (id: string) =>
      (await admin.from("shifts").select("date, start_hm, end_hm, override_reason").eq("id", id).single()).data as
        { date: string; start_hm: string; end_hm: string; override_reason: string | null } | null;

    // ══ (a) cast_unavailable_set / remove / list ══
    {
      const { data: u1, error: e1 } = await mgr.rpc("cast_unavailable_set", {
        p_cast_id: castA, p_date: D1, p_reason: "体調不良",
      });
      const { data: l1, error: eL1 } = await mgr.rpc("cast_unavailable_list", {
        p_cast_id: castA, p_from: "2031-05-01", p_to: "2031-05-31",
      });
      const rows1 = (l1 ?? []) as { date: string; reason: string | null }[];
      check("sm(a1) ★manager set→list に反映（date+reason）",
        !e1 && typeof u1 === "string" && !eL1
          && rows1.some((r) => r.date === D1 && r.reason === "体調不良"),
        e1?.message ?? eL1?.message ?? JSON.stringify(rows1));
      const { error: e2 } = await owner.rpc("cast_unavailable_set", { p_cast_id: castA, p_date: D7, p_reason: null });
      check("sm(a2) ★owner も set 可（reason null 可）", !e2, e2?.message);
      const { error: e3 } = await mgrB.rpc("cast_unavailable_set", { p_cast_id: castA, p_date: D1, p_reason: "x" });
      check("sm(a3) ★他店（他 org）manager は 'forbidden'", !!e3 && e3.message.includes("forbidden"),
        e3?.message ?? "通ってしまった");
      const { error: e4 } = await mgr.rpc("cast_unavailable_set", { p_cast_id: castA, p_date: D1, p_reason: "家庭の事情" });
      const rows4 = await unavailRows();
      check("sm(a4) ★同日再 set＝upsert（行は増えず reason 更新）",
        !e4 && rows4.filter((r) => r.date === D1).length === 1
          && rows4.find((r) => r.date === D1)?.reason === "家庭の事情",
        e4?.message ?? JSON.stringify(rows4));
      const { error: e5 } = await mgr.rpc("cast_unavailable_remove", { p_cast_id: castA, p_date: D2 });
      check("sm(a5) ★未宣言日の remove は 'not found'", !!e5 && e5.message.includes("not found"),
        e5?.message ?? "通ってしまった");
      // remove 正常系（D2 を set→remove＝以後の (b3) は「不可でない日」として使う）
      const { error: e6a } = await mgr.rpc("cast_unavailable_set", { p_cast_id: castA, p_date: D2, p_reason: "仮" });
      const { error: e6b } = await mgr.rpc("cast_unavailable_remove", { p_cast_id: castA, p_date: D2 });
      const rows6 = await unavailRows();
      check("sm(a6) ★remove 正常系＝行が消える", !e6a && !e6b && !rows6.some((r) => r.date === D2),
        e6a?.message ?? e6b?.message ?? JSON.stringify(rows6));
      const { error: e7a } = await mgr.rpc("cast_unavailable_list", { p_cast_id: castA, p_from: "2031-05-31", p_to: "2031-05-01" });
      const { error: e7b } = await mgr.rpc("cast_unavailable_list", { p_cast_id: castA, p_from: "2031-01-01", p_to: "2031-06-01" });
      check("sm(a7) ★list 範囲外（from>to／93日超）は 'bad range'",
        !!e7a && e7a.message.includes("bad range") && !!e7b && e7b.message.includes("bad range"),
        e7a?.message ?? e7b?.message ?? "通ってしまった");
    }

    // ══ (b) shift_set の不可ソフト拒否（判断F）══
    let shiftId1 = "";
    {
      const { error: e1 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castA, p_date: D1, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
      });
      check("sm(b1) ★不可日×reason なし＝'unavailable'（ソフト拒否）",
        !!e1 && e1.message.includes("unavailable"), e1?.message ?? "通ってしまった");
      const { data: s2, error: e2 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castA, p_date: D1, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
        p_override_reason: "本人了承済み",
      });
      shiftId1 = s2 as string;
      const row2 = await shiftOf(shiftId1);
      check("sm(b2) ★不可日×reason あり＝成功＋shifts.override_reason 保存",
        !e2 && row2?.override_reason === "本人了承済み", e2?.message ?? JSON.stringify(row2));
      const { data: s3, error: e3 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castA, p_date: D2, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
        p_override_reason: "ムダ理由",
      });
      const row3 = await shiftOf(s3 as string);
      check("sm(b3) ★不可でない日＝reason を渡しても null 保存（不可日のみの記録）",
        !e3 && row3?.override_reason === null, e3?.message ?? JSON.stringify(row3));
      const { error: e4 } = await mgr.rpc("shift_set", {
        p_id: shiftId1, p_cast_id: castA, p_date: D3, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
        p_override_reason: "本人了承済み",
      });
      const row4 = await shiftOf(shiftId1);
      check("sm(b4) ★update で不可でない日へ移動＝override_reason null 化",
        !e4 && row4?.date === D3 && row4?.override_reason === null, e4?.message ?? JSON.stringify(row4));
    }

    // ══ (c) 既存ガード残存＋旧シグネチャ不存在 ══
    {
      const { error: e1 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castA, p_date: DC, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
      });
      check("sm(c1) ★定休日は 'closed day' ハード拒否のまま（不可＝ソフトとの非対称）",
        !!e1 && e1.message.includes("closed day"), e1?.message ?? "通ってしまった");
      const { error: e2 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castA, p_date: D3, p_start_hm: "21:00", p_end_hm: "25:00", p_status: "planned",
      });
      check("sm(c2) ★同日既存は 'duplicate' のまま（1日1枠）",
        !!e2 && e2.message.includes("duplicate"), e2?.message ?? "通ってしまった");
      const { rows } = await db.query(
        `select count(*)::int as n,
                count(*) filter (where p.pronargs = 7)::int as n7
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = 'shift_set' and p.prokind = 'f'`);
      check("sm(c3) ★shift_set は7引数ちょうど1本（旧6引数の残骸なし＝オーバーロード増殖なし）",
        rows[0].n === 1 && rows[0].n7 === 1, JSON.stringify(rows[0]));
    }

    // ══ (d) shift_bulk_set_daily（判断C）══
    {
      const { data: r1, error: e1 } = await mgr.rpc("shift_bulk_set_daily", {
        p_cast_id: castA, p_items: [
          { date: D4, start_hm: "20:00", end_hm: "26:00" },
          { date: D5, start_hm: "21:00", end_hm: "25:00" },
          { date: D6, start_hm: "19:00", end_hm: "27:00" },
        ],
      });
      const res1 = r1 as { inserted: number; skipped: unknown[] } | null;
      const { data: d5row } = await admin.from("shifts").select("start_hm, end_hm")
        .eq("cast_id", castA).eq("date", D5).single();
      check("sm(d1) ★正常系＝日別時刻で3件 insert（D5 は 21:00〜25:00）",
        !e1 && res1?.inserted === 3 && (res1?.skipped ?? []).length === 0
          && d5row?.start_hm === "21:00" && d5row?.end_hm === "25:00",
        e1?.message ?? JSON.stringify({ res1, d5row }));
      const { data: r2, error: e2 } = await mgr.rpc("shift_bulk_set_daily", {
        p_cast_id: castA, p_items: [
          { date: DC2, start_hm: "20:00", end_hm: "26:00" },              // closed
          { date: D3, start_hm: "20:00", end_hm: "26:00" },               // duplicate（(b4) の行）
          { date: D7, start_hm: "20:00", end_hm: "26:00" },               // unavailable（reason なし）
          { date: D9, start_hm: "20:00", end_hm: "26:00" },               // ok
        ],
      });
      const res2 = r2 as { inserted: number; skipped: { date: string; reason: string }[] } | null;
      const reasonOf = (d: string) => res2?.skipped.find((s) => s.date === d)?.reason;
      check("sm(d2) ★skipped 3理由＝closed/duplicate/unavailable（ok 行だけ insert）",
        !e2 && res2?.inserted === 1 && res2?.skipped.length === 3
          && reasonOf(DC2) === "closed" && reasonOf(D3) === "duplicate" && reasonOf(D7) === "unavailable",
        e2?.message ?? JSON.stringify(res2));
      const { error: e3 } = await mgr.rpc("shift_bulk_set_daily", {
        p_cast_id: castA, p_items: [
          { date: "2031-05-17", start_hm: "20:00", end_hm: "26:00" },
          { date: "2031-05-17", start_hm: "21:00", end_hm: "25:00" },
        ],
      });
      check("sm(d3) ★同一 items 内の日付重複は 'dup date'（入力不正＝スキップにしない）",
        !!e3 && e3.message.includes("dup date"), e3?.message ?? "通ってしまった");
      const many = Array.from({ length: 63 }, (_, i) => ({
        date: new Date(Date.UTC(2031, 5, 1 + i)).toISOString().slice(0, 10),
        start_hm: "20:00", end_hm: "26:00",
      }));
      const { error: e4 } = await mgr.rpc("shift_bulk_set_daily", { p_cast_id: castA, p_items: many });
      check("sm(d4) ★63件は 'too many dates'（上限62）", !!e4 && e4.message.includes("too many dates"),
        e4?.message ?? "通ってしまった");
      const { data: r5, error: e5 } = await mgr.rpc("shift_bulk_set_daily", { p_cast_id: castA, p_items: [] });
      const res5 = r5 as { inserted: number; skipped: unknown[] } | null;
      check("sm(d5) ★空配列＝完全 no-op（inserted 0・skipped 空）",
        !e5 && res5?.inserted === 0 && (res5?.skipped ?? []).length === 0, e5?.message ?? JSON.stringify(res5));
      const { error: e6a } = await mgr.rpc("cast_unavailable_set", { p_cast_id: castA, p_date: D8, p_reason: "先約" });
      const { data: r6, error: e6 } = await mgr.rpc("shift_bulk_set_daily", {
        p_cast_id: castA, p_items: [{ date: D8, start_hm: "20:00", end_hm: "26:00", override_reason: "店舗都合" }],
      });
      const res6 = r6 as { inserted: number } | null;
      const { data: d8row } = await admin.from("shifts").select("override_reason")
        .eq("cast_id", castA).eq("date", D8).single();
      check("sm(d6) ★不可日＋override_reason＝insert＋shifts.override_reason 保存",
        !e6a && !e6 && res6?.inserted === 1 && d8row?.override_reason === "店舗都合",
        e6a?.message ?? e6?.message ?? JSON.stringify({ res6, d8row }));
    }

    // ══ (e) RLS/grant 遮断（実 signIn セッション＝prosrc 緑≠実行時の実測）══
    {
      const { error: eSel } = await mgr.from("cast_unavailable_days").select("id").limit(1);
      check("sm(e1) ★authenticated の直接 select は 'permission denied'（RPC 専用テーブル）",
        !!eSel && (eSel.message ?? "").includes("permission denied"), eSel?.message ?? "読めてしまった");
      const { error: eIns } = await mgr.from("cast_unavailable_days").insert({
        org_id: orgA, store_id: storeA1, cast_id: castA, date: "2031-05-20", reason: "直insert",
      });
      check("sm(e2) ★authenticated の直接 insert は 'permission denied'",
        !!eIns && (eIns.message ?? "").includes("permission denied"), eIns?.message ?? "書けてしまった");
    }
  } finally {
    await teardown();
    // business_hours を素の姿へ完全復元（マーカーは teardown が消す・snapshot にあった行は書き戻す）
    for (const row of bhSnapshot) {
      await admin.from("store_business_hours").upsert(row, { onConflict: "store_id,dow" });
    }
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（SM_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-shift-modal ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
