/**
 * verify:nox-analytics-t4 — mig0096（T4 集計 RPC 3本＋store_sales_targets/setter）の runtime 実証（段53・E8-6）
 *   実行: npm run verify:nox-analytics-t4（env: .env.local）
 *
 * ★台帳842 厳守: returns table の集計 RPC は「行が返る状態」での runtime 実行が検証必須
 *   （sum/avg の型昇格は 0行では発火しない）＝集計3本とも必ず行が返る fixture で実測する。
 *
 * 段構成（指示の14系＋α）:
 *   hourly:   (1) cutoff 境界＝05:59/06:00 の伝票が前営業日/当営業日へ割れる  (2) hour が JST 時計時刻
 *             (3) p_customer_id 絞込  (4) 92日超 'bad range'  (5) manager の null store 'forbidden'
 *             (6) owner null=org 合算＝2店 fixture で cutoff 店別適用（A2 を一時 12:00 化）を実測
 *             (＋) dow=biz_date の曜日・stay 分和/件数・guest_count
 *   category: (7) kind×fee_kind 生Σ → category-map 純関数経由で E8-2 出荷5分類と一致（★段53 が
 *             verify-nox-category-map の単体を実 RPC 出力で吸収する結線検証）  (8) line_count 総和
 *   cohort:   (9) 初来店月は「全履歴 min」＝窓外（2031-01）に履歴を持つ客は窓内 03 の新規に化けない
 *             （★adversarial 対象＝窓内 min 想定へ一時改変→赤→復元）  (10) offset 算出（0/1）
 *             (11) months 13 'bad range'  (12) regex 不正 'bad period'
 *   setter:   (13) upsert（再 set は行数不変で置換・audit）  (14) null=削除＋なし→なし無音
 *             (15) 'bad amount'／'bad period'  (16) manager 他店 'forbidden'
 *
 * fixture: P53 接頭辞・窓は 2031-01〜2031-04（payroll 2026-09〜2027-05/2028-06/2029-*・段52 2030-01 と非衝突）。
 *   STORE_A2 の settings_json.biz_cutoff_hm を一時 12:00 化（snapshot→finally 復元＋自己 assert）。
 *   seed 不触・finally 依存順全消し（check_lines→checks→customers→targets→audit→A2 設定復元）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";
import { sumCategories, type CategoryLine } from "../lib/nox/analytics/category-map";

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

const P53 = "NOX-VERIFY-P53";
/** 'YYYY-MM-DD' の曜日（0=日）＝app 側 dowOf と同式（UTC で解く） */
const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

