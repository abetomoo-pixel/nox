/*
 * verify:nox-shift-deep — SD シフト深部（mig0101/0102）の runtime 検証＝段59。
 *   npm run verify:nox-shift-deep（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * 正本: docs/tmp/NOX_SD設計書v1.md（sha 04621547…6796）§3 RPC 8本／SD-8（apply/clear 原子・入替型）／
 *       SD-9（1日1枠は純関数＋RPC ガード＝DB 制約はパーク）。
 *
 * ★prosrc 緑 ≠ 実行成功（設計書 §6）＝verify ハーネスの実 signIn で一巡を runtime 検証する:
 *  1 period CRUD: draft 作成→bad range/bad status→open へ update
 *  2 propose: planned→proposed 一括・二重 propose は 'bad rows'（集計拒否＝内容非開示）
 *  3 cast_confirm: proposed→confirmed 一方向。他人の行=forbidden・planned 行=bad status・二重=bad status
 *  4 auto_apply 一巡: 空配列=完全 no-op（0件・削除なし）→ wish 2件 apply → 再 apply で入替
 *    （旧 auto 削除＋wish pending 復元→再 accept＝★部分ユニーク shifts_wish_id_uidx と衝突しないことの実証）
 *    → period_remove は 'period in use'（auto 行が参照）→ auto_clear で全復元。
 *    manual 行（confirmed/planned）は一巡の間 1行も動かない＝auto∧planned のみ対象（SD-8）
 *  5 published 拒否: apply が 'period published'
 *  6 rules_set: upsert（同 store 同 id）・null=無制限・bad consec
 *  7 復元 assert: 生成物を全消しし、shifts/shift_wishes/shift_periods/shift_rules の対象範囲カウントが
 *    開始時と一致（固定カウント非汚染＝verify:nox-rls と同じ流儀）
 *  8 golden: forecastDay 55233（写経1本＝DB 操作が労務予測の純関数に波及していないことの直接確認。
 *    正本のドリフト検出は verify:nox-labor-forecast 26 が担う。wage 5931 ほかは verify:f0 連鎖で同 run 担保）
 *
 * 日付は 2026-09 の水曜3本（D1=09-09/D2=09-16/D3=09-23）＝rls の 07-15（水・営業日実証済み）と同曜日・
 * 既存 fixture（07-15/07-20）と非衝突。生成物は finally で admin 全消し。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { forecastDay, type ForecastComp } from "../lib/nox/labor-forecast";
import type { CompPlan } from "../lib/nox/pay";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

const D1 = "2026-09-09"; // 水
const D2 = "2026-09-16"; // 水
const D3 = "2026-09-23"; // 水
// ★0103 追随の専用日付（すべて 09 月 period 内・wipe 対象）
const D4 = "2026-09-24"; // 木（bulk の重複正規化用）
const D5 = "2026-09-21"; // 月（bulk の定休日スキップ用＝一時 bh 行 dow=1 を立てて検証）
const D_OUT = "2026-10-15"; // open 期間の外（wish_submit period_not_open 用）
const P2_START = "2026-11-01"; // overlap 検証用の別期間
const P2_END = "2026-11-30";
const P_START = "2026-09-01";
const P_END = "2026-09-30";

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };

  // fixture 解決
  const { data: storeRow } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1Id = storeRow!.id as string;
  const castIdOf = async (key: "castA1a" | "castA1b") =>
    (await admin.from("casts").select("id").eq("name", FIXTURE_USERS[key].name).eq("store_id", storeA1Id).single()).data!.id as string;
  const castIdA = await castIdOf("castA1a");
  const castIdB = await castIdOf("castA1b"); // 0103 追加段（bulk_set の対象）

  // 再実行冪等: 前 run の残骸を掃除（専用日付・専用 period 範囲・rules は store 単位）
  const wipe = async () => {
    await admin.from("attendance").delete().eq("store_id", storeA1Id).in("date", [D1, D2, D3, D4, D5]); // 0103: 段59-15 の一時 attendance
    await admin.from("shifts").delete().eq("store_id", storeA1Id).in("date", [D1, D2, D3, D4, D5]);
    await admin.from("shift_wishes").delete().eq("store_id", storeA1Id).in("date", [D1, D2, D3, D4, D5, D_OUT]);
    // ★常設 fixture（open 2026-07-01〜31＝seed:f0）は消さない＝start_date 限定 delete を維持
    await admin.from("shift_periods").delete().eq("store_id", storeA1Id).eq("start_date", P_START);
    await admin.from("shift_periods").delete().eq("store_id", storeA1Id).eq("start_date", P2_START); // 0103: overlap 検証の別期間
    await admin.from("shift_rules").delete().eq("store_id", storeA1Id);
    await admin.from("store_business_hours").delete().eq("store_id", storeA1Id).eq("dow", 1); // 0103: 段59-16 の一時定休日
  };
  await wipe();

  // 開始時カウント（復元 assert の基準・admin＝RLS 非依存）
  const countOf = async (tbl: string) =>
    (await admin.from(tbl).select("id", { count: "exact", head: true }).eq("store_id", storeA1Id)).count ?? -1;
  const base = {
    shifts: await countOf("shifts"),
    wishes: await countOf("shift_wishes"),
    periods: await countOf("shift_periods"),
    rules: await countOf("shift_rules"),
  };

  let periodId = ""; let sid1 = ""; let sid2 = ""; let w1 = ""; let w2 = "";
  try {
    // ══ 1 period CRUD（managerA1）══
    const mgr = await signIn("managerA1");
    {
      const { error: eBad } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: P_END, p_end_date: P_START, p_wish_deadline: null, p_status: "draft",
      });
      check("段59-1 start>end = bad range", has(eBad, "bad range"), eBad?.message ?? "通ってしまった");
      const { error: eSt } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: P_START, p_end_date: P_END, p_wish_deadline: null, p_status: "collecting",
      });
      check("段59-1 未知 status = bad status", has(eSt, "bad status"), eSt?.message ?? "通ってしまった");
      const { data: pid, error: eP } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: P_START, p_end_date: P_END, p_wish_deadline: "2026-09-05", p_status: "draft",
      });
      check("段59-1 period 作成（draft）成功", !eP && typeof pid === "string", eP?.message);
      periodId = (pid as string) ?? "";
      const { error: eU } = await mgr.rpc("shift_period_set", {
        p_id: periodId, p_store_id: storeA1Id, p_start_date: P_START, p_end_date: P_END, p_wish_deadline: "2026-09-05", p_status: "open",
      });
      const { data: pRow } = await mgr.from("shift_periods").select("status, wish_deadline").eq("id", periodId).single();
      check("段59-1 update 経路で open へ（wish_deadline 保持）", !eU && pRow?.status === "open" && pRow?.wish_deadline === "2026-09-05",
        eU?.message ?? JSON.stringify(pRow));
    }

    // ══ 2 propose（planned→proposed・二重は bad rows）══
    {
      const { data: s1 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castIdA, p_date: D1, p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned",
      });
      sid1 = s1 as string;
      check("段59-2 shift_set(planned) 成功", typeof sid1 === "string" && sid1.length > 0);
      const { data: n1, error: ePr } = await mgr.rpc("shift_propose", { p_shift_ids: [sid1, sid1] });
      check("段59-2 propose 重複 ids は除去され 1件（設計書 §3）", !ePr && n1 === 1, ePr?.message ?? `got ${n1}`);
      const { data: sRow } = await mgr.from("shifts").select("status, source").eq("id", sid1).single();
      check("段59-2 行が proposed（source=manual のまま）", sRow?.status === "proposed" && sRow?.source === "manual", JSON.stringify(sRow));
      const { error: ePr2 } = await mgr.rpc("shift_propose", { p_shift_ids: [sid1] });
      check("段59-2 二重 propose = bad rows（planned でない）", has(ePr2, "bad rows"), ePr2?.message ?? "通ってしまった");
    }

    // ══ 3 cast_confirm（一方向・本人限定）══
    {
      const cb = await signIn("castA1b");
      const { error: eOther } = await cb.rpc("shift_cast_confirm", { p_shift_id: sid1 });
      check("段59-3 他人の行 = forbidden", has(eOther, "forbidden"), eOther?.message ?? "通ってしまった");
      await cb.auth.signOut();

      const ca = await signIn("castA1a");
      const { data: cid, error: eCf } = await ca.rpc("shift_cast_confirm", { p_shift_id: sid1 });
      check("段59-3 ★本人の proposed→confirmed 成功（runtime）", !eCf && cid === sid1, eCf?.message);
      const { data: after } = await ca.from("shifts").select("status").eq("id", sid1).single();
      check("段59-3 status=confirmed を実測", after?.status === "confirmed", after?.status);
      const { error: eDup } = await ca.rpc("shift_cast_confirm", { p_shift_id: sid1 });
      check("段59-3 二重実行 = bad status（confirmed は再確認不可）", has(eDup, "bad status"), eDup?.message ?? "通ってしまった");

      const { data: s2 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castIdA, p_date: D2, p_start_hm: "20:00", p_end_hm: "25:00", p_status: "planned",
      });
      sid2 = s2 as string;
      const { error: ePl } = await ca.rpc("shift_cast_confirm", { p_shift_id: sid2 });
      check("段59-3 planned 行 = bad status（proposed のみ確認可＝一方向）", has(ePl, "bad status"), ePl?.message ?? "通ってしまった");
      await ca.auth.signOut();
    }

    // ══ 4 auto_apply 一巡（SD-8: 入替型・原子・manual 保持）══
    {
      // 空配列＝完全 no-op（0件・削除なし）
      const preCnt = await countOf("shifts");
      const { data: n0, error: e0 } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [] });
      check("段59-4 空配列 = 0（no-op）", !e0 && n0 === 0, e0?.message ?? `got ${n0}`);
      check("段59-4 空配列で削除なし（行数不変）", (await countOf("shifts")) === preCnt);

      // wish 2件（castA1a/castA1b のセルフ提出）
      const ca = await signIn("castA1a");
      const { data: wa } = await ca.rpc("shift_wish_submit", { p_date: D3, p_start_hm: "20:00", p_end_hm: "26:00" });
      w1 = wa as string;
      await ca.auth.signOut();
      const cb = await signIn("castA1b");
      const { data: wb } = await cb.rpc("shift_wish_submit", { p_date: D3, p_start_hm: "21:00", p_end_hm: "25:00" });
      w2 = wb as string;
      await cb.auth.signOut();
      check("段59-4 wish 2件提出", typeof w1 === "string" && typeof w2 === "string" && w1 !== w2);

      // apply（2件）→ auto 行2・wish accepted・wish_id 来歴・period_id 付与
      const { data: n2, error: eA } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [w1, w2] });
      check("段59-4 apply(w1,w2) = 2", !eA && n2 === 2, eA?.message ?? `got ${n2}`);
      const { data: autoRows } = await mgr.from("shifts")
        .select("wish_id, status, source, period_id, date").eq("store_id", storeA1Id).eq("source", "auto").eq("date", D3);
      check("段59-4 auto 行2（planned/auto/period_id/wish_id 来歴）",
        (autoRows ?? []).length === 2
        && autoRows!.every((r) => r.status === "planned" && r.period_id === periodId)
        && new Set(autoRows!.map((r) => r.wish_id)).size === 2,
        JSON.stringify(autoRows));
      const { data: wRows } = await mgr.from("shift_wishes").select("id, status").in("id", [w1, w2]);
      check("段59-4 wish 2件とも accepted", (wRows ?? []).length === 2 && wRows!.every((r) => r.status === "accepted"), JSON.stringify(wRows));

      // period_remove は参照ありで拒否
      const { error: eInUse } = await mgr.rpc("shift_period_remove", { p_id: periodId });
      check("段59-4 period_remove = period in use（auto 行が参照）", has(eInUse, "period in use"), eInUse?.message ?? "通ってしまった");

      // 再 apply で入替（w1 のみ）＝旧 auto 削除→wish pending 復元→w1 再 accept。
      // ★同じ w1 の wish_id を持つ行が delete→insert される＝部分ユニーク shifts_wish_id_uidx と
      //   衝突しないこと（SD-8 の原子入替）の実証。
      const { data: n3, error: eR } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [w1] });
      check("段59-4 ★再 apply(w1) = 1（入替・部分ユニーク衝突なし）", !eR && n3 === 1, eR?.message ?? `got ${n3}`);
      const { data: after1 } = await mgr.from("shifts").select("wish_id").eq("store_id", storeA1Id).eq("source", "auto").eq("date", D3);
      check("段59-4 auto 行1（wish_id=w1）", (after1 ?? []).length === 1 && after1![0].wish_id === w1, JSON.stringify(after1));
      const { data: w2Row } = await mgr.from("shift_wishes").select("status, decided_by, decided_at").eq("id", w2).single();
      check("段59-4 ★w2 が pending へ復元（decided_* も null）",
        w2Row?.status === "pending" && w2Row?.decided_by === null && w2Row?.decided_at === null, JSON.stringify(w2Row));

      // auto_clear で全復元
      const { data: nC, error: eC } = await mgr.rpc("shift_auto_clear", { p_period_id: periodId });
      check("段59-4 auto_clear = 1", !eC && nC === 1, eC?.message ?? `got ${nC}`);
      const { data: after0 } = await mgr.from("shifts").select("id").eq("store_id", storeA1Id).eq("source", "auto").eq("date", D3);
      check("段59-4 auto 行0", (after0 ?? []).length === 0, `got ${(after0 ?? []).length}`);
      const { data: w1Row } = await mgr.from("shift_wishes").select("status").eq("id", w1).single();
      check("段59-4 w1 も pending へ復元", w1Row?.status === "pending", w1Row?.status);

      // manual 行は一巡の間 1行も動かない（SD-8: auto∧planned のみ対象）
      const { data: manualRows } = await mgr.from("shifts").select("id, status").in("id", [sid1, sid2]);
      check("段59-4 ★manual 行2本が無傷（confirmed/planned 保持）",
        (manualRows ?? []).length === 2
        && manualRows!.some((r) => r.id === sid1 && r.status === "confirmed")
        && manualRows!.some((r) => r.id === sid2 && r.status === "planned"),
        JSON.stringify(manualRows));
    }

    // ══ 10 ★0103 period overlap（insert・update 両方＋常設 fixture への被せ）══
    {
      const { error: eOv1 } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: "2026-09-15", p_end_date: "2026-10-05", p_wish_deadline: null, p_status: "draft",
      });
      check("段59-10 重複範囲 insert = overlap（スイート period 09月に被せ）", has(eOv1, "overlap"), eOv1?.message ?? "通ってしまった");
      const { error: eOvF } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: "2026-07-15", p_end_date: "2026-07-20", p_wish_deadline: null, p_status: "draft",
      });
      check("段59-10 常設 fixture（open 07月）に被せても overlap", has(eOvF, "overlap"), eOvF?.message ?? "通ってしまった");
      const { data: p2, error: eP2 } = await mgr.rpc("shift_period_set", {
        p_id: null, p_store_id: storeA1Id, p_start_date: P2_START, p_end_date: P2_END, p_wish_deadline: null, p_status: "draft",
      });
      check("段59-10 非重複範囲（11月）は作成成功", !eP2 && typeof p2 === "string", eP2?.message);
      const { error: eOv2 } = await mgr.rpc("shift_period_set", {
        p_id: p2 as string, p_store_id: storeA1Id, p_start_date: "2026-09-20", p_end_date: "2026-10-10", p_wish_deadline: null, p_status: "draft",
      });
      check("段59-10 update で重複範囲へ = overlap", has(eOv2, "overlap"), eOv2?.message ?? "通ってしまった");
      const { error: eRm2 } = await mgr.rpc("shift_period_remove", { p_id: p2 as string });
      check("段59-10 11月 period 掃除（remove 成功）", !eRm2, eRm2?.message);
    }

    // ══ 11 ★0103 shift_set の 1日1枠（SD-9）══
    {
      const { error: eDup } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castIdA, p_date: D1, p_start_hm: "22:00", p_end_hm: "26:00", p_status: "planned",
      });
      check("段59-11 同日（castA×D1=sid1 既存）insert = duplicate", has(eDup, "duplicate"), eDup?.message ?? "通ってしまった");
      const { error: eMv } = await mgr.rpc("shift_set", {
        p_id: sid2, p_cast_id: castIdA, p_date: D1, p_start_hm: "20:00", p_end_hm: "25:00", p_status: "planned",
      });
      check("段59-11 update で他行の日付（D2→D1）へ移動 = duplicate", has(eMv, "duplicate"), eMv?.message ?? "通ってしまった");
      const { error: eSelf } = await mgr.rpc("shift_set", {
        p_id: sid2, p_cast_id: castIdA, p_date: D2, p_start_hm: "21:00", p_end_hm: "25:00", p_status: "planned",
      });
      const { data: s2Row } = await mgr.from("shifts").select("start_hm").eq("id", sid2).single();
      check("段59-11 自分自身の update（同日のまま時刻変更）は通る", !eSelf && s2Row?.start_hm === "21:00", eSelf?.message ?? s2Row?.start_hm);
    }

    // ══ 12 ★0103 wish_submit ガード（open 期間・duplicate wish・withdrawn 再提出）══
    let w1b = "";
    {
      const ca = await signIn("castA1a");
      const { error: eOut } = await ca.rpc("shift_wish_submit", { p_date: D_OUT, p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-12 open 期間の外 = period_not_open（fail-closed）", has(eOut, "period_not_open"), eOut?.message ?? "通ってしまった");
      const { error: eDupW } = await ca.rpc("shift_wish_submit", { p_date: D3, p_start_hm: "22:00", p_end_hm: "26:00" });
      check("段59-12 同日2件目（w1 が pending で live）= duplicate wish", has(eDupW, "duplicate wish"), eDupW?.message ?? "通ってしまった");
      const { error: eWd } = await ca.rpc("shift_wish_withdraw", { p_wish_id: w1 });
      check("段59-12 w1 withdraw 成功", !eWd, eWd?.message);
      const { data: wNew, error: eRe } = await ca.rpc("shift_wish_submit", { p_date: D3, p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-12 ★withdrawn 後の再提出は通る（部分 UNIQUE は live のみ対象）", !eRe && typeof wNew === "string", eRe?.message);
      w1b = wNew as string;
      await ca.auth.signOut();
    }

    // ══ 13 ★0103 wish_decide: accept 時に同日 shift 既存 = duplicate（wish は pending のまま）══
    let sid3 = "";
    {
      const { data: s3, error: eS3 } = await mgr.rpc("shift_set", {
        p_id: null, p_cast_id: castIdA, p_date: D3, p_start_hm: "19:00", p_end_hm: "23:00", p_status: "planned",
      });
      check("段59-13 前提: castA×D3 の manual 行作成", !eS3 && typeof s3 === "string", eS3?.message);
      sid3 = s3 as string;
      const { error: eDec } = await mgr.rpc("shift_wish_decide", { p_wish_id: w1b, p_accept: true });
      check("段59-13 accept は同日既存 shift で duplicate", has(eDec, "duplicate"), eDec?.message ?? "通ってしまった");
      const { data: wRow } = await mgr.from("shift_wishes").select("status, decided_by").eq("id", w1b).single();
      check("段59-13 ★wish は pending のまま（decide が丸ごとロールバック）",
        wRow?.status === "pending" && wRow?.decided_by === null, JSON.stringify(wRow));
    }

    // ══ 14 ★0103 auto_apply の原子性（duplicate で全体ロールバック・既存 auto 行も復元）══
    {
      const { data: nA, error: eA1 } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [w2] });
      check("段59-14 前提: apply([w2]) = 1（castB×D3 の auto 行）", !eA1 && nA === 1, eA1?.message ?? `got ${nA}`);
      const { error: eA2 } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [w1b, w2] });
      check("段59-14 w1b（castA×D3＝sid3 と衝突）を含む apply = duplicate: <id>", has(eA2, "duplicate"), eA2?.message ?? "通ってしまった");
      const { data: autoRows } = await mgr.from("shifts").select("wish_id").eq("store_id", storeA1Id).eq("source", "auto").eq("date", D3);
      check("段59-14 ★全体ロールバック＝既存 auto 行（w2）が復元されている",
        (autoRows ?? []).length === 1 && autoRows![0].wish_id === w2, JSON.stringify(autoRows));
      const { data: wStates } = await mgr.from("shift_wishes").select("id, status").in("id", [w1b, w2]);
      check("段59-14 ★w2=accepted・w1b=pending のまま（部分 accept なし）",
        (wStates ?? []).some((r) => r.id === w2 && r.status === "accepted")
        && (wStates ?? []).some((r) => r.id === w1b && r.status === "pending"), JSON.stringify(wStates));
      const { data: nC, error: eC } = await mgr.rpc("shift_auto_clear", { p_period_id: periodId });
      check("段59-14 掃除: auto_clear = 1（w2 pending 復元）", !eC && nC === 1, eC?.message ?? `got ${nC}`);
    }

    // ══ 15 ★0103 shift_remove（wish 復元・has attendance・ロール）══
    {
      const { data: rid3, error: eR3 } = await mgr.rpc("shift_remove", { p_id: sid3 });
      check("段59-15 planned（wish_id なし）削除成功", !eR3 && rid3 === sid3, eR3?.message);
      const { data: s4, error: eDec2 } = await mgr.rpc("shift_wish_decide", { p_wish_id: w1b, p_accept: true });
      check("段59-15 前提: 障害物が消えたので w1b accept 成功（shifts 生成）", !eDec2 && typeof s4 === "string", eDec2?.message);
      const { data: rid4, error: eR4 } = await mgr.rpc("shift_remove", { p_id: s4 as string });
      const { data: w1bRow } = await mgr.from("shift_wishes").select("status, decided_by, decided_at").eq("id", w1b).single();
      check("段59-15 ★wish_id あり削除 → wish が pending へ復元（decided_* も null）",
        !eR4 && rid4 === s4 && w1bRow?.status === "pending" && w1bRow?.decided_by === null && w1bRow?.decided_at === null,
        eR4?.message ?? JSON.stringify(w1bRow));
      // confirmed × attendance
      const { error: eAtt } = await admin.from("attendance").insert({
        org_id: storeRow!.org_id, store_id: storeA1Id, cast_id: castIdA, date: D1, status: "shukkin", source: "staff",
      });
      check("段59-15 前提: castA×D1 の attendance を admin 挿入", !eAtt, eAtt?.message);
      const { error: eHA } = await mgr.rpc("shift_remove", { p_id: sid1 });
      check("段59-15 confirmed＋attendance あり = has attendance", has(eHA, "has attendance"), eHA?.message ?? "通ってしまった");
      await admin.from("attendance").delete().eq("store_id", storeA1Id).eq("cast_id", castIdA).eq("date", D1);
      const { data: rid1, error: eR1 } = await mgr.rpc("shift_remove", { p_id: sid1 });
      check("段59-15 confirmed＋attendance なし = 削除可", !eR1 && rid1 === sid1, eR1?.message);
      sid1 = "";
      // ロール系
      const ca = await signIn("castA1a");
      const { error: eCa } = await ca.rpc("shift_remove", { p_id: sid2 });
      check("段59-15 cast ロール = forbidden", has(eCa, "forbidden"), eCa?.message ?? "通ってしまった");
      await ca.auth.signOut();
      const mb = await signIn("managerB1");
      const { error: eMb } = await mb.rpc("shift_remove", { p_id: sid2 });
      check("段59-15 他 org（managerB1）= forbidden", has(eMb, "forbidden"), eMb?.message ?? "通ってしまった");
      await mb.auth.signOut();
    }

    // ══ 16 ★0103 shift_bulk_set（一括作成・skip 系・正規化・上限・ロール）══
    {
      // castB は D1〜D3 に行なし（auto は clear 済み）＝クリーンな対象
      const { data: b1, error: eB1 } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: castIdB, p_dates: [D1, D2], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      const r1 = b1 as { inserted: number; skipped: string[] };
      check("段59-16 正常2件 = inserted:2 / skipped:[]", !eB1 && r1?.inserted === 2 && (r1?.skipped ?? []).length === 0, eB1?.message ?? JSON.stringify(b1));
      const { data: bRows } = await mgr.from("shifts").select("date, status, source").eq("store_id", storeA1Id).eq("cast_id", castIdB).in("date", [D1, D2]);
      check("段59-16 生成行は planned/manual", (bRows ?? []).length === 2 && bRows!.every((r) => r.status === "planned" && r.source === "manual"), JSON.stringify(bRows));
      const { data: b2 } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: castIdB, p_dates: [D1, D3], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      const r2 = b2 as { inserted: number; skipped: string[] };
      check("段59-16 同日既存（D1）はスキップ = inserted:1 / skipped:[D1]",
        r2?.inserted === 1 && (r2?.skipped ?? []).length === 1 && String(r2!.skipped[0]).startsWith(D1), JSON.stringify(b2));
      const { data: b3 } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: castIdB, p_dates: [D4, D4, null], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      const r3 = b3 as { inserted: number; skipped: string[] };
      check("段59-16 null・重複日付は正規化 = [D4,D4,null]→inserted:1", r3?.inserted === 1 && (r3?.skipped ?? []).length === 0, JSON.stringify(b3));
      const { data: b0 } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: castIdB, p_dates: [], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      const r0 = b0 as { inserted: number; skipped: string[] };
      check("段59-16 空配列 = 完全 no-op {inserted:0, skipped:[]}", r0?.inserted === 0 && (r0?.skipped ?? []).length === 0, JSON.stringify(b0));
      const many: string[] = [];
      for (let i = 0; i < 63; i++) {
        const d = new Date(Date.UTC(2026, 9, 1) + i * 86400000);
        many.push(d.toISOString().slice(0, 10));
      }
      const { error: eMany } = await mgr.rpc("shift_bulk_set", { p_cast_id: castIdB, p_dates: many, p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-16 63日 = too many dates（上限62）", has(eMany, "too many dates"), eMany?.message ?? "通ってしまった");
      // 定休日スキップ＝一時 bh（月曜 close）を立てて D5（月）が skip に入ることを実測
      const { error: eBh } = await admin.from("store_business_hours").insert({
        org_id: storeRow!.org_id, store_id: storeA1Id, dow: 1, is_closed: true, open_hm: null, close_hm: null,
      });
      check("段59-16 前提: 一時定休日（月曜）を admin 挿入", !eBh, eBh?.message);
      const { data: b5 } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: castIdB, p_dates: [D5], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      const r5 = b5 as { inserted: number; skipped: string[] };
      check("段59-16 定休日（D5=月）はスキップ = inserted:0 / skipped:[D5]",
        r5?.inserted === 0 && (r5?.skipped ?? []).length === 1 && String(r5!.skipped[0]).startsWith(D5), JSON.stringify(b5));
      await admin.from("store_business_hours").delete().eq("store_id", storeA1Id).eq("dow", 1);
      // 不在 cast（他 org 相当のプローブ＝org B に cast fixture が無いため不在 uuid で forbidden を実測。
      // 「他 org からの操作」は managerB1→castIdA の bulk で org 照合を直接実証する）
      const { error: eGhost } = await mgr.rpc("shift_bulk_set", {
        p_cast_id: "00000000-0000-4000-8000-000000000000", p_dates: [D4], p_start_hm: "20:00", p_end_hm: "26:00",
      });
      check("段59-16 不在 cast = forbidden", has(eGhost, "forbidden"), eGhost?.message ?? "通ってしまった");
      const mb = await signIn("managerB1");
      const { error: eOrgB } = await mb.rpc("shift_bulk_set", { p_cast_id: castIdA, p_dates: [D4], p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-16 他 org（managerB1→castA）= forbidden", has(eOrgB, "forbidden"), eOrgB?.message ?? "通ってしまった");
      await mb.auth.signOut();
      // manager 他店＝storeA2 に一時 cast を admin で作って mgr(A1) から呼ぶ
      const { data: stA2 } = await admin.from("stores").select("id").eq("name", "NOX-VERIFY-A2").single();
      const { data: tmpCast, error: eTmp } = await admin.from("casts").insert({
        org_id: storeRow!.org_id, store_id: stA2!.id, name: "NOX-VERIFY-0103-A2一時", is_active: true,
      }).select("id").single();
      check("段59-16 前提: A2 の一時 cast を admin 作成", !eTmp && !!tmpCast?.id, eTmp?.message);
      const { error: eA2c } = await mgr.rpc("shift_bulk_set", { p_cast_id: tmpCast!.id, p_dates: [D4], p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-16 manager 他店（A1 mgr→A2 cast）= forbidden", has(eA2c, "forbidden"), eA2c?.message ?? "通ってしまった");
      await admin.from("casts").delete().eq("id", tmpCast!.id);
      const ca = await signIn("castA1a");
      const { error: eCaB } = await ca.rpc("shift_bulk_set", { p_cast_id: castIdA, p_dates: [D4], p_start_hm: "20:00", p_end_hm: "26:00" });
      check("段59-16 cast ロール = forbidden", has(eCaB, "forbidden"), eCaB?.message ?? "通ってしまった");
      await ca.auth.signOut();
    }

    // ══ 5 published 拒否 ══
    {
      const { error: ePub } = await mgr.rpc("shift_period_set", {
        p_id: periodId, p_store_id: storeA1Id, p_start_date: P_START, p_end_date: P_END, p_wish_deadline: "2026-09-05", p_status: "published",
      });
      check("段59-5 period を published へ", !ePub, ePub?.message);
      // ★0103 後の注記: w1 は段59-12 で withdrawn 済みだが、period published ガードは wish 検証より
      //   前に評価される（0103 でも順序不変）＝本 assert は従来どおり成立する。
      const { error: eApply } = await mgr.rpc("shift_auto_apply", { p_period_id: periodId, p_wish_ids: [w1] });
      check("段59-5 published では apply 拒否", has(eApply, "period published"), eApply?.message ?? "通ってしまった");
    }

    // ══ 6 rules_set（upsert・null=無制限・bad consec）══
    {
      const { data: r1, error: eR1 } = await mgr.rpc("shift_rules_set", { p_store_id: storeA1Id, p_max_consec_days: 5, p_min_month_min: 6000 });
      check("段59-6 rules_set 成功", !eR1 && typeof r1 === "string", eR1?.message);
      const { data: r2, error: eR2 } = await mgr.rpc("shift_rules_set", { p_store_id: storeA1Id, p_max_consec_days: null, p_min_month_min: null });
      check("段59-6 upsert（同 store 同 id・null=無制限）", !eR2 && r2 === r1, eR2?.message ?? `${r1} vs ${r2}`);
      const { data: rRow } = await mgr.from("shift_rules").select("max_consec_days, min_month_min").eq("store_id", storeA1Id).single();
      check("段59-6 null が保存されている", rRow?.max_consec_days === null && rRow?.min_month_min === null, JSON.stringify(rRow));
      const { error: eBadC } = await mgr.rpc("shift_rules_set", { p_store_id: storeA1Id, p_max_consec_days: 0, p_min_month_min: null });
      check("段59-6 max_consec_days=0 = bad consec", has(eBadC, "bad consec"), eBadC?.message ?? "通ってしまった");
    }

    // ══ 7 period_remove（参照ゼロで成功）══
    {
      // sid1/sid2 は period_id null（shift_set は period を書かない）・auto 行は clear 済み＝参照ゼロ
      const { data: rid, error: eRm } = await mgr.rpc("shift_period_remove", { p_id: periodId });
      check("段59-7 period_remove 成功（参照ゼロ）", !eRm && rid === periodId, eRm?.message);
      periodId = "";
    }
    await mgr.auth.signOut();
  } finally {
    // 生成物の全消し（0103: wipe と同じ日付リスト＝D4/D5/D_OUT・11月 period・一時 bh/attendance も含む。
    //   常設 fixture（open 07月）は start_date 限定 delete の対象外＝温存）
    await wipe();
    if (periodId) await admin.from("shift_periods").delete().eq("id", periodId);
  }

  // ══ 8 復元 assert（開始時カウントと一致）══
  check("段59-8 shifts カウント復元", (await countOf("shifts")) === base.shifts);
  check("段59-8 shift_wishes カウント復元", (await countOf("shift_wishes")) === base.wishes);
  check("段59-8 shift_periods カウント復元", (await countOf("shift_periods")) === base.periods);
  check("段59-8 shift_rules カウント復元", (await countOf("shift_rules")) === base.rules);

  // ══ 9 golden: forecastDay 55233（写経1本・正本ドリフト検出は verify:nox-labor-forecast）══
  {
    const plan = (basePay: number, over?: Partial<CompPlan>): CompPlan => ({
      id: "p", name: "テスト", base: basePay,
      honBack: 3000, jonaiBack: 1000, dohanBack: 2000,
      salesSlide: [], pointSlide: [],
      ...over,
    });
    const comp = (p: CompPlan, override?: ForecastComp["override"]): ForecastComp => ({ plan: p, override });
    const r = forecastDay(
      [
        { castId: "A", startHm: "20:00", endHm: "26:00" },
        { castId: "B", startHm: "21:30", endHm: "26:00" },
        { castId: "C", startHm: "22:00", endHm: "26:00" },
        { castId: "D", startHm: "20:00", endHm: "25:30" },
        { castId: "E", startHm: "21:00", endHm: "21:50" },
      ],
      {
        A: comp(plan(3000, { salesSlide: [{ at: 0, wage: 3500 }, { at: 100_000, wage: 4000 }] })),
        B: comp(plan(2800), { base: 3000 }),
        D: comp(plan(3000, { pointSlide: [{ at: 0, wage: 3300 }] })),
        E: comp(plan(3100)),
      },
    );
    check("段59-9 ★全操作後 golden 不変（forecastDay total=55233）", r.total === 55233, `got ${r.total}`);
  }

  if (fails.length) {
    console.error(`verify:nox-shift-deep FAIL ${fails.length} / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-shift-deep ALL PASS (${pass} assertions)`);
  console.log("SD深部(0101/0102/0103): period CRUD+overlap/propose集計拒否/cast_confirm一方向/auto入替一巡+duplicate原子性/1日1枠/wish open期間+duplicate+withdrawn再提出/bulk_set/remove(wish復元・has attendance)/manual保持/published拒否/rules upsert/復元/golden55233");
}

main().catch((e) => { console.error(e); process.exit(1); });
