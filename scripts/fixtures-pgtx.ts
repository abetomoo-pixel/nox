// ★0154 suite 追従（2026-09-24）: pg 直結の 1 トランザクション内で JWT を emulate して RPC を叩く共通ヘルパー（cast-guarantee (9)／AG 突合の型）。
//   BEGIN … ROLLBACK＝残留 0。savepoint で raise を拾う。接続の close は呼び出し側の finally（教訓88）。
import type { Client } from "pg";
import { FIXTURE_USERS, STORE_A1 } from "./fixtures-f0";

export type CallResult = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
export type Who = { auth_user_id: string } | "anon";

export function pgTx(db: Client) {
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
  const call = async (sql: string, params: unknown[] = []): Promise<CallResult> => {
    await db.query("savepoint sp");
    try { const rows = (await db.query(sql, params)).rows as Record<string, unknown>[]; await db.query("release savepoint sp"); return { ok: true, rows }; }
    catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: (e as Error).message }; }
  };
  const errOf = (r: CallResult) => (r.ok ? "(no error)" : r.err);
  const asUid = async (uid: string) => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await db.query(`set local role authenticated`);
  };
  const asAnon = async () => { await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await db.query(`set local role anon`); };
  const asPg = async () => { await db.query("reset role"); };
  /** 役割を切り替えて 1 回呼び、postgres へ戻す */
  const as = async (who: Who, sql: string, params: unknown[] = []): Promise<CallResult> => {
    await asPg();
    if (who === "anon") await asAnon(); else await asUid(who.auth_user_id);
    const r = await call(sql, params);
    await asPg();
    return r;
  };
  const uidOf = async (key: keyof typeof FIXTURE_USERS) => one<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]);
  const storeA1 = async () => one<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]);
  const castOf = async (storeId: string, userId: string) => (await one<{ id: string }>(`select c.id from public.casts c where c.store_id = $1 and c.user_id = $2`, [storeId, userId]))?.id;
  return { q, one, call, errOf, asUid, asAnon, asPg, as, uidOf, storeA1, castOf };
}

/** 'YYYY-MM-DD' ± n 日（UTC 演算・表示用） */
export function ymdAdd(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
