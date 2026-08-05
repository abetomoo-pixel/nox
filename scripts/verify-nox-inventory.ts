/**
 * verify:nox-inventory — 純増① 在庫台帳 v1（mig0061）の runtime 実証
 *   実行: npm run verify:nox-inventory（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑：mig0061 の結線は「トリガ」＝money-core RPC を byte 非改変のまま
 *   check_lines AFTER INSERT/DELETE と checks AFTER UPDATE(→void) で stock_logs を積む。
 *   トリガは WHEN 句・security definer・NOT NULL/CHECK 制約の全てを実セッションで通して初めて
 *   「会計を落とさずに在庫が動く」ことが言える（特に kiosk 経路の by_user_id null）。
 *
 * 段構成（すべて実セッション・実 RPC）:
 *   (a) check_add_line(qty=3)      → stock_logs に delta=-3 / reason='sale'
 *   (b) check_remove_line          → delta=+3 / reason='sale_remove'（物理 delete が DELETE トリガを引く）
 *   (c) 商品行ありの check を void → reason='void_recredit' で +qty（★check_void は明細を残し status のみ
 *                                    変えるため DELETE トリガでは拾えない＝checks 側 WHEN ガードの実証）
 *   (d) カスタム明細（product_id null）の add/remove → stock_logs 増分ゼロ（WHEN 句の実証）
 *   (e) kiosk register セッションで add_line → 会計が落ちず・by_user_id null で行が入る
 *       （kiosk は users 行を持たない＝トリガの v_actor が null。stock_logs.by_user_id が NULLABLE/FK なし
 *         でなければここで NOT NULL 違反→check_add_line ごと rollback していた）
 *   (f) 通し Σdelta が初期値へ復帰（在庫が増減で保存されている＝台帳としての健全性）
 *
 * fixture は段内動的生成→finally 全消し（checks/check_lines/seat/kiosk 一式＋自分が積んだ stock_logs）。
 *   ★stock_logs の掃除は「verify 店 × トリガ3 reason」で絞る（手動入出庫 reason='入荷' 等は保護）。
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

const PREFIX = "NOX-VERIFY-INV";
const TRIG_REASONS = ["sale", "sale_remove", "void_recredit"];
// 段40 で使う（他 verify と同型のヘルパ）
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 準備: 店 / 商品 / 専用卓 / manager セッション ─────────────────────────
  const { data: store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  // 在庫対象＝実商品（type drink/champ/bottle・active）。カスタム明細対照のため1つで足りる。
  const { data: prod } = store
    ? await admin.from("products").select("id, name, price").eq("store_id", store.id).eq("is_active", true).in("type", ["drink", "champ", "bottle"]).order("name").limit(1).maybeSingle()
    : { data: null };

  const wipeFixture = async () => {
    const { data: seats } = await admin.from("seats").select("id").like("name", `${PREFIX}%`);
    const seatIds = (seats ?? []).map((r) => r.id as string);
    if (seatIds.length) {
      const { data: chs } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const chIds = (chs ?? []).map((r) => r.id as string);
      if (chIds.length) {
        for (const tbl of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables", "check_seats"]) {
          await admin.from(tbl).delete().in("check_id", chIds);
        }
        await admin.from("checks").delete().in("id", chIds);
      }
    }
    // ★check_lines の delete が DELETE トリガを引く＝stock 掃除は必ず明細削除の「後」に行う。
    if (store) {
      await admin.from("stock_logs").delete().eq("store_id", store.id).in("reason", TRIG_REASONS);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    // kiosk 一式（段(e)）
    const { data: devs } = await admin.from("kiosk_devices").select("id, auth_user_id").like("label", `${PREFIX}%`);
    const devIds = (devs ?? []).map((d) => d.id as string);
    if (devIds.length) await admin.from("kiosk_sessions").delete().in("device_id", devIds);
    for (const d of devs ?? []) await admin.auth.admin.deleteUser(d.auth_user_id as string).catch(() => undefined);
    await admin.from("kiosk_devices").delete().like("label", `${PREFIX}%`);
  };
  await wipeFixture(); // 前回遺物（中断時）を先に掃く＝再実行冪等

  const { data: seatRow } = store
    ? await admin.from("seats").insert({ org_id: store.org_id, store_id: store.id, name: `${PREFIX}-卓`, kind: "卓", sort_order: 995, is_active: true }).select("id").single()
    : { data: null };

  const mgr = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: eSign } = await mgr.auth.signInWithPassword({
    email: FIXTURE_USERS.managerA1.email, password: env.SEED_PASSWORD,
  });

  check("（準備）店/商品/専用卓/manager セッション 解決",
    !!store && !!prod && !!seatRow && !eSign,
    JSON.stringify({ store: !!store, prod: prod?.name, seat: !!seatRow, signIn: eSign?.message ?? "ok" }));

  if (!store || !prod || !seatRow) {
    report();
    return;
  }
  const seatId = seatRow.id as string;
  const productId = prod.id as string;

  // stock_logs ヘルパー（この商品の行のみ・Σdelta と最新行）
  const sumDelta = async (): Promise<number> => {
    const { data } = await admin.from("stock_logs").select("delta").eq("product_id", productId);
    return (data ?? []).reduce((s, r) => s + (r.delta as number), 0);
  };
  const rowsOf = async (reason: string) => {
    const { data } = await admin.from("stock_logs")
      .select("id, delta, reason, by_user_id, at").eq("product_id", productId).eq("reason", reason)
      .order("at", { ascending: false });
    return (data ?? []) as { id: string; delta: number; reason: string; by_user_id: string | null }[];
  };
  const countAll = async (): Promise<number> => {
    const { count } = await admin.from("stock_logs").select("id", { count: "exact", head: true }).eq("product_id", productId);
    return count ?? 0;
  };

  const base = await sumDelta();          // (f) の基準＝トリガ以外の在庫（入荷等）
  let kioskAuthId = "";

  try {
    // ═══ (a) 売上で在庫が減る: check_add_line(qty=3) → delta=-3 / 'sale' ═══
    const { data: ch1, error: eOpen1 } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("(a) check_open 成功", !eOpen1 && typeof ch1 === "string", eOpen1?.message);
    const { data: line1, error: eAdd1 } = await mgr.rpc("check_add_line", {
      p_check_id: ch1, p_product_id: productId, p_qty: 3, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
    });
    check("(a) ★check_add_line(qty=3) が落ちない（トリガ同居でも会計成功）", !eAdd1 && typeof line1 === "string", eAdd1?.message);
    const sale = await rowsOf("sale");
    check("(a) ★stock_logs に sale 行 delta=-3（売上で在庫が減る）",
      sale.length === 1 && sale[0].delta === -3, JSON.stringify(sale.slice(0, 2)));
    check("(a) Σdelta = 基準 −3", (await sumDelta()) === base - 3, `got ${await sumDelta()} / base ${base}`);

    // ═══ (b) 明細取消で戻る: check_remove_line → delta=+3 / 'sale_remove' ═══
    const { error: eRm } = await mgr.rpc("check_remove_line", { p_line_id: line1 });
    check("(b) check_remove_line 成功", !eRm, eRm?.message);
    const rem = await rowsOf("sale_remove");
    check("(b) ★stock_logs に sale_remove 行 delta=+3（物理 delete が DELETE トリガを引く）",
      rem.length === 1 && rem[0].delta === 3, JSON.stringify(rem.slice(0, 2)));
    check("(b) Σdelta が基準へ復帰（add→remove で正味0）", (await sumDelta()) === base, `got ${await sumDelta()} / base ${base}`);

    // ═══ (c) void で戻る: 商品行ありの check を void → 'void_recredit' ═══
    //   ★check_void は check_lines を消さず status のみ変える（現物確認済）＝DELETE トリガでは拾えない。
    const { data: line2, error: eAdd2 } = await mgr.rpc("check_add_line", {
      p_check_id: ch1, p_product_id: productId, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
    });
    check("(c) 準備 check_add_line(qty=2)", !eAdd2 && typeof line2 === "string", eAdd2?.message);
    check("(c) 準備後 Σdelta = 基準 −2", (await sumDelta()) === base - 2, `got ${await sumDelta()}`);
    const { error: eVoid } = await mgr.rpc("check_void", { p_check_id: ch1, p_reason: `${PREFIX} void 検証` });
    check("(c) check_void 成功", !eVoid, eVoid?.message);
    const vr = await rowsOf("void_recredit");
    check("(c) ★stock_logs に void_recredit 行 delta=+2（明細は残るが在庫は戻る）",
      vr.length === 1 && vr[0].delta === 2, JSON.stringify(vr.slice(0, 2)));
    check("(c) ★void 後 Σdelta が基準へ復帰（正味0）", (await sumDelta()) === base, `got ${await sumDelta()} / base ${base}`);
    // void 済み伝票の明細は保持されている（前提の実証＝DELETE トリガでは戻せない根拠）
    const { count: lineCnt } = await admin.from("check_lines").select("id", { count: "exact", head: true }).eq("check_id", ch1 as string);
    check("(c) ★void 後も check_lines は保持（status のみ変わる前提の実証）", (lineCnt ?? 0) === 1, `got ${lineCnt}`);

    // ═══ (d) カスタム明細は在庫を動かさない（product_id null → WHEN 句で非発火）═══
    const cntBefore = await countAll();
    const { data: ch2, error: eOpen2 } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("(d) 準備 check_open（2枚目）", !eOpen2 && typeof ch2 === "string", eOpen2?.message);
    const { data: cLine, error: eCustom } = await mgr.rpc("check_add_line", {
      p_check_id: ch2, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: `${PREFIX}-セット`, p_unit_price: 5000,
    });
    check("(d) カスタム明細 add 成功", !eCustom && typeof cLine === "string", eCustom?.message);
    const { error: eCustomRm } = await mgr.rpc("check_remove_line", { p_line_id: cLine });
    check("(d) カスタム明細 remove 成功", !eCustomRm, eCustomRm?.message);
    check("(d) ★カスタム明細の add/remove で stock_logs 増分ゼロ（product_id null は非発火）",
      (await countAll()) === cntBefore, `got ${await countAll()} / before ${cntBefore}`);
    check("(d) Σdelta 不変", (await sumDelta()) === base, `got ${await sumDelta()}`);

    // ═══ (e) kiosk セッション: by_user_id null でも行が入り会計が落ちない ═══
    const kEmail = `k-verify-inv@o-${(store.org_id as string).replace(/-/g, "").slice(0, 8)}.nox.local`;
    const { data: ownerUserRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.ownerA.email).single();
    const { data: ownerMemRow } = ownerUserRow
      ? await admin.from("memberships").select("id").eq("user_id", ownerUserRow.id).eq("store_id", store.id).single()
      : { data: null };
    const ownerMem = ownerMemRow?.id as string | undefined;
    const { data: lu } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const leftover = lu?.users?.find((u) => u.email === kEmail);
    if (leftover) await admin.auth.admin.deleteUser(leftover.id).catch(() => undefined);
    const { data: cu } = await admin.auth.admin.createUser({ email: kEmail, password: env.SEED_PASSWORD, email_confirm: true });
    kioskAuthId = cu?.user?.id ?? "";

    const owner = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await owner.auth.signInWithPassword({ email: FIXTURE_USERS.ownerA.email, password: env.SEED_PASSWORD });
    const kiosk = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (kioskAuthId && ownerMem) {
      const { error: eProv } = await owner.rpc("kiosk_provision", {
        p_auth_user_id: kioskAuthId, p_store_id: store.id, p_label: `${PREFIX}-reg`, p_purpose: "register",
      });
      check("(e) 準備 kiosk_provision(register)", !eProv, eProv?.message);
      const { error: eKSign } = await kiosk.auth.signInWithPassword({ email: kEmail, password: env.SEED_PASSWORD });
      check("(e) 準備 kiosk device signIn", !eKSign, eKSign?.message);
      const { error: ePin } = await owner.rpc("set_staff_pin", { p_membership_id: ownerMem, p_pin: "4321" });
      check("(e) 準備 set_staff_pin", !ePin, ePin?.message);
      const { data: rLogin } = await kiosk.rpc("kiosk_login", { p_membership_id: ownerMem, p_pin: "4321" });
      check("(e) 準備 kiosk_login ok:true", (rLogin as { ok?: boolean } | null)?.ok === true, JSON.stringify(rLogin));

      const sumBeforeK = await sumDelta();
      const { data: kLine, error: eKAdd } = await kiosk.rpc("check_add_line", {
        p_check_id: ch2, p_product_id: productId, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      check("(e) ★kiosk セッションの check_add_line が落ちない（by_user_id null 許容の実証）",
        !eKAdd && typeof kLine === "string", eKAdd?.message);
      const kSale = (await rowsOf("sale"))[0];
      check("(e) ★kiosk 由来の sale 行が入り by_user_id は null（users 行を持たない経路）",
        !!kSale && kSale.delta === -1 && kSale.by_user_id === null, JSON.stringify(kSale));
      check("(e) Σdelta = 直前 −1", (await sumDelta()) === sumBeforeK - 1, `got ${await sumDelta()}`);

      // (f) 復帰のため kiosk 明細を戻す（remove＝DELETE トリガ）
      const { error: eKRm } = await kiosk.rpc("check_remove_line", { p_line_id: kLine });
      check("(e) kiosk セッションの check_remove_line 成功", !eKRm, eKRm?.message);
    } else {
      check("(e) 準備 kiosk auth/owner membership 解決", false, JSON.stringify({ kioskAuthId: !!kioskAuthId, ownerMem }));
    }

    // ═══ (f) 通しの保存則: Σdelta が初期値へ復帰 ═══
    check("(f) ★通し Σdelta が初期値へ復帰（増減が保存されている＝台帳として健全）",
      (await sumDelta()) === base, `got ${await sumDelta()} / base ${base}`);

    // ═══ (g) 発注点の往復（mig0062: set_product の13引数版）═══
    //   set_product は upsert＝既存商品の全列を送り直す形。reorder_point 以外は現値を送って不変を保つ
    //   （★money 系 price/back/hon_pt/cost は現物の値をそのまま往復させる＝この段で値を変えない）。
    {
      const { data: p0 } = await admin.from("products")
        .select("id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id")
        .eq("id", productId).single();
      const { data: c0 } = await admin.from("product_costs").select("cost").eq("product_id", productId).maybeSingle();
      const origReorder = (p0?.reorder_point ?? null) as number | null;
      const argsOf = (reorder: number | null) => ({
        p_id: productId, p_store_id: p0!.store_id, p_type: p0!.type, p_category: p0!.category,
        p_name: p0!.name, p_price: p0!.price, p_cost: (c0?.cost ?? null) as number | null,
        p_back_mode: p0!.back_mode, p_back_value: p0!.back_value, p_unit4: p0!.unit4_json,
        p_hon_pt: p0!.hon_pt, p_is_active: p0!.is_active, p_reorder_point: reorder,
        // mig0063: 14引数版。この段はカテゴリを扱わないので現値を明示往復（原則7＝省略に頼らない）。
        p_category_id: (p0 as { category_id?: string | null }).category_id ?? null,
      });
      const reorderNow = async () => {
        const { data } = await admin.from("products").select("reorder_point").eq("id", productId).single();
        return (data?.reorder_point ?? null) as number | null;
      };

      const { error: eSet12 } = await mgr.rpc("set_product", argsOf(12));
      check("(g) ★set_product(p_reorder_point=12) 成功（mig0062 13引数版）", !eSet12, eSet12?.message);
      check("(g) ★products.reorder_point = 12（設定が反映される）", (await reorderNow()) === 12, `got ${await reorderNow()}`);

      const { error: eSet0 } = await mgr.rpc("set_product", argsOf(0));
      check("(g) 発注点 0 も設定できる（0 と null は別物）", !eSet0 && (await reorderNow()) === 0, eSet0?.message ?? `got ${await reorderNow()}`);

      const { error: eNeg } = await mgr.rpc("set_product", argsOf(-1));
      check("(g) ★負の発注点は 'bad reorder_point' で拒否（入口検証）",
        !!eNeg?.message?.includes("bad reorder_point"), eNeg?.message ?? "通ってしまった");
      check("(g) 拒否後も値は 0 のまま（ロールバック）", (await reorderNow()) === 0, `got ${await reorderNow()}`);

      const { error: eNull } = await mgr.rpc("set_product", argsOf(null));
      check("(g) ★null 戻し＝しきい無しへ戻せる（原則7: UI は常に明示値を送る）",
        !eNull && (await reorderNow()) === null, eNull?.message ?? `got ${await reorderNow()}`);

      // 現物復元（この段で商品マスタを汚さない）＋ money 系列の不変確認
      const { error: eRestore } = await mgr.rpc("set_product", argsOf(origReorder));
      check("(g) 現物復元（reorder_point を元値へ戻す）", !eRestore && (await reorderNow()) === origReorder,
        eRestore?.message ?? `got ${await reorderNow()} / orig ${origReorder}`);
      const { data: p1 } = await admin.from("products").select("price, back_mode, back_value, hon_pt, is_active").eq("id", productId).single();
      check("(g) ★往復で money 系（price/back/hon_pt/is_active）が不変",
        p1?.price === p0?.price && p1?.back_mode === p0?.back_mode && p1?.back_value === p0?.back_value
        && p1?.hon_pt === p0?.hon_pt && p1?.is_active === p0?.is_active,
        JSON.stringify({ before: p0, after: p1 }));
      const { data: c1 } = await admin.from("product_costs").select("cost").eq("product_id", productId).maybeSingle();
      check("(g) 往復で原価（product_costs・台帳#40）が不変",
        (c1?.cost ?? null) === (c0?.cost ?? null), `before ${c0?.cost ?? null} / after ${c1?.cost ?? null}`);
    }
  } finally {
    await wipeFixture();
    if (kioskAuthId) await admin.auth.admin.deleteUser(kioskAuthId).catch(() => undefined);
    // 非汚染の物理確認（fixture 由来の行が残っていない）
    const { count: leftSeat } = await admin.from("seats").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`);
    const { data: leftStock } = await admin.from("stock_logs").select("id").eq("store_id", store.id).in("reason", TRIG_REASONS);
    check("（掃除）専用卓 0・fixture 由来 stock_logs 0（append-only 非汚染）",
      (leftSeat ?? 0) === 0 && (leftStock ?? []).length === 0,
      `seats ${leftSeat} / stock ${(leftStock ?? []).length}`);
    check("（掃除）Σdelta が基準に一致（掃除後も在庫の真実は不変）",
      (await sumDelta()) === base, `got ${await sumDelta()} / base ${base}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 段40: mig0078 product_stock_totals の runtime 検証
  //   ★教訓12 が直撃する箇所＝sum(integer) は bigint に昇格するため、returns table の
  //     宣言 integer と食い違うと「1行返した瞬間」に落ちる。0行では発火しない。
  //     よって本段は必ず「行が返る状態」で実行する（(2) で件数>0 を明示 assert）。
  //   ★期待値は fixture から動的に算出して SQL 直集計と突き合わせる
  //     （CLUB NOX の 40商品/1170 はデモ org の実測値であり fixture の値ではない）。
  //   ★固定カウント非汚染: 生成は段内動的・削除は finally。
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const P40 = "NOX-VERIFY-段40";
    const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", "NOX-VERIFY-A2").single();

    const wipe40 = async () => {
      const { data: ps } = await admin.from("products").select("id").like("name", `${P40}%`);
      const ids = (ps ?? []).map((r) => r.id as string);
      if (ids.length) await admin.from("stock_logs").delete().in("product_id", ids);
      await admin.from("products").delete().like("name", `${P40}%`);
    };
    await wipe40();

    const sess = async (key: keyof typeof FIXTURE_USERS) => {
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
      return c;
    };

    try {
      const owner = await sess("ownerA");
      const mgr40 = await sess("managerA1");
      const staff40 = await sess("staffA1");
      const cast40 = await sess("castA1a");
      check("段40（準備）店A1/A2・owner/manager/staff/cast セッション解決",
        !!sA1 && !!sA2, JSON.stringify({ a1: !!sA1, a2: !!sA2 }));

      if (sA1 && sA2) {
        // 動的 fixture: A1 に2商品（正負混在で積む）・A2 に1商品・A1 にログ無し商品1つ
        const mkProd = async (store: { id: string; org_id: string }, nm: string) => {
          const { data } = await admin.from("products").insert({
            org_id: store.org_id, store_id: store.id, type: "drink", name: nm,
            price: 1000, back_mode: "rate", back_value: 10, hon_pt: 0, is_active: true,
          }).select("id").single();
          return data?.id as string;
        };
        const pA = await mkProd(sA1, `${P40}-A`);
        const pB = await mkProd(sA1, `${P40}-B`);
        const pNone = await mkProd(sA1, `${P40}-ログ無し`);
        const pA2 = await mkProd(sA2, `${P40}-他店`);
        const addLog = async (store: { id: string; org_id: string }, pid: string, d: number, r: string) => {
          await admin.from("stock_logs").insert({
            org_id: store.org_id, store_id: store.id, product_id: pid, delta: d, reason: r,
          });
        };
        // ★(10) 正負混在＝入荷の正と sale の負を両方入れる
        await addLog(sA1, pA, 30, "入荷");
        await addLog(sA1, pA, -4, "sale");
        await addLog(sA1, pA, 2, "sale_remove");   // 期待 28
        await addLog(sA1, pB, 7, "入荷");
        await addLog(sA1, pB, -9, "sale");          // 期待 -2（負在庫も許容）
        await addLog(sA2, pA2, 5, "入荷");          // 他店＝A1 スコープに混ざってはいけない
        check("段40（準備）商品4件・ログ6件を動的生成",
          !!pA && !!pB && !!pNone && !!pA2, JSON.stringify({ pA: !!pA, pB: !!pB, pNone: !!pNone, pA2: !!pA2 }));

        // SQL 直集計（期待値の出どころ＝ハードコードしない）
        const direct = async (storeId?: string) => {
          let q = admin.from("stock_logs").select("product_id, delta").eq("org_id", sA1.org_id);
          if (storeId) q = q.eq("store_id", storeId);
          const { data } = await q;
          const m = new Map<string, number>();
          for (const r of (data ?? []) as { product_id: string; delta: number }[]) {
            m.set(r.product_id, (m.get(r.product_id) ?? 0) + r.delta);
          }
          return m;
        };
        const asMap = (rows: unknown) => new Map(
          ((rows ?? []) as { product_id: string; qty: number }[]).map((r) => [r.product_id, r.qty]));
        const sameMap = (a: Map<string, number>, b: Map<string, number>) =>
          a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

        // ── (1)(2) owner / p_store_id=null → org 全体。行数>0 と Σqty の一致 ──
        {
          const { data, error } = await owner.rpc("product_stock_totals", { p_store_id: null });
          const got = asMap(data);
          const exp = await direct();
          check("段40(1) owner・p_store_id=null＝org 全体が返り SQL 直集計と一致",
            !error && sameMap(got, exp), `${error?.message ?? ""} rpc=${got.size} sql=${exp.size}`);
          const sumGot = [...got.values()].reduce((a, b) => a + b, 0);
          const sumExp = [...exp.values()].reduce((a, b) => a + b, 0);
          check("段40(1) Σqty も一致", sumGot === sumExp, `rpc=${sumGot} sql=${sumExp}`);
          // ★(2) 型昇格の発火確認＝0行では sum(integer)→bigint の不一致が出ない
          check("段40(2) ★1行以上返る状態で成功（sum(integer)→bigint 昇格が発火する条件を満たす）",
            !error && got.size > 0, `rows=${got.size}`);
          check("段40(2) qty が number として返る（bigint 文字列化していない）",
            [...got.values()].every((v) => typeof v === "number"),
            JSON.stringify([...got.entries()].slice(0, 3)));
        }

        // ── (3) owner・p_store_id 指定 → その店だけ ──
        {
          const { data, error } = await owner.rpc("product_stock_totals", { p_store_id: sA1.id });
          const got = asMap(data);
          check("段40(3) owner・store 指定＝その店だけ（他店 A2 の商品を含まない）",
            !error && sameMap(got, await direct(sA1.id)) && !got.has(pA2), error?.message ?? `rows=${got.size}`);
        }

        // ── (4) owner・他 org の store_id → forbidden ──
        {
          const { data: sB1 } = await admin.from("stores").select("id").eq("name", "NOX-VERIFY-B1").single();
          const { error } = await owner.rpc("product_stock_totals", { p_store_id: sB1?.id });
          check("段40(4) owner・他 org の store_id＝forbidden", has(error, "forbidden"), error?.message ?? "通ってしまった");
        }

        // ── (5)(7) manager・null / 自店明示 → 自店のみ・同一結果 ──
        {
          const { data: d1, error: e1 } = await mgr40.rpc("product_stock_totals", { p_store_id: null });
          const { data: d2, error: e2 } = await mgr40.rpc("product_stock_totals", { p_store_id: sA1.id });
          const g1 = asMap(d1), g2 = asMap(d2);
          check("段40(5) manager・null＝自店のみ（他店の商品が混ざらない）",
            !e1 && sameMap(g1, await direct(sA1.id)) && !g1.has(pA2), e1?.message ?? `rows=${g1.size}`);
          check("段40(7) manager・自店 store_id 明示＝(5) と同じ結果",
            !e2 && sameMap(g1, g2), e2?.message ?? `n1=${g1.size} n2=${g2.size}`);
        }

        // ── (6) manager・他店 store_id → forbidden ──
        {
          const { error } = await mgr40.rpc("product_stock_totals", { p_store_id: sA2.id });
          check("段40(6) manager・他店 store_id＝forbidden", has(error, "forbidden"), error?.message ?? "通ってしまった");
        }

        // ── (5s)〜(6s) staff＝manager 同型4観点（mig0079 是正の本体・0078 は else→forbidden で
        //     staff を落としていた＝レジの残N が消える挙動変化。RLS（stock_logs_select）は
        //     cast のみ除外で staff は自店可視＝RPC もそれに揃ったことを実測する）──
        {
          const { data: d1, error: e1 } = await staff40.rpc("product_stock_totals", { p_store_id: null });
          const { data: d2, error: e2 } = await staff40.rpc("product_stock_totals", { p_store_id: sA1.id });
          const g1 = asMap(d1), g2 = asMap(d2);
          check("段40(5s) ★staff・null＝自店のみ（SQL 直集計と一致・mig0079 是正）",
            !e1 && sameMap(g1, await direct(sA1.id)), e1?.message ?? `rows=${g1.size}`);
          check("段40(5s) ★staff・自店データのみ（他店 A2 の商品が混ざらない）",
            !e1 && !g1.has(pA2), e1?.message ?? `pA2=${g1.has(pA2)}`);
          check("段40(7s) ★staff・自店 store_id 明示＝null と同じ結果",
            !e2 && sameMap(g1, g2), e2?.message ?? `n1=${g1.size} n2=${g2.size}`);
          const { error: e3 } = await staff40.rpc("product_stock_totals", { p_store_id: sA2.id });
          check("段40(6s) ★staff・他店 store_id＝forbidden",
            has(e3, "forbidden"), e3?.message ?? "通ってしまった");
        }

        // ── (8) cast → 0行（mig0079: RLS は cast にエラーでなく0行を返すため RPC も0行で揃える
        //     ＝呼び出し側 fetchStockTotals がエラー握りつぶしゼロの drop-in になる）──
        {
          const { data, error } = await cast40.rpc("product_stock_totals", { p_store_id: null });
          check("段40(8) ★cast＝エラーでなく0行（mig0079・stock_logs_select の cast 0行と揃う）",
            !error && Array.isArray(data) && data.length === 0,
            error?.message ?? `rows=${(data as unknown[] | null)?.length}`);
        }

        // ── (9) 在庫ログが無い商品は行を返さない（呼び出し側の ?? 0 前提）──
        {
          const { data } = await mgr40.rpc("product_stock_totals", { p_store_id: sA1.id });
          const got = asMap(data);
          check("段40(9) 在庫ログ0件の商品は行を返さない（?? 0 で埋める前提が成立）",
            !got.has(pNone) && got.has(pA), `pNone=${got.has(pNone)} pA=${got.has(pA)}`);
        }

        // ── (10) 正負混在の合計が正しい（負在庫も返す）──
        {
          const { data } = await mgr40.rpc("product_stock_totals", { p_store_id: sA1.id });
          const got = asMap(data);
          check("段40(10) ★正負混在の合計が正しい（+30 -4 +2 = 28）", got.get(pA) === 28, `got ${got.get(pA)}`);
          check("段40(10) ★合計が負になる商品も行として返る（+7 -9 = -2）", got.get(pB) === -2, `got ${got.get(pB)}`);
        }
      }
    } finally {
      await wipe40();
      const { count: left40 } = await admin.from("products")
        .select("id", { count: "exact", head: true }).like("name", `${P40}%`);
      check("段40（掃除）fixture 商品0件（固定カウント非汚染）", (left40 ?? 0) === 0, `left ${left40}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 段41: mig0080 product_bulk_insert の runtime 検証
  //   ★prosrc 緑 ≠ runtime 緑：本 RPC の肝は「検証ループと DML の分離＝部分成功なし」で、
  //     これは実セッションで「1件不正 → 何も入らない（自動作成カテゴリも audit も残らない）」
  //     を実測して初めて言える。カテゴリ解決（lower 衝突・無効同名）も unique index
  //     (store_id, lower(name)) との相互作用ゆえ runtime でしか確かめられない。
  //   ★固定カウント非汚染: 生成は段内動的・削除は finally（商品/カテゴリ/原価/audit）。
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const P41 = "NOX-VERIFY-段41";
    const C41 = "NOX-VERIFY-C41";  // カテゴリ名 prefix
    const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", "NOX-VERIFY-A2").single();

    const wipe41 = async () => {
      const { data: ps } = await admin.from("products").select("id").like("name", `${P41}%`);
      const ids = (ps ?? []).map((r) => r.id as string);
      if (ids.length) {
        await admin.from("product_costs").delete().in("product_id", ids);
        await admin.from("stock_logs").delete().in("product_id", ids);
      }
      await admin.from("products").delete().like("name", `${P41}%`);
      await admin.from("product_categories").delete().like("name", `${C41}%`);
      await admin.from("audit_logs").delete().eq("action", "product_bulk_insert");
    };
    await wipe41();

    const sess41 = async (key: keyof typeof FIXTURE_USERS) => {
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
      return c;
    };

    try {
      const own41 = await sess41("ownerA");
      const mgr41 = await sess41("managerA1");
      const stf41 = await sess41("staffA1");
      const cst41 = await sess41("castA1a");
      check("段41（準備）店A1/A2・owner/manager/staff/cast セッション解決",
        !!sA1 && !!sA2, JSON.stringify({ a1: !!sA1, a2: !!sA2 }));

      // 商品件数・カテゴリ件数のスナップ（増分ゼロ assert 用）
      const countProds = async () => (await admin.from("products")
        .select("id", { count: "exact", head: true }).eq("store_id", sA1!.id)).count ?? 0;
      const countCats = async () => (await admin.from("product_categories")
        .select("id", { count: "exact", head: true }).eq("store_id", sA1!.id)).count ?? 0;
      const countAudit = async () => (await admin.from("audit_logs")
        .select("id", { count: "exact", head: true }).eq("action", "product_bulk_insert")).count ?? 0;

      if (sA1 && sA2) {
        // ── (1) owner 正常系: 新規カテゴリ2＋既存1・商品5件（3 type 混在・cost 有無混在）──
        {
          // 既存カテゴリを1つ先に作る（自動作成されないことの対照）
          const { data: pre } = await admin.from("product_categories").insert({
            org_id: sA1.org_id, store_id: sA1.id, name: `${C41}-既存`, sort_order: 900, is_active: true,
          }).select("id").single();
          const preId = pre?.id as string;

          const items = [
            { category: `${C41}-新規1`, name: `${P41}-a`, type: "drink",  price: 1000, cost: 300 },
            { category: `${C41}-新規1`, name: `${P41}-b`, type: "champ",  price: 30000, cost: null },
            { category: `${C41}-新規2`, name: `${P41}-c`, type: "bottle", price: 12000, cost: 4000 },
            { category: `${C41}-既存`,  name: `${P41}-d`, type: "drink",  price: 800 },
            { category: "",              name: `${P41}-e`, type: "drink",  price: 500, cost: 0 },
          ];
          const { data, error } = await own41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: items });
          const j = (data ?? {}) as { products_created?: number; categories_created?: string[]; by_type?: Record<string, number> };
          check("段41(1) owner 正常系＝成功して戻り jsonb が返る", !error && !!data, error?.message ?? "data なし");
          check("段41(1) products_created=5", j.products_created === 5, `got ${j.products_created}`);
          check("段41(1) categories_created＝新規2件のみ（既存は含まない）",
            Array.isArray(j.categories_created) && j.categories_created.length === 2
            && !j.categories_created.includes(`${C41}-既存`),
            JSON.stringify(j.categories_created));
          check("段41(1) by_type＝drink3/champ1/bottle1",
            j.by_type?.drink === 3 && j.by_type?.champ === 1 && j.by_type?.bottle === 1, JSON.stringify(j.by_type));

          // SQL 直集計と照合
          const { data: rows } = await admin.from("products")
            .select("id, name, type, price, category_id, back_mode, back_value, hon_pt, back_exempt_from_split, reorder_point, is_active")
            .like("name", `${P41}%`).order("name");
          check("段41(1) products が5行入っている（SQL 直集計）", (rows ?? []).length === 5, `got ${(rows ?? []).length}`);
          const byName = new Map((rows ?? []).map((r) => [r.name as string, r]));
          check("段41(1) 価格と type が入力どおり",
            byName.get(`${P41}-a`)?.price === 1000 && byName.get(`${P41}-b`)?.type === "champ"
            && byName.get(`${P41}-c`)?.price === 12000,
            JSON.stringify([...byName.values()].map((r) => `${r.name}:${r.type}:${r.price}`)));
          check("段41(1) ★既存カテゴリは再利用され新規作成されない（同一 id）",
            byName.get(`${P41}-d`)?.category_id === preId, `got ${byName.get(`${P41}-d`)?.category_id}`);

          // 原価: cost 指定ありの3件のみ product_costs 行（null と未指定は行なし）
          const ids = (rows ?? []).map((r) => r.id as string);
          const { data: costs } = await admin.from("product_costs").select("product_id, cost, org_id, store_id").in("product_id", ids);
          const costOf = new Map((costs ?? []).map((c) => [c.product_id as string, c.cost as number]));
          check("段41(1) ★product_costs は cost 指定ありの3件のみ（null/未指定は行を作らない）",
            (costs ?? []).length === 3, `got ${(costs ?? []).length}`);
          check("段41(1) 原価の値が一致（300 / 4000 / 0）",
            costOf.get(byName.get(`${P41}-a`)!.id as string) === 300
            && costOf.get(byName.get(`${P41}-c`)!.id as string) === 4000
            && costOf.get(byName.get(`${P41}-e`)!.id as string) === 0,
            JSON.stringify([...costOf.values()]));
          check("段41(1) ★product_costs の org_id/store_id が埋まる（_r2 の A2 改訂＝初版なら NOT NULL 違反）",
            (costs ?? []).every((c) => !!c.org_id && c.store_id === sA1.id),
            JSON.stringify((costs ?? []).map((c) => [c.org_id, c.store_id])));

          // (7) 既定値
          const a = byName.get(`${P41}-a`)!;
          check("段41(7) ★既定値 back_mode='rate' / back_value=0 / hon_pt=0 / exempt=false / reorder_point=null",
            a.back_mode === "rate" && a.back_value === 0 && a.hon_pt === 0
            && a.back_exempt_from_split === false && a.reorder_point === null,
            JSON.stringify({ bm: a.back_mode, bv: a.back_value, hp: a.hon_pt, ex: a.back_exempt_from_split, rp: a.reorder_point }));
          check("段41(7) is_active は列 default の true", a.is_active === true, `got ${a.is_active}`);

          // (5) カテゴリ空欄 → null
          check("段41(5) ★カテゴリ空欄＝category_id null（未分類）",
            byName.get(`${P41}-e`)?.category_id === null, `got ${byName.get(`${P41}-e`)?.category_id}`);

          // 新規カテゴリの org_id（_r2 の A3 改訂）と sort_order 末尾採番
          const { data: newCats } = await admin.from("product_categories")
            .select("id, name, org_id, sort_order, is_active").like("name", `${C41}-新規%`);
          check("段41(1) ★新規カテゴリの org_id が埋まる（_r2 の A3 改訂＝初版なら NOT NULL 違反）",
            (newCats ?? []).length === 2 && (newCats ?? []).every((c) => !!c.org_id),
            JSON.stringify((newCats ?? []).map((c) => c.org_id)));
          check("段41(1) 新規カテゴリは既存 max(sort_order)=900 より後ろに採番される",
            (newCats ?? []).every((c) => (c.sort_order as number) > 900),
            JSON.stringify((newCats ?? []).map((c) => c.sort_order)));

          // (9) audit 1操作1行
          const { data: au } = await admin.from("audit_logs")
            .select("target, before_json, after_json, store_id").eq("action", "product_bulk_insert");
          check("段41(9) ★audit は1操作1行（商品5件でも1行）", (au ?? []).length === 1, `got ${(au ?? []).length}`);
          const af = (au?.[0]?.after_json ?? {}) as Record<string, unknown>;
          check("段41(9) audit の p_target/p_before は null（単一 target が無いため）",
            au?.[0]?.target === null && au?.[0]?.before_json === null,
            JSON.stringify({ t: au?.[0]?.target, b: au?.[0]?.before_json }));
          check("段41(9) audit after に product_count/by_type/categories_created/products",
            af.product_count === 5 && !!af.by_type && Array.isArray(af.categories_created) && Array.isArray(af.products),
            JSON.stringify(Object.keys(af)));
          check("段41(9) audit の store_id が対象店", au?.[0]?.store_id === sA1.id, `got ${au?.[0]?.store_id}`);
        }

        // ── (2) ★1件でも不正なら全ロールバック（自動作成カテゴリ・audit も残らない）──
        {
          const pBefore = await countProds();
          const cBefore = await countCats();
          const aBefore = await countAudit();
          const items = [
            { category: `${C41}-RB`, name: `${P41}-r1`, type: "drink", price: 100 },
            { category: `${C41}-RB`, name: `${P41}-r2`, type: "drink", price: 200 },
            { category: `${C41}-RB`, name: `${P41}-r3`, type: "drink", price: 300 },
            { category: `${C41}-RB`, name: `${P41}-r4`, type: "drink", price: 400 },
            { category: `${C41}-RB`, name: `${P41}-r5`, type: "drink", price: -1 },  // ★不正
          ];
          const { error } = await own41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: items });
          check("段41(2) 5件目 price=-1 で 'bad price'", has(error, "bad price"), error?.message ?? "通ってしまった");
          check("段41(2) ★products は1件も増えていない（部分成功なし）",
            (await countProds()) === pBefore, `${pBefore} → ${await countProds()}`);
          check("段41(2) ★自動作成されるはずだったカテゴリも巻き戻る",
            (await countCats()) === cBefore, `${cBefore} → ${await countCats()}`);
          check("段41(2) ★audit 行も残らない（DML 後の perform ごとロールバック）",
            (await countAudit()) === aBefore, `${aBefore} → ${await countAudit()}`);
          const { count: rbCat } = await admin.from("product_categories")
            .select("id", { count: "exact", head: true }).eq("name", `${C41}-RB`);
          check("段41(2) ロールバック対象カテゴリ名が0件", (rbCat ?? 0) === 0, `got ${rbCat}`);
        }

        // ── (3) 無効カテゴリ同名 → 'duplicate name' ──
        {
          const { data: off } = await admin.from("product_categories").insert({
            org_id: sA1.org_id, store_id: sA1.id, name: `${C41}-停止中`, sort_order: 950, is_active: false,
          }).select("id").single();
          const pBefore = await countProds();
          const { error } = await own41.rpc("product_bulk_insert", {
            p_store_id: sA1.id,
            p_items: [{ category: `${C41}-停止中`, name: `${P41}-dup`, type: "drink", price: 100 }],
          });
          check("段41(3) ★無効カテゴリと同名＝'duplicate name'（set_product_category と統一）",
            has(error, "duplicate name"), error?.message ?? "通ってしまった");
          check("段41(3) 無効カテゴリは再有効化されない",
            (await admin.from("product_categories").select("is_active").eq("id", off!.id).single()).data?.is_active === false);
          check("段41(3) 商品も入っていない", (await countProds()) === pBefore, `${pBefore} → ${await countProds()}`);
        }

        // ── (4) カテゴリ lower 衝突: 既存「Bottle」に CSV「bottle」→ 既存 id に解決 ──
        {
          const { data: bt } = await admin.from("product_categories").insert({
            org_id: sA1.org_id, store_id: sA1.id, name: `${C41}-Bottle`, sort_order: 960, is_active: true,
          }).select("id").single();
          const cBefore = await countCats();
          const { data, error } = await own41.rpc("product_bulk_insert", {
            p_store_id: sA1.id,
            p_items: [{ category: `${C41}-bottle`.toLowerCase(), name: `${P41}-lc`, type: "bottle", price: 5000 }],
          });
          // ★prefix は大文字を含むため lower 化した名前で送る（unique は lower(name)）
          const j = (data ?? {}) as { categories_created?: string[] };
          check("段41(4) ★lower 衝突は既存カテゴリに解決＝成功する", !error, error?.message ?? "");
          check("段41(4) ★新規カテゴリは作られない（categories_created 空・件数不変）",
            (j.categories_created ?? []).length === 0 && (await countCats()) === cBefore,
            `created=${JSON.stringify(j.categories_created)} ${cBefore} → ${await countCats()}`);
          const { data: lc } = await admin.from("products").select("category_id").eq("name", `${P41}-lc`).single();
          check("段41(4) ★商品は既存「Bottle」の id に紐づく（大小異なる表記でも同一カテゴリ）",
            lc?.category_id === bt!.id, `got ${lc?.category_id} want ${bt!.id}`);
        }

        // ── (6) 上限 ──
        {
          const many = Array.from({ length: 301 }, (_, k) => ({ name: `${P41}-m${k}`, type: "drink", price: 100 }));
          const { error: e1 } = await own41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: many });
          check("段41(6) 301件＝'too many items'", has(e1, "too many items"), e1?.message ?? "通ってしまった");
          const cats31 = Array.from({ length: 31 }, (_, k) => ({
            category: `${C41}-x${k}`, name: `${P41}-n${k}`, type: "drink", price: 100,
          }));
          const { error: e2 } = await own41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: cats31 });
          check("段41(6) distinct 31カテゴリ＝'too many categories'",
            has(e2, "too many categories"), e2?.message ?? "通ってしまった");
          const { error: e3 } = await own41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: [] });
          check("段41(6) 空配列＝'bad items'", has(e3, "bad items"), e3?.message ?? "通ってしまった");
        }

        // ── (8) 認可 ──
        {
          const one = (n: string) => [{ name: `${P41}-${n}`, type: "drink", price: 100 }];
          const { error: eMgrOwn } = await mgr41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: one("mgr") });
          check("段41(8) manager 自店＝成功", !eMgrOwn, eMgrOwn?.message ?? "");
          const { error: eMgrOther } = await mgr41.rpc("product_bulk_insert", { p_store_id: sA2.id, p_items: one("mgr2") });
          check("段41(8) manager 他店＝forbidden", has(eMgrOther, "forbidden"), eMgrOther?.message ?? "通ってしまった");
          const { error: eStf } = await stf41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: one("stf") });
          check("段41(8) ★staff＝forbidden（set_product と同型＝マスタ書込は manager 以上）",
            has(eStf, "forbidden"), eStf?.message ?? "通ってしまった");
          const { error: eCst } = await cst41.rpc("product_bulk_insert", { p_store_id: sA1.id, p_items: one("cst") });
          check("段41(8) cast＝forbidden", has(eCst, "forbidden"), eCst?.message ?? "通ってしまった");
          const { data: sB1 } = await admin.from("stores").select("id").eq("name", "NOX-VERIFY-B1").single();
          const { error: eOrg } = await own41.rpc("product_bulk_insert", { p_store_id: sB1?.id, p_items: one("org") });
          check("段41(8) ★owner でも他 org の store＝forbidden（org 跨ぎ遮断）",
            has(eOrg, "forbidden"), eOrg?.message ?? "通ってしまった");
        }
      }
    } finally {
      await wipe41();
      const { count: leftP } = await admin.from("products")
        .select("id", { count: "exact", head: true }).like("name", `${P41}%`);
      const { count: leftC } = await admin.from("product_categories")
        .select("id", { count: "exact", head: true }).like("name", `${C41}%`);
      const { count: leftA } = await admin.from("audit_logs")
        .select("id", { count: "exact", head: true }).eq("action", "product_bulk_insert");
      check("段41（掃除）fixture 商品/カテゴリ/audit すべて0件（固定カウント非汚染）",
        (leftP ?? 0) === 0 && (leftC ?? 0) === 0 && (leftA ?? 0) === 0,
        `products=${leftP} categories=${leftC} audit=${leftA}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 段42: mig0081 product_reorder の runtime 検証
  //   ★本 RPC の肝は「スコープが category_id の is not distinct from」で、
  //     null（未分類）を1スコープとして扱えるかは = 比較では絶対に通らない＝
  //     runtime で null スコープの並び替えが成功することを実測して初めて言える。
  //   ★両方向件数検証（①実在 ②全件）も、is_active=false を含む全件を渡す運用契約
  //     （0077 同型）ゆえ実セッションでしか確かめられない。
  //   ★固定カウント非汚染: 生成は段内動的・削除は finally。
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const P42 = "NOX-VERIFY-段42";
    const C42 = "NOX-VERIFY-C42";
    const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", "NOX-VERIFY-A2").single();

    const wipe42 = async () => {
      const { data: ps } = await admin.from("products").select("id").like("name", `${P42}%`);
      const ids = (ps ?? []).map((r) => r.id as string);
      if (ids.length) {
        await admin.from("product_costs").delete().in("product_id", ids);
        await admin.from("stock_logs").delete().in("product_id", ids);
      }
      await admin.from("products").delete().like("name", `${P42}%`);
      await admin.from("product_categories").delete().like("name", `${C42}%`);
      await admin.from("audit_logs").delete().eq("action", "product_reorder");
    };
    await wipe42();

    const sess42 = async (key: keyof typeof FIXTURE_USERS) => {
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
      return c;
    };

    try {
      const own42 = await sess42("ownerA");
      const mgr42 = await sess42("managerA1");
      const stf42 = await sess42("staffA1");
      const cst42 = await sess42("castA1a");
      check("段42（準備）店A1/A2 解決", !!sA1 && !!sA2, JSON.stringify({ a1: !!sA1, a2: !!sA2 }));

      if (sA1 && sA2) {
        // fixture: カテゴリ2つ（本命 X・別カテゴリ Y）＋ X に3商品（1件は無効）＋ 未分類に2商品
        const mkCat = async (nm: string, so: number) => (await admin.from("product_categories").insert({
          org_id: sA1.org_id, store_id: sA1.id, name: nm, sort_order: so, is_active: true,
        }).select("id").single()).data?.id as string;
        const catX = await mkCat(`${C42}-X`, 810);
        const catY = await mkCat(`${C42}-Y`, 820);
        const mkProd = async (nm: string, catId: string | null, active = true) =>
          (await admin.from("products").insert({
            org_id: sA1.org_id, store_id: sA1.id, category_id: catId, type: "drink", name: nm,
            price: 1000, back_mode: "rate", back_value: 10, hon_pt: 0, is_active: active,
          }).select("id").single()).data?.id as string;
        const x1 = await mkProd(`${P42}-x1`, catX);
        const x2 = await mkProd(`${P42}-x2`, catX);
        const x3 = await mkProd(`${P42}-x3`, catX, false);  // ★無効商品（全件要求の対象）
        const y1 = await mkProd(`${P42}-y1`, catY);
        // 未分類スコープ: 既存の未分類商品も含めて全件を渡す必要がある
        const n1 = await mkProd(`${P42}-n1`, null);
        const n2 = await mkProd(`${P42}-n2`, null);
        check("段42（準備）カテゴリ2・商品6件を動的生成",
          !!catX && !!catY && !!x1 && !!x2 && !!x3 && !!y1 && !!n1 && !!n2);

        const sortOf = async (ids: string[]) => {
          const { data } = await admin.from("products").select("id, sort_order").in("id", ids);
          return new Map((data ?? []).map((r) => [r.id as string, r.sort_order as number]));
        };

        // ── (1) owner 正常系: catX の3件（無効込み）を x3,x1,x2 の順へ ──
        {
          const { data, error } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x3, x1, x2],
          });
          check("段42(1) owner 正常系＝成功（戻りは void）", !error && (data ?? null) === null, error?.message ?? `data=${JSON.stringify(data)}`);
          const m = await sortOf([x1, x2, x3]);
          check("段42(1) ★sort_order が配列順 1..3（SQL 直取得で照合）",
            m.get(x3) === 1 && m.get(x1) === 2 && m.get(x2) === 3,
            JSON.stringify({ x3: m.get(x3), x1: m.get(x1), x2: m.get(x2) }));
        }

        // ── (2) ★未分類スコープ（is not distinct from の実効確認）──
        {
          // 未分類の全件を取得して渡す（他段の残置があっても全件要求を満たす）
          const { data: allNull } = await admin.from("products")
            .select("id, created_at").eq("store_id", sA1.id).is("category_id", null).order("created_at");
          const ids = (allNull ?? []).map((r) => r.id as string);
          const reversed = [...ids].reverse();
          const { error } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: null, p_ids: reversed,
          });
          check("段42(2) ★p_category_id=null（未分類）スコープの並び替えが成功する（= 比較なら絶対に通らない）",
            !error, error?.message ?? "");
          const m = await sortOf(ids);
          check("段42(2) 未分類群の sort_order が配列順どおり",
            reversed.every((id, i) => m.get(id) === i + 1),
            JSON.stringify(reversed.map((id) => m.get(id))));
        }

        // ── (3) 部分配列 → 'partial ids' ──
        {
          const { error } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2],  // x3 が欠け
          });
          check("段42(3) ★部分配列＝'partial ids'（スコープ全件必須）",
            has(error, "partial ids"), error?.message ?? "通ってしまった");
        }

        // ── (4) 重複 id / 空配列 ──
        {
          const { error: e1 } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x1, x2],
          });
          check("段42(4) 重複 id＝'duplicate ids'", has(e1, "duplicate ids"), e1?.message ?? "通ってしまった");
          const { error: e2 } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [],
          });
          check("段42(4) 空配列＝'bad ids'", has(e2, "bad ids"), e2?.message ?? "通ってしまった");
        }

        // ── (5) 他スコープの id 混入 → forbidden ──
        {
          const { error } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2, y1],  // y1 は catY
          });
          check("段42(5) ★別カテゴリの商品 id 混入＝forbidden（①実在検証がスコープ限定）",
            has(error, "forbidden"), error?.message ?? "通ってしまった");
          // ★backfill（mig0081）は適用時点の既存行だけを埋める＝段内で新規生成した行は
          //   列 default の 0 のまま。混入を弾いた以上その 0 が動いていないことを見る。
          const m = await sortOf([y1]);
          check("段42(5) 混入を弾いた結果 y1 の sort_order は動いていない（新規行は default 0 のまま）",
            m.get(y1) === 0, `got ${m.get(y1)}`);
        }

        // ── (6) 認可 ──
        {
          const { error: eMgr } = await mgr42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2, x3],
          });
          check("段42(6) manager 自店＝成功", !eMgr, eMgr?.message ?? "");
          const { error: eMgr2 } = await mgr42.rpc("product_reorder", {
            p_store_id: sA2.id, p_category_id: null, p_ids: [x1],
          });
          check("段42(6) manager 他店＝forbidden", has(eMgr2, "forbidden"), eMgr2?.message ?? "通ってしまった");
          const { error: eStf } = await stf42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2, x3],
          });
          check("段42(6) staff＝forbidden", has(eStf, "forbidden"), eStf?.message ?? "通ってしまった");
          const { error: eCst } = await cst42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2, x3],
          });
          check("段42(6) cast＝forbidden", has(eCst, "forbidden"), eCst?.message ?? "通ってしまった");
          const { data: sB1 } = await admin.from("stores").select("id").eq("name", "NOX-VERIFY-B1").single();
          const { error: eOrg } = await own42.rpc("product_reorder", {
            p_store_id: sB1?.id, p_category_id: null, p_ids: [x1],
          });
          check("段42(6) ★owner でも他 org の store＝forbidden", has(eOrg, "forbidden"), eOrg?.message ?? "通ってしまった");
          // 他店カテゴリ id（A2 のカテゴリを A1 スコープで指定）
          const { data: catA2 } = await admin.from("product_categories").insert({
            org_id: sA2.org_id, store_id: sA2.id, name: `${C42}-A2`, sort_order: 830, is_active: true,
          }).select("id").single();
          const { error: eCat } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catA2!.id, p_ids: [x1],
          });
          check("段42(6) ★他店カテゴリ id＝forbidden（カテゴリ実在照合が store 限定）",
            has(eCat, "forbidden"), eCat?.message ?? "通ってしまった");
          const { error: eNo } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: "00000000-0000-0000-0000-000000000000", p_ids: [x1],
          });
          check("段42(6) 存在しないカテゴリ id＝forbidden", has(eNo, "forbidden"), eNo?.message ?? "通ってしまった");
        }

        // ── (7) ★is_active=false 込みなら成功・除くと partial ids ──
        {
          const { error: eOk } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x3, x2],
          });
          check("段42(7) ★無効商品を含めた全件なら成功（is_active 不問の全件要求）", !eOk, eOk?.message ?? "");
          const m = await sortOf([x1, x3, x2]);
          check("段42(7) 無効商品にも sort_order が振られる", m.get(x3) === 2, `got ${m.get(x3)}`);
          const { error: eNg } = await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: catX, p_ids: [x1, x2],
          });
          check("段42(7) ★無効商品を除くと 'partial ids'（有効分だけ渡す実装ミスを弾く）",
            has(eNg, "partial ids"), eNg?.message ?? "通ってしまった");
        }

        // ── (8) audit ──
        {
          await admin.from("audit_logs").delete().eq("action", "product_reorder");
          await own42.rpc("product_reorder", { p_store_id: sA1.id, p_category_id: catX, p_ids: [x2, x1, x3] });
          const { data: au } = await admin.from("audit_logs")
            .select("target, before_json, after_json, store_id").eq("action", "product_reorder");
          check("段42(8) audit が1行", (au ?? []).length === 1, `got ${(au ?? []).length}`);
          check("段42(8) ★target='products:store:<id>:category:<id>'",
            au?.[0]?.target === `products:store:${sA1.id}:category:${catX}`, String(au?.[0]?.target));
          const bef = au?.[0]?.before_json as Array<{ id: string; sort_order: number }> | null;
          const aft = au?.[0]?.after_json as Array<{ id: string; sort_order: number }> | null;
          check("段42(8) before/after に (id, sort_order) 配列（3件ずつ）",
            Array.isArray(bef) && Array.isArray(aft) && bef.length === 3 && aft.length === 3
            && bef.every((r) => "id" in r && "sort_order" in r),
            JSON.stringify({ b: bef?.length, a: aft?.length }));
          check("段42(8) audit の store_id が対象店", au?.[0]?.store_id === sA1.id, String(au?.[0]?.store_id));
          // 未分類スコープの target は :category:null
          await admin.from("audit_logs").delete().eq("action", "product_reorder");
          const { data: allNull } = await admin.from("products")
            .select("id").eq("store_id", sA1.id).is("category_id", null);
          await own42.rpc("product_reorder", {
            p_store_id: sA1.id, p_category_id: null, p_ids: (allNull ?? []).map((r) => r.id as string),
          });
          const { data: au2 } = await admin.from("audit_logs").select("target").eq("action", "product_reorder");
          check("段42(8) ★未分類スコープの target は ':category:null'",
            au2?.[0]?.target === `products:store:${sA1.id}:category:null`, String(au2?.[0]?.target));
        }
      }
    } finally {
      await wipe42();
      const { count: leftP } = await admin.from("products")
        .select("id", { count: "exact", head: true }).like("name", `${P42}%`);
      const { count: leftC } = await admin.from("product_categories")
        .select("id", { count: "exact", head: true }).like("name", `${C42}%`);
      const { count: leftA } = await admin.from("audit_logs")
        .select("id", { count: "exact", head: true }).eq("action", "product_reorder");
      check("段42（掃除）fixture 商品/カテゴリ/audit すべて0件（固定カウント非汚染）",
        (leftP ?? 0) === 0 && (leftC ?? 0) === 0 && (leftA ?? 0) === 0,
        `products=${leftP} categories=${leftC} audit=${leftA}`);
    }
  }

  report();
}

function report() {
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`verify:nox-inventory ALL PASS (${pass} assertions)`);
  console.log("在庫台帳 v1: sale(-qty) / sale_remove(+qty) / void_recredit(+Σqty)・カスタム明細 非発火・kiosk by_user_id null 許容");
}

main().catch((e) => {
  console.error("verify:nox-inventory 実行エラー", e);
  process.exit(1);
});
