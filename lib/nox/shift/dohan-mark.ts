// ★便 PR-1 R-4（裁定417・2026-10-23）: 同伴の正本＝伝票（check_nominations.is_dohan）。シフト側の attendance.status 'dohan' は撤去（0175 v2）。
//   今日タブ・/mine は「その営業日・そのキャストに同伴の名簿行がある伝票」を読んで「同伴（A2）」の印を出し、遅刻判定は同伴があれば免除。
//   純関数・DB を知らない（読取は呼び出し側）。
export type DohanNomRow = { cast_id: string; seat_name?: string | null; ended_at?: string | null; check_status?: string | null };

/** cast_id → その営業日に同伴がある伝票の席名（void は除く・退席済みでも同伴は残る＝来店の事実）。重複席は 1 つに */
export function dohanSeatsOf(rows: DohanNomRow[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (r.check_status === "void") continue;
    const list = m.get(r.cast_id) ?? [];
    const name = (r.seat_name ?? "").trim();
    if (name && !list.includes(name)) list.push(name);
    if (!m.has(r.cast_id)) m.set(r.cast_id, list);
  }
  return m;
}

/** 印の文言＝「同伴（A2）」・複数卓は「同伴（A2・B1）」・席名が無ければ「同伴」 */
export function dohanMarkTextOf(seats: string[] | undefined | null): string {
  const s = (seats ?? []).filter(Boolean);
  return s.length ? `同伴（${s.join("・")}）` : "同伴";
}

export const DOHAN_LATE_EXEMPT_NOTE = "同伴のため遅刻扱いなし";

/** 遅刻の表示＝同伴の営業日は免除（出勤記録は実時刻のまま・印に注記） */
export function lateExemptByDohanOf(lateMin: number | null | undefined, hasDohan: boolean): { late: boolean; note: string | null } {
  if (hasDohan) return { late: false, note: (lateMin ?? 0) > 0 ? DOHAN_LATE_EXEMPT_NOTE : null };
  return { late: (lateMin ?? 0) > 0, note: null };
}

/**
 * 給与・勤怠一覧の入力（attendance の行）に同伴の営業日を重ねる＝その日の status を 'dohan'（punch-match の applyAttendance で late を打ち消す値）に。
 * attendance の行が無い日は行を足す。absent／off はそのまま（同伴で当欠が消えることはない）。
 */
export function attendanceWithDohanOf<T extends { date: string; status: string }>(att: T[], dohanDates: Set<string>, make: (date: string) => T): T[] {
  const out = att.map((a) => (dohanDates.has(a.date) && (a.status === "shukkin" || a.status === "late") ? { ...a, status: "dohan" } : a));
  const have = new Set(out.map((a) => a.date));
  for (const d of dohanDates) if (!have.has(d)) out.push({ ...make(d), status: "dohan" });
  return out;
}
