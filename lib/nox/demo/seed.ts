// ★夜間便 N7-4（裁定276・277・2026-09-18）→ ★裁定328（便 D1・2026-10-02）: デモ org の種＝payload JSON（docs/demo/payload/<店コード>.json）を
//   営業日 bizDate 基準に直し、service role で demo_org_reset(p_org_id, p_payload, p_mode) を呼ぶ（サーバ専用・route と cron が共用）。
//   payload JSON の形（生成器 scripts/demo/gen-demo.mjs と対・旧「録画」と同形）:
//     { meta: { cutoff: '06:00', store: 'muse', users: { owner: '<payload 内の users.id>', manager: …, staff: …, cast: …, kiosk: '<auth user id の仮>' },
//              ids: { '<source_id>': '<uuid>' } }, tables: { <表名>: [<行 … 日付は {$rel} か {$m, d}>] } }
//   ★店は 6（MUSE／LUNA／NOIR／ACE／LILY／NEST＝org 名 NOX-DEMO-<CODE>）・役割は 4（owner／manager／staff／cast）＋kiosk（端末ユーザー）。
//   ★id の付け替え: payload の uuid は org ごとに決定的に写像（sha1 v5 風）＝ID 固定（毎回同じ）・他 org と衝突しない。
//     payload の users.id（meta.users）は demo org の実ユーザー（役割で対応）へ写す＝users は demo_org_reset が残す 3 表の 1 つ。
//   ★payload が 1 MB（裁定277-4）を超えるときは wipe → load を日付群ごとに分けて順に呼ぶ（器＝RPC は不変・D1-2）。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shiftPayload } from "./dateshift";
import { parseDemoUsers } from "./session";
import { CAST_PHOTO_BUCKET } from "../cast-photo";

