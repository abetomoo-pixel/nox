/**
 * verify:nox-categories — 純増⑦ 商品カテゴリマスタ＋kiosk_register_state v2（mig0063）の runtime 実証
 *   実行: npm run verify:nox-categories（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑：RLS の可視面（パターン3＝cast も見える）・重複名/越境の拒否・
 *   set_product の category_id 割当・kiosk 読取 v2（categories/category_id/started_at）は
 *   実セッションを通して初めて「壊れていない」と言える。
 *
 * 段構成:
 *   (a) set_product_category 新規作成 → SELECT 反映（manager 自店）
 *   (b) 同店重複名（大小文字違い）は 'duplicate name'
 *   (c) 他店 store_id は 'forbidden'（manager の店スコープ）
 *   (d) set_product で category_id 割当 → products へ反映（14引数版）
 *   (e) 他店カテゴリの割当は 'bad category'（クロス店割当遮断）
 *   (f) ★cast セッションで product_categories が見える（パターン3 の positive assert）
 *   (g) anon は 0行（RLS＋grant の二重で遮断）
 *   (h) ★kiosk_register_state v2＝categories / products.category_id / checks.started_at が載る（kiosk 実セッション）
 *   (i) is_active=false のカテゴリは kiosk categories から消える
 *
 * fixture は段内動的生成→finally 全消し（カテゴリ/商品/伝票/卓/kiosk 一式）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

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

const PREFIX = "NOX-VERIFY-CAT";
const TRIG_REASONS = ["sale", "sale_remove", "void_recredit"];

async function signIn(key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
  return c;
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();

  const wipe = async () => {
    // 伝票→明細→stock（トリガ行）→卓 の依存順（在庫 v1 のトリガが sale 行を積むため明細削除の後に掃く）
    const { data: seats } = await admin.from("seats").select("id").like("name", `${PREFIX}%`);
    const seatIds = (seats ?? []).map((r) => r.id as string);
    if (seatIds.length) {
      const { data: chs } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const chIds = (chs ?? []).map((r) => r.id as string);
      if (chIds.length) {
        for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables", "check_seats"]) {
          await admin.from(t).delete().in("check_id", chIds);
        }
        await admin.from("checks").delete().in("id", chIds);
      }
    }
    if (sA1) await admin.from("stock_logs").delete().eq("store_id", sA1.id).in("reason", TRIG_REASONS);
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    // 商品→カテゴリ（category_id FK は on delete set null だが順序を明示）
    await admin.from("products").delete().like("name", `${PREFIX}%`);
    await admin.from("product_categories").delete().like("name", `${PREFIX}%`);
    const { data: devs } = await admin.from("kiosk_devices").select("id, auth_user_id").like("label", `${PREFIX}%`);
    const devIds = (devs ?? []).map((d) => d.id as string);
    if (devIds.length) await admin.from("kiosk_sessions").delete().in("device_id", devIds);
    for (const d of devs ?? []) await admin.auth.admin.deleteUser(d.auth_user_id as string).catch(() => undefined);
    await admin.from("kiosk_devices").delete().like("label", `${PREFIX}%`);
  };
  await wipe(); // 再実行冪等

  const mgr = await signIn("managerA1");
  const cast = await signIn("castA1a");
  check("（準備）店A1/A2・manager/cast セッション 解決", !!sA1 && !!sA2, JSON.stringify({ a1: !!sA1, a2: !!sA2 }));
  if (!sA1 || !sA2) { report(); return; }

  let kioskAuthId = "";
  try {
    // ═══ (a) 新規作成 → SELECT 反映 ═══
    const { data: catId, error: eNew } = await mgr.rpc("set_product_category", {
      p_id: null, p_store_id: sA1.id, p_name: `${PREFIX}-焼酎`, p_sort_order: 10, p_is_active: true,
    });
    check("(a) ★set_product_category 新規作成 成功", !eNew && typeof catId === "string", eNew?.message);
    const { data: catRow } = await mgr.from("product_categories").select("id, name, sort_order, is_active, store_id").eq("id", (catId as string) ?? "").maybeSingle();
    check("(a) ★作成したカテゴリが SELECT で見える（name/sort_order/active/店）",
      catRow?.name === `${PREFIX}-焼酎` && catRow?.sort_order === 10 && catRow?.is_active === true && catRow?.store_id === sA1.id,
      JSON.stringify(catRow));

    // ═══ (b) 同店重複名（大小文字違い）は 'duplicate name' ═══
    const { error: eDup } = await mgr.rpc("set_product_category", {
      p_id: null, p_store_id: sA1.id, p_name: `${PREFIX}-焼酎`, p_sort_order: 20, p_is_active: true,
    });
    check("(b) ★同店の重複名は 'duplicate name' で拒否", has(eDup, "duplicate name"), eDup?.message ?? "通ってしまった");
    const { count: dupCnt } = await admin.from("product_categories").select("id", { count: "exact", head: true })
      .eq("store_id", sA1.id).like("name", `${PREFIX}-焼酎`);
    check("(b) 拒否後も行数は1のまま", (dupCnt ?? 0) === 1, `got ${dupCnt}`);

    // ═══ (c) 他店 store_id は 'forbidden'（manager の店スコープ）═══
    const { error: eOther } = await mgr.rpc("set_product_category", {
      p_id: null, p_store_id: sA2.id, p_name: `${PREFIX}-他店`, p_sort_order: 1, p_is_active: true,
    });
    check("(c) ★manager が他店 store_id へ作成 = 'forbidden'", has(eOther, "forbidden"), eOther?.message ?? "通ってしまった");

    // ═══ (d) set_product で category_id 割当 → products 反映（14引数）═══
    const setProdArgs = (categoryId: string | null, name: string) => ({
      p_id: null, p_store_id: sA1.id, p_type: "drink", p_category: null, p_name: name,
      p_price: 1200, p_cost: null, p_back_mode: "rate", p_back_value: 50, p_unit4: null,
      p_hon_pt: 0, p_is_active: true, p_reorder_point: null, p_category_id: categoryId,
    });
    const { data: prodId, error: eProd } = await mgr.rpc("set_product", setProdArgs(catId as string, `${PREFIX}-芋焼酎`));
    check("(d) ★set_product(14引数) で category_id 割当 成功", !eProd && typeof prodId === "string", eProd?.message);
    const { data: prodRow } = await admin.from("products").select("category_id, name, price").eq("id", (prodId as string) ?? "").maybeSingle();
    check("(d) ★products.category_id に反映", prodRow?.category_id === catId, JSON.stringify(prodRow));

    // ═══ (e) 他店カテゴリの割当は 'bad category'（クロス店割当遮断）═══
    //   他店（A2）のカテゴリを service で用意し、A1 の商品へ割当を試みる。
    const { data: a2Cat } = await admin.from("product_categories")
      .insert({ org_id: sA2.org_id, store_id: sA2.id, name: `${PREFIX}-A2カテゴリ`, sort_order: 1, is_active: true })
      .select("id").single();
    const { error: eBadCat } = await mgr.rpc("set_product", setProdArgs((a2Cat?.id as string) ?? null, `${PREFIX}-越境商品`));
    check("(e) ★他店カテゴリの割当 = 'bad category'（クロス店割当遮断）", has(eBadCat, "bad category"), eBadCat?.message ?? "通ってしまった");
    const { count: crossCnt } = await admin.from("products").select("id", { count: "exact", head: true }).like("name", `${PREFIX}-越境商品`);
    check("(e) 拒否により商品も作られていない（ロールバック）", (crossCnt ?? 0) === 0, `got ${crossCnt}`);

    // ═══ (f) cast セッションで見える（パターン3 の positive）═══
    const { data: castCats, error: eCastSel } = await cast.from("product_categories").select("id, name").eq("id", catId as string);
    check("(f) ★cast セッションで product_categories が見える（products 同型パターン3）",
      !eCastSel && (castCats ?? []).length === 1, eCastSel?.message ?? `got ${(castCats ?? []).length}`);

    // ═══ (g) anon は 0行 ═══
    const { data: anonCats } = await anon.from("product_categories").select("id");
    check("(g) ★anon は product_categories 0行（RLS＋grant の二重遮断）", (anonCats ?? []).length === 0, `got ${(anonCats ?? []).length}`);

    // ═══ (h) kiosk_register_state v2 ═══
    const kEmail = `k-verify-cat@o-${(sA1.org_id as string).replace(/-/g, "").slice(0, 8)}.nox.local`;
    const { data: ownerUserRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.ownerA.email).single();
    const { data: ownerMemRow } = ownerUserRow
      ? await admin.from("memberships").select("id").eq("user_id", ownerUserRow.id).eq("store_id", sA1.id).single()
      : { data: null };
    const ownerMem = ownerMemRow?.id as string | undefined;
    const { data: lu } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const leftover = lu?.users?.find((u) => u.email === kEmail);
    if (leftover) await admin.auth.admin.deleteUser(leftover.id).catch(() => undefined);
    const { data: cu } = await admin.auth.admin.createUser({ email: kEmail, password: env.SEED_PASSWORD, email_confirm: true });
    kioskAuthId = cu?.user?.id ?? "";
    const { data: seatRow } = await admin.from("seats")
      .insert({ org_id: sA1.org_id, store_id: sA1.id, name: `${PREFIX}-卓`, kind: "卓", sort_order: 994, is_active: true })
      .select("id").single();
    const owner = await signIn("ownerA");
    const kiosk = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (kioskAuthId && ownerMem && seatRow) {
      const { error: eProv } = await owner.rpc("kiosk_provision", {
        p_auth_user_id: kioskAuthId, p_store_id: sA1.id, p_label: `${PREFIX}-reg`, p_purpose: "register",
      });
      check("(h) 準備 kiosk_provision(register)", !eProv, eProv?.message);
      await kiosk.auth.signInWithPassword({ email: kEmail, password: env.SEED_PASSWORD });
      await owner.rpc("set_staff_pin", { p_membership_id: ownerMem, p_pin: "4321" });
      const { data: rLogin } = await kiosk.rpc("kiosk_login", { p_membership_id: ownerMem, p_pin: "4321" });
      check("(h) 準備 kiosk_login ok:true", (rLogin as { ok?: boolean } | null)?.ok === true, JSON.stringify(rLogin));

      // 滞在タイマー確認用に open 伝票を1枚（started_at が載ること）
      const { data: chkId } = await kiosk.rpc("check_open", { p_seat_id: seatRow.id, p_people: 1, p_nom_type: "free" });
      const { data: st, error: eSt } = await kiosk.rpc("kiosk_register_state");
      const state = st as {
        categories?: { id: string; name: string; sort_order: number }[];
        products?: { id: string; category_id: string | null }[];
        checks?: { id: string; started_at?: string }[];
      } | null;
      check("(h) ★kiosk_register_state v2: categories 配列に作成カテゴリが載る",
        !eSt && (state?.categories ?? []).some((c) => c.id === catId), eSt?.message ?? JSON.stringify(state?.categories));
      check("(h) ★kiosk_register_state v2: categories は name/sort_order を持つ",
        (state?.categories ?? []).find((c) => c.id === catId)?.sort_order === 10,
        JSON.stringify((state?.categories ?? []).find((c) => c.id === catId)));
      check("(h) ★kiosk_register_state v2: products に category_id が載る（割当済み商品）",
        (state?.products ?? []).find((p) => p.id === prodId)?.category_id === catId,
        JSON.stringify((state?.products ?? []).find((p) => p.id === prodId)));
      const kChk = (state?.checks ?? []).find((c) => c.id === chkId);
      check("(h) ★kiosk_register_state v2: checks に started_at が載る（floor 滞在タイマー用）",
        !!kChk?.started_at && !Number.isNaN(new Date(kChk.started_at).getTime()), JSON.stringify(kChk));

      // ═══ (i) is_active=false で kiosk categories から消える ═══
      const { error: eOff } = await mgr.rpc("set_product_category", {
        p_id: catId, p_store_id: sA1.id, p_name: `${PREFIX}-焼酎`, p_sort_order: 10, p_is_active: false,
      });
      check("(i) 準備 カテゴリを is_active=false へ更新", !eOff, eOff?.message);
      const { data: st2 } = await kiosk.rpc("kiosk_register_state");
      const state2 = st2 as { categories?: { id: string }[] } | null;
      check("(i) ★無効カテゴリは kiosk categories から消える（active のみ）",
        !(state2?.categories ?? []).some((c) => c.id === catId), JSON.stringify(state2?.categories));
    } else {
      check("(h) 準備 kiosk auth/owner membership/卓 解決", false, JSON.stringify({ kioskAuthId: !!kioskAuthId, ownerMem, seat: !!seatRow }));
    }
  } finally {
    await wipe();
    if (kioskAuthId) await admin.auth.admin.deleteUser(kioskAuthId).catch(() => undefined);
    const { count: leftCat } = await admin.from("product_categories").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`);
    const { count: leftProd } = await admin.from("products").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`);
    check("（掃除）fixture カテゴリ/商品 0 件（固定カウント非汚染）",
      (leftCat ?? 0) === 0 && (leftProd ?? 0) === 0, `cat ${leftCat} / prod ${leftProd}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 段39: mig0077 の runtime 検証（product_category_reorder / set_product_active）
  //   ★教訓12 の同族＝「集合を触る RPC は行を返す状態で実行しないと出ない不具合がある」。
  //     特に reorder は unnest with ordinality と件数一致の両方向検証を持つため、
  //     prosrc 緑では ordinality の起点も部分配列の拒否も一切証明できない。
  //   ★product_category_reorder は「同店の全行が配列に含まれること」を要求する（partial ids）。
  //     よって配列は fixture だけでなく**その店の現在の全カテゴリ**から組む必要がある。
  //     そのため sort_order を退避→finally で復元する（fixture 以外の行を壊さない）。
  //   ★固定カウントに触れない: 生成は段内動的・削除は finally・退避値は原状復帰。
  // ═══════════════════════════════════════════════════════════════════════════
  if (sA1 && sA2) {
    const P39 = "NOX-VERIFY-段39";
    const owner = await signIn("ownerA");
    // 退避（この店の全カテゴリの並び順）＝reorder は全行を書き換えるため
    const { data: snap } = await admin.from("product_categories")
      .select("id, sort_order").eq("store_id", sA1.id);
    const snapshot = (snap ?? []) as { id: string; sort_order: number }[];

    const wipe39 = async () => {
      await admin.from("products").delete().like("name", `${P39}%`);
      await admin.from("product_categories").delete().like("name", `${P39}%`);
      await admin.from("audit_logs").delete().in("action", ["product_category_reorder", "set_product_active"])
        .eq("store_id", sA1.id);
      for (const s of snapshot) {
        await admin.from("product_categories").update({ sort_order: s.sort_order }).eq("id", s.id);
      }
    };
    await wipe39();

    try {
      // 準備: 動的に3件つくる（既存行があってもよい＝配列は毎回「現在の全件」から組む）
      const mkIds: string[] = [];
      for (const [i, nm] of [`${P39}-あ`, `${P39}-い`, `${P39}-う`].entries()) {
        const { data: id, error } = await mgr.rpc("set_product_category", {
          p_id: null, p_store_id: sA1.id, p_name: nm, p_sort_order: 900 + i, p_is_active: true,
        });
        if (!error && typeof id === "string") mkIds.push(id);
      }
      check("段39（準備）カテゴリ3件を動的生成", mkIds.length === 3, `作成 ${mkIds.length} 件`);

      // この店の現在の全カテゴリ（並び順つき）＝reorder に渡す母集合
      const allOf = async (storeId: string) => {
        const { data } = await admin.from("product_categories")
          .select("id, sort_order, name").eq("store_id", storeId)
          .order("sort_order").order("name");
        return (data ?? []) as { id: string; sort_order: number; name: string }[];
      };
      const base = await allOf(sA1.id);
      const ids = base.map((r) => r.id);

      // ── (1) 正常系: 逆順で投げると 1..N に正規化される（★先頭=1＝ordinality の起点）──
      {
        const rev = [...ids].reverse();
        const { error } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: rev });
        const after = await allOf(sA1.id);
        const byId = new Map(after.map((r) => [r.id, r.sort_order]));
        const seq = rev.map((id) => byId.get(id));
        check("段39(1) ★reorder 正常系＝配列順に 1..N へ正規化（先頭=1）",
          !error && seq.length > 0 && seq[0] === 1 && seq.every((v, i) => v === i + 1),
          error?.message ?? JSON.stringify(seq));
        check("段39(1) 正規化後は連番かつ重複なし（穴も飛びも無い）",
          new Set(after.map((r) => r.sort_order)).size === after.length
          && Math.max(...after.map((r) => r.sort_order)) === after.length,
          JSON.stringify(after.map((r) => r.sort_order)));
      }

      // ── (2) 冪等: 同じ配列を2回投げても結果が変わらない ──
      {
        const rev = [...ids].reverse();
        const { error: e1 } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: rev });
        const a1 = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        const { error: e2 } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: rev });
        const a2 = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        check("段39(2) 冪等＝同じ配列の2回目で結果不変（差分でなく絶対順序を書く）",
          !e1 && !e2 && a1 === a2, `${e1?.message ?? ""}${e2?.message ?? ""}`);
      }

      // ── (3) ★部分配列（1件落とす）→ 'partial ids'（BANZEN は片方向検証で通る箇所）──
      {
        const before = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        const { error } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: ids.slice(1) });
        const after = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        check("段39(3) ★部分配列＝partial ids で拒否（欠けた行が旧値と衝突しない）",
          has(error, "partial ids") && before === after, error?.message ?? "通ってしまった");
      }

      // ── (4) ★余分な id（他店のカテゴリを混ぜる）→ 'forbidden' ──
      {
        const { data: a2cat, error: eMk } = await admin.from("product_categories")
          .insert({ org_id: sA2.org_id, store_id: sA2.id, name: `${P39}-他店`, sort_order: 999, is_active: true })
          .select("id").single();
        const before = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        const { error } = await mgr.rpc("product_category_reorder",
          { p_store_id: sA1.id, p_ids: [...ids, a2cat?.id as string] });
        const after = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        check("段39(4) ★他店カテゴリ混入＝forbidden（状態は不変）",
          !eMk && has(error, "forbidden") && before === after, error?.message ?? "通ってしまった");
      }

      // ── (5) ★重複 id（同じ id を2回）→ 'duplicate ids' ──
      {
        const before = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        const { error } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: [...ids, ids[0]] });
        const after = (await allOf(sA1.id)).map((r) => `${r.id}:${r.sort_order}`).join(",");
        check("段39(5) ★重複 id＝duplicate ids（ordinality が非決定になる形を入口で拒否）",
          has(error, "duplicate ids") && before === after, error?.message ?? "通ってしまった");
      }

      // ── (6) 空配列 → 'bad ids' ──
      {
        const { error } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: [] });
        check("段39(6) 空配列＝bad ids", has(error, "bad ids"), error?.message ?? "通ってしまった");
      }

      // ── (7)(8) 他店 store_id / manager の越権 → 'forbidden'／自店は成功 ──
      {
        const a2all = await allOf(sA2.id);
        const { error: eX } = await mgr.rpc("product_category_reorder",
          { p_store_id: sA2.id, p_ids: a2all.map((r) => r.id) });
        check("段39(7) manager が他店 store_id を並び替え＝forbidden",
          has(eX, "forbidden"), eX?.message ?? "通ってしまった");
        const { error: eOwn } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: ids });
        check("段39(8) manager 自店は成功（正の対照）", !eOwn, eOwn?.message);
        const { error: eOwner } = await owner.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: ids });
        check("段39(8) owner も自 org の店を並び替えできる", !eOwner, eOwner?.message);
      }

      // ── (9) audit＝1操作1行・before/after は (id, sort_order) のみ（PII なし）──
      {
        await admin.from("audit_logs").delete().eq("action", "product_category_reorder").eq("store_id", sA1.id);
        const { error } = await mgr.rpc("product_category_reorder", { p_store_id: sA1.id, p_ids: [...ids].reverse() });
        const { data: logs } = await admin.from("audit_logs")
          .select("action, target, before_json, after_json")
          .eq("action", "product_category_reorder").eq("store_id", sA1.id);
        const rows = (logs ?? []) as { target: string; before_json: unknown; after_json: unknown }[];
        check("段39(9) audit_logs に product_category_reorder が1操作1行", !error && rows.length === 1,
          `${error?.message ?? ""} rows=${rows.length}`);
        const keysOf = (j: unknown) => Array.from(new Set(
          (Array.isArray(j) ? j : []).flatMap((o) => Object.keys(o as Record<string, unknown>)))).sort();
        const bk = keysOf(rows[0]?.before_json), ak = keysOf(rows[0]?.after_json);
        check("段39(9) ★before/after のキーは id と sort_order のみ（名称＝PII 相当を残さない）",
          JSON.stringify(bk) === JSON.stringify(["id", "sort_order"])
          && JSON.stringify(ak) === JSON.stringify(["id", "sort_order"]),
          JSON.stringify({ before: bk, after: ak }));
        check("段39(9) target は store 粒度（product_categories:store:<uuid>）",
          rows[0]?.target === `product_categories:store:${sA1.id}`, rows[0]?.target);
      }

      // ══ set_product_active ══════════════════════════════════════════════
      // 準備: 触ってはいけない列に全部値を入れた商品を1件つくる
      const { data: prodId, error: eProd } = await mgr.rpc("set_product", {
        p_id: null, p_store_id: sA1.id, p_type: "champ", p_category: null,
        p_name: `${P39}-商品`, p_price: 12000, p_cost: 4000,
        p_back_mode: "unit4", p_back_value: null,
        p_unit4: { hon: 1200, jonai: 900, dohan: 700, free: 300 },
        p_hon_pt: 0, p_is_active: true, p_reorder_point: 3,
        p_category_id: mkIds[0] ?? null, p_back_exempt_from_split: false,
      });
      check("段39（準備）検証用の商品を動的生成（unit4/原価/発注点/カテゴリ入り）",
        !eProd && typeof prodId === "string", eProd?.message);

      if (typeof prodId === "string") {
        const snapOf = async () => {
          const { data } = await admin.from("products")
            .select("name, price, type, back_mode, back_value, unit4_json, hon_pt, reorder_point, category_id, back_exempt_from_split, is_active")
            .eq("id", prodId).single();
          return data as Record<string, unknown>;
        };
        const before = await snapOf();

        // ── (10) 正常系: true → false → true ──
        const { error: eOff } = await mgr.rpc("set_product_active", { p_id: prodId, p_store_id: sA1.id, p_is_active: false });
        const offRow = await snapOf();
        const { error: eOn } = await mgr.rpc("set_product_active", { p_id: prodId, p_store_id: sA1.id, p_is_active: true });
        const onRow = await snapOf();
        check("段39(10) set_product_active＝true→false→true が通り is_active が追随",
          !eOff && !eOn && offRow.is_active === false && onRow.is_active === true,
          `${eOff?.message ?? ""}${eOn?.message ?? ""} off=${offRow.is_active} on=${onRow.is_active}`);

        // ── (11) ★is_active 以外が1つも動かない（本 RPC の存在理由）──
        {
          const omit = (o: Record<string, unknown>) => {
            const { is_active: _drop, ...rest } = o; void _drop; return JSON.stringify(rest);
          };
          check("段39(11) ★name/price/type/back_*/unit4/hon_pt/reorder_point/category_id が1つも変化しない",
            omit(before) === omit(offRow) && omit(before) === omit(onRow),
            JSON.stringify({ before: omit(before), off: omit(offRow), on: omit(onRow) }));
        }

        // ── (12) 存在しない id → 'not found' ──
        {
          const { error } = await mgr.rpc("set_product_active", {
            p_id: "00000000-0000-0000-0000-000000000000", p_store_id: sA1.id, p_is_active: false,
          });
          check("段39(12) 存在しない id＝not found", has(error, "not found"), error?.message ?? "通ってしまった");
        }

        // ── (13) ★他店の商品はどう落ちるか（store_id の渡し方で分岐する）＝実測して固定 ──
        {
          const { data: a2prod } = await admin.from("products").insert({
            org_id: sA2.org_id, store_id: sA2.id, type: "drink", name: `${P39}-他店商品`,
            price: 1000, back_mode: "rate", back_value: 10, hon_pt: 0, is_active: true,
          }).select("id").single();
          // (13a) 自店 store_id ＋ 他店の商品 id → 行が引けない＝not found
          const { error: eA } = await mgr.rpc("set_product_active",
            { p_id: a2prod?.id as string, p_store_id: sA1.id, p_is_active: false });
          check("段39(13a) ★自店 store_id ＋ 他店商品 id ＝ not found（行照合で落ちる）",
            has(eA, "not found"), eA?.message ?? "通ってしまった");
          // (13b) 他店 store_id → ロール判定で先に落ちる＝forbidden
          const { error: eB } = await mgr.rpc("set_product_active",
            { p_id: a2prod?.id as string, p_store_id: sA2.id, p_is_active: false });
          const { data: a2after } = await admin.from("products").select("is_active").eq("id", a2prod?.id as string).single();
          check("段39(13b) ★他店 store_id ＝ forbidden（ロール判定が行照合より前・対象は不変）",
            has(eB, "forbidden") && a2after?.is_active === true, eB?.message ?? "通ってしまった");
          await admin.from("products").delete().eq("id", a2prod?.id as string);
        }

        // ── (14) p_is_active = null → 'bad is_active'（boolean を三値にしない）──
        {
          const { error } = await mgr.rpc("set_product_active", { p_id: prodId, p_store_id: sA1.id, p_is_active: null });
          const row = await snapOf();
          check("段39(14) p_is_active=null＝bad is_active（状態不変）",
            has(error, "bad is_active") && row.is_active === true, error?.message ?? "通ってしまった");
        }

        // ── (16) audit＝action 名が set_product と区別されている ──
        {
          await admin.from("audit_logs").delete().eq("action", "set_product_active").eq("store_id", sA1.id);
          const { error } = await mgr.rpc("set_product_active", { p_id: prodId, p_store_id: sA1.id, p_is_active: false });
          const { data: logs } = await admin.from("audit_logs")
            .select("action, target").eq("action", "set_product_active").eq("store_id", sA1.id);
          const rows = (logs ?? []) as { action: string; target: string }[];
          check("段39(16) ★audit の action は set_product_active（set_product と別名で記録）",
            !error && rows.length === 1 && rows[0].action === "set_product_active"
            && rows[0].target === `products:${prodId}`,
            `${error?.message ?? ""} ${JSON.stringify(rows)}`);
        }
      }
    } finally {
      await wipe39();
      const { count: left39 } = await admin.from("product_categories")
        .select("id", { count: "exact", head: true }).like("name", `${P39}%`);
      const restored = await admin.from("product_categories").select("id, sort_order").eq("store_id", sA1.id);
      const now = new Map(((restored.data ?? []) as { id: string; sort_order: number }[]).map((r) => [r.id, r.sort_order]));
      check("段39（掃除）fixture 0件＋退避した sort_order を完全復元（他段の固定値を汚さない）",
        (left39 ?? 0) === 0 && snapshot.every((s) => now.get(s.id) === s.sort_order),
        `left ${left39} / restored ${snapshot.filter((s) => now.get(s.id) !== s.sort_order).length} 件ずれ`);
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
  console.log(`verify:nox-categories ALL PASS (${pass} assertions)`);
  console.log("カテゴリマスタ: 重複名/越境拒否・cast 可視(パターン3)・anon 0行・kiosk v2(categories/category_id/started_at)");
}

main().catch((e) => {
  console.error("verify:nox-categories 実行エラー", e);
  process.exit(1);
});
