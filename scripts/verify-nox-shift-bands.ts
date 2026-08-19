/**
 * verify:nox-shift-bands — mig0095（staffing_needs 時間帯化＋incentive 対象/理由）の runtime 実証（段52・E8-4）
 *   実行: npm run verify:nox-shift-bands（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0095 の肝は (a) バンドの半開区間 [from,to) 交差ガード 'overlap' が
 *   隣接（境界一致）を許し交差だけを弾くこと (b) 旧3引数呼びが終日バンドとして生き続けること
 *   (c) 対象指定インセンティブの受給者＝「出勤受給者 ∩ 対象」（出勤しない対象者は受給しない）を
 *   computePayrollDraft の実行で実測すること（★golden 5931/125802 へは null 互換で不波及）。
 *
 * 段構成（指示の13系）:
 *   (1) set 5引数 → 実測  (2) 同 from 再 set → upsert 置換・行数不変  (3) 交差 → 'overlap'
 *   (4) 隣接（境界一致）→ 成功  (5) to 拡張で隣接へ食い込み → 'overlap'
 *   (6) from 1441 / from>=to → 'bad band'  (7) 旧3引数呼び＝終日互換（＋既存バンドと交差なら 'overlap'）
 *   (8) remove → 行消滅・audit before=行/after=null  (9) remove 不在 → 'not found'
 *   (10) publish 7引数（reason trim・対象2名の配列保存）  (11) 他店混入/空配列/重複='bad target'・201字='bad reason'
 *   (12) 旧5引数呼び → null/null で成功（現行互換）
 *   (13) 配分＝対象2名・pooled/per_head → 対象外の出勤 cast に extras なし・対象2名で allocDue（★adversarial 対象）
 *
 * fixture: P52 接頭辞・バンド系は STORE_A2（既存8行＝CLUB NOX 等の終日バンドは不触）・ownerA 実行。
 *   incentive/配分系は STORE_A1・期間 2030-01 で隔離。finally 依存順全消し・seed 不触。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";
import { computePayrollDraft } from "../lib/nox/payroll/core";

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

const P52 = "NOX-VERIFY-P52";
const PERIOD = "2030-01"; // payroll スイートの使用期間（2026-09〜2027-05・2028-06・2029-*）と非衝突

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

  const { data: sA1row } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const sA1 = sA1row as { id: string; org_id: string };
  const { data: sA2row } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const sA2 = (sA2row as { id: string }).id;
  const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = (mgrU as { id: string }).id;

  const bandIds: string[] = [];
  const castIds: string[] = [];
  const incIds: string[] = [];
  let planId: string | null = null;
  const cleanup = async () => {
    if (bandIds.length) await admin.from("staffing_needs").delete().in("id", bandIds);
    if (incIds.length) await admin.from("attendance_incentives").delete().in("id", incIds);
    if (castIds.length) {
      for (const t of ["punches", "shifts", "cast_plan", "cast_tax_profiles"]) {
        await admin.from(t).delete().in("cast_id", castIds);
      }
      await admin.from("casts").delete().in("id", castIds);
    }
    if (planId) await admin.from("comp_plans").delete().eq("id", planId);
    const targets = [
      ...bandIds.map((id) => `staffing_needs:${id}`),
      ...incIds.map((id) => `attendance_incentives:${id}`),
    ];
    if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
  };

  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  check("段52（準備）ownerA/managerA1 セッション解決", true);

  try {
    const bandRows = async (dow: number) =>
      ((await admin.from("staffing_needs").select("id, required, from_min, to_min")
        .eq("store_id", sA2).eq("dow", dow).order("from_min")).data ?? []) as
        Array<{ id: string; required: number; from_min: number; to_min: number }>;
    const track = (id: unknown) => { if (typeof id === "string" && !bandIds.includes(id)) bandIds.push(id); };

    // ═══ (1) set 5引数 ═══
    const { data: b1, error: e1 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 3, p_from_min: 1080, p_to_min: 1440,
    });
    track(b1);
    let rows = await bandRows(5);
    check("段52(1) ★set 5引数（金曜 18:00-24:00 必要3）実測",
      !e1 && rows.length === 1 && rows[0].required === 3 && rows[0].from_min === 1080 && rows[0].to_min === 1440,
      e1?.message ?? JSON.stringify(rows));

    // ═══ (2) 同 from 再 set＝upsert 置換 ═══
    const { data: b2, error: e2 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 4, p_from_min: 1080, p_to_min: 1320,
    });
    track(b2);
    rows = await bandRows(5);
    check("段52(2) ★同 from_min 再 set＝upsert 置換（required 4・to 1320・行数1不変・同一 id）",
      !e2 && rows.length === 1 && rows[0].required === 4 && rows[0].to_min === 1320 && b2 === b1,
      e2?.message ?? JSON.stringify({ rows, b1, b2 }));

    // ═══ (3) 交差バンド ═══
    const { error: e3 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 2, p_from_min: 1200, p_to_min: 1440,
    });
    check("段52(3) 交差（1200-1440 vs 1080-1320）は 'overlap'", has(e3, "overlap"), e3?.message ?? "通ってしまった");

    // ═══ (4) 隣接バンド（半開区間の境界一致＝非交差）═══
    const { data: b4, error: e4 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 2, p_from_min: 600, p_to_min: 1080,
    });
    track(b4);
    rows = await bandRows(5);
    check("段52(4) ★隣接（600-1080 と 1080-1320）は成功＝半開区間の境界一致は非交差",
      !e4 && rows.length === 2, e4?.message ?? JSON.stringify(rows));

    // ═══ (5) to_min 拡張で隣接へ食い込み ═══
    const { error: e5 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 2, p_from_min: 600, p_to_min: 1100,
    });
    check("段52(5) ★to 拡張（600-1100）が隣接 1080-1320 へ食い込み → 'overlap'", has(e5, "overlap"), e5?.message ?? "通ってしまった");

    // ═══ (6) bad band ═══
    const { error: e6a } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 1, p_from_min: 1441, p_to_min: 1442,
    });
    const { error: e6b } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 1, p_from_min: 500, p_to_min: 500,
    });
    check("段52(6) to>1440 は 'bad band'", has(e6a, "bad band"), e6a?.message ?? "通ってしまった");
    check("段52(6) from>=to は 'bad band'", has(e6b, "bad band"), e6b?.message ?? "通ってしまった");

    // ═══ (7) 旧3引数呼び＝終日バンド互換 ═══
    const { data: b7, error: e7 } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 6, p_required: 5,
    });
    track(b7);
    const rows6 = await bandRows(6);
    check("段52(7) ★旧3引数 named 呼び＝終日バンド（from 0 / to 1440）として動作（後方互換）",
      !e7 && rows6.length === 1 && rows6[0].from_min === 0 && rows6[0].to_min === 1440 && rows6[0].required === 5,
      e7?.message ?? JSON.stringify(rows6));
    const { error: e7b } = await owner.rpc("set_staffing_need", {
      p_store_id: sA2, p_dow: 5, p_required: 5,
    });
    check("段52(7) 旧3引数（終日）が既存バンドのある曜日では 'overlap'", has(e7b, "overlap"), e7b?.message ?? "通ってしまった");

    // ═══ (8) remove ═══
    const removedId = rows.find((r) => r.from_min === 600)?.id as string;
    const { error: e8 } = await owner.rpc("staffing_need_remove", { p_store_id: sA2, p_dow: 5, p_from_min: 600 });
    const after8 = await bandRows(5);
    check("段52(8) ★remove＝行消滅（600-1080 のみ消え 1080-1320 残存）",
      !e8 && after8.length === 1 && after8[0].from_min === 1080, e8?.message ?? JSON.stringify(after8));
    const { data: a8 } = await admin.from("audit_logs").select("before_json, after_json")
      .eq("action", "staffing_need_remove").eq("target", `staffing_needs:${removedId}`).limit(1);
    const a8row = (a8 ?? [])[0] as { before_json: Record<string, unknown> | null; after_json: unknown } | undefined;
    check("段52(8) audit before=行スナップ/after=null",
      a8row?.before_json?.from_min === 600 && a8row?.after_json === null, JSON.stringify(a8row));

    // ═══ (9) remove 不在 ═══
    const { error: e9 } = await owner.rpc("staffing_need_remove", { p_store_id: sA2, p_dow: 5, p_from_min: 600 });
    check("段52(9) 不在バンドの remove は 'not found'", has(e9, "not found"), e9?.message ?? "通ってしまった");

    // ═══ 配分系 fixture（STORE_A1・2030-01 隔離・casts 3名＋plan＋tax＋出勤2日）═══
    const mkCast = async (name: string) =>
      (await admin.from("casts").insert({
        org_id: sA1.org_id, store_id: sA1.id, name, is_active: true,
      }).select("id").single()).data?.id as string;
    const cA = await mkCast(`${P52}-castA`);
    const cB = await mkCast(`${P52}-castB`);
    const cC = await mkCast(`${P52}-castC`);
    castIds.push(cA, cB, cC);
    planId = (await admin.from("comp_plans").insert({
      org_id: sA1.org_id, store_id: sA1.id, name: `${P52}-プラン`, base: 5000,
      hon_back: 0, jonai_back: 0, dohan_back: 0, sales_slide: [], point_slide: [], is_active: true,
    }).select("id").single()).data?.id as string;
    for (const cid of [cA, cB, cC]) {
      await admin.from("cast_plan").insert({ org_id: sA1.org_id, store_id: sA1.id, cast_id: cid, plan_id: planId, overrides_json: {} });
      await admin.from("cast_tax_profiles").insert({ org_id: sA1.org_id, store_id: sA1.id, cast_id: cid, mode: "委託" });
    }
    const mkPunchDay = async (cid: string, date: string, nextDay: string) => {
      await admin.from("shifts").insert({ org_id: sA1.org_id, store_id: sA1.id, cast_id: cid, date, start_hm: "20:00", end_hm: "25:00", status: "confirmed", created_by: actorId });
      await admin.from("punches").insert([
        { org_id: sA1.org_id, store_id: sA1.id, cast_id: cid, punched_at: `${date}T20:00:00+09:00`, type: "in", source: "manager" },
        { org_id: sA1.org_id, store_id: sA1.id, cast_id: cid, punched_at: `${nextDay}T01:00:00+09:00`, type: "out", source: "manager" },
      ]);
    };
    for (const cid of [cA, cB, cC]) {
      await mkPunchDay(cid, "2030-01-10", "2030-01-11");
      await mkPunchDay(cid, "2030-01-11", "2030-01-12");
    }
    check("段52（準備）配分 fixture（casts3・plan/tax・出勤2日）", true);

    // ═══ (10) publish 7引数（reason trim・対象2名）═══
    const target2 = [cA, cB].sort();
    const { data: i10, error: e10 } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-10", p_kind: "bonus", p_amount_mode: "pooled", p_amount: 10000,
      p_reason: "  段52理由  ", p_target_cast_ids: target2,
    });
    if (typeof i10 === "string") incIds.push(i10);
    const { data: i10row } = await admin.from("attendance_incentives")
      .select("reason, target_cast_ids").eq("id", i10 as string).single();
    check("段52(10) ★publish 7引数＝reason trim・対象2名の配列保存",
      !e10 && i10row?.reason === "段52理由"
        && JSON.stringify([...(i10row?.target_cast_ids as string[])].sort()) === JSON.stringify(target2),
      e10?.message ?? JSON.stringify(i10row));

    // ═══ (11) bad target / bad reason ═══
    const { data: otherCast } = await admin.from("casts").select("id").eq("store_id", sA2).limit(1).maybeSingle();
    const foreign = (otherCast as { id: string } | null)?.id ?? randomUUID(); // A2 店 cast（無ければ不在 id＝同じく bad target）
    const { error: e11a } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-12", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000,
      p_reason: null, p_target_cast_ids: [cA, foreign],
    });
    const { error: e11b } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-12", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000,
      p_reason: null, p_target_cast_ids: [],
    });
    const { error: e11c } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-12", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000,
      p_reason: null, p_target_cast_ids: [cA, cA],
    });
    const { error: e11d } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-12", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000,
      p_reason: "あ".repeat(201), p_target_cast_ids: null,
    });
    check("段52(11) 他店 cast 混入は 'bad target'", has(e11a, "bad target"), e11a?.message ?? "通ってしまった");
    check("段52(11) 空配列は 'bad target'", has(e11b, "bad target"), e11b?.message ?? "通ってしまった");
    check("段52(11) 重複は 'bad target'", has(e11c, "bad target"), e11c?.message ?? "通ってしまった");
    check("段52(11) reason 201字は 'bad reason'", has(e11d, "bad reason"), e11d?.message ?? "通ってしまった");

    // ═══ (12) 旧5引数呼び＝null/null 互換 ═══
    const { data: i12, error: e12 } = await mgr.rpc("incentive_publish", {
      p_store_id: sA1.id, p_biz_date: "2030-01-11", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000,
    });
    if (typeof i12 === "string") incIds.push(i12);
    const { data: i12row } = await admin.from("attendance_incentives")
      .select("reason, target_cast_ids").eq("id", i12 as string).single();
    check("段52(12) ★旧5引数 named 呼び＝reason/target とも null で成功（現行互換）",
      !e12 && i12row?.reason === null && i12row?.target_cast_ids === null, e12?.message ?? JSON.stringify(i12row));

    // ═══ (13) 配分＝computePayrollDraft 実測（★adversarial 対象）═══
    //   2030-01-10: pooled 10000・対象 {cA,cB} → 出勤3名 ∩ 対象2名 ＝ cA/cB へ 5000/5000・cC は 0本
    //   2030-01-11: per_head 1000・対象 null   → 出勤3名 全員 1000（現行互換の対照）
    const draft = await computePayrollDraft(admin, mgr, sA1.id, PERIOD, { previewDefaults: false });
    const exOf = (cid: string, date: string) =>
      draft.rows.find((r) => r.castId === cid)?.extras.filter((x) => (x.label ?? "").includes(date)) ?? [];
    const eA10 = exOf(cA, "2030-01-10"), eB10 = exOf(cB, "2030-01-10"), eC10 = exOf(cC, "2030-01-10");
    check("段52(13) ★pooled 対象2名＝cA/cB に 5000/5000（allocDue・交差後 cast_id 昇順）",
      eA10.length === 1 && eA10[0].amount === 5000 && eB10.length === 1 && eB10[0].amount === 5000,
      JSON.stringify({ eA10, eB10 }));
    check("段52(13) ★対象外の出勤 cast（cC）には extras が付かない", eC10.length === 0, JSON.stringify(eC10));
    const eA11 = exOf(cA, "2030-01-11"), eC11 = exOf(cC, "2030-01-11");
    check("段52(13) 対象 null（per_head）＝出勤全員へ各 1000（現行互換の対照）",
      eA11.length === 1 && eA11[0].amount === 1000 && eC11.length === 1 && eC11[0].amount === 1000,
      JSON.stringify({ eA11, eC11 }));
  } finally {
    await cleanup();
    // 掃除の自己検証（固定カウント非汚染＝段44 流儀。A2 のバンドは自作 id のみ削除＝既存終日バンド不触）
    const { count: leftBand } = bandIds.length
      ? await admin.from("staffing_needs").select("id", { count: "exact", head: true }).in("id", bandIds)
      : { count: 0 };
    const { count: leftCast } = await admin.from("casts")
      .select("id", { count: "exact", head: true }).like("name", `${P52}%`);
    const { count: leftInc } = incIds.length
      ? await admin.from("attendance_incentives").select("id", { count: "exact", head: true }).in("id", incIds)
      : { count: 0 };
    check("段52（掃除）bands/casts/incentives 0件",
      (leftBand ?? 0) === 0 && (leftCast ?? 0) === 0 && (leftInc ?? 0) === 0,
      JSON.stringify({ leftBand, leftCast, leftInc }));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-shift-bands ALL PASS (${pass} assertions)`);
  console.log("シフト帯(0095): set5引数/upsert置換/overlap交差・食い込み/隣接成功/bad band/旧3引数終日互換/remove+audit/not found・publish7引数trim配列/bad target3種/bad reason/旧5引数互換・配分=対象∩出勤でextras実測");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