export const DEMO_STORES = ["muse", "luna", "noir", "ace", "lily", "nest"] as const;
export type DemoStore = (typeof DEMO_STORES)[number];
/** 互換名（旧 route／suite が業態キーで参照していた定数＝店コード 6 に置換） */
export const DEMO_BIZ_TYPES = DEMO_STORES;
export type DemoBiz = DemoStore;
export const DEMO_STORE_LABEL: Record<DemoStore, { name: string; biz: string; desc: string }> = {
  muse: { name: "SNACK MUSE", biz: "スナック", desc: "セット・ボトルキープ・つまみ" },
  luna: { name: "CLUB LUNA", biz: "キャバクラ・標準", desc: "指名・同伴・セット・延長" },
  noir: { name: "CLUB NOIR", biz: "キャバクラ・VIP 専用料金", desc: "VIP 席の料金表・ランク別指名料・売掛" },
  ace: { name: "CLUB ACE", biz: "キャバクラ・売上スライド", desc: "VIP 加算・売上スライド時給・売掛" },
  lily: { name: "Girls Bar LILY", biz: "ガールズバー", desc: "カウンター・チャージ・キャストショット" },
  nest: { name: "BAR NEST", biz: "バー", desc: "テーブルチャージ・商品会計・スタッフバック" },
};
export const DEMO_ROLES = ["owner", "manager", "staff", "cast"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
export const DEMO_ROLE_LABEL: Record<DemoRole, { label: string; desc: string; dest: string }> = {
  owner: { label: "オーナー", desc: "すべての画面・設定・給与", dest: "/dashboard" },
  manager: { label: "店長", desc: "レジ・シフト・日報・キャスト", dest: "/dashboard" },
  staff: { label: "スタッフ", desc: "レジ・打刻の代行・日報", dest: "/register" },
  cast: { label: "キャスト", desc: "マイページ・希望シフト・ランキング", dest: "/mine" },
};
/** 端末（kiosk）＝役割ではなく店ごとの固定端末ユーザー（328 追補1 ⑤・kiosk_devices と結線） */
export const DEMO_KIOSK_KEY = "kiosk";
export const DEMO_ORG_PREFIX = "NOX-DEMO-";
export const RESET_INTERVAL_MIN = 10;
export const RESET_TIMEOUT_MS = 8_000;
export const PAYLOAD_MAX_BYTES = 1_000_000; // 裁定277-4: 1 org＝payload 1 MB 以下（超えたら分割して load）
export const DEMO_RESET_TIME_JA = "毎日 06:05"; // ★328 追補1 ①: 営業日切替（cutoff 06:00）の後

export const demoOrgName = (store: DemoStore): string => `${DEMO_ORG_PREFIX}${store.toUpperCase()}`;
/** 'NOX-DEMO-MUSE' → 'muse'（対応表に無ければ null） */
export function storeOfOrgName(name: string | null | undefined): DemoStore | null {
  if (!name || !name.startsWith(DEMO_ORG_PREFIX)) return null;
  const k = name.slice(DEMO_ORG_PREFIX.length).toLowerCase();
  return (DEMO_STORES as readonly string[]).includes(k) ? (k as DemoStore) : null;
}
/** 互換名 */
export const bizOfOrgName = storeOfOrgName;
export const isDemoRole = (v: string): v is DemoRole => (DEMO_ROLES as readonly string[]).includes(v);
export const isDemoStore = (v: string): v is DemoStore => (DEMO_STORES as readonly string[]).includes(v);
/** 入場後の初期画面（328 追補1 ③: staff はレジ） */
export const demoDestOf = (role: DemoRole | typeof DEMO_KIOSK_KEY): string => (role === DEMO_KIOSK_KEY ? "/kiosk" : DEMO_ROLE_LABEL[role].dest);

export const payloadPath = (store: DemoStore): string => path.join(process.cwd(), "docs", "demo", "payload", `${store}.json`);
/** 互換名 */
export const recordingPath = payloadPath;

export type Recording = { meta?: { cutoff?: string; store?: string; users?: Record<string, string>; ids?: Record<string, string> }; tables?: Record<string, Record<string, unknown>[]> } & Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** payload の uuid → org ごとに決定的な uuid（v5 風・sha1）。同じ payload を複数 org に載せても PK が衝突しない・毎回同じ（ID 固定） */
export function remapUuid(orgId: string, id: string): string {
  const h = createHash("sha1").update(`nox-demo:${orgId}:${id.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export type BuildOk = { ok: true; biz: DemoStore; payload: Record<string, Record<string, unknown>[]>; tables: number; rows: number };
export type BuildErr = { ok: false; status: 403 | 503; error: string };

/**
 * payload JSON → demo_org_reset の p_payload。
 *   userIdByRole: demo org の users.id（役割→id）。payload の meta.users の id をこれへ写す（無ければその値は写像せず＝load で 'org mismatch'／FK に落ちる）。
 *   ★kiosk_devices.auth_user_id は users ではなく auth ユーザー id＝meta.users.kiosk と userIdByRole.kiosk（auth user id）で写す。
 */
export function buildPayloadFromRecording(orgId: string, bizDate: string, rec: Recording, userIdByRole: Record<string, string> = {}): BuildOk | BuildErr {
  const tables = (rec.tables ?? Object.fromEntries(Object.entries(rec).filter(([k, v]) => k !== "meta" && Array.isArray(v)))) as Record<string, Record<string, unknown>[]>;
  if (!tables || Object.keys(tables).length === 0) return { ok: false, status: 503, error: "録画なし" };
  const cutoff = rec.meta?.cutoff && /^\d{2}:\d{2}$/.test(rec.meta.cutoff) ? rec.meta.cutoff : "06:00";
  const userMap = new Map<string, string>();
  for (const [role, recId] of Object.entries(rec.meta?.users ?? {})) if (userIdByRole[role] && UUID_RE.test(recId)) userMap.set(recId.toLowerCase(), userIdByRole[role]);
  const mapId = (v: string): string => userMap.get(v.toLowerCase()) ?? remapUuid(orgId, v);
  const shifted = shiftPayload(tables, bizDate, cutoff);
  const out: Record<string, Record<string, unknown>[]> = {};
  let rows = 0;
  for (const [table, list] of Object.entries(shifted)) {
    out[table] = list.map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "org_id") o[k] = orgId;
        else if (typeof v === "string" && UUID_RE.test(v)) o[k] = mapId(v);
        else o[k] = v;
      }
      return o;
    });
    rows += list.length;
  }
  const store = (rec.meta?.store && isDemoStore(rec.meta.store) ? rec.meta.store : "luna") as DemoStore;
  return { ok: true, biz: store, payload: out, tables: Object.keys(out).length, rows };
}

/** org を admin で引き、店の payload JSON を読んで payload を組む。無ければ 503「録画なし」・demo でなければ 403 */
export async function buildPayload(admin: SupabaseClient, orgId: string, bizDate: string): Promise<BuildOk | BuildErr> {
  const { data: org } = await admin.from("orgs").select("id, name, is_demo").eq("id", orgId).maybeSingle();
  if (!org || org.is_demo !== true) return { ok: false, status: 403, error: "デモ環境のみ実行できます" };
  const store = storeOfOrgName(org.name as string);
  if (!store) return { ok: false, status: 503, error: "録画なし（店を判定できません）" };
  const p = payloadPath(store);
  if (!fs.existsSync(p)) return { ok: false, status: 503, error: "録画なし" };
  let rec: Recording;
  try { rec = JSON.parse(fs.readFileSync(p, "utf8")) as Recording; } catch { return { ok: false, status: 503, error: "録画なし（JSON を読めません）" }; }
  // demo org の users（役割→users.id）＝payload の meta.users と役割で対応させる。役割は env DEMO_USERS（店:役割→auth user id）から引く
  const userIdByRole: Record<string, string> = {};
  const envMap = parseDemoUsers(process.env.DEMO_USERS);
  if (envMap) {
    const { data: users } = await admin.from("users").select("id, auth_user_id").eq("org_id", orgId);
    for (const role of DEMO_ROLES) {
      const auid = envMap[`${store}:${role}`];
      const u = auid ? (users ?? []).find((x) => x.auth_user_id === auid) : null;
      if (u) userIdByRole[role] = u.id as string;
    }
    const kioskAuth = envMap[`${store}:${DEMO_KIOSK_KEY}`];
    if (kioskAuth) userIdByRole[DEMO_KIOSK_KEY] = kioskAuth; // kiosk_devices.auth_user_id（auth user id そのもの）
  }
  const built = buildPayloadFromRecording(orgId, bizDate, rec, userIdByRole);
  return built.ok ? { ...built, biz: store } : built;
}

/** env DEMO_USERS の解釈＝session.ts（Edge の middleware と共用・★D2-b で移動・互換のため再 export） */
export { parseDemoUsers } from "./session";

// ── ★D1-2: payload の分割（1 MB 超は日付群ごとに load を分ける・器＝RPC は不変）──
/** 伝票・日次系（日付で切れる表）。それ以外（マスタ・当日のライブ状態を含む全表）は先頭の chunk にまとめる */
export const DATED_TABLES: readonly string[] = ["checks", "check_lines", "check_nominations", "check_cast_backs", "check_seats", "payments", "receivables", "ar_collections", "punches", "shifts", "attendance", "daily_reports", "stock_logs"];
export const payloadBytes = (p: Record<string, unknown[]>): number => Buffer.byteLength(JSON.stringify(p));
/**
 * 行の「日付群キー」＝checks は id・明細系は check_id で親の日に付ける・日次系は自分の日付列。
 * 日付は shift 後（実値）でも前（{$rel}／{$m,d}）でも文字列化して比較するだけ（同じ日なら同じキー）。
 */
function dayKeyOf(table: string, row: Record<string, unknown>, checkDay: Map<string, string>): string {
  const d = (v: unknown): string => (v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "")).slice(0, 32);
  if (table === "checks") return d(row.started_at);
  if (["check_lines", "check_nominations", "check_cast_backs", "check_seats", "payments"].includes(table)) return checkDay.get(String(row.check_id)) ?? "";
  if (table === "receivables") return row.check_id ? (checkDay.get(String(row.check_id)) ?? d(row.created_at)) : d(row.created_at);
  if (table === "ar_collections") return d(row.biz_date);
  if (table === "punches") return d(row.punched_at);
  if (table === "shifts" || table === "attendance") return d(row.date);
  if (table === "daily_reports") return d(row.biz_date);
  if (table === "stock_logs") return d(row.at);
  return "";
}
/** payload → [先頭 chunk（マスタ＋日付なし行）, 日付群 chunk…]。各 chunk ≤ maxBytes を目標（1 日分が超えるときはその日だけで 1 chunk） */
export function splitPayload(payload: Record<string, Record<string, unknown>[]>, maxBytes = PAYLOAD_MAX_BYTES): Record<string, Record<string, unknown>[]>[] {
  if (payloadBytes(payload) <= maxBytes) return [payload];
  const head: Record<string, Record<string, unknown>[]> = {};
  const byDay = new Map<string, Record<string, Record<string, unknown>[]>>();
  const checkDay = new Map<string, string>();
  for (const r of payload.checks ?? []) checkDay.set(String(r.id), dayKeyOf("checks", r, checkDay));
  for (const [t, rows] of Object.entries(payload)) {
    if (!DATED_TABLES.includes(t)) { head[t] = rows; continue; }
    for (const r of rows) {
      const k = dayKeyOf(t, r, checkDay);
      if (!k) { (head[t] ??= []).push(r); continue; }
      const g = byDay.get(k) ?? {}; (g[t] ??= []).push(r); byDay.set(k, g);
    }
  }
  const chunks: Record<string, Record<string, unknown>[]>[] = [head];
  let cur: Record<string, Record<string, unknown>[]> = {}; let curBytes = 2;
  const flush = () => { if (Object.keys(cur).length) chunks.push(cur); cur = {}; curBytes = 2; };
  for (const k of [...byDay.keys()].sort()) {
    const g = byDay.get(k)!; const b = payloadBytes(g);
    if (curBytes + b > maxBytes && curBytes > 2) flush();
    for (const [t, rows] of Object.entries(g)) (cur[t] ??= []).push(...rows);
    curBytes += b;
  }
  flush();
  return chunks;
}

export type ResetResult = { ok: true; mode: "all" | "wipe+load"; chunks: number; result: unknown } | { ok: false; error: string };

/** demo_org_reset: payload が 1 MB 以下なら 'all' 1 回（RESET_TIMEOUT_MS 超は 'wipe'→'load'）。超えるなら 'wipe' → 分割した 'load' を順に */
export async function runDemoReset(admin: SupabaseClient, orgId: string, payload: Record<string, Record<string, unknown>[]>): Promise<ResetResult> {
  const call = (mode: "all" | "wipe" | "load", p: Record<string, unknown[]> | null) => admin.rpc("demo_org_reset", { p_org_id: orgId, p_payload: p, p_mode: mode });
  const chunks = splitPayload(payload);
  if (chunks.length === 1) {
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), RESET_TIMEOUT_MS));
    const first = await Promise.race([call("all", payload), timeout]);
    if (first !== "timeout") {
      if (first.error) return { ok: false, error: first.error.message };
      return { ok: true, mode: "all", chunks: 1, result: first.data };
    }
  }
  const w = await call("wipe", null);
  if (w.error) return { ok: false, error: `wipe: ${w.error.message}` };
  const results: unknown[] = [w.data];
  for (let i = 0; i < chunks.length; i++) {
    const l = await call("load", chunks[i]);
    if (l.error) return { ok: false, error: `load ${i + 1}/${chunks.length}: ${l.error.message}` };
    results.push(l.data);
  }
  return { ok: true, mode: "wipe+load", chunks: chunks.length, result: results };
}

export type AfterResetResult = { photos: { casts: number; users: number }; payroll: "D2-c" };

/**
 * 再生後の後処理（裁定276-4）:
 *   ★D2-b（328 追補4・2026-10-08）写真の再打刻＝payload の casts.photo_updated_at は null（写真の有無は DB 列＝null で「写真なし」）なので、
 *     reset のたびに Storage（cast-photos/{org_id}/）に実体がある cast／user の photo_updated_at を now() に戻す（実体は wipe で消えない・users は残る 3 表だが同じ式で揃える）。
 *     admin（service）で casts／users を直接 update＝RPC set_*_photo_updated_at は本人／自店の authz（デモの cron にはセッションが無い）。
 *   給与の正規経路（payroll_run_create→payroll_finalize）＝D2-c（報酬参考 13,648,300 の突合）。
 */
export async function afterResetHooks(admin: SupabaseClient, orgId: string, _bizDate: string): Promise<AfterResetResult> {
  const out: AfterResetResult = { photos: { casts: 0, users: 0 }, payroll: "D2-c" };
  try {
    const { data: objs, error } = await admin.storage.from(CAST_PHOTO_BUCKET).list(orgId, { limit: 1000 });
    if (error || !objs) return out;
    const castIds: string[] = [], userIds: string[] = [];
    for (const o of objs) {
      const m = /^(u_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/i.exec(o.name);
      if (!m) continue;
      (m[1] ? userIds : castIds).push(m[2]);
    }
    const now = new Date().toISOString();
    if (castIds.length) {
      const { data } = await admin.from("casts").update({ photo_updated_at: now }).eq("org_id", orgId).in("id", castIds).select("id");
      out.photos.casts = data?.length ?? 0;
    }
    if (userIds.length) {
      const { data } = await admin.from("users").update({ photo_updated_at: now }).eq("org_id", orgId).in("id", userIds).select("id");
      out.photos.users = data?.length ?? 0;
    }
  } catch (e) { console.error(`afterResetHooks: ${e instanceof Error ? e.message : String(e)}`); }
  return out;
}
