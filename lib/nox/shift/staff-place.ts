// ★夜間便 N6（便 S の再開・裁定287-1・2026-09-18）: 黒服シフトの配置フロー（日付→人／人→日付）の純関数（DB を知らない）。
//   写経元＝キャスト側の DayAddPanel（日付起点）と ShiftAddForm（キャスト起点）。型は staff-shift-board の Wish／StaffShift と同形。
export type StaffWishLike = { id: string; staff_id: string; biz_date: string; pattern_id: string; available: boolean; note?: string | null };
export type StaffShiftLike = { id: string; staff_id: string; biz_date: string; pattern_id: string; start_hm: string; end_hm: string; status: string; wish_id?: string | null };
export type StaffLike = { id: string; name: string; role?: string };

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 'YYYY-MM-DD' → 'M/D(曜)'（S-3: 見出しの日付表記） */
export function mdDowOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${DOW_JA[dow]})`;
}

/** その日の ◯ 希望（available=true）だけ */
export const wishesOnDay = (wishes: readonly StaffWishLike[], day: string): StaffWishLike[] =>
  wishes.filter((w) => w.biz_date === day && w.available);

/** その人がその日に ◯ 希望を出しているか */
export const hasWish = (wishes: readonly StaffWishLike[], staffId: string, day: string): boolean =>
  wishes.some((w) => w.staff_id === staffId && w.biz_date === day && w.available);

/** その人のその日の配置行（無ければ null・複数枠なら最初の 1 行） */
export const placedOf = (shifts: readonly StaffShiftLike[], staffId: string, day: string): StaffShiftLike | null =>
  shifts.find((s) => s.staff_id === staffId && s.biz_date === day) ?? null;

export type StaffDayRow<T extends StaffLike = StaffLike> = {
  staff: T;
  /** その日の ◯ 希望（枠ごと・無ければ []） */
  wishes: StaffWishLike[];
  /** その日の配置行（無ければ null） */
  placed: StaffShiftLike | null;
};

/** S-1 左ペイン: その日に ◯ 希望を出している人を上に（希望あり→名前順・希望なし→名前順） */
export function staffRowsForDay<T extends StaffLike>(staff: readonly T[], wishes: readonly StaffWishLike[], shifts: readonly StaffShiftLike[], day: string): StaffDayRow<T>[] {
  const rows = staff.map((s) => ({
    staff: s,
    wishes: wishes.filter((w) => w.staff_id === s.id && w.biz_date === day && w.available),
    placed: placedOf(shifts, s.id, day),
  }));
  return rows.sort((a, b) => {
    const wa = a.wishes.length > 0 ? 0 : 1, wb = b.wishes.length > 0 ? 0 : 1;
    if (wa !== wb) return wa - wb;
    return a.staff.name.localeCompare(b.staff.name, "ja");
  });
}

/** S-2 カレンダー: その人の ◯ 希望の日 → 枠 id の一覧（印と枠名） */
export function wishDaysOf(wishes: readonly StaffWishLike[], staffId: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const w of wishes) if (w.staff_id === staffId && w.available) m.set(w.biz_date, [...(m.get(w.biz_date) ?? []), w.pattern_id]);
  return m;
}

/** S-2 カレンダー: その人の配置済みの日 → 行 */
export function placedDaysOf(shifts: readonly StaffShiftLike[], staffId: string): Map<string, StaffShiftLike> {
  const m = new Map<string, StaffShiftLike>();
  for (const s of shifts) if (s.staff_id === staffId && !m.has(s.biz_date)) m.set(s.biz_date, s);
  return m;
}

/** 配置フォームの既定の枠＝その人の ◯ 希望の枠（先頭）・無ければ当日有効枠の先頭 */
export function defaultPatternFor(effectivePatternIds: readonly string[], wishPatternIds: readonly string[]): string | null {
  const w = wishPatternIds.find((id) => effectivePatternIds.includes(id));
  return w ?? effectivePatternIds[0] ?? null;
}

/** propose に渡す wish_id＝その人・その日・その枠の ◯ 希望（枠が違えば null＝RPC の wish_mismatch を避ける） */
export function wishIdFor(wishes: readonly StaffWishLike[], staffId: string, day: string, patternId: string): string | null {
  return wishes.find((w) => w.staff_id === staffId && w.biz_date === day && w.pattern_id === patternId && w.available)?.id ?? null;
}

/** ★便 X2-3（2026-09-24）: time 入力（HH:MM 0〜23 時台）の開始・終了から「翌日」を自動判定＝終了 ≤ 開始なら翌日（30 時間制の end_hm＝終了＋24h）。
 *  入力が欠けていれば false（現状維持）。18:00→23:00 は false（同日）・18:00→01:00 は true・同時刻は true（0 分の枠は作らない＝RPC hm_order で拒否） */
export function nextOf30h(startHm: string | null | undefined, endHm: string | null | undefined): boolean {
  if (!startHm || !endHm || !/^\d{2}:\d{2}$/.test(startHm) || !/^\d{2}:\d{2}$/.test(endHm)) return false;
  const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  return toMin(endHm) <= toMin(startHm);
}

/** 取消（裁定287-1）: 過去の営業日は不可（ボタンを出さない）・confirmed は理由必須 */
export const canCancel = (s: StaffShiftLike, bizToday: string): boolean => s.biz_date >= bizToday;
export const cancelNeedsReason = (s: StaffShiftLike): boolean => s.status === "confirmed";

/** S-2 の状態遷移: 人を選ぶ→カレンダー・日をクリック→配置・配置後→カレンダー（続けて別の日）・戻る→カレンダー */
export type ByStaffStep = "pick" | "calendar" | "place";
export function byStaffNext(step: ByStaffStep, action: "picked" | "day" | "placed" | "back" | "cleared"): ByStaffStep {
  if (action === "cleared") return "pick";
  if (action === "picked") return "calendar";
  if (step === "calendar" && action === "day") return "place";
  if (step === "place" && (action === "placed" || action === "back")) return "calendar";
  return step;
}
