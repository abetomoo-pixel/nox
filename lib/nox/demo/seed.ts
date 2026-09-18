// ★夜間便 N7-4（裁定276・277・2026-09-18）: デモ org の種＝録画 JSON（lib/nox/demo/recordings/<業態>.json）を営業日 bizDate 基準に直し、
//   service role で demo_org_reset(p_org_id, p_payload, p_mode) を呼ぶ（サーバ専用・route と cron が共用）。
//   録画 JSON の形（採取側 poc-record.mjs と対）:
//     { meta: { cutoff: '06:00', users: { owner: '<録画時の users.id>', manager: ..., cast: ... } }, tables: { <表名>: [<行 … 日付は {$rel}>] } }
//   ★録画は本便時点で存在しない（裁定276-1 の PoC のみ）＝無ければ「録画なし」で 503。
//   ★id の付け替え: 同じ録画を 4 org に載せると PK が衝突するため、録画中の uuid は org ごとに決定的に写像する（sha1 で v5 風）。
//     ただし録画時の users.id（meta.users）は demo org の実ユーザー（役割で対応）へ写す＝users は demo_org_reset が残す 3 表の 1 つ。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shiftPayload } from "./dateshift";

export const DEMO_BIZ_TYPES = ["cabaret", "girlsbar", "snack", "lounge"] as const;
export type DemoBiz = (typeof DEMO_BIZ_TYPES)[number];
export const DEMO_ORG_PREFIX = "NOX-DEMO-";
export const RESET_INTERVAL_MIN = 10;
export const RESET_TIMEOUT_MS = 8_000;

/** 'NOX-DEMO-CABARET' → 'cabaret'（対応表に無ければ null） */
export function bizOfOrgName(name: string | null | undefined): DemoBiz | null {
  if (!name || !name.startsWith(DEMO_ORG_PREFIX)) return null;
  const k = name.slice(DEMO_ORG_PREFIX.length).toLowerCase();
  return (DEMO_BIZ_TYPES as readonly string[]).includes(k) ? (k as DemoBiz) : null;
}

export const recordingPath = (biz: DemoBiz): string => path.join(process.cwd(), "lib", "nox", "demo", "recordings", `${biz}.json`);

