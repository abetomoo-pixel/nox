/*
 * verify:nox-autocharge — 裁定111（mig0124）名簿操作を正・課金は派生 の係留。
 *   npm run verify:nox-autocharge（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * 観点（設計書 v1.1 §3 判断A'/B/C/D/E/H）:
 *  (c) 遷移ベース派生: free→hon で hon_shimei 行 insert（価格＝check_shimei_add と同額）・
 *      既存あれば追加しない・hon→jonai 付替え・→free で delete
 *  (a) キー欠落=既存値保持: nom_kind/is_dohan/ended 各キー無しで保存→既存値・派生行とも不変
 *      （kiosk のキー無送信ペイロードと同形＝kiosk 保存で種別・同伴・ended が変化しないことの機械証明）
 *  (b) ended: true=ended_at セット・再 true=旧値引継ぎ・キー欠落=保持・false=解除
 *  (d) dohan 派生: OFF→ON で qty=dohan_count（既定1）・ON→OFF で delete・
 *      ON 継続+count 変更で qty 同期（行ちょうど1本時のみ）・手動取消後は復活しない（reconcile なし）
 *  (e) active 判定: active あり∧active 合計0='bad weight'・全員 ended=許可（按分なし）
 *  (f) check_close: 全 weight 0 名簿で締め成功（sumw ガード）・check_cast_backs 0行
 *  (g) ext_shimei: enabled∧rule で active hon ごとに1行・disabled/rule なし=行なし・jonai/ended 対象外
 *  (h) has payments: 入金後の派生を伴う保存=拒否・純粋 weight 編集=成功
 *
 * 逆張り: AC_INVERT=1 で全 check の期待を反転＝全赤を実測（各 assert が落ち得ることの機械証明）。
 * fixture は段内動的生成（NOX-VERIFY-ac* 命名）＋ finally 全消し・store 設定は退避→復元。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

const INV = process.env.AC_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: "managerA1") => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1");
  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;

  // store 設定の退避（時間=manual・指名/同伴の fallback 額・ext_shimei_enabled）→ finally 復元
  const STORE_FIELDS = "set_min, set_fee, ext_min, ext_fee, time_mode, time_per, hon_fee, jonai_fee, dohan_fee, ext_shimei_enabled";
  const { data: origStore } = await admin.from("stores").select(STORE_FIELDS).eq("id", storeA1).single();

  const CASTS = ["NOX-VERIFY-acA", "NOX-VERIFY-acB", "NOX-VERIFY-acC"];
  const SEATS = ["NOX-VERIFY-ac卓1", "NOX-VERIFY-ac卓2", "NOX-VERIFY-ac卓3", "NOX-VERIFY-ac卓4", "NOX-VERIFY-ac卓5"];
  const PROD = "NOX-VERIFY-acドリンク";
  const madeChecks: string[] = [];
  const ruleIds: string[] = [];
  let castA = "", castB = "", castC = "";
  const seatIds: string[] = [];

  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").in("name", CASTS);
    const castIds = (cs ?? []).map((r) => r.id as string);
    const { data: sts } = await admin.from("seats").select("id").in("name", SEATS);
    const sIds = (sts ?? []).map((r) => r.id as string);
    const { data: chks } = sIds.length
      ? await admin.from("checks").select("id").in("seat_id", sIds)
      : { data: [] as { id: string }[] };
    const chkIds = Array.from(new Set([...(chks ?? []).map((r) => r.id as string), ...madeChecks]));
    if (chkIds.length) {
      for (const t of ["check_cast_backs", "check_nominations", "check_lines", "payments"]) {
        await admin.from(t).delete().in("check_id", chkIds);
      }
      await admin.from("checks").delete().in("id", chkIds);
    }
    if (castIds.length) {
      await admin.from("check_nominations").delete().in("cast_id", castIds);
      await admin.from("casts").delete().in("id", castIds);
    }
    if (sIds.length) await admin.from("seats").delete().in("id", sIds);
    // 教訓49 続報: stock trigger の stock_logs を products より先に消す（FK 残置＝無音失敗の予防）
    const { data: prods } = await admin.from("products").select("id").eq("name", PROD);
    const prodIds = (prods ?? []).map((r) => r.id as string);
    if (prodIds.length) {
      await admin.from("stock_logs").delete().in("product_id", prodIds);
      const { error: eProd } = await admin.from("products").delete().in("id", prodIds);
      if (eProd) console.error(`[ac teardown] products delete 失敗（次 run 先頭で自浄）: ${eProd.message}`);
    }
    if (ruleIds.length) await admin.from("pricing_rules").delete().in("id", ruleIds);
    // 自前 fixture の ext_shimei ルール残置も名指しで自浄（rule は amount=800 の store A1 ext_shimei のみ）
    await admin.from("pricing_rules").delete().eq("store_id", storeA1).eq("fee_kind", "ext_shimei");
    if (origStore) {
      const { error: eSt } = await admin.from("stores").update(origStore).eq("id", storeA1);
      if (eSt) console.error(`[ac teardown] store 復元失敗: ${eSt.message}`);
    }
  }
  await teardown();

  try {
    // ── fixture ──
    const { error: eSt } = await admin.from("stores").update({
      set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2000, time_mode: "manual", time_per: "table",
      hon_fee: 3000, jonai_fee: 1000, dohan_fee: 2000, ext_shimei_enabled: false,
    }).eq("id", storeA1);
    if (eSt) throw new Error(`store 設定: ${eSt.message}`);
    castA = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: CASTS[0], is_active: true }).select("id").single()).data!.id as string;
    castB = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: CASTS[1], is_active: true }).select("id").single()).data!.id as string;
    castC = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: CASTS[2], is_active: true }).select("id").single()).data!.id as string;
    for (const nm of SEATS) {
      seatIds.push((await admin.from("seats").insert({
        org_id: orgA, store_id: storeA1, name: nm, kind: "卓", sort_order: 970, is_active: true,
      }).select("id").single()).data!.id as string);
    }
    const openAt = async (seatIdx: number) => {
      const { data, error } = await mgr.rpc("check_open", { p_seat_id: seatIds[seatIdx], p_people: 2, p_nom_type: "free" });
      if (error) throw new Error(`check_open(${seatIdx}): ${error.message}`);
      const id = data as string; madeChecks.push(id);
      return id;
    };
    const setNoms = (chk: string, list: Record<string, unknown>[]) =>
      mgr.rpc("check_set_nominations", { p_check_id: chk, p_nominations: list });
    const feeLines = async (chk: string, kinds: string[]) =>
      ((await admin.from("check_lines")
        .select("id, fee_kind, cast_id, qty, unit_price_snapshot, line_total")
        .eq("check_id", chk).in("fee_kind", kinds).order("sort_order")).data ?? []) as
        Array<{ id: string; fee_kind: string; cast_id: string | null; qty: number; unit_price_snapshot: number; line_total: number }>;
    const nomRow = async (chk: string, cast: string) =>
      (await admin.from("check_nominations")
        .select("cast_id, ratio_weight, nom_kind, is_dohan, ended_at")
        .eq("check_id", chk).eq("cast_id", cast).single()).data as
        { ratio_weight: number; nom_kind: string; is_dohan: boolean; ended_at: string | null } | null;

    // ══ (c) 遷移ベース派生（判断C）══
    const c1 = await openAt(0);
    {
      // (c1) 新規 cast を明示 free で追加＝派生なし
      const { error: e } = await setNoms(c1, [{ cast_id: castA, weight: 100, nom_kind: "free", is_dohan: false }]);
      const l = await feeLines(c1, ["hon_shimei", "jonai_shimei", "dohan"]);
      check("ac(c1) ★新規 cast 明示 free＝派生なし（fee 行 0）", !e && l.length === 0, e?.message ?? JSON.stringify(l));
      // (c2) free→hon＝hon_shimei 行 insert
      const { error: e2 } = await setNoms(c1, [{ cast_id: castA, weight: 100, nom_kind: "hon" }]);
      const l2 = await feeLines(c1, ["hon_shimei"]);
      check("ac(c2) ★free→hon＝hon_shimei 行 insert（cast_id 一致・qty=1）",
        !e2 && l2.length === 1 && l2[0].cast_id === castA && l2[0].qty === 1,
        e2?.message ?? JSON.stringify(l2));
      // (c3) 価格＝check_shimei_add と同額（別伝票の直接課金と比較＝解決方式の同一性）
      const c2chk = await openAt(1);
      const { data: directLine, error: eD } = await mgr.rpc("check_shimei_add", {
        p_check_id: c2chk, p_cast_id: castA, p_kind: "hon", p_idem_key: randomUUID(),
      });
      const { data: dl } = await admin.from("check_lines").select("unit_price_snapshot").eq("id", (directLine as string) ?? "").single();
      check("ac(c3) ★派生行の価格＝check_shimei_add と同額（pricing_resolve_core 同一経路）",
        !eD && typeof l2[0]?.unit_price_snapshot === "number"
          && l2[0]?.unit_price_snapshot === dl?.unit_price_snapshot,
        eD?.message ?? JSON.stringify({ derived: l2[0]?.unit_price_snapshot, direct: dl?.unit_price_snapshot }));
      // (c4) 既存行あれば追加しない（直課金済み伝票で free→hon）
      const { error: e4 } = await setNoms(c2chk, [{ cast_id: castA, weight: 100, nom_kind: "hon" }]);
      const l4 = await feeLines(c2chk, ["hon_shimei"]);
      check("ac(c4) ★既存 hon_shimei 行あり＝追加しない（行数 1 のまま・裁定111-1）",
        !e4 && l4.length === 1, e4?.message ?? JSON.stringify(l4));
      // (c5) hon→jonai＝付替え
      const { error: e5 } = await setNoms(c1, [{ cast_id: castA, weight: 100, nom_kind: "jonai" }]);
      const lH = await feeLines(c1, ["hon_shimei"]);
      const lJ = await feeLines(c1, ["jonai_shimei"]);
      check("ac(c5) ★hon→jonai＝付替え（hon 行 delete・jonai 行 insert）",
        !e5 && lH.length === 0 && lJ.length === 1 && lJ[0].cast_id === castA,
        e5?.message ?? JSON.stringify({ lH, lJ }));
      // (c6) jonai→free＝行 delete
      const { error: e6 } = await setNoms(c1, [{ cast_id: castA, weight: 100, nom_kind: "free" }]);
      const l6 = await feeLines(c1, ["hon_shimei", "jonai_shimei"]);
      check("ac(c6) ★jonai→free＝行 delete（fee 行 0）", !e6 && l6.length === 0, e6?.message ?? JSON.stringify(l6));
    }

    // ══ (a) キー欠落=既存値保持（判断A'・kiosk ペイロード同形）══
    {
      // 全キー保存で hon＋同伴 qty2 を確立
      const { error: e1 } = await setNoms(c1, [{ cast_id: castA, weight: 60, nom_kind: "hon", is_dohan: true, dohan_count: 2 }]);
      const lHon = await feeLines(c1, ["hon_shimei"]);
      const lDo = await feeLines(c1, ["dohan"]);
      check("ac(a1) ★全キー保存＝hon 行1＋dohan 行 qty2（種別・同伴の派生同時成立）",
        !e1 && lHon.length === 1 && lDo.length === 1 && lDo[0].qty === 2 && lDo[0].line_total === lDo[0].unit_price_snapshot * 2,
        e1?.message ?? JSON.stringify({ lHon, lDo }));
      // キー欠落（weight のみ＝kiosk の保存ペイロードと同形）
      const { error: e2 } = await setNoms(c1, [{ cast_id: castA, weight: 70 }]);
      const r2 = await nomRow(c1, castA);
      check("ac(a2) ★キー欠落保存＝nom_kind/is_dohan 不変・weight のみ更新（kiosk 同形＝free 落ちの是正）",
        !e2 && r2?.nom_kind === "hon" && r2?.is_dohan === true && r2?.ratio_weight === 70 && r2?.ended_at === null,
        e2?.message ?? JSON.stringify(r2));
      const lHon2 = await feeLines(c1, ["hon_shimei"]);
      const lDo2 = await feeLines(c1, ["dohan"]);
      check("ac(a3) ★キー欠落保存＝派生行も不変（hon 1・dohan qty2 のまま）",
        lHon2.length === 1 && lDo2.length === 1 && lDo2[0].qty === 2,
        JSON.stringify({ lHon2, lDo2 }));
    }

    // ══ (b) ended（判断A'）══
    {
      const { error: e1 } = await setNoms(c1, [{ cast_id: castA, weight: 70, ended: true }]);
      const r1 = await nomRow(c1, castA);
      const t1 = r1?.ended_at ?? null;
      check("ac(b1) ★ended:true＝ended_at セット（kind/同伴はキー欠落＝保持）",
        !e1 && t1 !== null && r1?.nom_kind === "hon" && r1?.is_dohan === true,
        e1?.message ?? JSON.stringify(r1));
      const { error: e2 } = await setNoms(c1, [{ cast_id: castA, weight: 70, ended: true }]);
      const r2 = await nomRow(c1, castA);
      check("ac(b2) ★再 ended:true＝旧値引継ぎ（timestamp 同一）", !e2 && r2?.ended_at === t1,
        e2?.message ?? JSON.stringify({ t1, t2: r2?.ended_at }));
      const { error: e3 } = await setNoms(c1, [{ cast_id: castA, weight: 70 }]);
      const r3 = await nomRow(c1, castA);
      check("ac(b3) ★ended キー欠落＝ended_at 保持", !e3 && r3?.ended_at === t1,
        e3?.message ?? JSON.stringify({ t1, t3: r3?.ended_at }));
      const { error: e4 } = await setNoms(c1, [{ cast_id: castA, weight: 70, ended: false }]);
      const r4 = await nomRow(c1, castA);
      check("ac(b4) ★ended:false＝解除（null・復帰可）", !e4 && r4?.ended_at === null,
        e4?.message ?? JSON.stringify(r4));
    }

    // ══ (d) dohan 派生（判断C/H）══
    {
      // 現在: castA hon・is_dohan=true・dohan 行 qty2
      const { error: e1 } = await setNoms(c1, [{ cast_id: castA, weight: 100, is_dohan: true, dohan_count: 3 }]);
      const l1 = await feeLines(c1, ["dohan"]);
      check("ac(d1) ★ON 継続＋dohan_count 変更＝qty 同期（3・line_total 同期・行1本時のみ）",
        !e1 && l1.length === 1 && l1[0].qty === 3 && l1[0].line_total === l1[0].unit_price_snapshot * 3,
        e1?.message ?? JSON.stringify(l1));
      const { error: e2 } = await setNoms(c1, [{ cast_id: castA, weight: 100, is_dohan: false }]);
      const l2 = await feeLines(c1, ["dohan"]);
      check("ac(d2) ★ON→OFF＝dohan 行 delete", !e2 && l2.length === 0, e2?.message ?? JSON.stringify(l2));
      const { error: e3 } = await setNoms(c1, [{ cast_id: castA, weight: 100, is_dohan: true }]);
      const l3 = await feeLines(c1, ["dohan"]);
      check("ac(d3) ★OFF→ON（count 省略）＝qty=1 の dohan 行 insert",
        !e3 && l3.length === 1 && l3[0].qty === 1 && l3[0].cast_id === castA,
        e3?.message ?? JSON.stringify(l3));
      // 手動取消（明細側 check_remove_line）→ ON 継続保存で復活しない（reconcile なし＝裁定111-4）
      const { error: eRm } = await mgr.rpc("check_remove_line", { p_line_id: l3[0]?.id });
      const { error: e4 } = await setNoms(c1, [{ cast_id: castA, weight: 100, is_dohan: true, dohan_count: 5 }]);
      const l4 = await feeLines(c1, ["dohan"]);
      check("ac(d4) ★手動取消後＝ON 継続保存で復活しない（qty 同期も no-op）",
        !eRm && !e4 && l4.length === 0, eRm?.message ?? e4?.message ?? JSON.stringify(l4));
    }

    // ══ (e) active 判定（判断B）══
    {
      const { error: e1 } = await setNoms(c1, [
        { cast_id: castA, weight: 0 },                    // active（ended なし）
        { cast_id: castB, weight: 0, ended: true },       // ended
      ]);
      check("ac(e1) ★active あり∧active 合計0＝'bad weight'（裁定110 の趣旨を active に維持）",
        !!e1 && e1.message.includes("bad weight"), e1?.message ?? "通ってしまった");
      const { error: e2 } = await setNoms(c1, [
        { cast_id: castA, weight: 0, ended: true },
        { cast_id: castB, weight: 0, ended: true },
      ]);
      const rA = await nomRow(c1, castA);
      const rB = await nomRow(c1, castB);
      check("ac(e2) ★全員 ended＝保存成功（按分なし・全行 ended_at セット）",
        !e2 && rA?.ended_at !== null && rB?.ended_at !== null,
        e2?.message ?? JSON.stringify({ rA, rB }));
    }

    // ══ (f) check_close: 全 weight 0 名簿で締め成功（sumw ガード・判断B 同梱）══
    {
      const { data: pr, error: ePr } = await admin.from("products").insert({
        org_id: orgA, store_id: storeA1, type: "drink", name: PROD, price: 1000, category: "ドリンク",
        back_mode: "rate", back_value: 50, is_active: true, sort_order: 997,
      }).select("id").single();
      if (ePr) throw new Error(`products insert: ${ePr.message}`);
      const c3 = await openAt(2);
      const { error: eL } = await mgr.rpc("check_add_line", {
        p_check_id: c3, p_product_id: pr!.id, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      if (eL) throw new Error(`check_add_line: ${eL.message}`);
      const { error: eN } = await setNoms(c3, [
        { cast_id: castA, weight: 0, ended: true },
        { cast_id: castB, weight: 0, ended: true },
      ]);
      const { data: tot } = await admin.from("checks").select("total").eq("id", c3).single();
      const { error: ePay } = await mgr.rpc("check_pay", {
        p_check_id: c3, p_method: "cash", p_amount: tot!.total, p_pay_group: "A", p_tendered: tot!.total, p_idem_key: randomUUID(),
      });
      const { error: eC } = await mgr.rpc("check_close", { p_check_id: c3, p_idem_key: randomUUID() });
      check("ac(f1) ★全 weight=0（全員 ended）名簿＋back 対象行で締め成功（sumw=0 の除算ガード）",
        !eN && !ePay && !eC, eN?.message ?? ePay?.message ?? eC?.message);
      const { data: backs } = await admin.from("check_cast_backs").select("cast_id").eq("check_id", c3);
      check("ac(f2) ★check_cast_backs 0 行（按分なし＝cast_sales_aggregate/allocDue と整合）",
        (backs ?? []).length === 0, JSON.stringify(backs));
    }

    // ══ (g) ext_shimei（判断D/E/G）══
    {
      const c4 = await openAt(3);
      // 名簿: A=hon(active)・B=jonai(active)・C=hon→ended（派生行はここで立つ＝以降のext検証と独立）
      const { error: eN1 } = await setNoms(c4, [
        { cast_id: castA, weight: 50, nom_kind: "hon" },
        { cast_id: castB, weight: 50, nom_kind: "jonai" },
        { cast_id: castC, weight: 0, nom_kind: "hon" },
      ]);
      const { error: eN2 } = await setNoms(c4, [
        { cast_id: castA, weight: 50 },
        { cast_id: castB, weight: 50 },
        { cast_id: castC, weight: 0, ended: true },
      ]);
      if (eN1 || eN2) throw new Error(`(g) 名簿準備: ${eN1?.message ?? eN2?.message}`);
      const extShimei = () => feeLines(c4, ["ext_shimei"]);
      // disabled（既定 false）
      const { error: eE1 } = await mgr.rpc("check_extension_add", { p_check_id: c4 });
      const g1 = await extShimei();
      const ext1 = await feeLines(c4, ["extension"]);
      check("ac(g1) ★disabled＝ext_shimei 行なし（extension 行は従来どおり立つ）",
        !eE1 && g1.length === 0 && ext1.length === 1, eE1?.message ?? JSON.stringify({ g1, ext1 }));
      // enabled ∧ rule なし＝skip
      await admin.from("stores").update({ ext_shimei_enabled: true }).eq("id", storeA1);
      const { error: eE2 } = await mgr.rpc("check_extension_add", { p_check_id: c4 });
      const g2 = await extShimei();
      check("ac(g2) ★enabled∧rule なし＝課金しない（skip・stores フォールバック額なし＝判断D）",
        !eE2 && g2.length === 0, eE2?.message ?? JSON.stringify(g2));
      // enabled ∧ rule あり＝active hon ごとに1行（jonai/ended は対象外）
      const { data: rule, error: eR } = await admin.from("pricing_rules").insert({
        org_id: orgA, store_id: storeA1, fee_kind: "ext_shimei",
        seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: null,
        amount: 800, duration_min: null, priority: 10, is_active: true,
      }).select("id").single();
      if (eR) throw new Error(`(g) rule insert: ${eR.message}`);
      ruleIds.push(rule!.id as string);
      const { error: eE3 } = await mgr.rpc("check_extension_add", { p_check_id: c4 });
      const g3 = await extShimei();
      check("ac(g3) ★enabled∧rule＝active hon（castA）のみ1行・¥800・qty=1（jonai=castB/ended=castC 対象外）",
        !eE3 && g3.length === 1 && g3[0].cast_id === castA && g3[0].unit_price_snapshot === 800 && g3[0].qty === 1,
        eE3?.message ?? JSON.stringify(g3));
    }

    // ══ (h) has payments（派生のみ保守側・純粋 weight 編集は通す）══
    {
      const { data: pr } = await admin.from("products").select("id").eq("name", PROD).single();
      const c5 = await openAt(4);
      const { error: eL } = await mgr.rpc("check_add_line", {
        p_check_id: c5, p_product_id: pr!.id, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      const { error: eN } = await setNoms(c5, [
        { cast_id: castA, weight: 60, nom_kind: "hon" },
        { cast_id: castB, weight: 40 },
      ]);
      if (eL || eN) throw new Error(`(h) 準備: ${eL?.message ?? eN?.message}`);
      const { data: tot } = await admin.from("checks").select("total").eq("id", c5).single();
      const { error: ePay } = await mgr.rpc("check_pay", {
        p_check_id: c5, p_method: "cash", p_amount: tot!.total, p_pay_group: "A", p_tendered: tot!.total, p_idem_key: randomUUID(),
      });
      if (ePay) throw new Error(`(h) pay: ${ePay.message}`);
      const { error: e1 } = await setNoms(c5, [
        { cast_id: castA, weight: 70 },
        { cast_id: castB, weight: 30 },
      ]);
      const rA = await nomRow(c5, castA);
      check("ac(h1) ★入金後の純粋 weight 編集＝成功（派生なし＝従来どおり通す）",
        !e1 && rA?.ratio_weight === 70, e1?.message ?? JSON.stringify(rA));
      const { error: e2 } = await setNoms(c5, [
        { cast_id: castA, weight: 70 },
        { cast_id: castB, weight: 30, nom_kind: "jonai" },  // free→jonai＝派生 insert
      ]);
      check("ac(h2) ★入金後の派生を伴う保存＝'has payments'（合計が動く経路の保守側ガード）",
        !!e2 && e2.message.includes("has payments"), e2?.message ?? "通ってしまった");
    }
  } finally {
    await teardown();
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（AC_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-autocharge ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
