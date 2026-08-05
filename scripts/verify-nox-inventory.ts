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
      const cast40 = await sess("castA1a");
      check("段40（準備）店A1/A2・owner/manager/cast セッション解決",
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

        // ── (8) cast → forbidden（stock_logs_select の auth_role() <> 'cast' と揃う）──
        {
          const { error } = await cast40.rpc("product_stock_totals", { p_store_id: null });
          check("段40(8) ★cast＝forbidden（stock_logs_select のパターン2 と揃う）",
            has(error, "forbidden"), error?.message ?? "通ってしまった");
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
