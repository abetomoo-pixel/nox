/*
 * verify:nox-341 — 裁定341（0169・便 P169＝X-13-29）＋裁定342（便 P169・起票101 の解決）: 場内→本指名の非遡及と
 *   「既出のドリンクも本指名の率にする」（check_nomination_rate_apply）の実走・未来日除外の純関数と配線。
 *   npm run verify:nox-341（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）。f0 101 段目。
 *  r341(1) 0169 live: check_nominations に prev_kind／kind_changed_at（admin select が通る）
 *  r341(2) 場内→本指名（manager・チェックオフ）: 名簿行に prev_kind='jonai'＋kind_changed_at・切替前の行は旧区分＝close で
 *          drink_back 300（jonai・unit4）＋切替後の行 400（hon）＝700（非遡及が既定）
 *  r341(3) staff／cast は check_nomination_rate_apply を呼べない（forbidden）・記録は残る
 *  r341(4) manager の apply＝記録が消える・audit 'check_nomination_rate_apply'（note「指名切替に伴う率変更」）1 行・close で 800（全行 hon）・
 *          記録なしの再 apply は no-op（エラーなし・audit 増えない）
 *  r341(5) client（register-board）: 切替ダイアログ（店長以上・チェック既定オフ）→ 保存→ オンなら rpc check_nomination_rate_apply・
 *          切替記録のある本指名キャストにチェック・行の印「の率（切替前）」・P168 の無効「（準備中）」は 0
 *  f342(1) punchCountsUpToOf／shiftHoursUpToOf: 未来日は 0・今日は含む／collect.ts の配線（旧 m.absentN／m.lateN の直渡しなし）
 * fixture は段内動的生成（NOX-VERIFY-341* 命名）＋ finally 全消し（audit の自分の行も消す）。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { punchCountsUpToOf, shiftHoursUpToOf } from "../lib/nox/payroll/anomaly";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── f342: 純関数（DB 不触）──
{
  const days = [
    { bizDate: "2026-10-05", finalType: "ok" }, { bizDate: "2026-10-09", finalType: "late" }, { bizDate: "2026-10-12", finalType: "absent" },
    { bizDate: "2026-10-13", finalType: "absent" }, { bizDate: "2026-10-14", finalType: "absent" }, { bizDate: "2026-10-20", finalType: "ok" },
  ];
  const c = punchCountsUpToOf(days, "2026-10-13");
  check("f342(1-1) punchCountsUpToOf: 今日（10/13）までだけ＝days 2（ok＋late）・lateN 1・absentN 2（10/14・10/20 は数えない）", c.days === 2 && c.lateN === 1 && c.absentN === 2, JSON.stringify(c));
  const all = punchCountsUpToOf(days, "2026-10-31");
  check("f342(1-2) 月末を今日にすると全日＝days 3・lateN 1・absentN 3（従来の数え方と同値）", all.days === 3 && all.lateN === 1 && all.absentN === 3, JSON.stringify(all));
  const h = shiftHoursUpToOf({ "2026-10-12": 6, "2026-10-13": 5, "2026-10-14": 6, "2026-10-20": 6 }, "2026-10-13");
  check("f342(1-3) shiftHoursUpToOf: 今日までの日だけ（10/12・10/13）＝'shift' 基準の時給の母数に未来日を含めない", JSON.stringify(h) === JSON.stringify({ "2026-10-12": 6, "2026-10-13": 5 }), JSON.stringify(h));
  const co = src("lib/nox/payroll/collect.ts");
  check("f342(1-4) collect.ts: punchCountsUpToOf／shiftHoursUpToOf を todayBiz で呼ぶ・旧 m.absentN／m.lateN の直渡しなし・受給者判定（インセンティブ）は不変＝final ok／late",
    co.includes("punchCountsUpToOf(m.days.map(") && co.includes("shiftHoursUpToOf(shiftHoursAll, todayBiz)") && !co.includes("absentN: m.absentN") && !co.includes("lateN: m.lateN") && co.includes('if (d.final.type === "ok" || d.final.type === "late") { // 受給者判定'));
}
// ── r341(5): client の配線（DB 不触）──
{
  const rb = src("app/(manage)/register/register-board.tsx");
  check("r341(5-1) 切替ダイアログ: 場内→本指名は店長以上に setRateDlg（apply 既定 false）・確定＝autoSaveNoms→apply なら rateApply",
    rb.includes('if (v === "hon" && kind === "jonai" && isManagerUp) { setRateDlg({ castId: ca.id, name: ca.name, kinds, weights, apply: false }); return; }')
    && rb.includes("const saved = await autoSaveNoms(d.weights, d.kinds, nomDohan, nomDohanN);") && rb.includes("if (saved && d.apply) await rateApply(d.castId, d.name);"));
  check("r341(5-2) rateApply: rpc check_nomination_rate_apply(p_check_id, p_cast_id)・失敗は赤（forbidden／billing locked／not open／not found の和訳）・成功文言に監査名",
    rb.includes('supabase.rpc("check_nomination_rate_apply", { p_check_id: check.id, p_cast_id: castId })') && rb.includes("率変更に失敗:") && rb.includes("監査: 指名切替に伴う率変更"));
  check("r341(5-3) 切替記録のある本指名キャスト（店長以上・open）にチェック「既出ドリンクも本指名の率にする（切替前の N 行は場内の率）」・名簿 select に prev_kind, kind_changed_at・行 select に created_at",
    rb.includes('kind === "hon" && nomRow?.kind_changed_at && isManagerUp && check.status === "open"') && rb.includes("この伝票の既出ドリンクも本指名の率にする（切替前の {preN} 行は場内の率）")
    && rb.includes('select("cast_id, ratio_weight, nom_kind, is_dohan, prev_kind, kind_changed_at")') && rb.includes("customer_id, product_id, created_at\")"));
  check("r341(5-4) 行の区分表示: 切替前の行に「{キャスト} 場内の率（切替前）」の印（created_at < kind_changed_at）・P168 の無効「（準備中）」は 0",
    rb.includes("の率（切替前）") && rb.includes("l.created_at! < n.kind_changed_at") && !rb.includes("（準備中）\" />") && !rb.includes("本指名の率にする（準備中）"));
}

const P_SEAT = "NOX-VERIFY-341卓";
const P_CAST = "NOX-VERIFY-341A";
const P_PROD = "NOX-VERIFY-341ドリンク";

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (key: "managerA1" | "staffA1" | "castA1a") => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1");
  const staff = await signIn("staffA1");
  const cast = await signIn("castA1a");
  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;
  const madeChecks: string[] = [];
  let castA = "", seatId = "", prodId = "";

  async function teardown() {
    const { data: sts } = await admin.from("seats").select("id").eq("name", P_SEAT);
    const seatIds = (sts ?? []).map((r) => r.id as string);
    const { data: chks } = seatIds.length ? await admin.from("checks").select("id").in("seat_id", seatIds) : { data: [] as { id: string }[] };
    const chkIds = Array.from(new Set([...(chks ?? []).map((r) => r.id as string), ...madeChecks]));
    if (chkIds.length) {
      await admin.from("drink_claims").delete().in("check_id", chkIds);
      for (const t of ["check_cast_backs", "check_nominations", "check_lines", "payments"]) await admin.from(t).delete().in("check_id", chkIds);
      await admin.from("audit_logs").delete().in("target", chkIds.map((id) => `checks:${id}`)); // 自分の伝票の監査行だけ（verify org 内）
      await admin.from("checks").delete().in("id", chkIds);
    }
    const { data: cs } = await admin.from("casts").select("id").eq("name", P_CAST);
    const ids = (cs ?? []).map((r) => r.id as string);
    if (ids.length) { await admin.from("check_nominations").delete().in("cast_id", ids); await admin.from("casts").delete().in("id", ids); }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    const { data: prods } = await admin.from("products").select("id").eq("name", P_PROD);
    const prodIds = (prods ?? []).map((r) => r.id as string);
    if (prodIds.length) { await admin.from("stock_logs").delete().in("product_id", prodIds); await admin.from("products").delete().in("id", prodIds); } // 教訓44／49
  }
  await teardown();

  try {
    // ── fixture ──
    castA = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: P_CAST, is_active: true }).select("id").single()).data!.id as string;
    seatId = (await admin.from("seats").insert({ org_id: orgA, store_id: storeA1, name: P_SEAT, kind: "卓", sort_order: 97, is_active: true }).select("id").single()).data!.id as string;
    const { data: pr, error: ePr } = await admin.from("products").insert({
      org_id: orgA, store_id: storeA1, type: "drink", name: P_PROD, price: 1000, category: "ドリンク",
      back_mode: "unit4", back_value: null, unit4_json: { hon: 400, jonai: 300, dohan: 200, free: 100 },
      back_exempt_from_split: false, is_active: true, sort_order: 997, // 按分対象＝check_close が名簿の区分（行時点）で unit4 を解決
    }).select("id").single();
    if (ePr) throw new Error(`products insert: ${ePr.message}`);
    prodId = pr!.id as string;

    // r341(1) 0169 live（列）
    {
      const { error } = await admin.from("check_nominations").select("prev_kind, kind_changed_at").limit(1);
      check("r341(1-1) 0169 live: check_nominations に prev_kind／kind_changed_at（select が通る）", !error, error?.message);
    }

    const nomRowOf = async (chk: string) => (await admin.from("check_nominations").select("nom_kind, prev_kind, kind_changed_at").eq("check_id", chk).eq("cast_id", castA).single()).data as { nom_kind: string; prev_kind: string | null; kind_changed_at: string | null } | null;
    const auditN = async (chk: string) => (await admin.from("audit_logs").select("id, after_json").eq("action", "check_nomination_rate_apply").eq("target", `checks:${chk}`)).data ?? [];
    const addLine = async (chk: string) => {
      const { error } = await mgr.rpc("check_add_line", { p_check_id: chk, p_product_id: prodId, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
      if (error) throw new Error(`check_add_line: ${error.message}`);
    };
    const setKind = async (chk: string, kind: "hon" | "jonai") => {
      const { error } = await mgr.rpc("check_set_nominations", { p_check_id: chk, p_nominations: [{ cast_id: castA, weight: 1, nom_kind: kind, is_dohan: false }] });
      if (error) throw new Error(`check_set_nominations(${kind}): ${error.message}`);
    };
    const closeIt = async (chk: string) => {
      const { data: tot } = await admin.from("checks").select("total").eq("id", chk).single();
      const due = tot!.total as number;
      const { error: ePay } = await mgr.rpc("check_pay", { p_check_id: chk, p_method: "cash", p_amount: due, p_pay_group: "A", p_tendered: due, p_idem_key: randomUUID() });
      if (ePay) throw new Error(`check_pay: ${ePay.message}`);
      const { error: eC } = await mgr.rpc("check_close", { p_check_id: chk, p_idem_key: randomUUID() });
      if (eC) throw new Error(`check_close: ${eC.message}`);
      return (await admin.from("check_cast_backs").select("cast_id, drink_back").eq("check_id", chk).eq("cast_id", castA).maybeSingle()).data?.drink_back as number | undefined;
    };
    // 場内で 1 本 → 本指名に切替 → 1 本（切替前の行は場内の率・後の行は本指名の率）
    const openSwitched = async () => {
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
      if (eO) throw new Error(`check_open: ${eO.message}`);
      const chk = cid as string; madeChecks.push(chk);
      await setKind(chk, "jonai");
      await addLine(chk);
      await new Promise((r) => setTimeout(r, 30)); // 行の created_at < kind_changed_at を時計で保証
      await setKind(chk, "hon");
      await addLine(chk);
      return chk;
    };

    // ══ r341(2) チェックオフ＝非遡及が既定 ══
    {
      const chk = await openSwitched();
      const row = await nomRowOf(chk);
      check("r341(2-1) 場内→本指名で名簿行に prev_kind='jonai'＋kind_changed_at（切替記録）", row?.nom_kind === "hon" && row?.prev_kind === "jonai" && !!row?.kind_changed_at, JSON.stringify(row));
      const { data: ls } = await admin.from("check_lines").select("created_at").eq("check_id", chk).eq("product_id", prodId).order("created_at");
      const [l1, l2] = (ls ?? []).map((r) => r.created_at as string);
      check("r341(2-2) 行 1 の created_at < kind_changed_at < 行 2（check_close の判定材料）", !!row?.kind_changed_at && l1 < row.kind_changed_at! && row.kind_changed_at! < l2, JSON.stringify({ l1, chg: row?.kind_changed_at, l2 }));
      const back = await closeIt(chk);
      check("r341(2-3) ★close（チェックオフ）: 切替前の行は場内 300＋切替後の行は本指名 400＝drink_back 700（遡及しない）", back === 700, `got ${back}`);
      check("r341(2-4) close 後も記録は残る（監査の材料・apply は open のみ）", (await nomRowOf(chk))?.prev_kind === "jonai");
    }

    // ══ r341(3)(4) staff／cast は呼べない → manager の apply → 800 ══
    {
      const chk = await openSwitched();
      const { error: eS } = await staff.rpc("check_nomination_rate_apply", { p_check_id: chk, p_cast_id: castA });
      check("r341(3-1) staff は check_nomination_rate_apply を呼べない（forbidden）", !!eS && /forbidden/.test(eS.message), eS?.message ?? "実行できてしまった");
      const { error: eCa } = await cast.rpc("check_nomination_rate_apply", { p_check_id: chk, p_cast_id: castA });
      check("r341(3-2) cast も呼べない（forbidden）", !!eCa && /forbidden/.test(eCa.message), eCa?.message ?? "実行できてしまった");
      check("r341(3-3) 拒否後も記録は残る", (await nomRowOf(chk))?.prev_kind === "jonai" && (await auditN(chk)).length === 0);
      const { error: eM } = await mgr.rpc("check_nomination_rate_apply", { p_check_id: chk, p_cast_id: castA });
      const rowAfter = await nomRowOf(chk);
      const au = await auditN(chk);
      const note = (au[0]?.after_json as Record<string, unknown> | undefined)?.note;
      check("r341(4-1) ★manager の apply＝記録が消える（prev_kind／kind_changed_at null）・nom_kind は hon のまま", !eM && rowAfter?.nom_kind === "hon" && rowAfter?.prev_kind === null && rowAfter?.kind_changed_at === null, eM?.message ?? JSON.stringify(rowAfter));
      check("r341(4-2) audit 'check_nomination_rate_apply' 1 行・after.note「指名切替に伴う率変更」", au.length === 1 && note === "指名切替に伴う率変更", JSON.stringify({ n: au.length, note }));
      const { error: eM2 } = await mgr.rpc("check_nomination_rate_apply", { p_check_id: chk, p_cast_id: castA });
      check("r341(4-3) 記録なしの再 apply は no-op（エラーなし・audit 増えない）", !eM2 && (await auditN(chk)).length === 1, eM2?.message);
      const back = await closeIt(chk);
      check("r341(4-4) ★close（apply 後）: 全行が本指名の率＝400×2＝drink_back 800", back === 800, `got ${back}`);
      const { error: eAfterClose } = await mgr.rpc("check_nomination_rate_apply", { p_check_id: chk, p_cast_id: castA });
      check("r341(4-5) close 後の apply は 'not open'", !!eAfterClose && /not open/.test(eAfterClose.message), eAfterClose?.message ?? "通ってしまった");
    }
  } finally {
    await teardown();
  }
}

main().then(() => {
  if (fails.length) {
    console.error(`verify:nox-341 FAIL ${fails.length} / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-341 OK (${pass} checks)`);
  console.log("裁定341（0169・X-13-29）: 場内→本指名は非遡及（切替前 300＋後 400＝700）・apply で 800・staff／cast forbidden・audit note／裁定342: 未来日は日数・当欠・シフト時間に数えない");
}).catch((e) => { console.error("verify:nox-341 ERROR", e); process.exit(1); });
