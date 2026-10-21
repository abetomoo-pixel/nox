// ★夜間便 N7-5（裁定276-1〜3・2026-09-18）: 録画 JSON の「営業日相対の日オフセット＋JST 時刻」⇄ 実時刻（純関数・DB を知らない）。
//   採取側（scripts/demo/poc-record.mjs の toRel）と対:
//     timestamptz 列 → { $rel: 営業日オフセット（bizDateOf(v, cutoff) − 採取時の営業日）, t: JST 時刻 'HH:MM:SS.mmm' }
//     date 列        → { $rel: 日オフセット }
//   再生側（本ファイル）: 営業日＝targetBiz + $rel。暦日は 30 時間制を考慮＝JST 時刻 t が cutoff より前（深夜）なら翌暦日
//   （営業日 D の範囲＝[D cutoff, D+1 cutoff)＝lib/nox/biz-date.ts と同じ規約）。★poc-record.mjs の fromRel はこの +1 日を持たない
//   （cutoff 前の深夜の伝票が前営業日に落ちる）＝採取側と対にするため本関数を正とする（夜間便ログに記録）。
//   ★裁定328（便 D1・2026-10-02）: 月相対 { $m: 月オフセット, d: 日 }（＋ t）を追加＝「先月＝R の前月の同じ日」（固定日付を持たない・gen_plan §2）。
//     d が写像先の月に無い（2 月の 29／30／31）ときは末日に畳む（仮決め）。
import { addDays, bizDateOf } from "@/lib/nox/biz-date";
import { daysInMonthOf } from "../month"; // ★便 X13-H H-9: 暦月の日付は 1 か所で

export type RelDate = { $rel: number };
export type RelTs = { $rel: number; t: string };
export type RelMonth = { $m: number; d: number; t?: string; fmt?: "ym" }; // fmt "ym"＝'YYYY-MM'（period 列・text）
const DAY = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, "0");

export const isRel = (v: unknown): v is RelDate | RelTs | RelMonth =>
  !!v && typeof v === "object" && !Array.isArray(v) && (typeof (v as { $rel?: unknown }).$rel === "number" || (typeof (v as { $m?: unknown }).$m === "number" && typeof (v as { d?: unknown }).d === "number"));
export const isRelMonth = (v: unknown): v is RelMonth => !!v && typeof v === "object" && typeof (v as { $m?: unknown }).$m === "number" && typeof (v as { d?: unknown }).d === "number";

/** 暦日の差（b − a・日） */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** date 列: 営業日 targetBiz + $rel */
export const relToDate = (v: RelDate, targetBiz: string): string => addDays(targetBiz, v.$rel);

