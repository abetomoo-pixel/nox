/**
 * verify:nox-ar-partial — mig0092（receivables.due＋collected_amount＝部分回収）の runtime 実証（段50・E8-2）
 *   実行: npm run verify:nox-ar-partial（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0092 の肝は「残高 = amount − deducted_amount − collected_amount」の
 *   三者不変量が、現金回収（receivable_collect）・給与天引き（payroll_finalize）・巻き戻し
 *   （payroll_reopen）・取消ガード（check_void）の4経路すべてで守られること。実セッションで突合する。
 *
 * 段構成（指示の11系）:
 *   (1) 部分回収 3000 → collected=3000・open 維持・ar_collections 1行 amount=3000
 *   (2) 同一 idem リプレイ → 同一 collection id・行数/金額 不変
 *   (3) p_amount > 残高 → 'bad amount'
 *   (4) p_amount 0/負 → 'bad amount'
 *   (5) p_amount null → 残額全額・status='collected'・collected_amount=amount
 *   (6) collected への再回収 → 'not open'
 *   (7) 部分/全額回収済み伝票の check_void → 'receivable settled'
 *   (8) 未回収売掛のみの伝票の check_void → 成功（receivables 'voided'）
 *   (9) 部分現金回収済み行へ amount−collected 超の天引き → 'bad receivable'（新上限・adversarial 対象）
 *   (10) 残額ちょうどの天引き → status='deducted'（新 v_full 判定＝deducted+collected=amount）
 *   (11) payroll_reopen 巻き戻し → deducted 復元・★collected_amount 不変・CHECK 非違反
 *
 * fixture は段内動的生成→finally 全消し（段49 型）: seats/casts は prefix P50・checks/lines/payments/
 *   receivables/ar_collections/payslips/payroll_runs/audit は id 精密削除。stores の時間6値は
 *   snapshot→復元（set_fee=0 で開卓時 set 行を作らせない＝金額を明細 custom 行だけで決定的にする）。
 *   売掛は real path（check_open→check_add_line→check_pay 'ar'）で生成＝seed 不触・固定カウント非汚染。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

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

const P50 = "NOX-VERIFY-P50";
const RUN_PERIOD = "2028-06"; // payroll スイートの使用期間（2026-09〜2027-05・2029-*）と非衝突

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
  const { data: origStore } = await admin.from("stores")
    .select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();
  const { data: actorRow } = await admin.from("users")
    .select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = (actorRow as { id: string }).id;

  const checkIds: string[] = [];
  const seatIds: string[] = [];
  const recvIds: string[] = [];
  const castIds: string[] = [];
  let runId: string | null = null;
  const cleanup = async () => {
    // 依存順: ar_collections → payslips/run → receivables → payments/nominations/lines → checks → casts/seats → stores 復元
    if (recvIds.length) await admin.from("ar_collections").delete().in("receivable_id", recvIds);
    if (runId) {
      await admin.from("payslips").delete().eq("run_id", runId);
      await admin.from("payroll_runs").delete().eq("id", runId);
    }
    if (recvIds.length) await admin.from("receivables").delete().in("id", recvIds);
    if (checkIds.length) {
      await admin.from("payments").delete().in("check_id", checkIds);
      await admin.from("check_nominations").delete().in("check_id", checkIds);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
    }
    const targets = [
      ...checkIds.map((id) => `checks:${id}`),
      ...recvIds.map((id) => `receivables:${id}`),
      ...(runId ? [`payroll_runs:${runId}`] : []),
    ];
    if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
    if (castIds.length) await admin.from("casts").delete().in("id", castIds);
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    if (origStore) await admin.from("stores").update(origStore).eq("id", sA1.id);
  };

  const mgr = await signIn("managerA1");
  check("段50（準備）managerA1 セッション解決", true);

  try {
    // 時間料金 0 円化（開卓時 set 行を作らせない＝売掛額を custom 行のみで決定的にする）。finally 復元。
    await admin.from("stores").update({
      set_min: 60, set_fee: 0, ext_min: 30, ext_fee: 0, time_mode: "manual", time_per: "table",
    }).eq("id", sA1.id);

    const mkSeat = async (nm: string) =>
      (await admin.from("seats").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: nm, kind: "卓", sort_order: 984, is_active: true,
      }).select("id").single()).data?.id as string;
    const seatA = await mkSeat(`${P50}-卓A`);
    const seatB = await mkSeat(`${P50}-卓B`);
    const seatC = await mkSeat(`${P50}-卓C`);
    seatIds.push(seatA, seatB, seatC);
    check("段50（準備）seats 3 生成", !!seatA && !!seatB && !!seatC);

    // real path で売掛を1本生成: open → custom 行 → 'ar' 全額入金 → receivables 1行
    const mkReceivable = async (seatId: string, price: number, castId?: string) => {
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: null, p_nom_type: "free" });
      if (eO) throw new Error(`check_open: ${eO.message}`);
      checkIds.push(cid as string);
      if (castId) {
        const { error: eN } = await mgr.rpc("check_set_nominations", {
          p_check_id: cid, p_nom_type: "hon", p_nominations: [{ cast_id: castId, weight: 1 }],
        });
        if (eN) throw new Error(`set_nominations: ${eN.message}`);
      }
      const { error: eL } = await mgr.rpc("check_add_line", {
        p_check_id: cid, p_product_id: null, p_qty: 1, p_kind: "custom",
        p_pay_group: "A", p_name: `${P50}売掛`, p_unit_price: price,
      });
      if (eL) throw new Error(`check_add_line: ${eL.message}`);
      const { data: ck } = await admin.from("checks").select("total").eq("id", cid as string).single();
      const due = (ck as { total: number }).total; // 単一グループ A＝total が due（サ料・丸めは store 設定準拠）
      const { error: eP } = await mgr.rpc("check_pay", {
        p_check_id: cid, p_method: "ar", p_amount: due, p_pay_group: "A",
        p_tendered: null, p_idem_key: randomUUID(), p_method_detail: null,
      });
      if (eP) throw new Error(`check_pay(ar): ${eP.message}`);
      const { data: rv } = await admin.from("receivables").select("id, amount").eq("check_id", cid as string).single();
      recvIds.push((rv as { id: string }).id);
      return { checkId: cid as string, recvId: (rv as { id: string }).id, amount: (rv as { amount: number }).amount };
    };
    const recvState = async (id: string) =>
      (await admin.from("receivables").select("status, amount, deducted_amount, collected_amount, due")
        .eq("id", id).single()).data as
        { status: string; amount: number; deducted_amount: number; collected_amount: number; due: string | null };
    const collections = async (id: string) =>
      ((await admin.from("ar_collections").select("id, amount").eq("receivable_id", id).order("created_at")).data ?? []) as
        Array<{ id: string; amount: number }>;

    // ═══ 売掛A（回収系 1〜7）═══
    const A = await mkReceivable(seatA, 10000);
    check("段50（準備）売掛A 生成（real path・amount=サ料丸め込み実額）", A.amount >= 10000, `amount=${A.amount}`);

    // (1) 部分回収 3000
    const idem1 = randomUUID();
    const { data: col1, error: e1 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-15", p_method: "cash", p_note: "段50部分",
      p_idem_key: idem1, p_amount: 3000,
    });
    const s1 = await recvState(A.recvId);
    const c1 = await collections(A.recvId);
    check("段50(1) ★部分回収 3000 成功（collection id 返却）", !e1 && typeof col1 === "string", e1?.message);
    check("段50(1) ★collected_amount=3000・status open 維持",
      s1.collected_amount === 3000 && s1.status === "open", JSON.stringify(s1));
    check("段50(1) ar_collections 1行・amount=3000", c1.length === 1 && c1[0].amount === 3000, JSON.stringify(c1));

    // (2) 同一 idem リプレイ
    const { data: col2, error: e2 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-15", p_method: "cash", p_note: "段50部分",
      p_idem_key: idem1, p_amount: 3000,
    });
    const s2 = await recvState(A.recvId);
    const c2 = await collections(A.recvId);
    check("段50(2) ★同一 idem リプレイ＝同一 collection id・行数/金額 不変",
      !e2 && col2 === col1 && c2.length === 1 && s2.collected_amount === 3000,
      e2?.message ?? JSON.stringify({ col1, col2, c2, s2 }));

    // (3) 残高超過
    const { error: e3 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-15", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: A.amount - 3000 + 1,
    });
    check("段50(3) ★残高超過（残高+1）は 'bad amount'", has(e3, "bad amount"), e3?.message ?? "通ってしまった");

    // (4) 0 / 負
    const { error: e4a } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-15", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: 0,
    });
    const { error: e4b } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-15", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: -5,
    });
    check("段50(4) 0 円は 'bad amount'", has(e4a, "bad amount"), e4a?.message ?? "通ってしまった");
    check("段50(4) 負額は 'bad amount'", has(e4b, "bad amount"), e4b?.message ?? "通ってしまった");

    // (5) 残額指定なし（null）＝全額
    const { error: e5 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-16", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: null,
    });
    const s5 = await recvState(A.recvId);
    const c5 = await collections(A.recvId);
    check("段50(5) ★null＝残額全額回収・status='collected'・collected_amount=amount",
      !e5 && s5.status === "collected" && s5.collected_amount === A.amount, e5?.message ?? JSON.stringify(s5));
    check("段50(5) ar_collections 2行目 amount=残額", c5.length === 2 && c5[1].amount === A.amount - 3000, JSON.stringify(c5));

    // (6) collected への再回収
    const { error: e6 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: A.recvId, p_biz_date: "2028-06-17", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: null,
    });
    check("段50(6) collected への再回収は 'not open'", has(e6, "not open"), e6?.message ?? "通ってしまった");

    // (7) 回収済み伝票の void 拒否
    const { error: e7 } = await mgr.rpc("check_void", { p_check_id: A.checkId, p_reason: "段50検証" });
    check("段50(7) ★回収済み売掛の伝票 void は 'receivable settled'", has(e7, "receivable settled"), e7?.message ?? "通ってしまった");

    // ═══ 売掛B（未回収のみ → void 成功）═══
    const B = await mkReceivable(seatB, 5000);
    const { error: e8 } = await mgr.rpc("check_void", { p_check_id: B.checkId, p_reason: "段50検証" });
    const s8 = await recvState(B.recvId);
    check("段50(8) ★未回収売掛のみの伝票 void 成功・receivables 'voided'",
      !e8 && s8.status === "voided", e8?.message ?? JSON.stringify(s8));

    // ═══ 売掛C（天引き系 9〜11・cast 付き）═══
    const { data: castRow } = await admin.from("casts").insert({
      org_id: sA1.org_id, store_id: sA1.id, name: `${P50}-cast`, is_active: true,
    }).select("id").single();
    const castC = (castRow as { id: string }).id;
    castIds.push(castC);
    const C = await mkReceivable(seatC, 10000, castC);
    const sC0 = await recvState(C.recvId);
    check("段50（準備）売掛C 生成（cast 帰属＝先頭指名から）", sC0.status === "open", JSON.stringify(sC0));
    const { error: eMk } = await mgr.rpc("receivable_mark_deduct", { p_receivable_id: C.recvId, p_consent: true, p_note: null });
    check("段50（準備）mark_deduct 成功（deduct_from_cast=true）", !eMk, eMk?.message);
    const { error: eC3 } = await mgr.rpc("receivable_collect", {
      p_receivable_id: C.recvId, p_biz_date: "2028-06-18", p_method: "cash", p_note: null,
      p_idem_key: randomUUID(), p_amount: 3000,
    });
    check("段50（準備）売掛C へ部分現金回収 3000", !eC3 && (await recvState(C.recvId)).collected_amount === 3000, eC3?.message);

    const { data: runRows, error: eRun } = await mgr.rpc("payroll_run_create", { p_store_id: sA1.id, p_period: RUN_PERIOD });
    runId = ((runRows ?? [])[0] as { id: string } | undefined)?.id ?? null;
    check("段50（準備）payroll_run_create（2028-06）", !eRun && !!runId, eRun?.message);
    const payslips = (amt: number) => [{
      cast_id: castC, net: 0, breakdown: { pay: { net: 0 }, extras: [] },
      ar_deducted: [{ receivable_id: C.recvId, amount: amt }], ar_carried: [],
    }];

    // (9) 新上限＝amount − collected を超える天引き → 'bad receivable'
    //   ★adversarial 検証済み: この assertion の期待値を旧式上限（amount のみ＝超過を成功扱い）へ
    //     一時改変して実行し、スイートが赤くなることを確認してから復元した（改変痕跡は残していない）。
    const overAmt = C.amount - 3000 + 1; // 旧上限（amount）以下・新上限（amount−collected）超＝新旧で判定が割れる境界値
    const { error: e9 } = await admin.rpc("payroll_finalize", {
      p_org_id: sA1.org_id, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: payslips(overAmt),
    });
    const s9 = await recvState(C.recvId);
    check("段50(9) ★amount−collected 超の天引きは 'bad receivable'（mig0092 新上限）",
      has(e9, "bad receivable"), e9?.message ?? "通ってしまった");
    check("段50(9) 全ロールバック（deducted=0・collected=3000 不変）",
      s9.deducted_amount === 0 && s9.collected_amount === 3000, JSON.stringify(s9));

    // (10) 残額ちょうどの天引き → 'deducted'（新 v_full＝deducted+collected=amount）
    const exactAmt = C.amount - 3000;
    const { error: e10 } = await admin.rpc("payroll_finalize", {
      p_org_id: sA1.org_id, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: payslips(exactAmt),
    });
    const s10 = await recvState(C.recvId);
    check("段50(10) ★残額ちょうどの天引き成功＝status='deducted'（deducted+collected=amount）",
      !e10 && s10.status === "deducted" && s10.deducted_amount === exactAmt && s10.collected_amount === 3000,
      e10?.message ?? JSON.stringify(s10));

    // (11) reopen 巻き戻し → deducted 復元・collected 不変・CHECK 非違反
    const { error: e11 } = await admin.rpc("payroll_reopen", {
      p_org_id: sA1.org_id, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(),
    });
    const s11 = await recvState(C.recvId);
    check("段50(11) ★reopen 成功＝deducted 巻き戻し（0・open）・collected_amount=3000 不変・CHECK 非違反（行読取可）",
      !e11 && s11.deducted_amount === 0 && s11.status === "open" && s11.collected_amount === 3000,
      e11?.message ?? JSON.stringify(s11));

    // ═══ (12) mig0093: receivable_set_due（期日の唯一の書込経路）═══
    //   売掛C は (11) の reopen で open に戻っている＝設定対象に再利用（fixture 追加ゼロ）。
    {
      const auditCount = async () =>
        (await admin.from("audit_logs").select("id", { count: "exact", head: true })
          .eq("action", "receivable_set_due").eq("target", `receivables:${C.recvId}`)).count ?? 0;
      const { error: eD1 } = await mgr.rpc("receivable_set_due", { p_receivable_id: C.recvId, p_due: "2028-07-10" });
      const sD1 = await recvState(C.recvId);
      check("段50(12) ★set_due 設定＝due='2028-07-10' 実測", !eD1 && sD1.due === "2028-07-10", eD1?.message ?? JSON.stringify(sD1));
      const a1 = await auditCount();
      check("段50(12) audit 1行（action=receivable_set_due）", a1 === 1, `got ${a1}`);
      // 無変更呼び＝無音・audit 増えない
      const { error: eD2 } = await mgr.rpc("receivable_set_due", { p_receivable_id: C.recvId, p_due: "2028-07-10" });
      const a2 = await auditCount();
      check("段50(12) ★無変更呼び＝無音 return・audit 不増", !eD2 && a2 === 1, eD2?.message ?? `audit ${a1}→${a2}`);
      // null でクリア
      const { error: eD3 } = await mgr.rpc("receivable_set_due", { p_receivable_id: C.recvId, p_due: null });
      const sD3 = await recvState(C.recvId);
      const a3 = await auditCount();
      check("段50(12) ★null でクリア＝due=null・audit 2行目", !eD3 && sD3.due === null && a3 === 2,
        eD3?.message ?? JSON.stringify({ sD3, a3 }));
      // collected 行（売掛A）は not open
      const { error: eD4 } = await mgr.rpc("receivable_set_due", { p_receivable_id: A.recvId, p_due: "2028-07-10" });
      check("段50(12) collected 行は 'not open'", has(eD4, "not open"), eD4?.message ?? "通ってしまった");
      // 他 org（managerB1）= forbidden（行実在・org 不一致の遮断）
      const mgrB = await signIn("managerB1");
      const { error: eD5 } = await mgrB.rpc("receivable_set_due", { p_receivable_id: C.recvId, p_due: "2028-07-10" });
      check("段50(12) ★他 org は forbidden", has(eD5, "forbidden"), eD5?.message ?? "通ってしまった");
    }
  } finally {
    await cleanup();
    // 掃除の自己検証（固定カウント非汚染＝段44 流儀）
    const { count: leftSeat } = await admin.from("seats")
      .select("id", { count: "exact", head: true }).like("name", `${P50}%`);
    const { count: leftCast } = await admin.from("casts")
      .select("id", { count: "exact", head: true }).like("name", `${P50}%`);
    const { count: leftRecv } = recvIds.length
      ? await admin.from("receivables").select("id", { count: "exact", head: true }).in("id", recvIds)
      : { count: 0 };
    const { data: st } = await admin.from("stores")
      .select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();
    check("段50（掃除）seats/casts/receivables 0件・stores 時間6値復元",
      (leftSeat ?? 0) === 0 && (leftCast ?? 0) === 0 && (leftRecv ?? 0) === 0
      && JSON.stringify(st) === JSON.stringify(origStore),
      JSON.stringify({ leftSeat, leftCast, leftRecv, st }));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-ar-partial ALL PASS (${pass} assertions)`);
  console.log("部分回収(0092)+期日(0093): 3000部分/idemリプレイ/残高超・0・負/null全額collected/not open/void settled/void成功/天引き新上限/新v_full/reopen不変量/set_due設定・無音・nullクリア・not open・他org forbidden");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
