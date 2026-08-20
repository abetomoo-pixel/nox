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

    // ═══ (6) E8-1b: check_line_set_group（mig0091・会計分けの付け替え）═══
    //   time_auto 行拒否・payments 後拒否・bad group・成功時の pay_group 更新と総額不変（recalc 整合）。
    {
      const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatA, p_people: 2, p_nom_type: "free" });
      check("段49(6) 付け替え用 check_open 成功（seatA 再利用＝(1)は closed 済み）", !eO && typeof cid === "string", eO?.message);
      const cidG = cid as string; checkIds.push(cidG);
      const { data: lineId, error: eL } = await mgr.rpc("check_add_line", {
        p_check_id: cidG, p_product_id: null, p_qty: 1, p_kind: "custom",
        p_pay_group: "A", p_name: "P49付替行", p_unit_price: 1000,
      });
      check("段49(6) カスタム行追加成功", !eL && typeof lineId === "string", eL?.message);
      const before = await chk(cidG);
      const { error: eG } = await mgr.rpc("check_line_set_group", { p_line_id: lineId as string, p_group: "B" });
      check("段49(6) ★set_group('B') 成功", !eG, eG?.message);
      const { data: lg } = await admin.from("check_lines").select("pay_group").eq("id", lineId as string).single();
      const after = await chk(cidG);
      check("段49(6) ★pay_group='B' へ更新・checks.total 不変（group 横断合算＝recalc 整合）",
        lg?.pay_group === "B" && after.total === before.total, JSON.stringify({ lg, before: before.total, after: after.total }));
      // time_auto 行（開卓時 set 行）は拒否
      const { data: tset } = await admin.from("check_lines").select("id")
        .eq("check_id", cidG).eq("time_auto", true).limit(1);
      const { error: eT } = await mgr.rpc("check_line_set_group", { p_line_id: tset?.[0]?.id as string, p_group: "B" });
      check("段49(6) ★time_auto 行は 'time line' 拒否（時間料金は会計A固定）", has(eT, "time line"), eT?.message ?? "通ってしまった");
      // bad group（A-F 外）
      const { error: eBg } = await mgr.rpc("check_line_set_group", { p_line_id: lineId as string, p_group: "G" });
      check("段49(6) 'G' は bad group 拒否（'^[A-F]$'）", has(eBg, "bad group"), eBg?.message ?? "通ってしまった");
      // payments 後拒否（cidM は (5) で入金済み・非 time_auto の延長行を対象に）
      const { data: mext } = await admin.from("check_lines").select("id")
        .eq("check_id", cidM).eq("time_auto", false).eq("fee_kind", "extension").limit(1);
      const { error: eHp2 } = await mgr.rpc("check_line_set_group", { p_line_id: mext?.[0]?.id as string, p_group: "B" });
      check("段49(6) ★入金後は 'has payments' 拒否", has(eHp2, "has payments"), eHp2?.message ?? "通ってしまった");
    }

    // ═══ (7)〜(11) 段54（mig0097/0097b・R2-6/R2-7/R2-7b/R2-7c）: 時点起算＋二重化封鎖の直接検証 ═══
    //   rewind 方式（pricing-apply 段44(3-3) の started_at 後付けと同型）で「確定ブロック凍結」を実測。
    //   set40/ext30・経過115分 → blocks=(115-40+29)/30=3・#1(終端70)/#2(終端100)=終了済み・#3(終端130)=進行中。
    {
      await setStore({ set_min: 40, set_fee: 5000, ext_min: 30, ext_fee: 1500, time_mode: "auto", time_per: "person" });
      const mkSeat54 = async (nm: string) => {
        const id = (await admin.from("seats").insert({
          org_id: sA1.org_id, store_id: sA1.id, name: nm, kind: "卓", sort_order: 986, is_active: true,
        }).select("id").single()).data?.id as string;
        seatIds.push(id);
        return id;
      };
      const seatD = await mkSeat54(`${P49}-卓D`);
      const seatE = await mkSeat54(`${P49}-卓E`);
      const seatF = await mkSeat54(`${P49}-卓F`);
      const autoRows = async (cid: string) =>
        ((await admin.from("check_lines").select("id, fee_kind, qty, line_total, block_no")
          .eq("check_id", cid).eq("time_auto", true).order("block_no")).data ?? []) as
          Array<{ id: string; fee_kind: string | null; qty: number; line_total: number; block_no: number | null }>;
      const rewind = async (cid: string, min: number) =>
        admin.from("checks").update({ started_at: new Date(Date.now() - min * 60_000).toISOString() }).eq("id", cid);

      // ── (7) apply 済み伝票の時点起算: 2ブロック確定（旧 units=2）→ people 3 → 確定分不変・進行中のみ3 ──
      const { data: c7d, error: e7o } = await mgr.rpc("check_open", { p_seat_id: seatD, p_people: 2, p_nom_type: "free" });
      const c7 = c7d as string;
      check("段54(7) 準備: check_open(people=2)", !e7o && !!c7, e7o?.message);
      checkIds.push(c7);
      await rewind(c7, 115);
      const { data: j7raw, error: e7a } = await mgr.rpc("check_time_charge_apply", { p_check_id: c7 });
      const j7 = (j7raw ?? {}) as { blocks?: number; total?: number };
      const t7pre = await autoRows(c7);
      check("段54(7) 準備: 経過115分 apply＝blocks 3・ext 3行（全行 旧units qty=2）",
        !e7a && j7.blocks === 3 && t7pre.filter((l) => l.fee_kind === "extension").length === 3
        && t7pre.filter((l) => l.fee_kind === "extension").every((l) => l.qty === 2 && l.line_total === 3000),
        e7a?.message ?? JSON.stringify(t7pre));
      const { error: e7p } = await mgr.rpc("check_set_people", { p_check_id: c7, p_people: 3 });
      const t7 = await autoRows(c7);
      const extOf = (rows: typeof t7, k: number) => rows.find((l) => l.fee_kind === "extension" && l.block_no === k);
      check("段54(7) ★時点起算: people 2→3 で確定 #1/#2 は qty=2/3000 のまま凍結・進行中 #3 のみ qty=3/4500",
        !e7p
        && extOf(t7, 1)?.qty === 2 && extOf(t7, 1)?.line_total === 3000
        && extOf(t7, 2)?.qty === 2 && extOf(t7, 2)?.line_total === 3000
        && extOf(t7, 3)?.qty === 3 && extOf(t7, 3)?.line_total === 4500,
        e7p?.message ?? JSON.stringify(t7));
      check("段54(7) ★set 行は全遡及のまま（block_no=0・qty=3/15000）",
        t7.find((l) => l.fee_kind === "set")?.block_no === 0
        && t7.find((l) => l.fee_kind === "set")?.qty === 3
        && t7.find((l) => l.fee_kind === "set")?.line_total === 15000, JSON.stringify(t7));
      // 総額保存則（新意味論＝確定分+進行分の和）: 再 apply の返り値 total = Σtime_auto 行
      const { data: j7bRaw, error: e7r } = await mgr.rpc("check_time_charge_apply", { p_check_id: c7 });
      const j7b = (j7bRaw ?? {}) as { total?: number; set_c?: number; ext_c?: number };
      const sum7 = (await autoRows(c7)).reduce((a, l) => a + l.line_total, 0);
      check("段54(7) ★総額保存則（確定分+進行分の和）: total=25500=Σtime_auto 行・set_c+ext_c と一致",
        !e7r && j7b.total === 25500 && sum7 === 25500 && (j7b.set_c ?? 0) + (j7b.ext_c ?? 0) === 25500,
        e7r?.message ?? JSON.stringify({ j7b, sum7 }));

      // ── (8) 放置伝票: apply 未実行のまま 115分経過 → set_people(3) が2段 apply で旧 units を凍結 ──
      const { data: c8d, error: e8o } = await mgr.rpc("check_open", { p_seat_id: seatE, p_people: 2, p_nom_type: "free" });
      const c8 = c8d as string;
      check("段54(8) 準備: check_open(people=2・apply は呼ばない)", !e8o && !!c8, e8o?.message);
      checkIds.push(c8);
      await rewind(c8, 115);
      const { error: e8p } = await mgr.rpc("check_set_people", { p_check_id: c8, p_people: 3 });
      const t8 = await autoRows(c8);
      check("段54(8) ★放置伝票でも時点起算: ①事前 apply が旧2で凍結＝#1/#2=qty2・#3=qty3・set=qty3",
        !e8p
        && extOf(t8, 1)?.qty === 2 && extOf(t8, 2)?.qty === 2 && extOf(t8, 3)?.qty === 3
        && t8.find((l) => l.fee_kind === "set")?.qty === 3,
        e8p?.message ?? JSON.stringify(t8));

      // ── (10) check_open の null set 行 → apply → block_no=0 の1本へ収束（0097b 吸収）──
      const { data: c10d, error: e10o } = await mgr.rpc("check_open", { p_seat_id: seatF, p_people: 2, p_nom_type: "free" });
      const c10 = c10d as string;
      check("段54(10) 準備: check_open(people=2)", !e10o && !!c10, e10o?.message);
      checkIds.push(c10);
      const t10pre = await autoRows(c10);
      check("段54(10) 前提の実測: check_open 由来の set 行は block_no=null（0098 で 0 化予定＝現状の再生産源）",
        t10pre.length === 1 && t10pre[0].fee_kind === "set" && t10pre[0].block_no === null, JSON.stringify(t10pre));
      const { error: e10a } = await mgr.rpc("check_time_charge_apply", { p_check_id: c10 });
      const t10 = await autoRows(c10);
      check("段54(10) ★apply 後は set 行1本（block_no=0・qty=2/10000）＝null 行は吸収され二重化しない",
        !e10a && t10.length === 1 && t10[0].fee_kind === "set" && t10[0].block_no === 0
        && t10[0].qty === 2 && t10[0].line_total === 10000, e10a?.message ?? JSON.stringify(t10));

      // ── (11) null+0 二重化（過去バグ状態）の再現 → apply → 単一行収束・総額正常化 ──
      //   0097b 前に開卓→apply された伝票の状態を admin 直 insert で再現（block_no=0 行を複製）。
      //   ★seat は新規（check_open は同一 seat の open 伝票を自然冪等で返すため再利用不可＝(11) 初回実行で実測）
      const seatG = await mkSeat54(`${P49}-卓G`);
      const { data: c11d, error: e11o } = await mgr.rpc("check_open", { p_seat_id: seatG, p_people: 2, p_nom_type: "free" });
      const c11 = c11d as string;
      check("段54(11) 準備: check_open（新規卓 G・people=2）", !e11o && !!c11, e11o?.message);
      checkIds.push(c11);
      const { error: e11i } = await admin.from("check_lines").insert({
        org_id: sA1.org_id, store_id: sA1.id, check_id: c11, kind: "time", pay_group: "A",
        name_snapshot: "セット料金(40分)", unit_price_snapshot: 5000, qty: 2, line_total: 10000,
        sort_order: 900, time_auto: true, fee_kind: "set", block_no: 0,
      });
      const t11pre = await autoRows(c11);
      check("段54(11) 準備: null+0 の set 2本＝二重化状態を再現（Σ20000 の過大）",
        !e11i && t11pre.filter((l) => l.fee_kind === "set").length === 2
        && t11pre.reduce((a, l) => a + l.line_total, 0) === 20000, e11i?.message ?? JSON.stringify(t11pre));
      const { error: e11a } = await mgr.rpc("check_time_charge_apply", { p_check_id: c11 });
      const t11 = await autoRows(c11);
      const c11total = (await chk(c11)).total;
      check("段54(11) ★二重化伝票が apply で単一行へ収束（set 1本=10000）・checks.total も正常化（recalc 済み）",
        !e11a && t11.filter((l) => l.fee_kind === "set").length === 1
        && t11[0].block_no === 0 && t11[0].line_total === 10000
        && c11total === 11000, // 10000+サ料10%（P49 店は round down 100・11000）
        e11a?.message ?? JSON.stringify({ t11, c11total }));
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
  console.log("人数修正(0090)+会計付替(0091): person制set行追随・table制不変・manual延長行不触・set_group=B移動/total不変/time line/bad group/has payments・locked/anon拒否");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
