/*
 * verify:nox-seat-reorder — mig0145 seat_reorder（裁定255・R16＝席の並べ替えの原子化）の係留。
 *   npm run verify:nox-seat-reorder（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *   走数外（f0 では 48 段目に連結）。
 *
 * 観点（相談役ブロック 2026-09-14 ①〜⑭）:
 *  ① owner が全件 id 配列を渡すと sort_order が 1..N に再採番される
 *  ② updated_at が更新される（sort_order が変わった行はすべて更新。★契約上は配列の全行に now() が入る＝cast_rank_reorder と同じ）
 *  ③ 配列の順序どおりに並ぶ（先頭→1・末尾→N）
 *  ④ 空配列・null → bad ids
 *  ⑤ 重複 id → duplicate ids
 *  ⑥ 部分配列（1 件欠け）→ partial ids
 *  ⑦ 他店（A2）の id を混ぜる → forbidden
 *  ⑧ 他 org の store_id（B1）→ forbidden
 *  ⑨ manager は自店のみ可・他店（A2）は forbidden／cast は forbidden
 *  ⑩ anon から seat_reorder が BLOCKED（permission denied for function）
 *  ⑪ 無効席（is_active=false）も再採番の対象に含まれる
 *  ⑫ audit_logs に action='seat_reorder' が成功 1 回につき 1 行・before/after が (id, sort_order) の配列
 *  ⑬ 失敗系では seats が 1 行も変わらない（各拒否の前後で (id, sort_order, updated_at) のハッシュ一致）
 *  ⑭ 後始末後に sort_order が実行前と一致
 *
 * fixture（既存 reorder 系＝verify-nox-pricing 段43(12) と同流儀・verify org A・finally で全消し・money 非接触）:
 *   - A1 の既存 seats（seed:f0 の 13 席）をそのまま母集団にし、admin insert で NOX-VERIFY-SR卓X（有効）／SR卓Y（無効）の 2 席を足す
 *   - 実行前の (id, name, kind, sort_order, is_active) を控え、teardown で **set_seat（RPC 経由）** により元の sort_order へ復元・追加 2 席は admin delete
 *   - audit_logs は開始時刻以降・org A・action in ('seat_reorder','set_seat') のみ delete
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_A2, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null | undefined, s: string) => !!e?.message?.includes(s);

type SeatRow = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean; updated_at: number /* epoch 秒 */ };
const FX = ["NOX-VERIFY-SR卓X", "NOX-VERIFY-SR卓Y"];

