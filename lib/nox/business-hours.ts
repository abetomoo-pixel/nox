/* 営業時間（store_business_hours・mig0032）の UI 側判定の単一ソース（B-5 スライスA）。
 *
 * DB helper reservation_is_closed_day と同じ営業日解決を TS で再現する:
 *  - reserved_at（実時刻）→ JST → cutoff（biz_cutoff_hm・既定 06:00）を引いた日付＝営業日 → その曜日(dow)。
 *  - 深夜帯（cutoff 前）は前営業日に属する（例: 月曜 03:00 は日曜営業日・dow=0）。
 *  - dow は JS getDay = pg extract(dow)（0=日..6=土・段25-8 で DB 側と一致を実測済み）。
 * 時間内判定は shift-time.ts の 24h超表記の意味論に合わせる:
 *  - open_hm は 00:00-23:59・close_hm は 00:00-47:59（30:00 = 翌06:00）。
 *  - 営業日 0:00 起点の分に正規化（深夜帯は +1440）して open <= t < close で判定。
 * 判定の使い分け（RPC との非対称・段25 実測）:
 *  - closed（定休日）= UI 一次ブロック（RPC も 'closed day' で拒否＝二層）。
 *  - outside（時間外）= UI 警告のみ（RPC は通す）。
 *  - unset（行なし）= 判定なし（後方互換・警告もブロックもしない）。 */
import { hm2min, min2hm } from "@/lib/nox/shift-time";

export type BusinessHourRow = {
  dow: number; is_closed: boolean; open_hm: string | null; close_hm: string | null;
};
export type HoursStatus = "closed" | "outside" | "inside" | "unset";

export const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

// reserved_at → 営業日の dow と「営業日 0:00 起点の分」（深夜帯は +1440＝24h超表記と同軸）
export function bizDayParts(reservedAt: Date, cutoffHm = "06:00"): { dow: number; minutes: number } {
  const jst = new Date(reservedAt.getTime() + 9 * 3600_000);
  const minutesOfDay = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const isLate = minutesOfDay < hm2min(cutoffHm);            // cutoff 前＝前営業日の深夜帯
  const bizDate = new Date(jst.getTime() - (isLate ? 24 * 3600_000 : 0));
  return { dow: bizDate.getUTCDay(), minutes: minutesOfDay + (isLate ? 1440 : 0) };
}

export function businessHoursStatus(
  reservedAt: Date, rows: BusinessHourRow[], cutoffHm = "06:00",
): { status: HoursStatus; row: BusinessHourRow | null; dow: number } {
  const { dow, minutes } = bizDayParts(reservedAt, cutoffHm);
  const row = rows.find((r) => r.dow === dow) ?? null;
  if (!row) return { status: "unset", row: null, dow };
  if (row.is_closed) return { status: "closed", row, dow };
  const open = hm2min(row.open_hm ?? "00:00");
  const close = hm2min(row.close_hm ?? "00:00");
  return { status: open <= minutes && minutes < close ? "inside" : "outside", row, dow };
}

// 営業時間の表示（24h超表記は「翌HH:MM」へ・例 20:00-30:00 → 「20:00-翌06:00」）
export function fmtHoursLabel(row: BusinessHourRow): string {
  if (row.is_closed || !row.open_hm || !row.close_hm) return "定休日";
  const close = hm2min(row.close_hm);
  return `${row.open_hm}-${close >= 1440 ? `翌${min2hm(close - 1440)}` : row.close_hm}`;
}
