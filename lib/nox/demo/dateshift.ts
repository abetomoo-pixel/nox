// ★夜間便 N7-5（裁定276-1〜3・2026-09-18）: 録画 JSON の「営業日相対の日オフセット＋JST 時刻」⇄ 実時刻（純関数・DB を知らない）。
//   採取側（scripts/demo/poc-record.mjs の toRel）と対:
//     timestamptz 列 → { $rel: 営業日オフセット（bizDateOf(v, cutoff) − 採取時の営業日）, t: JST 時刻 'HH:MM:SS.mmm' }
//     date 列        → { $rel: 日オフセット }
//   再生側（本ファイル）: 営業日＝targetBiz + $rel。暦日は 30 時間制を考慮＝JST 時刻 t が cutoff より前（深夜）なら翌暦日
//   （営業日 D の範囲＝[D cutoff, D+1 cutoff)＝lib/nox/biz-date.ts と同じ規約）。★poc-record.mjs の fromRel はこの +1 日を持たない
//   （cutoff 前の深夜の伝票が前営業日に落ちる）＝採取側と対にするため本関数を正とする（夜間便ログに記録）。
import { addDays, bizDateOf } from "@/lib/nox/biz-date";

export type RelDate = { $rel: number };
export type RelTs = { $rel: number; t: string };
const DAY = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, "0");

export const isRel = (v: unknown): v is RelDate | RelTs =>
  !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as { $rel?: unknown }).$rel === "number";

/** 暦日の差（b − a・日） */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** date 列: 営業日 targetBiz + $rel */
export const relToDate = (v: RelDate, targetBiz: string): string => addDays(targetBiz, v.$rel);

/** timestamptz 列: 営業日 targetBiz + $rel の JST 時刻 t（cutoff 前の深夜は翌暦日）→ ISO（UTC） */
export function relToIso(v: RelTs, targetBiz: string, cutoffHm: string): string {
  const biz = addDays(targetBiz, v.$rel);
  const hm = v.t.slice(0, 5);
  const day = hm < cutoffHm ? addDays(biz, 1) : biz;
  return new Date(`${day}T${v.t}+09:00`).toISOString();
}

/** 採取側の鏡像: ISO → { $rel, t }（bizDateOf で営業日を求め、採取時の営業日 baseBiz からの差） */
export function isoToRel(iso: string, baseBiz: string, cutoffHm: string): RelTs {
  const bd = bizDateOf(iso, cutoffHm);
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const t = `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}.${String(jst.getUTCMilliseconds()).padStart(3, "0")}`;
  return { $rel: daysBetween(baseBiz, bd), t };
}
export const dateToRel = (ymd: string, baseBiz: string): RelDate => ({ $rel: daysBetween(baseBiz, ymd) });

/** 行の値のうち { $rel } 形だけを実値へ（他はそのまま） */
export function shiftRow(row: Record<string, unknown>, targetBiz: string, cutoffHm: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (isRel(v)) out[k] = "t" in v && typeof v.t === "string" ? relToIso(v as RelTs, targetBiz, cutoffHm) : relToDate(v, targetBiz);
    else out[k] = v;
  }
  return out;
}

/** payload（表→行[]）全体を targetBiz 基準へ */
export function shiftPayload(payload: Record<string, Record<string, unknown>[]>, targetBiz: string, cutoffHm: string): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [table, rows] of Object.entries(payload)) out[table] = rows.map((r) => shiftRow(r, targetBiz, cutoffHm));
  return out;
}
