/*
 * verify:nox-vip-unit — 裁定118（mig0130）VIP 方式B（vip_charge）＋課金単位（billing_unit）の係留。
 *   npm run verify:nox-vip-unit（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 舞台はルール0件店 A2（prc スイートと同じ根拠＝決定論）。stores 6値（set_min/set_fee/ext_min/ext_fee/
 * time_per/time_mode）は開始時 snapshot→明示値へ設定→finally 完全復元。owner セッション・終日全曜日ルール。
 *
 * 観点（設計書 v1 §6 の8系統）:
 *  (a) 互換: billing_unit 全 null＋vip_charge 0件＝全経路現行同値（set 行 qty=time_per 起点・
 *      vip_charge_fee null・vip 行なし・set_unit/ext_unit は time_per 値で凍結）
 *  (b) vip_charge: VIP 席で行生成（kind='charge'/time_auto/block_no=0/額/qty）・非 VIP 席で非生成・
 *      区分付き vip の一致（同 priority 区分優先）と非一致（null 版へ）
 *  (c) billing_unit: set=person（time_per table を上書き）・ext=table・vip=null→time_per 追随と person
 *  (d) 凍結: set_unit/ext_unit/vip_charge_fee/vip_charge_unit/ext_menu unit キーの snap 実測＋
 *      開栓後のルール単位変更が非遡及
 *  (e) 人数変更: person 単位 vip 行の qty 追随（manual/auto 両モード）・table 単位不変・extension 不触
 *  (f) 非干渉: auto 店で apply 実走→vip 行が upsert/削除されない＋set/ext がそれぞれ set_unit/ext_unit
 *      起点の units で再計算（混在単位: set=person・ext=table）＋返却 jsonb units/ext_units
 *  (g) ガード: 'bad unit kind'（dohan へ単位）・'bad unit'（不正値）・ラッパ6引数化の5引数相当互換・
 *      ラッパで vip_charge/ext_shimei 解決可・set_pricing_rule で ext_shimei 依然拒否
 *  (h) rate-back/日報: vip 行込み伝票の pay→close 実走（保存則＝lines Σ=total）＋
 *      categoryOf('charge','vip_charge')='other' の現状記録 pin（118-UI で time 系へ変える際に張り替え）
 *
 * 逆張り: VU_INVERT=1 で全 check の期待を反転＝全赤を実測。
 * fixture: NOX-VERIFY-vu* 命名・finally 全消し（checks/lines/payments→rules→cats→seats・audit 精密削除）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A2, loadEnvOrExit } from "./fixtures-f0";
import { categoryOf } from "../lib/nox/analytics/category-map";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const INV = process.env.VU_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

const PFX = "NOX-VERIFY-vu";

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
  const owner = await signIn("ownerA");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA2 } = await admin.from("stores")
    .select("id, org_id, set_min, set_fee, ext_min, ext_fee, time_per, time_mode").eq("name", STORE_A2).single();
  const storeA2 = sA2!.id as string;
  const orgA2 = sA2!.org_id as string;
  // ★stores 6値 snapshot（finally 復元・変更するのはこの6値のみ）
  const orig = {
    set_min: sA2!.set_min as number, set_fee: sA2!.set_fee as number,
    ext_min: sA2!.ext_min as number, ext_fee: sA2!.ext_fee as number,
    time_per: sA2!.time_per as string, time_mode: sA2!.time_mode as string,
  };

  const checkIds: string[] = [];
  const ruleIds: string[] = [];
  const seatIds: string[] = [];
  const catIds: string[] = [];

  async function teardown() {
    const { data: seats } = await admin.from("seats").select("id").like("name", `${PFX}%`);
    const allSeatIds = [...new Set([...seatIds, ...(seats ?? []).map((r) => r.id as string)])];
    if (allSeatIds.length) {
      const { data: cks } = await admin.from("checks").select("id").in("seat_id", allSeatIds);
      for (const r of cks ?? []) if (!checkIds.includes(r.id as string)) checkIds.push(r.id as string);
    }
    if (checkIds.length) {
      const { data: lns } = await admin.from("check_lines").select("id").in("check_id", checkIds);
      await admin.from("payments").delete().in("check_id", checkIds);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      const targets = [
        ...checkIds.map((id) => `checks:${id}`),
        ...(lns ?? []).map((l) => `check_lines:${l.id as string}`),
      ];
      if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
    }
    const { data: cats } = await admin.from("pricing_categories").select("id").like("name", `${PFX}%`);
    const allCatIds = [...new Set([...catIds, ...(cats ?? []).map((r) => r.id as string)])];
    if (allCatIds.length) {
      const { data: rls } = await admin.from("pricing_rules").select("id").in("category_id", allCatIds);
      for (const r of rls ?? []) if (!ruleIds.includes(r.id as string)) ruleIds.push(r.id as string);
    }
    if (ruleIds.length) {
      await admin.from("pricing_rules").delete().in("id", ruleIds);
      await admin.from("audit_logs").delete().in("target", ruleIds.map((id) => `pricing_rules:${id}`));
    }
    if (allSeatIds.length) await admin.from("seats").delete().in("id", allSeatIds);
    if (allCatIds.length) {
      await admin.from("pricing_categories").delete().in("id", allCatIds);
      await admin.from("audit_logs").delete().in("target", allCatIds.map((id) => `pricing_categories:${id}`));
    }
  }
  await teardown();

  const setStore = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("stores").update(patch).eq("id", storeA2);
    if (error) throw new Error(`stores update: ${error.message}`);
  };
  const mkSeat = async (nm: string, kind: string) => {
    const id = (await admin.from("seats").insert({
      org_id: orgA2, store_id: storeA2, name: nm, kind, sort_order: 986, is_active: true,
    }).select("id").single()).data!.id as string;
    seatIds.push(id);
    return id;
  };
  const mkCat = async (name: string, sort: number) => {
    const { data, error } = await owner.rpc("set_pricing_category", {
      p_id: null, p_store_id: storeA2, p_name: name, p_sort: sort, p_is_active: true,
    });
    if (error) throw new Error(`set_pricing_category: ${error.message}`);
    catIds.push(data as string);
    return data as string;
  };
  // 16引数 set_pricing_rule（終日・全曜日・rank なし・原則7 全値明示）
  const setRule = async (over: Record<string, unknown>) => {
    const { data, error } = await owner.rpc("set_pricing_rule", {
      p_id: null, p_store_id: storeA2, p_seat_kind: null, p_dow_mask: null,
      p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_duration_min: null,
      p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: null,
      p_billing_unit: null,
      ...over,
    });
    if (error) return { id: null as string | null, error };
    if (!ruleIds.includes(data as string)) ruleIds.push(data as string);
    return { id: data as string, error: null };
  };
  const checkRow = async (id: string) =>
    (await admin.from("checks")
      .select("total, status, set_unit, ext_unit, vip_charge_fee, vip_charge_unit, ext_menu_snap, set_fee, people")
      .eq("id", id).single()).data as {
        total: number; status: string; set_unit: string | null; ext_unit: string | null;
        vip_charge_fee: number | null; vip_charge_unit: string | null;
        ext_menu_snap: { rule_id: string; amount: number; unit?: string }[] | null;
        set_fee: number; people: number | null;
      };
  const linesOf = async (id: string) =>
    (await admin.from("check_lines")
      .select("id, kind, fee_kind, time_auto, block_no, qty, unit_price_snapshot, line_total, back_snapshot")
      .eq("check_id", id).order("sort_order")).data as {
        id: string; kind: string; fee_kind: string | null; time_auto: boolean; block_no: number | null;
        qty: number; unit_price_snapshot: number; line_total: number; back_snapshot: unknown;
      }[];
  const openAt = async (seatId: string, people: number, cat?: string) => {
    const args: Record<string, unknown> = { p_seat_id: seatId, p_people: people, p_nom_type: "free" };
    if (cat) args.p_category_id = cat;
    const { data, error } = await owner.rpc("check_open", args);
    if (data) checkIds.push(data as string);
    return { id: data as string | null, error };
  };
  const vipLines = (ls: Awaited<ReturnType<typeof linesOf>>) => ls.filter((l) => l.fee_kind === "vip_charge");

  try {
    // stores を決定論の明示値へ（set 60分5000・ext 30分2000・table・manual）
    await setStore({ set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2000, time_per: "table", time_mode: "manual" });

    const seatTaku = await mkSeat(`${PFX}-卓a`, "卓");
    const seatB1 = await mkSeat(`${PFX}-VIP1`, "VIP");
    const seatB3 = await mkSeat(`${PFX}-VIP2`, "VIP");
    const seatB4 = await mkSeat(`${PFX}-VIP3`, "VIP");
    const seatC2 = await mkSeat(`${PFX}-VIP4`, "VIP");
    const seatF = await mkSeat(`${PFX}-VIP5`, "VIP");
    const seatH = await mkSeat(`${PFX}-VIP6`, "VIP");
    const catX = await mkCat(`${PFX}区分X`, 10);
    const catY = await mkCat(`${PFX}区分Y`, 20);

    // ══ (a) 互換: rules 0件・vip 0件＝現行同値 ══
    let idA = "";
    {
      const oA = await openAt(seatTaku, 1);
      idA = oA.id ?? "";
      const row = idA ? await checkRow(idA) : null;
      const ls = idA ? await linesOf(idA) : [];
      check("vu(a1) ★rules 0件開栓＝現行同値（set 行 qty1・set_fee=stores 5000・vip_charge_fee null・vip 行なし）",
        !oA.error && row?.set_fee === 5000 && row?.vip_charge_fee === null
          && ls.filter((l) => l.fee_kind === "set").length === 1
          && ls.find((l) => l.fee_kind === "set")?.qty === 1 && vipLines(ls).length === 0,
        oA.error?.message ?? JSON.stringify({ row, ls }));
      check("vu(a2) ★新規開栓は set_unit/ext_unit へ time_per 値が凍結（'table'）・vip_charge_unit null",
        row?.set_unit === "table" && row?.ext_unit === "table" && row?.vip_charge_unit === null,
        JSON.stringify({ s: row?.set_unit, e: row?.ext_unit, v: row?.vip_charge_unit }));
    }

    // ── fixture rules 投入（set=person・ext=table・vip=null 単位・vip catX 版）──
    const rSetP = await setRule({ p_fee_kind: "set", p_amount: 8000, p_duration_min: 60, p_priority: 10, p_billing_unit: "person" });
    const rExtT = await setRule({ p_fee_kind: "extension", p_amount: 2000, p_duration_min: 30, p_priority: 10, p_billing_unit: "table" });
    const rVip = await setRule({ p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_amount: 3000, p_priority: 10 });
    const rVipX = await setRule({ p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_amount: 5000, p_priority: 10, p_category_id: catX });
    check("vu(準備) ★16引数 set_pricing_rule で4本作成（vip_charge 受理・区分付き vip 可＝裁定4）",
      !!rSetP.id && !!rExtT.id && !!rVip.id && !!rVipX.id,
      [rSetP, rExtT, rVip, rVipX].map((r) => r.error?.message).filter(Boolean).join(" / "));

    // ══ (b)(c)(d) VIP 開栓＝行生成・混在単位・凍結 ══
    let idB1 = "";
    {
      const oB = await openAt(seatB1, 2);
      idB1 = oB.id ?? "";
      const row = idB1 ? await checkRow(idB1) : null;
      const ls = idB1 ? await linesOf(idB1) : [];
      const vip = vipLines(ls)[0];
      check("vu(b1) ★VIP 席開栓＝vip_charge 行生成（kind='charge'・time_auto・block_no=0・¥3000×qty1=table）",
        !oB.error && vipLines(ls).length === 1 && vip?.kind === "charge" && vip?.time_auto === true
          && vip?.block_no === 0 && vip?.unit_price_snapshot === 3000 && vip?.qty === 1 && vip?.line_total === 3000,
        oB.error?.message ?? JSON.stringify(vip));
      check("vu(c1) ★set は billing_unit='person' が time_per='table' を上書き（qty=2・¥8000）",
        ls.find((l) => l.fee_kind === "set")?.qty === 2
          && ls.find((l) => l.fee_kind === "set")?.unit_price_snapshot === 8000,
        JSON.stringify(ls.find((l) => l.fee_kind === "set")));
      check("vu(d1) ★snap 凍結4値＋ext_menu unit キー（set_unit person・ext_unit table・vip 3000/table・menu[0].unit='table'）",
        row?.set_unit === "person" && row?.ext_unit === "table"
          && row?.vip_charge_fee === 3000 && row?.vip_charge_unit === "table"
          && row?.ext_menu_snap?.[0]?.unit === "table",
        JSON.stringify({ row: { s: row?.set_unit, e: row?.ext_unit, vf: row?.vip_charge_fee, vu: row?.vip_charge_unit }, menu: row?.ext_menu_snap }));
      check("vu(h0) ★vip_charge 行の back_snapshot=null（給与不干渉の行形）", vip?.back_snapshot === null,
        JSON.stringify(vip?.back_snapshot));
    }
    // (b2) 非 VIP 席＝a1 の卓開栓で vip 行なし（seat_kind 条件）を独立ラベルで
    {
      const ls = idA ? await linesOf(idA) : [];
      check("vu(b2) ★非 VIP 席は vip_charge 非生成（seat_kind 条件・特殊分岐なし）", vipLines(ls).length === 0,
        JSON.stringify(vipLines(ls)));
    }
    // (b3)(b4) 区分付き vip の一致・非一致
    {
      const oB3 = await openAt(seatB3, 1, catX);
      const row3 = oB3.id ? await checkRow(oB3.id) : null;
      check("vu(b3) ★区分X開栓＝区分付き vip が勝つ（同 priority 区分優先・¥5000）",
        !oB3.error && row3?.vip_charge_fee === 5000, oB3.error?.message ?? JSON.stringify(row3?.vip_charge_fee));
      const oB4 = await openAt(seatB4, 1, catY);
      const row4 = oB4.id ? await checkRow(oB4.id) : null;
      check("vu(b4) ★区分Y開栓＝catX 版非一致→null 版へ（¥3000）",
        !oB4.error && row4?.vip_charge_fee === 3000, oB4.error?.message ?? JSON.stringify(row4?.vip_charge_fee));
    }

    // ══ (c2)(d2) vip の unit を person 化→新規開栓のみ反映（非遡及）══
    let idC2 = "";
    {
      const { error: eUp } = await owner.rpc("set_pricing_rule", {
        p_id: rVip.id, p_store_id: storeA2, p_fee_kind: "vip_charge", p_seat_kind: "VIP", p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 3000, p_duration_min: null,
        p_priority: 10, p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: null,
        p_billing_unit: "person",
      });
      const oC = await openAt(seatC2, 3);
      idC2 = oC.id ?? "";
      const row = idC2 ? await checkRow(idC2) : null;
      const vip = idC2 ? vipLines(await linesOf(idC2))[0] : undefined;
      check("vu(c2) ★vip billing_unit='person'＝qty=人数3（3000×3）・vip_charge_unit='person'",
        !eUp && !oC.error && vip?.qty === 3 && vip?.line_total === 9000 && row?.vip_charge_unit === "person",
        eUp?.message ?? oC.error?.message ?? JSON.stringify({ vip, u: row?.vip_charge_unit }));
      const rowB1 = idB1 ? await checkRow(idB1) : null;
      const vipB1 = idB1 ? vipLines(await linesOf(idB1))[0] : undefined;
      check("vu(d2) ★開栓後のルール単位変更は非遡及（B1 伝票＝table/qty1 のまま）",
        rowB1?.vip_charge_unit === "table" && vipB1?.qty === 1,
        JSON.stringify({ u: rowB1?.vip_charge_unit, qty: vipB1?.qty }));
    }

    // ══ (c3) ext=table: manual 延長追加＝people 2 でも qty=1 ══
    {
      const { error: eExt } = await owner.rpc("check_extension_add", { p_check_id: idB1 });
      const ext = (await linesOf(idB1)).find((l) => l.fee_kind === "extension");
      check("vu(c3) ★manual 延長＝ext_unit('table') 起点で qty=1（people 2 でも・¥2000）",
        !eExt && ext?.qty === 1 && ext?.unit_price_snapshot === 2000 && ext?.line_total === 2000,
        eExt?.message ?? JSON.stringify(ext));
    }

    // ══ (e) 人数変更 ══
    {
      const { error: e1 } = await owner.rpc("check_set_people", { p_check_id: idC2, p_people: 5 });
      const ls = await linesOf(idC2);
      check("vu(e1) ★person 単位＝set_people(5) で vip 行 qty5（15000）・set 行 qty5（manual）",
        !e1 && vipLines(ls)[0]?.qty === 5 && vipLines(ls)[0]?.line_total === 15000
          && ls.find((l) => l.fee_kind === "set")?.qty === 5,
        e1?.message ?? JSON.stringify(ls));
      const { error: e2 } = await owner.rpc("check_set_people", { p_check_id: idB1, p_people: 4 });
      const lsB = await linesOf(idB1);
      check("vu(e2) ★table 単位＝vip 行 qty1 不変・extension 行も不触（追加時点確定）",
        !e2 && vipLines(lsB)[0]?.qty === 1 && lsB.find((l) => l.fee_kind === "extension")?.qty === 1,
        e2?.message ?? JSON.stringify(lsB));
    }

    // ══ (f) auto 店＝apply 非干渉・混在単位・返却 jsonb ══
    let idF = "";
    {
      await setStore({ time_mode: "auto" });
      const oF = await openAt(seatF, 2);
      idF = oF.id ?? "";
      // 経過100分（set60+ext30×2ブロック目）へ rewind（pricing-apply 段44(3) の型）
      await admin.from("checks").update({ started_at: new Date(Date.now() - 100 * 60000).toISOString() }).eq("id", idF);
      const { data: j, error: eAp } = await owner.rpc("check_time_charge_apply", { p_check_id: idF });
      const jr = j as { units?: number; ext_units?: number; blocks?: number } | null;
      const ls = await linesOf(idF);
      const setL = ls.find((l) => l.fee_kind === "set");
      const exts = ls.filter((l) => l.fee_kind === "extension");
      const vip = vipLines(ls)[0];
      check("vu(f1) ★混在単位の apply＝set 行 qty2（set_unit person）・ext 行2本 qty1（ext_unit table）",
        !oF.error && !eAp && setL?.qty === 2 && setL?.line_total === 16000
          && exts.length === 2 && exts.every((l) => l.qty === 1 && l.line_total === 2000),
        oF.error?.message ?? eAp?.message ?? JSON.stringify({ setL, exts }));
      check("vu(f2) ★apply は vip 行に非干渉（1本のまま・qty2/6000 不変＝person 開栓時凍結）",
        vipLines(ls).length === 1 && vip?.qty === 2 && vip?.line_total === 6000,
        JSON.stringify(vip));
      check("vu(f3) ★apply 返却 jsonb＝units 2（set 側据え置き）＋ext_units 1（追加キー）・blocks 2",
        jr?.units === 2 && jr?.ext_units === 1 && jr?.blocks === 2, JSON.stringify(jr));
      // (e3) auto でも person vip は人数追随
      const { error: e3 } = await owner.rpc("check_set_people", { p_check_id: idF, p_people: 3 });
      const vip3 = vipLines(await linesOf(idF))[0];
      check("vu(e3) ★auto モードでも person vip 行は人数追随（qty3/9000）",
        !e3 && vip3?.qty === 3 && vip3?.line_total === 9000, e3?.message ?? JSON.stringify(vip3));
      await setStore({ time_mode: "manual" });
    }

    // ══ (g) ガード ══
    {
      const g1 = await setRule({ p_fee_kind: "dohan", p_amount: 4000, p_priority: 50, p_billing_unit: "table" });
      check("vu(g1) ★dohan へ単位指定＝'bad unit kind'（fail-closed）", has(g1.error, "bad unit kind"),
        g1.error?.message ?? "通ってしまった");
      const g2 = await setRule({ p_fee_kind: "set", p_amount: 1000, p_priority: 51, p_billing_unit: "xxx" });
      check("vu(g2) ★不正値＝'bad unit'", has(g2.error, "bad unit") && !has(g2.error, "bad unit kind"),
        g2.error?.message ?? "通ってしまった");
      const { data: r5, error: e5 } = await owner.rpc("pricing_resolve", {
        p_store_id: storeA2, p_at: new Date().toISOString(), p_fee_kind: "set", p_seat_kind: null, p_rank_id: null,
      });
      check("vu(g3) ★ラッパ5引数相当呼び（p_category_id 省略）が成功＝後方互換",
        !e5 && Array.isArray(r5), e5?.message ?? JSON.stringify(r5));
      const { data: rv, error: ev } = await owner.rpc("pricing_resolve", {
        p_store_id: storeA2, p_at: new Date().toISOString(), p_fee_kind: "vip_charge", p_seat_kind: "VIP",
        p_rank_id: null, p_category_id: null,
      });
      const { error: es } = await owner.rpc("pricing_resolve", {
        p_store_id: storeA2, p_at: new Date().toISOString(), p_fee_kind: "ext_shimei", p_seat_kind: null,
        p_rank_id: null, p_category_id: null,
      });
      const rvRow = Array.isArray(rv) && rv.length ? rv[0] as { amount: number; billing_unit: string | null } : null;
      check("vu(g4) ★ラッパ whitelist 7種同期＝vip_charge 解決可（3000/person・billing_unit 露出）・ext_shimei も可",
        !ev && rvRow?.amount === 3000 && rvRow?.billing_unit === "person" && !es,
        ev?.message ?? es?.message ?? JSON.stringify(rvRow));
      const g5 = await setRule({ p_fee_kind: "ext_shimei", p_amount: 1000, p_priority: 52 });
      check("vu(g5) ★set_pricing_rule で ext_shimei は依然 'bad fee kind'（0124 設計維持）",
        has(g5.error, "bad fee kind"), g5.error?.message ?? "通ってしまった");
    }

    // ══ (h) close 実走＝保存則＋category-map 現状記録 ══
    {
      const oH = await openAt(seatH, 1);
      const idH = oH.id ?? "";
      const rowH = idH ? await checkRow(idH) : null;
      const due = rowH?.total ?? 0;
      const { error: ePay } = await owner.rpc("check_pay", {
        p_check_id: idH, p_method: "cash", p_amount: due, p_pay_group: "A", p_tendered: due, p_idem_key: randomUUID(),
      });
      const { error: eClose } = await owner.rpc("check_close", { p_check_id: idH, p_idem_key: randomUUID() });
      const rowH2 = idH ? await checkRow(idH) : null;
      const lsH = idH ? await linesOf(idH) : [];
      const lineSum = lsH.filter((l) => l.kind !== "discount").reduce((s, l) => s + l.line_total, 0);
      check("vu(h1) ★vip 行込み伝票の pay→close 実走＝closed・保存則（vip 行が close を壊さない）",
        !oH.error && !ePay && !eClose && rowH2?.status === "closed"
          && vipLines(lsH).length === 1 && lineSum > 0,
        oH.error?.message ?? ePay?.message ?? eClose?.message ?? JSON.stringify({ st: rowH2?.status, lineSum }));
      // ★118-UI（裁定118-6）: vip_charge は time 系（セット・延長と同区分）＝'other' 現状記録から張り替え済み
      check("vu(h2) ★category-map＝categoryOf('charge','vip_charge')='time'（裁定118-6・118-UI で追随済み）",
        categoryOf("charge", "vip_charge") === "time", String(categoryOf("charge", "vip_charge")));
    }
  } finally {
    await teardown();
    await admin.from("stores").update(orig).eq("id", storeA2);
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（VU_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-vip-unit ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