/** 月相対: targetBiz の月 + $m の d 日（無い日は末日） */
export function relMonthToDate(v: RelMonth, targetBiz: string): string {
  const [y, m] = targetBiz.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + v.$m, 1));
  const dim = daysInMonthOf(`${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}`);
  const d = Math.min(Math.max(1, Math.round(v.d)), dim);
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(d)}`;
}

/** 営業日 biz の JST 時刻 t（cutoff 前の深夜は翌暦日）→ ISO（UTC） */
function bizTimeToIso(biz: string, t: string, cutoffHm: string): string {
  const hm = t.slice(0, 5);
  const day = hm < cutoffHm ? addDays(biz, 1) : biz;
  const tt = /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
  return new Date(`${day}T${tt}+09:00`).toISOString();
}

/** timestamptz 列: 営業日 targetBiz + $rel の JST 時刻 t（cutoff 前の深夜は翌暦日）→ ISO（UTC） */
export function relToIso(v: RelTs, targetBiz: string, cutoffHm: string): string {
  return bizTimeToIso(addDays(targetBiz, v.$rel), v.t, cutoffHm);
}

/** 採取側の鏡像: ISO → { $rel, t }（bizDateOf で営業日を求め、採取時の営業日 baseBiz からの差） */
export function isoToRel(iso: string, baseBiz: string, cutoffHm: string): RelTs {
  const bd = bizDateOf(iso, cutoffHm);
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const t = `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}.${String(jst.getUTCMilliseconds()).padStart(3, "0")}`;
  return { $rel: daysBetween(baseBiz, bd), t };
}
export const dateToRel = (ymd: string, baseBiz: string): RelDate => ({ $rel: daysBetween(baseBiz, ymd) });

/** 行の値のうち { $rel }／{ $m, d } 形だけを実値へ（他はそのまま） */
export function shiftRow(row: Record<string, unknown>, targetBiz: string, cutoffHm: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (isRelMonth(v)) {
      const biz = relMonthToDate(v, targetBiz);
      out[k] = v.fmt === "ym" ? biz.slice(0, 7) : typeof v.t === "string" ? bizTimeToIso(biz, v.t, cutoffHm) : biz;
    } else if (isRel(v)) out[k] = "t" in v && typeof v.t === "string" ? relToIso(v as RelTs, targetBiz, cutoffHm) : relToDate(v as RelDate, targetBiz);
    else out[k] = v;
  }
  return out;
}

/** ★便 X13-G W-18 ③: 今月の写し（gen-demo）の行＝$onlyBefore（日付の列名）・$dedupe（重なりを見る列）。 */
const dayOfVal = (v: unknown, cutoffHm: string): string | null => (typeof v === "string" ? (v.length > 10 ? bizDateOf(v, cutoffHm) : v.slice(0, 10)) : null);
function mirrorKeep(raw: Record<string, unknown>, shifted: Record<string, unknown>, targetBiz: string, cutoffHm: string): boolean {
  const f = raw.$onlyBefore;
  if (typeof f !== "string") return true;
  const v = raw[f];
  if (isRelMonth(v)) { // 月の末日に畳んだ行（その月に無い日）は落とす
    const [y, m] = relMonthToDate({ ...v, d: 1 }, targetBiz).split("-").map(Number);
    const dim = daysInMonthOf(`${y}-${pad(m)}`);
    if (v.d > dim) return false;
  }
  const day = dayOfVal(shifted[f], cutoffHm);
  return day !== null && day < targetBiz;
}
const dedupeKeyOf = (row: Record<string, unknown>, cols: readonly string[], cutoffHm: string): string =>
  cols.map((c) => (c.endsWith(":day") ? dayOfVal(row[c.slice(0, -4)], cutoffHm) : String(row[c] ?? ""))).join("|");

/** payload（表→行[]）全体を targetBiz 基準へ（★W-18: 今月の写しは reset 日より前だけ・写しでない行と重なる日は写しを落とす・子の行は親が落ちたら落とす） */
export function shiftPayload(payload: Record<string, Record<string, unknown>[]>, targetBiz: string, cutoffHm: string): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  const droppedChecks = new Set<string>();
  const strip = (r: Record<string, unknown>) => { const o = { ...r }; delete o.$onlyBefore; delete o.$dedupe; return o; };
  const order = Object.keys(payload).sort((a, b) => Number(b === "checks") - Number(a === "checks")); // 伝票を先に（子の判定に使う）
  for (const table of order) {
    const rows = payload[table];
    const kept: Record<string, unknown>[] = [];
    const mirrors: { raw: Record<string, unknown>; sh: Record<string, unknown> }[] = [];
    for (const r of rows) {
      const sh = shiftRow(r, targetBiz, cutoffHm);
      if (typeof r.$onlyBefore !== "string") { kept.push(sh); continue; }
      const parent = typeof r.check_id === "string" ? r.check_id : null;
      if (!mirrorKeep(r, sh, targetBiz, cutoffHm) || (parent && droppedChecks.has(parent))) { if (table === "checks" && typeof r.id === "string") droppedChecks.add(r.id); continue; }
      mirrors.push({ raw: r, sh });
    }
    const cols = (rows.find((r) => Array.isArray(r.$dedupe))?.$dedupe ?? null) as string[] | null;
    const base = cols ? new Set(kept.map((r) => dedupeKeyOf(r, cols, cutoffHm))) : null;
    for (const m of mirrors) {
      if (base && cols && base.has(dedupeKeyOf(m.sh, cols, cutoffHm))) { if (table === "checks" && typeof m.raw.id === "string") droppedChecks.add(m.raw.id); continue; }
      kept.push(strip(m.sh));
    }
    out[table] = kept;
  }
  return Object.fromEntries(Object.keys(payload).map((t) => [t, out[t]]));
}
