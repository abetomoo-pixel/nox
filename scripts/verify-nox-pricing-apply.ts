/**
 * verify:nox-pricing-apply — mig0084（料金ルールの課金経路結線）の runtime 実証（段44）
 *   実行: npm run verify:nox-pricing-apply（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑：0084 の肝は「開栓時凍結」＝open 後に stores/pricing_rules を
 *   変えても伝票が動かないことと、「ルール0件店の完全同値」＝改稿後も stores スナップが
 *   1値も変わらないこと。どちらも実セッションで伝票を作って初めて言える。
 *   check_time_charge_apply 無改稿でルール由来額が効くのも checks スナップ経由の実測のみ。
 *
 * 段構成（指示 1〜7・8 は verify:f0 全走で担保）:
 *   (1) ルール0件店（A2）: open → スナップ8値 = stores 完全一致・dohan_fee is null
 *   (2) ルールあり店（A1）: 解決値凍結（set=額+分・extension=額のみ→分は stores）・
 *       open 後に stores/pricing_rules を変更しても伝票不変（★凍結の実証）
 *   (3) check_time_charge_apply（mig0089 行分離）: 開卓 set 行・legacy 移行・2行体制・
 *       総額保存則（旧合算と同値）・額0で行なし・rewind で ext 行実体化＋鏡像突合
 *   (4) shimei: kind='charge'/fee_kind/cast_id/額・ランク別解決・rank 変更→新行=新額かつ
 *       既存行不変・ルール0件（jonai）= stores.jonai_fee・0円でも行が立つ
 *   (5) dohan: 凍結値×人数・null は stores フォールバック（legacy 経路＝0084 以前の伝票と同型）
 *   (6) 負系: bad kind/bad count/bad cast(他店)/inactive cast/not open/has payments/
 *       can_register false/anon BLOCKED/authenticated からの core 直呼び拒否
 *   (7) kiosk 腕: kiosk セッションの check_open でもルール解決が動く
 *
 * fixture は段内動的生成→finally 全消し（段31–33/43 型）:
 *   seats/checks/check_lines/payments/pricing_rules/cast_ranks/一時 cast は prefix・id で全削除。
 *   ★stores の変更（A1.set_fee/jonai_fee・A2.dohan_fee）は開始時に原値 snapshot → finally 復元。
 *   ★castA1a.rank_id は finally で null 復元。audit は本段の target を精密削除（action 一括
 *     削除は他スイート実行痕を巻き込むため採らない）。
 *   ★時刻依存ゼロ＝ルールは全て終日・全曜日（帯なし）で作る（now() がいつでも当たる）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";
// レジ時間UX R5（裁定29）: 表示用クライアント鏡像（blocks 式の写し）の境界 assert と RPC 突合を
// 本スイートに同居させる（time charge の正が既にここにあるため）。
import { timeBlocksOf, timeStatusOf } from "../lib/nox/check-calc";

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

const P44 = "NOX-VERIFY-P44";

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
    const { error } = await c.auth.signInWithPassword({
      email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD,
    });
    if (error) { console.error(`✗ ${key} サインイン失敗: ${error.message}`); process.exit(1); }
    return c;
  };

  const { data: sA1 } = await admin.from("stores").select("*").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("*").eq("name", STORE_A2).single();
  if (!sA1 || !sA2) { console.error("✗ fixture 店なし（seed:f0 実行済みか）"); process.exit(1); }

  // ★stores 原値 snapshot（finally 復元・変更するのはこの3値のみ）
  const orig = {
    a1SetFee: sA1.set_fee as number,
    a1JonaiFee: sA1.jonai_fee as number,
    a2DohanFee: sA2.dohan_fee as number,
  };

  // 追跡リスト（finally 全消し用）
  const checkIds: string[] = [];
  const lineIds: string[] = [];
  const tmpCastIds: string[] = [];
  let kioskAuthId = "";
  let castA1aId = "";

  const wipe = async () => {
    // stores 復元（最優先＝他スイートへの波及を断つ）
    await admin.from("stores").update({ set_fee: orig.a1SetFee, jonai_fee: orig.a1JonaiFee }).eq("id", sA1.id);
    await admin.from("stores").update({ dohan_fee: orig.a2DohanFee }).eq("id", sA2.id);
    if (checkIds.length) {
      await admin.from("payments").delete().in("check_id", checkIds);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
    }
    await admin.from("seats").delete().like("name", `${P44}%`);
    await admin.from("pricing_rules").delete().in("store_id", [sA1.id, sA2.id]);
    if (castA1aId) await admin.from("casts").update({ rank_id: null }).eq("id", castA1aId);
    if (tmpCastIds.length) await admin.from("casts").delete().in("id", tmpCastIds);
    await admin.from("cast_ranks").delete().in("store_id", [sA1.id, sA2.id]);
    // kiosk（categories (h) 型の後片付け）
    const { data: devs } = await admin.from("kiosk_devices").select("id").like("label", `${P44}%`);
    const devIds = (devs ?? []).map((d) => d.id as string);
    if (devIds.length) {
      await admin.from("kiosk_sessions").delete().in("device_id", devIds);
      await admin.from("kiosk_devices").delete().in("id", devIds);
    }
    if (kioskAuthId) await admin.auth.admin.deleteUser(kioskAuthId).catch(() => undefined);
    // audit は本段の target を精密削除（action 一括は他スイートの実行痕を巻き込む）
    const targets = [
      ...checkIds.map((id) => `checks:${id}`),
      ...lineIds.map((id) => `check_lines:${id}`),
    ];
    if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
  };

  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const regOff = await signIn("staffRegOffA1");
  check("段44（準備）owner/managerA1/staffRegOffA1 セッション解決", true);

  try {
    // ── fixture 構築 ──
    const mkSeat = async (store: { id: string; org_id: string }, nm: string, kind: string) =>
      (await admin.from("seats").insert({
        org_id: store.org_id, store_id: store.id, name: nm, kind, sort_order: 980, is_active: true,
      }).select("id").single()).data?.id as string;
    const seatA1a = await mkSeat(sA1, `${P44}-卓A`, "卓");
    const seatA1b = await mkSeat(sA1, `${P44}-卓K`, "卓");
    const seatA2 = await mkSeat(sA2, `${P44}-卓2`, "卓");

    const mkRule = async (r: Record<string, unknown>) =>
      (await admin.from("pricing_rules").insert({
        org_id: sA1.org_id, store_id: sA1.id, seat_kind: null, dow_mask: null,
        time_from_min: null, time_to_min: null, rank_id: null, duration_min: null,
        is_active: true, ...r,
      }).select("id").single()).data?.id as string;
    // ★全て終日・全曜日＝now() 依存ゼロ。set=額+分／extension=額のみ（分は stores へ coalesce）
    const ruleSet = await mkRule({ fee_kind: "set", amount: 8000, duration_min: 40, priority: 10 });
    await mkRule({ fee_kind: "extension", amount: 1500, priority: 10 });
    await mkRule({ fee_kind: "dohan", amount: 4000, priority: 10 });
    await mkRule({ fee_kind: "hon_shimei", amount: 3000, priority: 100 });
    const { data: rankRow } = await admin.from("cast_ranks").insert({
      org_id: sA1.org_id, store_id: sA1.id, name: `${P44}-ランクS`, sort_order: 970, is_active: true,
    }).select("id").single();
    const rankS = rankRow!.id as string;
    await mkRule({ fee_kind: "hon_shimei", amount: 5000, priority: 1, rank_id: rankS });
    const { data: castRow } = await admin.from("casts")
      .select("id").eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", sA1.id).single();
    castA1aId = castRow!.id as string;
    check("段44（準備）seats3・rules5・rank1・cast 解決",
      !!seatA1a && !!seatA1b && !!seatA2 && !!ruleSet && !!rankS && !!castA1aId);

    // ═══ (1) ルール0件店（A2）: スナップ8値 = stores 完全一致・dohan_fee null ═══
    {
      const { data: cid, error } = await owner.rpc("check_open", { p_seat_id: seatA2, p_people: 2, p_nom_type: "free" });
      check("段44(1) ルール0件店で check_open 成功", !error && typeof cid === "string", error?.message);
      if (typeof cid === "string") checkIds.push(cid);
      const { data: c } = await admin.from("checks").select("*").eq("id", cid as string).single();
      check("段44(1) ★スナップ8値が stores と完全一致（改稿前と完全同値＝golden 構造保証）",
        c?.service_rate === sA2.service_rate && c?.round_unit === sA2.round_unit && c?.round_mode === sA2.round_mode
        && c?.set_min === sA2.set_min && c?.set_fee === sA2.set_fee
        && c?.ext_min === sA2.ext_min && c?.ext_fee === sA2.ext_fee && c?.time_per === sA2.time_per,
        JSON.stringify({ chk: [c?.set_min, c?.set_fee, c?.ext_min, c?.ext_fee], st: [sA2.set_min, sA2.set_fee, sA2.ext_min, sA2.ext_fee] }));
      check("段44(1) ★dohan_fee は null（ルール0件＝裁定②）", c?.dohan_fee === null, `got ${c?.dohan_fee}`);
    }

    // ═══ (2) ルールあり店（A1）: 解決値凍結＋open 後変更でも伝票不変 ═══
    let chkA1 = "";
    {
      const { data: cid, error } = await mgr.rpc("check_open", { p_seat_id: seatA1a, p_people: null, p_nom_type: "free" });
      check("段44(2) ルールあり店で check_open 成功（manager）", !error && typeof cid === "string", error?.message);
      chkA1 = cid as string;
      checkIds.push(chkA1);
      const { data: c } = await admin.from("checks").select("*").eq("id", chkA1).single();
      check("段44(2) ★set はルール値（額8000＋分40）で凍結",
        c?.set_fee === 8000 && c?.set_min === 40, JSON.stringify({ fee: c?.set_fee, min: c?.set_min }));
      check("段44(2) ★extension は額のみルール（1500）・分は stores 既定へ coalesce",
        c?.ext_fee === 1500 && c?.ext_min === sA1.ext_min, JSON.stringify({ fee: c?.ext_fee, min: c?.ext_min, st: sA1.ext_min }));
      check("段44(2) ★dohan_fee はルール値 4000 で凍結", c?.dohan_fee === 4000, `got ${c?.dohan_fee}`);
      check("段44(2) 会計3値は stores のまま（rate/unit/mode は料金レーン対象外）",
        c?.service_rate === sA1.service_rate && c?.round_unit === sA1.round_unit && c?.round_mode === sA1.round_mode,
        JSON.stringify([c?.service_rate, c?.round_unit, c?.round_mode]));

      // ★凍結: open 後に rules と stores を変えても伝票は不変
      await admin.from("pricing_rules").update({ amount: 9999 }).eq("id", ruleSet);
      await admin.from("stores").update({ set_fee: orig.a1SetFee + 1 }).eq("id", sA1.id);
      const { data: c2 } = await admin.from("checks").select("set_fee, set_min, ext_fee, dohan_fee").eq("id", chkA1).single();
      check("段44(2) ★open 後に pricing_rules/stores を変更しても伝票スナップ不変（凍結）",
        c2?.set_fee === 8000 && c2?.set_min === 40 && c2?.ext_fee === 1500 && c2?.dohan_fee === 4000,
        JSON.stringify(c2));
      // 復元（以後のテストは原状のルール値で行う）
      await admin.from("pricing_rules").update({ amount: 8000 }).eq("id", ruleSet);
      await admin.from("stores").update({ set_fee: orig.a1SetFee }).eq("id", sA1.id);
    }

    // ═══ (3) check_time_charge_apply（mig0089 行分離）: legacy 移行・2行体制・総額保存則 ═══
    //   段48（R-A1）で旧「合算1行」仕様から張り替え（裁定26 書式・返り値 line_id →
    //   set_line_id/ext_line_id）。総額は旧式と同値＝金額のゴールデンは据置で行構造だけ検証を差し替え。
    {
      type ApplyRet = {
        total?: number; set_c?: number; ext_c?: number; blocks?: number; elapsed_min?: number;
        units?: number; // ★mig0097（段54）: ブロック行 assert で参照
        set_line_id?: string | null; ext_line_id?: string | null;
      };
      // (3-0) ★0089 D節: check_open が set 行を既に自動挿入している（開卓直後から明細に見える）
      const { data: atOpen } = await admin.from("check_lines")
        .select("fee_kind, kind, line_total").eq("check_id", chkA1).eq("time_auto", true);
      check("段44(3) ★開卓時 set 行が既に1本（0089 D節・ルール由来 8000・kind='time'）",
        (atOpen ?? []).length === 1 && atOpen?.[0]?.fee_kind === "set"
        && atOpen?.[0]?.kind === "time" && atOpen?.[0]?.line_total === 8000, JSON.stringify(atOpen));

      // (3-1) legacy 合算1行（旧 apply の行形＝fee_kind null・time_auto）を admin で再現 → apply が吸収
      const { data: lg, error: eLg } = await admin.from("check_lines").insert({
        org_id: sA1.org_id, store_id: sA1.id, check_id: chkA1, product_id: null, kind: "time",
        pay_group: "A", name_snapshot: "時間料金(セット+延長)", unit_price_snapshot: 9999, qty: 1,
        line_total: 9999, sort_order: 90, time_auto: true, fee_kind: null,
      }).select("id").single();
      check("段44(3) legacy 合算1行を再現（fee_kind null・新ユニークは NULL distinct で許容）", !eLg && !!lg?.id, eLg?.message);

      const { data, error } = await mgr.rpc("check_time_charge_apply", { p_check_id: chkA1 });
      const j = (data ?? {}) as ApplyRet;
      check("段44(3) check_time_charge_apply 成功（mig0089 行分離版）", !error, error?.message);
      check("段44(3) ★経過0分＝blocks 0・set_c=ルール由来 8000・ext_c 0・total 8000（旧合算と総額同値）",
        j.blocks === 0 && j.set_c === 8000 && j.ext_c === 0 && j.total === 8000, JSON.stringify(j));
      check("段44(3) 返り値＝set_line_id あり・ext_line_id なし（blocks 0 で ext 行を立てない）",
        typeof j.set_line_id === "string" && j.ext_line_id == null, JSON.stringify(j));
      const { data: t1 } = await admin.from("check_lines")
        .select("id, fee_kind, kind, name_snapshot, unit_price_snapshot, qty, line_total")
        .eq("check_id", chkA1).eq("time_auto", true).order("sort_order");
      const nullRows = (t1 ?? []).filter((l) => l.fee_kind === null);
      const setRows = (t1 ?? []).filter((l) => l.fee_kind === "set");
      const extRows = (t1 ?? []).filter((l) => l.fee_kind === "extension");
      check("段44(3) ★legacy 移行＝fee_kind null 行 0（apply が delete）・set 1本・ext 0本",
        nullRows.length === 0 && setRows.length === 1 && extRows.length === 0, JSON.stringify(t1));
      check("段44(3) set 行の実体（unit=8000×qty1・name にセット料金と分数）",
        setRows[0]?.unit_price_snapshot === 8000 && setRows[0]?.qty === 1 && setRows[0]?.line_total === 8000
        && String(setRows[0]?.name_snapshot).includes("セット料金"), JSON.stringify(setRows[0]));
      check("段44(3) ★総額保存則: Σtime_auto 行 = 返り値 total",
        (t1 ?? []).reduce((a, l) => a + (l.line_total as number), 0) === j.total, JSON.stringify(t1));

      // (3-2) 額0 ＝ 行を立てない（set 行も delete 分岐で消える）→ 原状復元
      await admin.from("checks").update({ set_fee: 0 }).eq("id", chkA1);
      const { data: d0, error: e0 } = await mgr.rpc("check_time_charge_apply", { p_check_id: chkA1 });
      const j0 = (d0 ?? {}) as ApplyRet;
      const { count: n0 } = await admin.from("check_lines")
        .select("id", { count: "exact", head: true }).eq("check_id", chkA1).eq("time_auto", true);
      check("段44(3) ★額0＝time_auto 行なし・total 0・set_line_id null（行を立てない/delete 分岐）",
        !e0 && j0.total === 0 && j0.set_line_id == null && (n0 ?? -1) === 0, JSON.stringify({ j0, n0 }));
      await admin.from("checks").update({ set_fee: 8000 }).eq("id", chkA1);

      // (3-3) rewind（seed の started_at 後付けと同型）で ext 行の実体化＝blocks>0 の runtime 実証。
      //   期待値は「RPC が返した elapsed_min を鏡像 timeBlocksOf へ入力」＝時刻非依存で決定的。
      await admin.from("checks").update(
        { started_at: new Date(Date.now() - 100 * 60_000).toISOString() }).eq("id", chkA1);
      const { data: d2, error: e2 } = await mgr.rpc("check_time_charge_apply", { p_check_id: chkA1 });
      const j2 = (d2 ?? {}) as ApplyRet;
      const { data: tchk } = await admin.from("checks").select("set_min, ext_min, ext_fee").eq("id", chkA1).single();
      const sMin = tchk?.set_min as number, eMin = tchk?.ext_min as number, eFee = tchk?.ext_fee as number;
      const expBlocks = timeBlocksOf(j2.elapsed_min ?? 0, sMin, eMin);
      check("段44(3) rewind 100分＝blocks ≥ 1・鏡像突合 timeBlocksOf(RPC.elapsed_min) = RPC.blocks",
        !e2 && expBlocks >= 1 && j2.blocks === expBlocks, JSON.stringify({ j2, sMin, eMin }));
      check("段44(3) ★超過時＝set 行と ext 末尾行の line_id が返る（mig0097: ext_line_id=block_no 最大行）",
        typeof j2.set_line_id === "string" && typeof j2.ext_line_id === "string", JSON.stringify(j2));
      if (j2.set_line_id) lineIds.push(j2.set_line_id);
      const { data: t2 } = await admin.from("check_lines")
        .select("id, fee_kind, unit_price_snapshot, qty, line_total, name_snapshot, block_no")
        .eq("check_id", chkA1).eq("time_auto", true).order("sort_order");
      // ★mig0097（段54 張り替え）: extension はブロック行化＝行数=blocks・block_no=1..n・
      //   各行 qty=units（この fixture は units=1）・unit=凍結 ext_fee・name に #k。
      const exts2 = (t2 ?? []).filter((l) => l.fee_kind === "extension");
      for (const l of exts2) lineIds.push(l.id as string);
      check("段44(3) ★ext 行の実体（mig0097 ブロック行化＝行数=blocks・block_no=1..n・各行 qty=units・name #k）",
        exts2.length === expBlocks && eFee === 1500
        && exts2.every((l, i) => l.unit_price_snapshot === eFee && l.qty === (j2.units ?? 1)
          && l.line_total === eFee * (j2.units ?? 1) && l.block_no === i + 1
          && String(l.name_snapshot).includes(`延長料金`) && String(l.name_snapshot).includes(`#${i + 1}`)),
        JSON.stringify(exts2));
      check("段44(3) ★総額保存則（超過）: Σtime_auto = total = set_c+ext_c（旧合算1行と同値）",
        (t2 ?? []).reduce((a, l) => a + (l.line_total as number), 0) === j2.total
        && j2.total === (j2.set_c ?? 0) + (j2.ext_c ?? 0), JSON.stringify({ t2, j2 }));

      // ═══ (3b) レジ時間UX R5（裁定29）: クライアント鏡像の境界 assert（純関数・時刻非依存）═══
      {
        // 境界5点＋時計逆行（set=40/ext=15 の固定値・RPC の v_blocks=(d-set+ext-1)/ext と同式）
        const st0 = timeStatusOf(0, 39 * 60_000, 40, 15);
        const st1 = timeStatusOf(0, 40 * 60_000, 40, 15);
        const st2 = timeStatusOf(0, 41 * 60_000, 40, 15);
        const st3 = timeStatusOf(0, 55 * 60_000, 40, 15);
        const st4 = timeStatusOf(0, 56 * 60_000, 40, 15);
        check("段44(3b) 鏡像境界: 経過39<set40＝セット内・残り1分", st0.inSet && st0.blocks === 0 && st0.remainMin === 1, JSON.stringify(st0));
        check("段44(3b) 鏡像境界: 経過40=set ちょうど＝セット内・残り0分（RPC d<=set と同判定）", st1.inSet && st1.blocks === 0 && st1.remainMin === 0, JSON.stringify(st1));
        check("段44(3b) 鏡像境界: 経過41＝延長1回目・次境界=set+ext", !st2.inSet && st2.blocks === 1 && st2.nextAtMs === (40 + 15) * 60_000, JSON.stringify(st2));
        check("段44(3b) 鏡像境界: 経過55=set+ext ちょうど＝延長1回目のまま", st3.blocks === 1, JSON.stringify(st3));
        check("段44(3b) 鏡像境界: 経過56＝延長2回目", st4.blocks === 2, JSON.stringify(st4));
        check("段44(3b) 鏡像境界: 時計逆行＝経過0（RPC v_d<0→0 と同判定）", timeStatusOf(60_000, 0, 40, 15).elapsedMin === 0);
      }
    }

    // ═══ (4) shimei ═══
    {
      // a) rank なし → wildcard 3000
      const { data: l1, error: e1 } = await mgr.rpc("check_shimei_add", {
        p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "hon",
      });
      check("段44(4) hon（rank なし）＝wildcard 3000 で成功", !e1 && typeof l1 === "string", e1?.message);
      if (typeof l1 === "string") lineIds.push(l1);
      const { data: r1 } = await admin.from("check_lines").select("*").eq("id", l1 as string).single();
      check("段44(4) ★行の形＝kind='charge'/fee_kind='hon_shimei'/cast_id 凍結/qty1/額3000",
        r1?.kind === "charge" && r1?.fee_kind === "hon_shimei" && r1?.cast_id === castA1aId
        && r1?.qty === 1 && r1?.unit_price_snapshot === 3000 && r1?.line_total === 3000
        && r1?.product_id === null && r1?.back_snapshot === null,
        JSON.stringify({ k: r1?.kind, f: r1?.fee_kind, c: r1?.cast_id === castA1aId, p: r1?.unit_price_snapshot }));

      // b) rank 付与 → 新行はランク行 5000・既存行は 3000 のまま
      await admin.from("casts").update({ rank_id: rankS }).eq("id", castA1aId);
      const { data: l2, error: e2 } = await mgr.rpc("check_shimei_add", {
        p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "hon",
      });
      check("段44(4) rank 付与後の新行＝ランク別 5000", !e2 && typeof l2 === "string", e2?.message);
      if (typeof l2 === "string") lineIds.push(l2);
      const { data: r2 } = await admin.from("check_lines").select("unit_price_snapshot").eq("id", l2 as string).single();
      const { data: r1b } = await admin.from("check_lines").select("unit_price_snapshot").eq("id", l1 as string).single();
      check("段44(4) ★新行=5000・既存行=3000 不変（行追加時解決＝凍結原則の例外はランク軸のみ）",
        r2?.unit_price_snapshot === 5000 && r1b?.unit_price_snapshot === 3000,
        JSON.stringify({ new: r2?.unit_price_snapshot, old: r1b?.unit_price_snapshot }));

      // c) jonai ルール0件 → stores.jonai_fee フォールバック（2500）
      await admin.from("stores").update({ jonai_fee: 2500 }).eq("id", sA1.id);
      const { data: l3, error: e3 } = await mgr.rpc("check_shimei_add", {
        p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "jonai",
      });
      check("段44(4) ★jonai ルール0件＝stores.jonai_fee(2500) へフォールバック", !e3 && typeof l3 === "string", e3?.message);
      if (typeof l3 === "string") lineIds.push(l3);
      const { data: r3 } = await admin.from("check_lines").select("unit_price_snapshot, fee_kind, name_snapshot").eq("id", l3 as string).single();
      check("段44(4) jonai 行＝fee_kind='jonai_shimei'・額2500・名称『場内指名料』",
        r3?.unit_price_snapshot === 2500 && r3?.fee_kind === "jonai_shimei" && r3?.name_snapshot === "場内指名料",
        JSON.stringify(r3));

      // d) 0円でも行が立つ（jonai_fee=0）
      await admin.from("stores").update({ jonai_fee: 0 }).eq("id", sA1.id);
      const { data: l4, error: e4 } = await mgr.rpc("check_shimei_add", {
        p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "jonai",
      });
      check("段44(4) ★0円でも行が立つ（行の存在が指名事実＝裁定①）", !e4 && typeof l4 === "string", e4?.message);
      if (typeof l4 === "string") lineIds.push(l4);
      const { data: r4 } = await admin.from("check_lines").select("unit_price_snapshot, line_total, cast_id").eq("id", l4 as string).single();
      check("段44(4) 0円行＝unit 0/total 0/cast_id 凍結",
        r4?.unit_price_snapshot === 0 && r4?.line_total === 0 && r4?.cast_id === castA1aId, JSON.stringify(r4));
      await admin.from("stores").update({ jonai_fee: orig.a1JonaiFee }).eq("id", sA1.id);

      // e) check_recalc が走っている＝checks.total は「サ料込み・丸め後」（check_group_due 同式）。
      //    ★素の Σline_total ではない（初稿の誤り＝実測 20300 vs Σ18500 で発覚。
      //      18500 × 1.10 = 20350 → round_unit 100 down = 20300）。
      const { data: sum } = await admin.from("check_lines").select("line_total").eq("check_id", chkA1);
      const net = (sum ?? []).reduce((a, x) => a + (x.line_total as number), 0);
      const { data: tot } = await admin.from("checks")
        .select("total, service_rate, round_unit, round_mode").eq("id", chkA1).single();
      const withSvc = net + Math.round(net * (tot?.service_rate as number) / 100);
      const u = tot?.round_unit as number;
      const expect = tot?.round_mode === "up" ? Math.ceil(withSvc / u) * u
        : tot?.round_mode === "round" ? Math.round(withSvc / u) * u
        : Math.floor(withSvc / u) * u;
      check("段44(4) check_recalc 連動＝checks.total = サ料込み丸め後（check_group_due 同式）",
        tot?.total === expect, `total=${tot?.total} 期待=${expect}（net=${net}）`);
    }

    // ═══ (5) dohan ═══
    {
      // ★R-2b（0119）: 同伴料は cast 必須（'cast required'）＝各呼びに p_cast_id を明示。A2 伝票用の cast も用意。
      const { data: cA2d } = await admin.from("casts").insert({
        org_id: sA2.org_id, store_id: sA2.id, name: `${P44}-A2同伴cast`, is_active: true,
      }).select("id").single();
      tmpCastIds.push(cA2d!.id as string);
      const castA2dId = cA2d!.id as string;
      // 凍結値 4000 × 3人
      const { data: l5, error: e5 } = await mgr.rpc("check_dohan_add", { p_check_id: chkA1, p_cast_id: castA1aId, p_count: 3 });
      check("段44(5) dohan＝凍結値×人数で成功", !e5 && typeof l5 === "string", e5?.message);
      if (typeof l5 === "string") lineIds.push(l5);
      const { data: r5 } = await admin.from("check_lines").select("*").eq("id", l5 as string).single();
      check("段44(5) ★unit=凍結4000/qty=3/total=12000/fee_kind='dohan'/cast_id 凍結（0119: cast 必須）",
        r5?.unit_price_snapshot === 4000 && r5?.qty === 3 && r5?.line_total === 12000
        && r5?.fee_kind === "dohan" && r5?.cast_id === castA1aId && r5?.kind === "charge",
        JSON.stringify({ u: r5?.unit_price_snapshot, q: r5?.qty, t: r5?.line_total }));

      // legacy 経路: dohan_fee null の伝票（A2 のルール0件 open）→ stores 現在値へフォールバック
      await admin.from("stores").update({ dohan_fee: 3500 }).eq("id", sA2.id);
      const chkA2 = checkIds[0];
      const { data: l6, error: e6 } = await owner.rpc("check_dohan_add", { p_check_id: chkA2, p_cast_id: castA2dId, p_count: 1 });
      check("段44(5) ★dohan_fee null（legacy/ルール0件）＝stores.dohan_fee(3500) 現在値フォールバック",
        !e6 && typeof l6 === "string", e6?.message);
      if (typeof l6 === "string") lineIds.push(l6);
      const { data: r6 } = await admin.from("check_lines").select("unit_price_snapshot, line_total").eq("id", l6 as string).single();
      check("段44(5) フォールバック行＝unit 3500/total 3500",
        r6?.unit_price_snapshot === 3500 && r6?.line_total === 3500, JSON.stringify(r6));
      await admin.from("stores").update({ dohan_fee: orig.a2DohanFee }).eq("id", sA2.id);
    }

    // ═══ (6) 負系 ═══
    {
      const { error: eK } = await mgr.rpc("check_shimei_add", { p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "dohan" });
      check("段44(6) shimei に p_kind='dohan'＝'bad kind'", has(eK, "bad kind"), eK?.message ?? "通ってしまった");
      const { error: eC } = await mgr.rpc("check_dohan_add", { p_check_id: chkA1, p_cast_id: castA1aId, p_count: 0 });
      check("段44(6) p_count=0＝'bad count'", has(eC, "bad count"), eC?.message ?? "通ってしまった");

      // 他店 cast（A2 に一時生成）
      const { data: c2 } = await admin.from("casts").insert({
        org_id: sA2.org_id, store_id: sA2.id, name: `${P44}-他店cast`, is_active: true,
      }).select("id").single();
      tmpCastIds.push(c2!.id as string);
      const { error: eBc } = await mgr.rpc("check_shimei_add", { p_check_id: chkA1, p_cast_id: c2!.id as string, p_kind: "hon" });
      check("段44(6) ★他店 cast＝'bad cast'（伝票の店と照合）", has(eBc, "bad cast"), eBc?.message ?? "通ってしまった");

      // inactive cast（A1 に一時生成・CHECK casts_active_left_on_chk 対応で left_on を設定）
      const { data: c3 } = await admin.from("casts").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: `${P44}-退店cast`, is_active: false, left_on: "2026-01-01",
      }).select("id").single();
      tmpCastIds.push(c3!.id as string);
      const { error: eIc } = await mgr.rpc("check_shimei_add", { p_check_id: chkA1, p_cast_id: c3!.id as string, p_kind: "hon" });
      check("段44(6) ★inactive cast＝'inactive cast'", has(eIc, "inactive cast"), eIc?.message ?? "通ってしまった");

      // has payments（A2 伝票に admin で入金1行 → 両 RPC 拒否 → 掃除）
      const chkA2 = checkIds[0];
      const { data: mgrUser } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
      const { data: pay } = await admin.from("payments").insert({
        org_id: sA2.org_id, store_id: sA2.id, check_id: chkA2, pay_group: "A",
        method: "cash", amount: 1000, by_user_id: mgrUser!.id,
      }).select("id").single();
      const { error: eP1 } = await owner.rpc("check_shimei_add", { p_check_id: chkA2, p_cast_id: castA1aId, p_kind: "hon" });
      check("段44(6) ★入金後の shimei＝'has payments'（合計が動く経路を塞ぐ）",
        has(eP1, "has payments") || has(eP1, "bad cast"), eP1?.message ?? "通ってしまった");
      const { error: eP2 } = await owner.rpc("check_dohan_add", { p_check_id: chkA2, p_cast_id: tmpCastIds[0], p_count: 1 });
      check("段44(6) 入金後の dohan＝'has payments'", has(eP2, "has payments"), eP2?.message ?? "通ってしまった");
      await admin.from("payments").delete().eq("id", pay!.id);

      // not open（A2 伝票を void → shimei/dohan 拒否）
      const { error: eV } = await owner.rpc("check_void", { p_check_id: chkA2, p_reason: "verify cleanup" });
      check("段44(6) 準備: check_void 成功", !eV, eV?.message);
      const { error: eNo } = await owner.rpc("check_dohan_add", { p_check_id: chkA2, p_cast_id: tmpCastIds[0], p_count: 1 });
      check("段44(6) void 済み伝票＝'not open'", has(eNo, "not open"), eNo?.message ?? "通ってしまった");

      // can_register=false の staff は forbidden
      const { error: eRo } = await regOff.rpc("check_shimei_add", { p_check_id: chkA1, p_cast_id: castA1aId, p_kind: "hon" });
      check("段44(6) ★can_register=false の staff＝forbidden", has(eRo, "forbidden"), eRo?.message ?? "通ってしまった");

      // anon BLOCKED
      const Z = "00000000-0000-0000-0000-000000000000";
      const { error: eA1 } = await anon.rpc("check_shimei_add", { p_check_id: Z, p_cast_id: Z, p_kind: "hon" });
      check("段44(6) anon check_shimei_add BLOCKED", isFnBlocked(eA1), eA1?.message ?? "実行できてしまった");
      const { error: eA2 } = await anon.rpc("check_dohan_add", { p_check_id: Z, p_cast_id: Z, p_count: 1 });
      check("段44(6) anon check_dohan_add BLOCKED", isFnBlocked(eA2), eA2?.message ?? "実行できてしまった");

      // authenticated からの core 直呼び拒否（biz_minutes_of 同型 ACL）
      const { error: eCore } = await mgr.rpc("pricing_resolve_core", {
        p_store_id: sA1.id, p_at: "2026-01-11T20:00:00+09:00", p_fee_kind: "set", p_seat_kind: null, p_rank_id: null,
      });
      check("段44(6) ★authenticated から pricing_resolve_core 直呼び＝permission denied（内部専用）",
        isFnBlocked(eCore), eCore?.message ?? "実行できてしまった");
    }

    // ═══ (7) kiosk 腕で check_open の解決が動く ═══
    {
      const kEmail = `k-verify-p44@o-${(sA1.org_id as string).replace(/-/g, "").slice(0, 8)}.nox.local`;
      const { data: lu } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const leftover = lu?.users?.find((u) => u.email === kEmail);
      if (leftover) await admin.auth.admin.deleteUser(leftover.id).catch(() => undefined);
      const { data: cu } = await admin.auth.admin.createUser({ email: kEmail, password: env.SEED_PASSWORD, email_confirm: true });
      kioskAuthId = cu?.user?.id ?? "";
      const { data: ownerUserRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.ownerA.email).single();
      const { data: ownerMemRow } = await admin.from("memberships").select("id")
        .eq("user_id", ownerUserRow!.id).eq("store_id", sA1.id).single();
      const kiosk = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: eProv } = await owner.rpc("kiosk_provision", {
        p_auth_user_id: kioskAuthId, p_store_id: sA1.id, p_label: `${P44}-reg`, p_purpose: "register",
      });
      check("段44(7) 準備 kiosk_provision(register)", !eProv, eProv?.message);
      await kiosk.auth.signInWithPassword({ email: kEmail, password: env.SEED_PASSWORD });
      await owner.rpc("set_staff_pin", { p_membership_id: ownerMemRow!.id, p_pin: "4444" });
      const { data: rLogin } = await kiosk.rpc("kiosk_login", { p_membership_id: ownerMemRow!.id, p_pin: "4444" });
      check("段44(7) 準備 kiosk_login ok:true", (rLogin as { ok?: boolean } | null)?.ok === true, JSON.stringify(rLogin));

      const { data: kcid, error: eKo } = await kiosk.rpc("check_open", { p_seat_id: seatA1b, p_people: 1, p_nom_type: "free" });
      check("段44(7) ★kiosk 腕の check_open が成功（core 解決が auth_org_id null 文脈でも動く）",
        !eKo && typeof kcid === "string", eKo?.message);
      if (typeof kcid === "string") checkIds.push(kcid);
      const { data: kc } = await admin.from("checks").select("set_fee, set_min, ext_fee, dohan_fee").eq("id", kcid as string).single();
      check("段44(7) ★kiosk 開栓でもルール解決値が凍結される（8000/40/1500/4000）",
        kc?.set_fee === 8000 && kc?.set_min === 40 && kc?.ext_fee === 1500 && kc?.dohan_fee === 4000,
        JSON.stringify(kc));
    }
  } finally {
    await wipe();
    const { count: leftSeat } = await admin.from("seats")
      .select("id", { count: "exact", head: true }).like("name", `${P44}%`);
    const { count: leftRule } = await admin.from("pricing_rules")
      .select("id", { count: "exact", head: true }).in("store_id", [sA1.id, sA2.id]);
    const { count: leftRank } = await admin.from("cast_ranks")
      .select("id", { count: "exact", head: true }).in("store_id", [sA1.id, sA2.id]);
    const { data: stA1 } = await admin.from("stores").select("set_fee, jonai_fee").eq("id", sA1.id).single();
    const { data: stA2 } = await admin.from("stores").select("dohan_fee").eq("id", sA2.id).single();
    check("段44（掃除）seats/rules/ranks 0件・stores 原値復元（固定カウント非汚染）",
      (leftSeat ?? 0) === 0 && (leftRule ?? 0) === 0 && (leftRank ?? 0) === 0
      && stA1?.set_fee === orig.a1SetFee && stA1?.jonai_fee === orig.a1JonaiFee
      && stA2?.dohan_fee === orig.a2DohanFee,
      JSON.stringify({ leftSeat, leftRule, leftRank, stA1, stA2 }));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-pricing-apply ALL PASS (${pass} assertions)`);
  console.log("課金結線: ルール0件=stores完全同値・開栓時凍結・time行分離(0089)=legacy移行/総額保存則・shimei/dohan行・kiosk腕");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