async function main() {
  const t0 = new Date().toISOString();
  const mk = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = mk();
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = mk();
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const cast = await signIn("castA1a");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const { data: sB1 } = await admin.from("stores").select("id").eq("name", STORE_B1).single();
  const storeA1 = sA1!.id as string, orgA = sA1!.org_id as string, storeA2 = sA2!.id as string, storeB1 = sB1!.id as string;
  const seatsOf = (store: string) => q<SeatRow>(`select id, name, kind, sort_order, is_active, extract(epoch from updated_at)::float8 as updated_at from public.seats where store_id = $1 order by sort_order, name`, [store]);
  const snap = async () => createHash("md5").update(JSON.stringify((await seatsOf(storeA1)).map((s) => [s.id, s.sort_order, s.updated_at]))).digest("hex");
  const reorder = (c: ReturnType<typeof mk>, store: string, ids: unknown) => c.rpc("seat_reorder", { p_store_id: store, p_ids: ids });

  // 実行前の控え（既存席のみ・復元用）
  await admin.from("seats").delete().in("name", FX); // 前回の取り残し
  const pre = await seatsOf(storeA1);
  const preOrder = pre.map((s) => [s.id, s.sort_order]);
  const fxIds: string[] = [];
  let okCalls = 0;

  async function teardown() {
    // 追加 2 席は admin delete → 既存席は set_seat（RPC 経由）で元の sort_order へ
    if (fxIds.length) await admin.from("seats").delete().in("id", fxIds);
    await admin.from("seats").delete().in("name", FX);
    for (const s of pre) {
      const { error } = await owner.rpc("set_seat", { p_id: s.id, p_store_id: storeA1, p_name: s.name, p_kind: s.kind, p_sort_order: s.sort_order, p_is_active: s.is_active });
      if (error) console.error(`[seat-reorder teardown] set_seat 復元 ${s.name}: ${error.message}`);
    }
    await db.query(`delete from public.audit_logs where org_id = $1 and at >= $2 and action = any($3)`, [orgA, t0, ["seat_reorder", "set_seat"]]);
  }

  try {
    // ── fixture: 有効 1・無効 1 を追加 ──
    {
      const { data, error } = await admin.from("seats").insert([
        { org_id: orgA, store_id: storeA1, name: FX[0], kind: "卓", sort_order: 0, is_active: true },
        { org_id: orgA, store_id: storeA1, name: FX[1], kind: "VIP", sort_order: 0, is_active: false },
      ]).select("id, name");
      if (error) throw new Error("seats insert: " + error.message);
      for (const r of data ?? []) fxIds.push(r.id as string);
      check("sr(fx) 準備: A1 の既存席＋有効 1・無効 1 を追加（母集団 N ≥ 3）", fxIds.length === 2 && pre.length >= 1, `pre ${pre.length} fx ${fxIds.length}`);
    }
    const all0 = await seatsOf(storeA1);
    const N = all0.length;
    const a2seat = (await seatsOf(storeA2))[0]?.id;
    check("sr(fx) 準備: A2 に他店 id の材料が 1 席以上", !!a2seat, "A2 に席なし");

    // ── ①②③⑪ owner: 逆順の全件配列で 1..N ──
    {
      const ids = all0.map((s) => s.id).reverse();
      const before = new Map(all0.map((s) => [s.id, s]));
      const tCall = Date.now() / 1000 - 60; // 秒（DB と手元の時計差を 60 秒まで許容）
      const { error } = await reorder(owner, storeA1, ids);
      if (!error) okCalls++;
      const after = await seatsOf(storeA1);
      const byId = new Map(after.map((s) => [s.id, s]));
      check("sr(①) ★owner の全件配列で seat_reorder が通る", !error, error?.message);
      check("sr(①-2) ★sort_order が 1..N に再採番（重複なし・欠けなし）",
        JSON.stringify(after.map((s) => s.sort_order)) === JSON.stringify(Array.from({ length: N }, (_, i) => i + 1)), after.map((s) => s.sort_order).join(","));
      check("sr(③) ★配列の順序どおり（先頭→1・末尾→N）", byId.get(ids[0])!.sort_order === 1 && byId.get(ids[N - 1])!.sort_order === N && ids.every((id, i) => byId.get(id)!.sort_order === i + 1),
        ids.map((id) => byId.get(id)!.sort_order).join(","));
      const changed = after.filter((s) => before.get(s.id)!.sort_order !== s.sort_order);
      check("sr(②) ★sort_order が変わった行は updated_at が呼び出し時刻以降に更新（epoch 秒・前値より大きい）", changed.length > 0 && changed.every((s) => s.updated_at >= tCall && s.updated_at > before.get(s.id)!.updated_at),
        JSON.stringify(changed.slice(0, 3).map((s) => [s.name, before.get(s.id)!.updated_at, s.updated_at])));
      const unchanged = after.filter((s) => before.get(s.id)!.sort_order === s.sort_order);
      console.log(`  参考: sort_order 不変の行 ${unchanged.length} 件も updated_at=now() が入る（契約＝cast_rank_reorder と同型）`);
      const y = after.find((s) => s.name === FX[1])!;
      check("sr(⑪) ★無効席（is_active=false）も再採番の対象（配列位置どおりの sort_order）", !y.is_active && y.sort_order === ids.indexOf(y.id) + 1, JSON.stringify({ active: y.is_active, so: y.sort_order, pos: ids.indexOf(y.id) + 1 }));
    }

    // ── ④〜⑧ 拒否系（前後でハッシュ一致＝⑬）──
    const rejected: Array<[string, () => Promise<{ error: { message: string } | null }>, string]> = [
      ["④-1 空配列", () => reorder(owner, storeA1, []) as never, "bad ids"],
      ["④-2 null", () => reorder(owner, storeA1, null) as never, "bad ids"],
      ["⑤ 重複 id", async () => { const ids = all0.map((s) => s.id); ids[1] = ids[0]; return reorder(owner, storeA1, ids) as never; }, "duplicate ids"],
      ["⑥ 部分配列（1 件欠け）", () => reorder(owner, storeA1, all0.map((s) => s.id).slice(1)) as never, "partial ids"],
      ["⑦ 他店（A2）の id を混ぜる", () => { const ids = all0.map((s) => s.id); ids[0] = a2seat; return reorder(owner, storeA1, ids) as never; }, "forbidden"],
      ["⑧ 他 org の store_id（B1）", () => reorder(owner, storeB1, all0.map((s) => s.id)) as never, "forbidden"],
      ["⑨-2 manager の他店（A2）", () => reorder(mgr, storeA2, [a2seat]) as never, "forbidden"],
      ["⑨-3 cast", () => reorder(cast, storeA1, all0.map((s) => s.id)) as never, "forbidden"],
    ];
    for (const [label, fn, msg] of rejected) {
      const h0 = await snap();
      const { error } = await fn();
      const h1 = await snap();
      check(`sr(${label}) → ${msg}`, has(error, msg), error?.message ?? "通ってしまった");
      check(`sr(⑬ ${label}) 拒否の前後で seats が 1 行も変わらない`, h0 === h1, `${h0} → ${h1}`);
    }

    // ── ⑨-1 manager 自店は可 ──
    {
      const cur = await seatsOf(storeA1);
      const ids = cur.map((s) => s.id).reverse();
      const { error } = await reorder(mgr, storeA1, ids);
      if (!error) okCalls++;
      const after = await seatsOf(storeA1);
      const byId = new Map(after.map((s) => [s.id, s]));
      check("sr(⑨-1) ★manager は自店の seat_reorder が通り配列順で 1..N", !error && ids.every((id, i) => byId.get(id)!.sort_order === i + 1), error?.message ?? after.map((s) => s.sort_order).join(","));
    }

    // ── ⑩ anon ──
    {
      const { error } = await reorder(anon, storeA1, all0.map((s) => s.id));
      check("sr(⑩) ★anon の seat_reorder は BLOCKED（permission denied for function）", has(error, "permission denied for function"), error?.message ?? "通ってしまった");
    }

    // ── ⑫ audit ──
    {
      const rows = await q<{ b: Array<{ id: string; sort_order: number }>; a: Array<{ id: string; sort_order: number }>; target: string; store_id: string }>(
        `select before_json as b, after_json as a, target, store_id from public.audit_logs where org_id = $1 and at >= $2 and action = 'seat_reorder' order by at`, [orgA, t0]);
      check(`sr(⑫-1) ★audit_logs の seat_reorder 行数 = 成功呼び出し数（${okCalls}）`, rows.length === okCalls, `got ${rows.length}`);
      const r = rows[rows.length - 1];
      const shape = (x: unknown) => Array.isArray(x) && x.length === N && x.every((e) => typeof e?.id === "string" && typeof e?.sort_order === "number");
      check("sr(⑫-2) ★before/after が (id, sort_order) の配列（N 件）・target は seats:store:<store>・store_id あり",
        !!r && shape(r.b) && shape(r.a) && r.target === `seats:store:${storeA1}` && r.store_id === storeA1, r ? JSON.stringify({ b: r.b?.length, a: r.a?.length, target: r.target }) : "行なし");
      const afterSorted = r ? [...r.a].sort((x, y) => x.sort_order - y.sort_order).map((x) => x.sort_order) : [];
      check("sr(⑫-3) after の sort_order は 1..N", JSON.stringify(afterSorted) === JSON.stringify(Array.from({ length: N }, (_, i) => i + 1)), afterSorted.join(","));
    }
  } finally {
    await teardown();
  }
  // ── ⑭ 後始末 ──
  {
    const now = await seatsOf(storeA1);
    const left = now.filter((s) => FX.includes(s.name)).length;
    check("sr(⑭-1) ★追加した 2 席が消えている", left === 0, `left ${left}`);
    check("sr(⑭-2) ★既存席の (id, sort_order) が実行前と一致（set_seat で復元）", JSON.stringify(now.map((s) => [s.id, s.sort_order])) === JSON.stringify(preOrder),
      JSON.stringify({ pre: preOrder.map((x) => x[1]), now: now.map((s) => s.sort_order) }));
    const au = await q<{ n: number }>(`select count(*)::int as n from public.audit_logs where org_id = $1 and at >= $2 and action = any($3)`, [orgA, t0, ["seat_reorder", "set_seat"]]);
    check("sr(⑭-3) audit_logs の本 suite 行は 0", au[0].n === 0, `left ${au[0].n}`);
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-seat-reorder ALL PASS (${pass} assertions)`);
  console.log("席の並べ替え(0145): owner 全件 1..N＋順序＋updated_at＋無効席 / bad ids・duplicate・partial・他店 id・他 org・manager 他店・cast の拒否と無変化 / manager 自店 OK / anon BLOCKED / audit before/after / 復元");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
