/*
 * verify:nox-r2b — R-2b（裁定100/102・mig0118/0119）キャスト別指名種別・同伴別軸の係留。
 *   npm run verify:nox-r2b（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * 観点（裁定100-E）:
 *  (1) backfill 同値＝0118 以前の全 live 名簿行が旧 nom_type 写像どおり（zero-result は fail）
 *  (2) 同一 cast に hon∧同伴 → get_cast_sales で hon=1・dohan=1（別軸の同時成立＝裁定86-④）
 *  (3) shimei の同一 idem_key 再送＝同じ行 id・行は増えない（裁定102）
 *  (4) 同伴料 cast なし＝'cast required'（裁定100 A-5）
 *  (5) dohan_auto_hon で free→hon 昇格・明示 jonai は昇格しない
 *  (6) 1伝票に hon と jonai の2 cast → 各自の種別で計上（卓一括の旧写像と判別）
 *  (7) checks.nom_type 派生サマリ＝hon>jonai>dohan>free の優先順
 *  (8) dohan rate ガードは封印のまま（'dohan rate requires R-2b' は独立 mig で解錠＝裁定76/100-B5）
 *  (9) dohan の同一 idem_key 再送＝行が増えない（裁定102）
 *  (10) drink_claim の unit4 キー＝申告キャスト自身の名簿行（伝票サマリではない）
 *  (11) 予約経由の指名転写（mig0120 裁定103）＝dohan 予約→free/is_dohan=true・hon 予約→hon/false
 *
 * 逆張り: R2B_INVERT=1 で全 check の期待を反転＝全赤を実測（各 assert が落ち得ることの機械証明）。
 *   加えて (1) はデータ逆張り（1行の nom_kind を壊す→赤→復元）を実行ログで確認する運用。
 * fixture は段内動的生成（NOX-VERIFY-r2b* 命名・period 2031-03 隔離）＋ finally 全消し。
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

const INV = process.env.R2B_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const P = "2031-03"; // 隔離 period（既存 fixture 群と非衝突）

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: "managerA1" | "ownerA") => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1");
  const owner = await signIn("ownerA");
  const { data: sA1 } = await admin.from("stores").select("id, org_id, dohan_auto_hon").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;
  const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = mgrU!.id as string;

  const CASTS = ["NOX-VERIFY-r2bA", "NOX-VERIFY-r2bB"];
  const SEAT = "NOX-VERIFY-r2b卓";
  const RES = "NOX-VERIFY-r2b予約客";
  const PROD = "NOX-VERIFY-r2bドリンク";
  const PLAN = "NOX-VERIFY-r2bプラン";
  const madeChecks: string[] = [];
  let castA = "", castB = "", seatId = "", prodId = "";

  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").in("name", CASTS);
    const ids = (cs ?? []).map((r) => r.id as string);
    const { data: sts } = await admin.from("seats").select("id").eq("name", SEAT);
    const seatIds = (sts ?? []).map((r) => r.id as string);
    const { data: chks } = seatIds.length
      ? await admin.from("checks").select("id").in("seat_id", seatIds)
      : { data: [] as { id: string }[] };
    const chkIds = Array.from(new Set([...(chks ?? []).map((r) => r.id as string), ...madeChecks]));
    await admin.from("reservations").delete().eq("guest_name", RES); // (11) fixture（check_id FK が checks 削除を塞ぐため先に）
    if (chkIds.length) {
      await admin.from("drink_claims").delete().in("check_id", chkIds);
      for (const t of ["check_cast_backs", "check_nominations", "check_lines", "payments"]) {
        await admin.from(t).delete().in("check_id", chkIds);
      }
      await admin.from("checks").delete().in("id", chkIds);
    }
    if (ids.length) {
      await admin.from("check_nominations").delete().in("cast_id", ids);
      await admin.from("casts").delete().in("id", ids);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    // ★教訓44 型: エラーを確認しない delete は一過性失敗で無音残置になる（2026-09-01 に products で実発火＝
    //   後続 run の anon-guard 段28 が残置商品を拾って偽赤）。失敗は stderr へ出して次 run の先頭 teardown に委ねる
    const { error: eProd } = await admin.from("products").delete().eq("name", PROD);
    if (eProd) console.error(`[r2b teardown] products delete 失敗（次 run 先頭で自浄）: ${eProd.message}`);
    await admin.from("comp_plans").delete().eq("name", PLAN);
    await admin.from("stores").update({ dohan_auto_hon: false }).eq("id", storeA1); // フラグ復元（既定 false）
  }
  await teardown();

  try {
    // ── fixture ──
    castA = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: CASTS[0], is_active: true }).select("id").single()).data!.id as string;
    castB = (await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name: CASTS[1], is_active: true }).select("id").single()).data!.id as string;
    seatId = (await admin.from("seats").insert({ org_id: orgA, store_id: storeA1, name: SEAT, kind: "卓", sort_order: 99, is_active: true }).select("id").single()).data!.id as string;

    // ══ (1) backfill 同値（0118 以前の全行・zero-result fail）══
    {
      const { data: rows } = await admin
        .from("check_nominations")
        .select("id, nom_kind, is_dohan, created_at, checks!inner(nom_type)")
        .lt("created_at", "2026-09-01T00:00:00+09:00");
      const rs = (rows ?? []) as { id: string; nom_kind: string; is_dohan: boolean; checks: { nom_type: string } | { nom_type: string }[] }[];
      const nomOf = (x: (typeof rs)[0]) => (Array.isArray(x.checks) ? x.checks[0]?.nom_type : x.checks?.nom_type) ?? "?";
      const bad = rs.filter((r) => {
        const nt = nomOf(r);
        if (nt === "hon") return !(r.nom_kind === "hon" && !r.is_dohan);
        if (nt === "jonai") return !(r.nom_kind === "jonai" && !r.is_dohan);
        if (nt === "dohan") return !(r.nom_kind === "free" && r.is_dohan);
        return !(r.nom_kind === "free" && !r.is_dohan);
      });
      check("r2b(1) ★backfill 同値＝0118 以前の全行が旧 nom_type 写像どおり（zero-result は fail）",
        rs.length > 0 && bad.length === 0,
        JSON.stringify({ total: rs.length, bad: bad.slice(0, 3) }));
    }

    // ══ (2)(6) 各自の種別で計上（closed fixture・period 2031-03 隔離・get_cast_sales で読む）══
    {
      const mk = async (startedAt: string, noms: { cast_id: string; nom_kind: string; is_dohan: boolean }[]) => {
        const { data: c } = await admin.from("checks").insert({
          org_id: orgA, store_id: storeA1, seat_id: seatId, status: "closed",
          started_at: startedAt, closed_at: startedAt, nom_type: "free",
          service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
        }).select("id").single();
        const cid = c!.id as string; madeChecks.push(cid);
        let pos = 0;
        for (const n of noms) {
          await admin.from("check_nominations").insert({
            org_id: orgA, store_id: storeA1, check_id: cid, cast_id: n.cast_id,
            ratio_weight: 1, position: pos++, nom_kind: n.nom_kind, is_dohan: n.is_dohan,
          });
        }
        return cid;
      };
      // (2) castA に hon∧同伴（1伝票）
      await mk(`${P}-10T22:00:00+09:00`, [{ cast_id: castA, nom_kind: "hon", is_dohan: true }]);
      // (6) castA=hon / castB=jonai の混在1伝票
      await mk(`${P}-12T22:00:00+09:00`, [
        { cast_id: castA, nom_kind: "hon", is_dohan: false },
        { cast_id: castB, nom_kind: "jonai", is_dohan: false },
      ]);
      const { data: sales, error: eS } = await mgr.rpc("get_cast_sales", {
        p_store_id: storeA1, p_from: `${P}-01`, p_to: `${P}-31`,
      });
      const rows = (sales ?? []) as { cast_id: string; hon: number; jonai: number; dohan: number }[];
      const agg = (cid: string) => rows.filter((r) => r.cast_id === cid)
        .reduce((a, r) => ({ hon: a.hon + r.hon, jonai: a.jonai + r.jonai, dohan: a.dohan + r.dohan }), { hon: 0, jonai: 0, dohan: 0 });
      const a = agg(castA), b = agg(castB);
      check("r2b(2) ★同一 cast に hon∧同伴 → hon=1・dohan=1（別軸の同時成立・裁定86-④）",
        !eS && a.hon === 2 /* (2)の1 + (6)の1 */ && a.dohan === 1 && a.jonai === 0,
        eS?.message ?? JSON.stringify(a));
      check("r2b(6) ★混在伝票＝各自の種別で計上（castB は jonai のみ・hon/dohan 0）",
        b.jonai === 1 && b.hon === 0 && b.dohan === 0, JSON.stringify(b));
    }

    // ══ (7) nom_type 派生サマリの優先順（open 伝票・実 RPC）══
    let openChk = "";
    {
      const { data: oc, error: eO } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 2, p_nom_type: "free" });
      if (eO) throw new Error(`check_open: ${eO.message}`);
      openChk = oc as string; madeChecks.push(openChk);
      const summary = async () => (await admin.from("checks").select("nom_type").eq("id", openChk).single()).data?.nom_type;
      await mgr.rpc("check_set_nominations", { p_check_id: openChk, p_nominations: [{ cast_id: castA, weight: 1, nom_kind: "free", is_dohan: true }] });
      const s1 = await summary(); // dohan のみ → 'dohan'
      await mgr.rpc("check_set_nominations", { p_check_id: openChk, p_nominations: [
        { cast_id: castA, weight: 1, nom_kind: "free", is_dohan: true },
        { cast_id: castB, weight: 1, nom_kind: "jonai", is_dohan: false },
      ] });
      const s2 = await summary(); // dohan+jonai → 'jonai'
      await mgr.rpc("check_set_nominations", { p_check_id: openChk, p_nominations: [
        { cast_id: castA, weight: 2, nom_kind: "hon", is_dohan: true },
        { cast_id: castB, weight: 1, nom_kind: "jonai", is_dohan: false },
      ] });
      const s3 = await summary(); // hon 混在 → 'hon'
      check("r2b(7) ★派生サマリ＝hon>jonai>dohan>free（dohan→'dohan'・+jonai→'jonai'・+hon→'hon'）",
        s1 === "dohan" && s2 === "jonai" && s3 === "hon", JSON.stringify({ s1, s2, s3 }));
    }

    // ══ (3)(9) idem_key（裁定102）＝同キー再送で行が増えない・同じ id ══
    {
      const cnt = async () => (await admin.from("check_lines").select("id", { count: "exact", head: true }).eq("check_id", openChk)).count ?? 0;
      const k1 = randomUUID();
      const { data: l1, error: e1 } = await mgr.rpc("check_shimei_add", { p_check_id: openChk, p_cast_id: castA, p_kind: "hon", p_idem_key: k1 });
      const n1 = await cnt();
      const { data: l1b, error: e1b } = await mgr.rpc("check_shimei_add", { p_check_id: openChk, p_cast_id: castA, p_kind: "hon", p_idem_key: k1 });
      const n1b = await cnt();
      check("r2b(3) ★shimei 同一 idem_key 再送＝同じ行 id・行数不変（連打/再送の吸収）",
        !e1 && !e1b && l1 === l1b && n1 === n1b && typeof l1 === "string",
        e1?.message ?? e1b?.message ?? JSON.stringify({ l1, l1b, n1, n1b }));
      const k2 = randomUUID();
      const { data: d1, error: e2 } = await mgr.rpc("check_dohan_add", { p_check_id: openChk, p_cast_id: castA, p_count: 2, p_idem_key: k2 });
      const n2 = await cnt();
      const { data: d1b, error: e2b } = await mgr.rpc("check_dohan_add", { p_check_id: openChk, p_cast_id: castA, p_count: 2, p_idem_key: k2 });
      const n2b = await cnt();
      check("r2b(9) ★dohan 同一 idem_key 再送＝行が増えない・同じ id",
        !e2 && !e2b && d1 === d1b && n2 === n2b, e2?.message ?? e2b?.message ?? JSON.stringify({ d1, d1b, n2, n2b }));
    }

    // ══ (4) 同伴料 cast なし＝'cast required' ══
    {
      const { error: e } = await mgr.rpc("check_dohan_add", { p_check_id: openChk, p_cast_id: null, p_count: 1, p_idem_key: null });
      check("r2b(4) ★同伴料 cast なしは 'cast required'（裁定100 A-5）",
        !!e && e.message.includes("cast required"), e?.message ?? "通ってしまった");
    }

    // ══ (5) dohan_auto_hon: free→hon 昇格・明示 jonai は昇格しない ══
    {
      await admin.from("stores").update({ dohan_auto_hon: true }).eq("id", storeA1);
      const { error: e } = await mgr.rpc("check_set_nominations", { p_check_id: openChk, p_nominations: [
        { cast_id: castA, weight: 1, nom_kind: "free", is_dohan: true },   // → hon へ昇格
        { cast_id: castB, weight: 1, nom_kind: "jonai", is_dohan: true },  // 明示 jonai は不変
      ] });
      const { data: rows } = await admin.from("check_nominations").select("cast_id, nom_kind, is_dohan").eq("check_id", openChk);
      const rA = (rows ?? []).find((r) => r.cast_id === castA);
      const rB = (rows ?? []).find((r) => r.cast_id === castB);
      check("r2b(5) ★dohan_auto_hon＝free∧同伴→hon 昇格・明示 jonai は昇格しない",
        !e && rA?.nom_kind === "hon" && rA?.is_dohan === true && rB?.nom_kind === "jonai" && rB?.is_dohan === true,
        e?.message ?? JSON.stringify({ rA, rB }));
      await admin.from("stores").update({ dohan_auto_hon: false }).eq("id", storeA1);
    }

    // ══ (10) drink_claim の unit4 キー＝申告キャスト自身の名簿行（伝票サマリと判別）══
    {
      // 商品（unit4: hon400/jonai300/dohan200/free100）→ 行 → castB（jonai）が申告 → back=300（サマリ hon の 400 ではない）
      const { data: pr, error: ePr } = await admin.from("products").insert({
        org_id: orgA, store_id: storeA1, type: "drink", name: PROD, price: 1000, category: "ドリンク",
        back_mode: "unit4", back_value: null, unit4_json: { hon: 400, jonai: 300, dohan: 200, free: 100 },
        back_exempt_from_split: true, is_active: true, sort_order: 999,
      }).select("id").single();
      if (ePr) throw new Error(`products insert: ${ePr.message}`);
      prodId = pr!.id as string;
      // 名簿を hon(castA)+jonai(castB) に戻す（(5) の昇格状態を上書き・サマリ='hon'）
      await mgr.rpc("check_set_nominations", { p_check_id: openChk, p_nominations: [
        { cast_id: castA, weight: 1, nom_kind: "hon", is_dohan: false },
        { cast_id: castB, weight: 1, nom_kind: "jonai", is_dohan: false },
      ] });
      const { error: eL } = await mgr.rpc("check_add_line", {
        p_check_id: openChk, p_product_id: prodId, p_qty: 1, p_kind: null,
        p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      const { error: eL2 } = await mgr.rpc("check_add_line", {
        p_check_id: openChk, p_product_id: prodId, p_qty: 1, p_kind: null,
        p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      const { data: lines } = await admin.from("check_lines").select("id").eq("check_id", openChk).eq("product_id", prodId).order("created_at");
      const [lineA, lineB] = (lines ?? []).map((r) => r.id as string);
      // 経路A: 代理起票（submit 時に即 approved・per-cast キーで焼付け）
      const { data: claimId, error: eC } = await mgr.rpc("drink_claim_submit_proxy", { p_line_id: lineA, p_cast_id: castB });
      const { data: claimA } = await admin.from("drink_claims").select("back_amount, status").eq("id", claimId ?? "").single();
      // 経路B: pending 行を decide（承認時に per-cast キーで再計算・products 直読み・別行＝line live uidx 回避）
      const { data: pend } = await admin.from("drink_claims").insert({
        org_id: orgA, store_id: storeA1, check_id: openChk, check_line_id: lineB,
        cast_id: castB, product_id: prodId, qty: 1, back_amount: 0, status: "pending", requested_by: actorId,
      }).select("id").single();
      const { error: eD } = await mgr.rpc("drink_claim_decide", { p_claim_id: pend?.id, p_approve: true, p_qty_override: null });
      const { data: claimB } = await admin.from("drink_claims").select("back_amount, status").eq("id", pend?.id ?? "").single();
      check("r2b(10) ★drink_claim の unit4 はキャスト別キー（jonai の castB→300・サマリ hon の 400 ではない・proxy/decide 両経路）",
        !eL && !eL2 && !eC && !eD && claimA?.status === "approved" && claimA?.back_amount === 300
          && claimB?.status === "approved" && claimB?.back_amount === 300,
        eL?.message ?? eL2?.message ?? eC?.message ?? eD?.message ?? JSON.stringify({ claimA, claimB }));
    }

    // ══ (8) dohan rate ガード封印のまま ══
    {
      const { error: e } = await owner.rpc("set_comp_plan", {
        p_id: null, p_store_id: storeA1, p_name: PLAN, p_base: 5000,
        p_hon_back: 0, p_jonai_back: 0, p_dohan_back: 0,
        p_sales_slide: [], p_point_slide: [], p_is_active: true,
        p_hon_back_mode: "per_count", p_hon_back_rate: null,
        p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
        p_dohan_back_mode: "rate", p_dohan_back_rate: 50,
      });
      check("r2b(8) ★dohan rate ガードは封印のまま（'dohan rate requires R-2b'＝解錠は独立 mig・裁定76/100-B5）",
        !!e && e.message.includes("dohan rate requires R-2b"), e?.message ?? "通ってしまった");
    }

    // ══ (11) 予約経由の指名転写（mig0120 裁定103）＝実 RPC reservation_to_check → 0118 backfill と同一写像 ══
    {
      // 前提: dohan_auto_hon=false（(5) が復元済み）を能動確認（true だと 11a が hon 昇格して偽赤/偽緑になる）
      const { data: st } = await admin.from("stores").select("dohan_auto_hon").eq("id", storeA1).single();
      check("r2b(11) 前提＝dohan_auto_hon=false（昇格なしの素の写像を見る）", st?.dohan_auto_hon === false, JSON.stringify(st));
      // 同卓の open が 'seat occupied' に当たるため openChk を fixture 閉卓
      await admin.from("checks").update({ status: "closed", closed_at: `${P}-14T23:00:00+09:00` }).eq("id", openChk);
      const mkRes = async (nomType: string) => {
        const { data: r } = await admin.from("reservations").insert({
          org_id: orgA, store_id: storeA1, cast_id: castA, guest_name: RES,
          reserved_at: `${P}-15T20:00:00+09:00`, party_size: 2, nom_type: nomType, status: "booked", created_by: actorId,
        }).select("id").single();
        return r!.id as string;
      };
      const nomsOf = async (cid: string) =>
        (await admin.from("check_nominations").select("cast_id, nom_kind, is_dohan, ratio_weight").eq("check_id", cid)).data ?? [];
      // (11a) dohan 予約 → 名簿行 nom_kind=free / is_dohan=true（伝票単位 dohan のキャスト行転写）
      const r1 = await mkRes("dohan");
      const { data: c1, error: e1 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r1, p_seat_id: seatId });
      if (typeof c1 === "string") madeChecks.push(c1);
      const n1 = await nomsOf((c1 as string) ?? "");
      check("r2b(11a) ★dohan 予約→来店＝名簿1行・nom_kind=free/is_dohan=true/weight=1（裁定103 写像）",
        !e1 && n1.length === 1 && n1[0].cast_id === castA && n1[0].nom_kind === "free" && n1[0].is_dohan === true && n1[0].ratio_weight === 1,
        e1?.message ?? JSON.stringify(n1));
      await admin.from("checks").update({ status: "closed", closed_at: `${P}-15T23:00:00+09:00` }).eq("id", (c1 as string) ?? "");
      // (11b) hon 予約 → 名簿行 nom_kind=hon / is_dohan=false
      const r2 = await mkRes("hon");
      const { data: c2, error: e2 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r2, p_seat_id: seatId });
      if (typeof c2 === "string") madeChecks.push(c2);
      const n2 = await nomsOf((c2 as string) ?? "");
      check("r2b(11b) ★hon 予約→来店＝名簿1行・nom_kind=hon/is_dohan=false（そのまま転写）",
        !e2 && n2.length === 1 && n2[0].cast_id === castA && n2[0].nom_kind === "hon" && n2[0].is_dohan === false,
        e2?.message ?? JSON.stringify(n2));
      await admin.from("checks").update({ status: "closed", closed_at: `${P}-15T23:30:00+09:00` }).eq("id", (c2 as string) ?? "");
    }
  } finally {
    await teardown();
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（R2B_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-r2b ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