type Recording = { meta?: { cutoff?: string; users?: Record<string, string> }; tables?: Record<string, Record<string, unknown>[]> } & Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 録画中の uuid → org ごとに決定的な uuid（v5 風・sha1）。同じ録画を複数 org に載せても PK が衝突しない */
export function remapUuid(orgId: string, id: string): string {
  const h = createHash("sha1").update(`nox-demo:${orgId}:${id.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export type BuildOk = { ok: true; biz: DemoBiz; payload: Record<string, Record<string, unknown>[]>; tables: number; rows: number };
export type BuildErr = { ok: false; status: 403 | 503; error: string };

/**
 * 録画 JSON → demo_org_reset の p_payload。
 *   userIdByRole: demo org の users.id（役割→id）。録画の meta.users の id をこれへ写す（無ければその値は写像せず＝load で 'org mismatch'／FK に落ちる）。
 */
export function buildPayloadFromRecording(orgId: string, bizDate: string, rec: Recording, userIdByRole: Record<string, string> = {}): BuildOk | BuildErr {
  const tables = (rec.tables ?? Object.fromEntries(Object.entries(rec).filter(([k, v]) => k !== "meta" && Array.isArray(v)))) as Record<string, Record<string, unknown>[]>;
  if (!tables || Object.keys(tables).length === 0) return { ok: false, status: 503, error: "録画なし" };
  const cutoff = rec.meta?.cutoff && /^\d{2}:\d{2}$/.test(rec.meta.cutoff) ? rec.meta.cutoff : "06:00";
  const userMap = new Map<string, string>();
  for (const [role, recId] of Object.entries(rec.meta?.users ?? {})) if (userIdByRole[role]) userMap.set(recId.toLowerCase(), userIdByRole[role]);
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
  return { ok: true, biz: (rec.meta as { biz?: DemoBiz } | undefined)?.biz ?? "cabaret", payload: out, tables: Object.keys(out).length, rows };
}

/** org を admin で引き、業態の録画 JSON を読んで payload を組む。録画が無ければ 503「録画なし」・demo でなければ 403 */
export async function buildPayload(admin: SupabaseClient, orgId: string, bizDate: string): Promise<BuildOk | BuildErr> {
  const { data: org } = await admin.from("orgs").select("id, name, is_demo").eq("id", orgId).maybeSingle();
  if (!org || org.is_demo !== true) return { ok: false, status: 403, error: "デモ環境のみ実行できます" };
  const biz = bizOfOrgName(org.name as string);
  if (!biz) return { ok: false, status: 503, error: "録画なし（業態を判定できません）" };
  const p = recordingPath(biz);
  if (!fs.existsSync(p)) return { ok: false, status: 503, error: "録画なし" };
  let rec: Recording;
  try { rec = JSON.parse(fs.readFileSync(p, "utf8")) as Recording; } catch { return { ok: false, status: 503, error: "録画なし（JSON を読めません）" }; }
  // demo org の users（役割→users.id）＝録画の meta.users と役割で対応させる。役割は env DEMO_USERS（業態:役割→auth user id）から引く
  const userIdByRole: Record<string, string> = {};
  const envMap = parseDemoUsers(process.env.DEMO_USERS);
  if (envMap) {
    const { data: users } = await admin.from("users").select("id, auth_user_id").eq("org_id", orgId);
    for (const role of ["owner", "manager", "cast"]) {
      const auid = envMap[`${biz}:${role}`];
      const u = auid ? (users ?? []).find((x) => x.auth_user_id === auid) : null;
      if (u) userIdByRole[role] = u.id as string;
    }
  }
  const built = buildPayloadFromRecording(orgId, bizDate, rec, userIdByRole);
  return built.ok ? { ...built, biz } : built;
}

/** env DEMO_USERS（JSON: {"cabaret:owner":"<auth user id>", …}）。無い・壊れている＝null */
export function parseDemoUsers(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === "string" && UUID_RE.test(v)) out[k] = v;
    return out;
  } catch { return null; }
}

export type ResetResult = { ok: true; mode: "all" | "wipe+load"; result: unknown } | { ok: false; error: string };

/** demo_org_reset を 'all' で 1 回。RESET_TIMEOUT_MS を超えて応答が無ければ 'wipe'→'load' の 2 回呼びへ切り替える */
export async function runDemoReset(admin: SupabaseClient, orgId: string, payload: Record<string, unknown[]>): Promise<ResetResult> {
  const call = (mode: "all" | "wipe" | "load") => admin.rpc("demo_org_reset", { p_org_id: orgId, p_payload: mode === "wipe" ? null : payload, p_mode: mode });
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), RESET_TIMEOUT_MS));
  const first = await Promise.race([call("all"), timeout]);
  if (first !== "timeout") {
    if (first.error) return { ok: false, error: first.error.message };
    return { ok: true, mode: "all", result: first.data };
  }
  const w = await call("wipe");
  if (w.error) return { ok: false, error: `wipe: ${w.error.message}` };
  const l = await call("load");
  if (l.error) return { ok: false, error: `load: ${l.error.message}` };
  return { ok: true, mode: "wipe+load", result: { wipe: w.data, load: l.data } };
}

/**
 * 再生後の後処理（裁定276-4）: 過去営業日の daily_report_close と給与の正規経路を呼ぶ。
 *   ★TODO（本便では形だけ）: 録画データが無く、締め対象の営業日と給与期間を決められないため中身は未実装＝呼んでも何もしない。
 *   実装時は (1) 録画の meta に「締め済み営業日の $rel 一覧」を持たせ bizDate 基準に直して daily_report_close を順に呼ぶ、
 *   (2) 給与は payroll の正規 route（/api/payroll/finalize）と同じサーバ再計算経路を service で呼ぶ（凍結値の直書きはしない）。
 */
export async function afterResetHooks(_admin: SupabaseClient, _orgId: string, _bizDate: string): Promise<{ skipped: true; todo: string }> {
  return { skipped: true, todo: "daily_report_close（過去営業日）と給与の正規経路＝録画データ整備後に実装" };
}