type HourRow = {
  biz_date: string; dow: number; hour: number; sales: number;
  check_count: number; guest_count: number; stay_min_sum: number; stay_count: number;
};
type CatRow = { biz_date: string; kind: string; fee_kind: string | null; amount: number; line_count: number };
type CohortRow = { cohort_month: string; month_offset: number; customer_count: number };

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
  const { data: sA2row } = await admin.from("stores").select("id, settings_json").eq("name", STORE_A2).single();
  const sA2 = sA2row as { id: string; settings_json: Record<string, unknown> | null };
  const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = (mgrU as { id: string }).id;

  // A2 の settings_json snapshot（cutoff 12:00 の一時化→finally 復元）
  const a2SettingsBefore = sA2.settings_json ?? {};

  const custIds: string[] = [];
  const checkIds: string[] = [];
  const castIds: string[] = [];
  const cleanup = async () => {
    if (checkIds.length) {
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
    }
    if (castIds.length) await admin.from("casts").delete().in("id", castIds); // ★0119: dohan 行 cast 必須 CHECK 対応の fixture cast
    if (custIds.length) await admin.from("customers").delete().in("id", custIds);
    // setter の残骸（テスト中に削除済みだが保険）＋ audit
    const { data: tRows } = await admin.from("store_sales_targets")
      .select("id").eq("store_id", sA1.id).in("period", ["2031-03"]);
    for (const t of (tRows ?? []) as { id: string }[]) {
      await admin.from("store_sales_targets").delete().eq("id", t.id);
    }
    await admin.from("audit_logs").delete().eq("action", "store_sales_target_set").eq("store_id", sA1.id);
    // A2 設定復元
    await admin.from("stores").update({ settings_json: a2SettingsBefore }).eq("id", sA2.id);
  };

  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");

  try {
    // ══ fixture 準備 ══
    // A2 cutoff を一時 12:00 化（org 合算での店別 cutoff 適用の実測用）
    {
      const { error } = await admin.from("stores")
        .update({ settings_json: { ...a2SettingsBefore, biz_cutoff_hm: "12:00" } }).eq("id", sA2.id);
      check("段53（準備）A2 cutoff 一時 12:00 化", !error, error?.message);
    }
    const mkCust = async (name: string) => {
      const { data, error } = await admin.from("customers")
        .insert({ org_id: sA1.org_id, store_id: sA1.id, name: `${P53}-${name}` }).select("id").single();
      if (error) { check(`段53（準備）customer ${name}`, false, error.message); return null; }
      custIds.push(data!.id as string);
      return data!.id as string;
    };
    const c1 = await mkCust("客1");
    const c2 = await mkCust("客2");
    const cX = await mkCust("窓外履歴");
    const cY = await mkCust("コホート");

    // seat_id は NOT NULL＝seed 済みの既存 seat を各店1つ流用（行は作らない・参照のみ）
    const seatOf = async (storeId: string) => {
      const { data } = await admin.from("seats").select("id").eq("store_id", storeId).limit(1).single();
      return (data?.id as string) ?? null;
    };
    const seatA1 = await seatOf(sA1.id);
    const seatA2 = await seatOf(sA2.id);
    check("段53（準備）seat 解決（A1/A2）", !!seatA1 && !!seatA2, `A1=${seatA1} A2=${seatA2}`);
    const mkCheck = async (storeId: string, startedIso: string, closedIso: string | null, total: number,
      customerId: string | null, people: number | null) => {
      const { data, error } = await admin.from("checks").insert({
        org_id: sA1.org_id, store_id: storeId, seat_id: storeId === sA2.id ? seatA2 : seatA1,
        status: "closed", nom_type: "free",
        started_at: startedIso, closed_at: closedIso, total, people, customer_id: customerId,
        service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
      }).select("id").single();
      if (error) { check("段53（準備）check insert", false, error.message); return null; }
      checkIds.push(data!.id as string);
      return data!.id as string;
    };

    // hourly fixture（A1・cutoff 06:00 既定）: 2031-03-10 の 05:59 / 06:00 / 20:00
    await mkCheck(sA1.id, "2031-03-10T05:59:00+09:00", "2031-03-10T06:29:00+09:00", 1000, c1, 1); // biz 03-09 h5
    await mkCheck(sA1.id, "2031-03-10T06:00:00+09:00", "2031-03-10T07:30:00+09:00", 2000, c2, 2); // biz 03-10 h6 stay90
    await mkCheck(sA1.id, "2031-03-10T20:00:00+09:00", "2031-03-10T21:00:00+09:00", 3000, c1, 1); // biz 03-10 h20 stay60
    // A2（cutoff 12:00）: JST 08:00 → biz は前営業日 03-09（06:00 既定なら 03-10 になる時刻＝店別適用の判別点）
    await mkCheck(sA2.id, "2031-03-10T08:00:00+09:00", "2031-03-10T09:00:00+09:00", 4000, null, 3);
    // cohort fixture（A1）: cX=窓外 2031-01 に初来店→03 再訪／cY=02 初来店→03 再訪
    await mkCheck(sA1.id, "2031-01-15T20:00:00+09:00", "2031-01-15T21:00:00+09:00", 10, cX, 1);
    await mkCheck(sA1.id, "2031-03-05T20:00:00+09:00", "2031-03-05T21:00:00+09:00", 11, cX, 1);
    await mkCheck(sA1.id, "2031-02-10T20:00:00+09:00", "2031-02-10T21:00:00+09:00", 20, cY, 1);
    await mkCheck(sA1.id, "2031-03-12T20:00:00+09:00", "2031-03-12T21:00:00+09:00", 21, cY, 1);
    // category fixture（A1・2031-03-20）: verify-nox-category-map の (4) と同じ12行を実 DB で再現
    const k5 = await mkCheck(sA1.id, "2031-03-20T20:00:00+09:00", "2031-03-20T22:00:00+09:00", 222500, null, 2);
    if (k5) {
      // ★R-2b（0119）: dohan 行は cast_id 必須 CHECK（NOT VALID でも新規 INSERT に即時強制＝教訓47）→ fixture cast を1人用意
      const { data: dc } = await admin.from("casts").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: `${P53}-dohan-cast`, is_active: true,
      }).select("id").single();
      const dohanCastId = dc!.id as string; castIds.push(dohanCastId);
      const L = (kind: string, fee: string | null, total: number, sort: number, castId: string | null = null) => ({
        org_id: sA1.org_id, store_id: sA1.id, check_id: k5, kind, fee_kind: fee, pay_group: "A",
        name_snapshot: `${P53}-${kind}${fee ? ":" + fee : ""}`, unit_price_snapshot: total, qty: 1,
        line_total: total, sort_order: sort, cast_id: castId,
      });
      const { error } = await admin.from("check_lines").insert([
        L("set", null, 5000, 1), L("time", "set", 3000, 2), L("time", null, 2000, 3),
        L("charge", "hon_shimei", 3000, 4), L("charge", "jonai_shimei", 2000, 5), L("charge", "dohan", 4000, 6, dohanCastId),
        L("charge", null, 10000, 7), L("drink", null, 2500, 8), L("champ", null, 150000, 9),
        L("bottle", null, 40000, 10), L("custom", null, 1000, 11), L("discount", null, 1500, 12),
      ]);
      check("段53（準備）category 12行 投入", !error, error?.message);
    }

    // ══ hourly（(1)〜(6)＋dow/stay/guest）══
    {
      const { data, error } = await mgr.rpc("store_hourly_aggregate", {
        p_store_id: sA1.id, p_from: "2031-03-09", p_to: "2031-03-10", p_customer_id: null,
      });
      const rows = (data ?? []) as HourRow[];
      check("段53(1) ★cutoff 境界: 05:59 伝票は前営業日 03-09 に帰属", !error &&
        rows.some((r) => r.biz_date === "2031-03-09" && r.hour === 5 && Number(r.sales) === 1000),
        error?.message ?? JSON.stringify(rows));
      check("段53(1) ★cutoff 境界: 06:00 伝票は当営業日 03-10 に帰属",
        rows.some((r) => r.biz_date === "2031-03-10" && r.hour === 6 && Number(r.sales) === 2000), JSON.stringify(rows));
      check("段53(2) hour は JST 時計時刻（20:00 開卓＝hour 20）",
        rows.some((r) => r.biz_date === "2031-03-10" && r.hour === 20 && Number(r.sales) === 3000), JSON.stringify(rows));
      const h6 = rows.find((r) => r.biz_date === "2031-03-10" && r.hour === 6);
      check("段53(2)＋ stay/guest: h6 は stay_min_sum=90・stay_count=1・guest_count=2",
        !!h6 && Number(h6.stay_min_sum) === 90 && h6.stay_count === 1 && h6.guest_count === 2, JSON.stringify(h6));
      const h5 = rows.find((r) => r.biz_date === "2031-03-09" && r.hour === 5);
      check("段53(2)＋ dow=biz_date の曜日（前営業日行）", !!h5 && h5.dow === dowOf("2031-03-09"), JSON.stringify(h5));
    }
    {
      const { data, error } = await mgr.rpc("store_hourly_aggregate", {
        p_store_id: sA1.id, p_from: "2031-03-09", p_to: "2031-03-10", p_customer_id: c1,
      });
      const rows = (data ?? []) as HourRow[];
      const total = rows.reduce((a, r) => a + Number(r.sales), 0);
      check("段53(3) ★p_customer_id 絞込＝c1 の2伝票のみ（1000+3000・h6 が消える）",
        !error && total === 4000 && !rows.some((r) => r.hour === 6), error?.message ?? JSON.stringify(rows));
    }
    {
      const { error } = await mgr.rpc("store_hourly_aggregate", {
        p_store_id: sA1.id, p_from: "2031-01-01", p_to: "2031-04-15", p_customer_id: null,
      });
      check("段53(4) 92日超 = 'bad range'", has(error, "bad range"), error?.message ?? "通ってしまった");
    }
    {
      const { error } = await mgr.rpc("store_hourly_aggregate", {
        p_store_id: null, p_from: "2031-03-09", p_to: "2031-03-10", p_customer_id: null,
      });
      check("段53(5) ★manager の null store = 'forbidden'", has(error, "forbidden"), error?.message ?? "通ってしまった");
    }
    {
      const { data, error } = await owner.rpc("store_hourly_aggregate", {
        p_store_id: null, p_from: "2031-03-09", p_to: "2031-03-10", p_customer_id: null,
      });
      const rows = (data ?? []) as HourRow[];
      check("段53(6) ★owner null=org 合算＝A2 の 08:00 伝票が cutoff 12:00 適用で 03-09 に載る",
        !error && rows.some((r) => r.biz_date === "2031-03-09" && r.hour === 8 && Number(r.sales) === 4000),
        error?.message ?? JSON.stringify(rows));
      check("段53(6) org 合算に A1 側の行も同居（h5/h6/h20 が揃う）",
        rows.some((r) => r.hour === 5) && rows.some((r) => r.hour === 6) && rows.some((r) => r.hour === 20),
        JSON.stringify(rows.map((r) => [r.biz_date, r.hour])));
    }

    // ══ category（(7)(8)＝category-map 結線）══
    {
      const { data, error } = await mgr.rpc("store_category_aggregate", {
        p_store_id: sA1.id, p_from: "2031-03-20", p_to: "2031-03-20",
      });
      const rows = (data ?? []) as CatRow[];
      const lines: CategoryLine[] = rows.map((r) => ({ kind: r.kind, fee_kind: r.fee_kind, amount: Number(r.amount) }));
      const s = sumCategories(lines);
      check("段53(7) ★RPC 生Σ → category-map で E8-2 出荷5分類と一致（time=10000）",
        !error && s.cats.time === 10000, error?.message ?? JSON.stringify(s.cats));
      check("段53(7) drink/champ/bottle = 2500/150000/40000",
        s.cats.drink === 2500 && s.cats.champ === 150000 && s.cats.bottle === 40000, JSON.stringify(s.cats));
      check("段53(7) other=20000（指名3本+無印charge+custom）・nomFee=3000/2000/4000",
        s.cats.other === 20000 && s.nomFee.hon === 3000 && s.nomFee.jonai === 2000 && s.nomFee.dohan === 4000,
        JSON.stringify({ other: s.cats.other, nomFee: s.nomFee }));
      check("段53(7) discount=1500（別掲・正値）・total=222500（恒等）",
        s.discount === 1500 && s.total === 222500, JSON.stringify({ d: s.discount, t: s.total }));
      // E8-2 report-board の kindSums ループを逐語再現した対照計算（写像の同値を二重に係留）
      const kindSums = { time: 0, drink: 0, champ: 0, bottle: 0, other: 0 };
      let discount = 0;
      for (const r of rows) {
        const v = Number(r.amount);
        if (r.kind === "time" || r.kind === "set") kindSums.time += v;
        else if (r.kind === "drink") kindSums.drink += v;
        else if (r.kind === "champ") kindSums.champ += v;
        else if (r.kind === "bottle") kindSums.bottle += v;
        else if (r.kind === "discount") discount += Math.abs(v);
        else kindSums.other += v;
      }
      check("段53(7) ★E8-2 kindSums 逐語対照と全分類一致",
        kindSums.time === s.cats.time && kindSums.drink === s.cats.drink && kindSums.champ === s.cats.champ
        && kindSums.bottle === s.cats.bottle && kindSums.other === s.cats.other && discount === s.discount,
        JSON.stringify({ kindSums, discount }));
      check("段53(8) line_count 総和 = 12", rows.reduce((a, r) => a + r.line_count, 0) === 12,
        JSON.stringify(rows.map((r) => [r.kind, r.fee_kind, r.line_count])));
    }

    // ══ cohort（(9)〜(12)）══
    {
      const { data, error } = await mgr.rpc("store_cohort_aggregate", {
        p_store_id: sA1.id, p_from_month: "2031-02", p_months: 2,
      });
      const rows = (data ?? []) as CohortRow[];
      const at = (m: string, o: number) => rows.find((r) => r.cohort_month === m && r.month_offset === o);
      // ★(9) adversarial 対象: cX は 2031-01（窓外）に初来店済み＝窓内 03 の新規に化けない。
      //   03 コホートの offset0 は c1/c2 の 2人ちょうど（cX が混ざれば 3 になる＝改変時の赤で実証）。
      check("段53(9) ★初来店月は全履歴 min＝窓外履歴客 cX は 03 コホートに入らない（offset0=2人）",
        !error && at("2031-03", 0)?.customer_count === 2, error?.message ?? JSON.stringify(rows));
      check("段53(10) offset 算出＝cY は 02 コホート offset0=1・offset1=1（03 再訪）",
        at("2031-02", 0)?.customer_count === 1 && at("2031-02", 1)?.customer_count === 1, JSON.stringify(rows));
    }
    {
      const { error } = await mgr.rpc("store_cohort_aggregate", { p_store_id: sA1.id, p_from_month: "2031-02", p_months: 13 });
      check("段53(11) months=13 = 'bad range'", has(error, "bad range"), error?.message ?? "通ってしまった");
    }
    {
      const { error } = await mgr.rpc("store_cohort_aggregate", { p_store_id: sA1.id, p_from_month: "2031-2", p_months: 2 });
      check("段53(12) regex 不正 = 'bad period'", has(error, "bad period"), error?.message ?? "通ってしまった");
    }

    // ══ setter（(13)〜(16)）══
    {
      const { data: id1, error: e1 } = await mgr.rpc("store_sales_target_set", {
        p_store_id: sA1.id, p_period: "2031-03", p_amount: 500000,
      });
      const { data: r1 } = await admin.from("store_sales_targets")
        .select("id, sales_target").eq("store_id", sA1.id).eq("period", "2031-03");
      check("段53(13) set 500000 → 行1・値実測", !e1 && (r1 ?? []).length === 1 && r1![0].sales_target === 500000,
        e1?.message ?? JSON.stringify(r1));
      const { error: e2 } = await mgr.rpc("store_sales_target_set", {
        p_store_id: sA1.id, p_period: "2031-03", p_amount: 600000,
      });
      const { data: r2 } = await admin.from("store_sales_targets")
        .select("id, sales_target").eq("store_id", sA1.id).eq("period", "2031-03");
      check("段53(13) ★再 set＝upsert 置換（行数1不変・600000・id 不変）",
        !e2 && (r2 ?? []).length === 1 && r2![0].sales_target === 600000 && r2![0].id === r1![0].id,
        e2?.message ?? JSON.stringify(r2));
      check("段53(13) 返り値は行 id", id1 === r1![0].id, String(id1));

      const { error: e3 } = await mgr.rpc("store_sales_target_set", {
        p_store_id: sA1.id, p_period: "2031-03", p_amount: null,
      });
      const { data: r3 } = await admin.from("store_sales_targets")
        .select("id").eq("store_id", sA1.id).eq("period", "2031-03");
      const { data: aud1 } = await admin.from("audit_logs")
        .select("id").eq("action", "store_sales_target_set").eq("store_id", sA1.id);
      check("段53(14) ★null=削除（行消滅）", !e3 && (r3 ?? []).length === 0, e3?.message ?? JSON.stringify(r3));
      const audCount = (aud1 ?? []).length;
      const { data: id4, error: e4 } = await mgr.rpc("store_sales_target_set", {
        p_store_id: sA1.id, p_period: "2031-03", p_amount: null,
      });
      const { data: aud2 } = await admin.from("audit_logs")
        .select("id").eq("action", "store_sales_target_set").eq("store_id", sA1.id);
      check("段53(14) ★なし→なし＝無音（null 返り・audit 不増）",
        !e4 && id4 === null && (aud2 ?? []).length === audCount, e4?.message ?? `aud ${audCount}→${(aud2 ?? []).length}`);
      check("段53(14) audit は set/置換/削除の3行", audCount === 3, `got ${audCount}`);
    }
    {
      const { error } = await mgr.rpc("store_sales_target_set", { p_store_id: sA1.id, p_period: "2031-03", p_amount: -1 });
      check("段53(15) -1 = 'bad amount'", has(error, "bad amount"), error?.message ?? "通ってしまった");
      const { error: eP } = await mgr.rpc("store_sales_target_set", { p_store_id: sA1.id, p_period: "2031-13", p_amount: 1 });
      check("段53(15) '2031-13' = 'bad period'", has(eP, "bad period"), eP?.message ?? "通ってしまった");
    }
    {
      const { error } = await mgr.rpc("store_sales_target_set", { p_store_id: sA2.id, p_period: "2031-03", p_amount: 1 });
      check("段53(16) ★manager 他店 = 'forbidden'", has(error, "forbidden"), error?.message ?? "通ってしまった");
    }
  } finally {
    await cleanup();
    // 掃除の自己検証（seed 非汚染＋A2 設定復元）
    const { count: leftChk } = await admin.from("checks")
      .select("id", { count: "exact", head: true }).in("id", checkIds.length ? checkIds : ["00000000-0000-0000-0000-000000000000"]);
    const { count: leftCust } = await admin.from("customers")
      .select("id", { count: "exact", head: true }).like("name", `${P53}%`);
    const { count: leftTgt } = await admin.from("store_sales_targets")
      .select("id", { count: "exact", head: true }).eq("store_id", sA1.id).eq("period", "2031-03");
    const { data: a2After } = await admin.from("stores").select("settings_json").eq("id", sA2.id).single();
    check("段53（掃除）checks/customers/targets 残置ゼロ",
      (leftChk ?? 0) === 0 && (leftCust ?? 0) === 0 && (leftTgt ?? 0) === 0,
      `chk=${leftChk} cust=${leftCust} tgt=${leftTgt}`);
    check("段53（掃除）A2 settings_json 復元",
      JSON.stringify(a2After?.settings_json ?? {}) === JSON.stringify(a2SettingsBefore),
      JSON.stringify(a2After?.settings_json));
  }

  if (fails.length) {
    console.error(`verify:nox-analytics-t4 FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-analytics-t4 ALL PASS (${pass} assertions)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
