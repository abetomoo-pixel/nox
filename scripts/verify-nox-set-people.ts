/**
 * verify:nox-set-people — mig0090 check_set_people（開卓後の人数修正）の runtime 実証（段49・E8-1）
 *   実行: npm run verify:nox-set-people（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0090 の肝は「person 制のみ開卓時 set 行（time_auto ∧ fee_kind='set'）を
 *   即時追随し、table 制・manual 押下済み延長行（time_auto=false）には触れない」こと。
 *   行の qty/line_total と checks.people/total を実セッションで突合して初めて言える。
 *
 * 段構成:
 *   (1) person 制: open(people=2)→set 行 qty=2/10000 → set_people(3)→people=3・set 行 qty=3/15000・
 *       recalc 連動（checks.total 変動）・audit 行 action='check_set_people'
 *   (2) null 許容: set_people(null)→people=null・set 行 qty=coalesce(null,1)=1/5000（CHECK 整合）
 *   (3) table 制: open(people=2)→set 行 qty=1/5000 → set_people(4)→people=4・★set 行不変（qty=1/5000）
 *   (4) manual 延長行不触: time_mode='manual'（person 制）→open(people=2)→check_extension_add
 *       （ext 行 qty=2/4000・time_auto=false）→ set_people(3)→set 行 qty=3 更新・★延長行 qty=2/4000 不変
 *   (5) 拒否系: bad people（0）/ not open / has payments（入金1行後）/ billing locked（org canceled）/
 *       anon BLOCKED
 *
 * fixture は段内動的生成→finally 全消し（段44/47 型）:
 *   seats は prefix P49・checks/lines/payments/audit は id 精密削除。stores の時間6値と
 *   org_billing.status は開始時 snapshot → finally 復元。時刻依存ゼロ（経過 0 分のまま検証）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const isFnBlocked = (e: { message?: string } | null) =>
  !!e?.message && /permission denied for function/i.test(e.message);

const P49 = "NOX-VERIFY-P49";

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
  const { data: origBilling } = await admin.from("org_billing").select("status").eq("org_id", sA1.org_id).maybeSingle();

  const checkIds: string[] = [];
  const seatIds: string[] = [];
  const cleanup = async () => {
    if (checkIds.length) {
      await admin.from("payments").delete().in("check_id", checkIds);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      const targets = checkIds.flatMap((id) => [`checks:${id}`]);
      await admin.from("audit_logs").delete().in("target", targets);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    if (origStore) await admin.from("stores").update(origStore).eq("id", sA1.id);
    if (origBilling) await admin.from("org_billing").update({ status: origBilling.status }).eq("org_id", sA1.org_id);
  };

  const mgr = await signIn("managerA1");
  check("段49（準備）managerA1 セッション解決", true);

  try {
    const mkSeat = async (nm: string) =>
      (await admin.from("seats").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: nm, kind: "卓", sort_order: 985, is_active: true,
      }).select("id").single()).data?.id as string;
    const seatA = await mkSeat(`${P49}-卓A`);
    const seatB = await mkSeat(`${P49}-卓B`);
    const seatC = await mkSeat(`${P49}-卓C`);
    seatIds.push(seatA, seatB, seatC);
    check("段49（準備）seats 3 生成", !!seatA && !!seatB && !!seatC);

    // 共通の時間設定（ルール0件店＝stores 直値が凍結される・pricing_rules は作らない）
    const setStore = async (patch: Record<string, unknown>) => {
      const { error } = await admin.from("stores").update(patch).eq("id", sA1.id);
      if (error) throw new Error(`stores 更新: ${error.message}`);
    };
    const timeRows = async (cid: string) =>
      ((await admin.from("check_lines").select("fee_kind, time_auto, qty, line_total")
        .eq("check_id", cid).eq("kind", "time").order("sort_order")).data ?? []) as
        Array<{ fee_kind: string | null; time_auto: boolean; qty: number; line_total: number }>;
    const chk = async (cid: string) =>
      (await admin.from("checks").select("people, total").eq("id", cid).single()).data as { people: number | null; total: number };

    // ═══ (1) person 制: set 行の即時追随＋recalc＋audit ═══
    let cidP = "";
    {
      await setStore({ set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2000, time_mode: "auto", time_per: "person" });
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatA, p_people: 2, p_nom_type: "free" });
      check("段49(1) person 制 check_open（people=2）", !eO && typeof cid === "string", eO?.message);
      cidP = cid as string; checkIds.push(cidP);
      const t0 = await timeRows(cidP);
      check("段49(1) 開卓時 set 行＝qty 2 / 10000（0089 D節・person 制）",
        t0.length === 1 && t0[0].fee_kind === "set" && t0[0].time_auto && t0[0].qty === 2 && t0[0].line_total === 10000,
        JSON.stringify(t0));
      const before = await chk(cidP);
      const { error: e1 } = await mgr.rpc("check_set_people", { p_check_id: cidP, p_people: 3 });
      check("段49(1) check_set_people(3) 成功", !e1, e1?.message);
      const after = await chk(cidP);
      const t1 = await timeRows(cidP);
      check("段49(1) ★people=3・set 行 qty=3 / 15000 へ即時追随",
        after.people === 3 && t1.length === 1 && t1[0].qty === 3 && t1[0].line_total === 15000, JSON.stringify({ after, t1 }));
      check("段49(1) ★check_recalc 連動＝checks.total が増加（サ料込で再計算）",
        after.total > before.total, `before=${before.total} after=${after.total}`);
      const { data: al } = await admin.from("audit_logs").select("id")
        .eq("action", "check_set_people").eq("target", `checks:${cidP}`);
      check("段49(1) audit 行生成（action=check_set_people・target=checks:<id>）", (al ?? []).length >= 1, `got ${(al ?? []).length}`);

      // ═══ (2) null 許容（CHECK `null or >0` と整合＝人数クリア） ═══
      const { error: eN } = await mgr.rpc("check_set_people", { p_check_id: cidP, p_people: null });
      const aN = await chk(cidP);
      const tN = await timeRows(cidP);
      check("段49(2) ★null 許容＝people=null・set 行 qty=coalesce(null,1)=1 / 5000",
        !eN && aN.people === null && tN[0].qty === 1 && tN[0].line_total === 5000, eN?.message ?? JSON.stringify({ aN, tN }));
    }

    // ═══ (3) table 制: people は変わるが set 行は不変 ═══
    {
      await setStore({ time_per: "table" });
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatB, p_people: 2, p_nom_type: "free" });
      check("段49(3) table 制 check_open（people=2）", !eO && typeof cid === "string", eO?.message);
      const cidT = cid as string; checkIds.push(cidT);
      const t0 = await timeRows(cidT);
      check("段49(3) 開卓時 set 行＝qty 1 / 5000（table 制＝units 1）",
        t0.length === 1 && t0[0].qty === 1 && t0[0].line_total === 5000, JSON.stringify(t0));
      const { error: e1 } = await mgr.rpc("check_set_people", { p_check_id: cidT, p_people: 4 });
      const a1 = await chk(cidT);
      const t1 = await timeRows(cidT);
      check("段49(3) ★table 制＝people=4 へ更新・set 行は不変（qty 1 / 5000）",
        !e1 && a1.people === 4 && t1.length === 1 && t1[0].qty === 1 && t1[0].line_total === 5000,
        e1?.message ?? JSON.stringify({ a1, t1 }));
    }

    // ═══ (4) manual 店: 押下済み延長行（time_auto=false）は不触 ═══
    let cidM = "";
    {
      await setStore({ time_mode: "manual", time_per: "person" });
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatC, p_people: 2, p_nom_type: "free" });
      check("段49(4) manual 店 check_open（person 制・people=2）", !eO && typeof cid === "string", eO?.message);
      cidM = cid as string; checkIds.push(cidM);
      const { error: eX } = await mgr.rpc("check_extension_add", { p_check_id: cidM });
      check("段49(4) check_extension_add 成功（延長 1押し＝1行・qty=units=2）", !eX, eX?.message);
      const { error: e1 } = await mgr.rpc("check_set_people", { p_check_id: cidM, p_people: 3 });
      const t1 = await timeRows(cidM);
      const setRow = t1.find((l) => l.time_auto && l.fee_kind === "set");
      const extRow = t1.find((l) => !l.time_auto && l.fee_kind === "extension");
      check("段49(4) ★set 行は qty=3 / 15000 へ追随・押下済み延長行は qty=2 / 4000 のまま不触",
        !e1 && setRow?.qty === 3 && setRow?.line_total === 15000
        && extRow?.qty === 2 && extRow?.line_total === 4000, e1?.message ?? JSON.stringify(t1));
    }

    // ═══ (5) 拒否系 ═══
    {
      const { error: eBad } = await mgr.rpc("check_set_people", { p_check_id: cidM, p_people: 0 });
      check("段49(5) bad people（0）拒否", has(eBad, "bad people"), eBad?.message ?? "通ってしまった");

      // has payments: cidM へ一部入金 → 拒否 → 入金は cleanup で削除
      const due = (await chk(cidM)).total;
      const { error: ePay } = await mgr.rpc("check_pay", {
        p_check_id: cidM, p_method: "cash", p_amount: Math.max(1, Math.min(1000, due)),
        p_pay_group: "A", p_tendered: null, p_idem_key: crypto.randomUUID(), p_method_detail: null,
      });
      check("段49(5) 前置き: 一部入金成功", !ePay, ePay?.message);
      const { error: eHp } = await mgr.rpc("check_set_people", { p_check_id: cidM, p_people: 5 });
      check("段49(5) ★has payments 拒否（person 制の units 変動＝入金後の合計変動を塞ぐ）",
        has(eHp, "has payments"), eHp?.message ?? "通ってしまった");

      // not open: cidP を closed 化（admin 直・cleanup で削除するテスト行）
      await admin.from("checks").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", cidP);
      const { error: eNo } = await mgr.rpc("check_set_people", { p_check_id: cidP, p_people: 2 });
      check("段49(5) not open 拒否", has(eNo, "not open"), eNo?.message ?? "通ってしまった");

      // billing locked: org を canceled へ → 拒否 → finally で復元
      await admin.from("org_billing").update({ status: "canceled" }).eq("org_id", sA1.org_id);
      const { error: eLk } = await mgr.rpc("check_set_people", { p_check_id: cidM, p_people: 5 });
      check("段49(5) ★billing locked 拒否（課金ゲート 0090 内蔵・規則A形）",
        has(eLk, "billing locked"), eLk?.message ?? "通ってしまった");
      await admin.from("org_billing").update({ status: origBilling?.status ?? "active" }).eq("org_id", sA1.org_id);

      // anon BLOCKED（EXECUTE 面）
      const { error: eAn } = await anon.rpc("check_set_people", { p_check_id: cidM, p_people: 2 });
      check("段49(5) anon BLOCKED（permission denied for function）", isFnBlocked(eAn), eAn?.message ?? "実行できてしまった");
    }
  } finally {
    await cleanup();
    // 掃除の自己検証（固定カウント非汚染＝段44 流儀）
    const { count: leftSeat } = await admin.from("seats")
      .select("id", { count: "exact", head: true }).like("name", `${P49}%`);
    const { data: st } = await admin.from("stores")
      .select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();
    const { data: ob } = await admin.from("org_billing").select("status").eq("org_id", sA1.org_id).maybeSingle();
    check("段49（掃除）seats 0件・stores 時間6値復元・org_billing 復元",
      (leftSeat ?? 0) === 0
      && JSON.stringify(st) === JSON.stringify(origStore)
      && ob?.status === origBilling?.status,
      JSON.stringify({ leftSeat, st, ob }));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-set-people ALL PASS (${pass} assertions)`);
  console.log("人数修正(0090): person制set行追随・null許容・table制不変・manual延長行不触・payments/not open/locked/anon拒否");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
