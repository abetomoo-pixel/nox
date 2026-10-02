// ★夜間便 N6（便 S の再開・裁定287-1・2026-09-18）: スタッフシフトの配置フロー（日付→人／人→日付）の純関数（DB を知らない）。
//   写経元＝キャスト側の DayAddPanel（日付起点）と ShiftAddForm（キャスト起点）。型は staff-shift-board の Wish／StaffShift と同形。
export type StaffWishLike = { id: string; staff_id: string; biz_date: string; pattern_id: string; available: boolean; note?: string | null };
export type StaffShiftLike = { id: string; staff_id: string; biz_date: string; pattern_id: string; start_hm: string; end_hm: string; status: string; wish_id?: string | null };
export type StaffLike = { id: string; name: string; role?: string; photoUrl?: string | null }; // ★0162（裁定329・便 M5-1）: スタッフ写真の署名 URL（無ければ頭文字）

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

/** S-2 の状態遷移 → ★裁定333（便 S1・2026-10-02）: 人を選ぶ→選択画面（カレンダーで複数日を選び、枠と時刻を 1 回だけ選び、一括で配置）。配置後も選択画面に留まる（失敗した日が残る）・解除で人選びへ */
export type ByStaffStep = "pick" | "select";
export function byStaffNext(step: ByStaffStep, action: "picked" | "placed" | "cleared"): ByStaffStep {
  if (action === "cleared") return "pick";
  if (action === "picked" || action === "placed") return "select";
  return step;
}

// ── ★裁定333（便 S1）: スタッフから配置＝複数日の選択・枠と時刻は 1 回・日ごとに propose（一括 RPC は無い）──
/** その日が選べない理由（null＝選べる）。過去日・定休日・配置済み（枠を問わず）・有効な枠なし。優先順＝この順 */
export type DayBlock = "past" | "closed" | "placed" | "no_pattern";
export const DAY_BLOCK_JA: Record<DayBlock, string> = { past: "過去の営業日", closed: "定休日", placed: "配置済み", no_pattern: "有効な枠がありません" };
export function dayBlockOf(day: string, ctx: { bizToday: string; closedDows: ReadonlySet<number> | readonly number[]; placed: boolean; effectiveCount: number }): DayBlock | null {
  if (day < ctx.bizToday) return "past";
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const closed = ctx.closedDows instanceof Set ? ctx.closedDows.has(dow) : (ctx.closedDows as readonly number[]).includes(dow);
  if (closed) return "closed";
  if (ctx.placed) return "placed";
  if (ctx.effectiveCount === 0) return "no_pattern";
  return null;
}
/** クリックでトグル（昇順を保つ・重複なし） */
export function toggleDay(sel: readonly string[], day: string): string[] {
  return (sel.includes(day) ? sel.filter((d) => d !== day) : [...sel, day]).slice().sort();
}
export type PatternLike = { id: string; name: string; start_hm: string; end_hm: string };
export type PatternChoice = { name: string; days: number; sample: PatternLike };
/** 選択した日全体で選べる枠＝名前で束ねる（枠は日ごとに有効な版が違う）。days＝その名前の枠が有効な日数・sample＝先頭の日の版 */
export function patternChoicesOf(days: readonly string[], effectiveByDay: ReadonlyMap<string, readonly PatternLike[]>): PatternChoice[] {
  const out = new Map<string, PatternChoice>();
  for (const d of days) {
    for (const p of effectiveByDay.get(d) ?? []) {
      const cur = out.get(p.name);
      if (cur) cur.days++; else out.set(p.name, { name: p.name, days: 1, sample: p });
    }
  }
  return [...out.values()];
}
/** 既定の枠名＝選択日の ◯ 希望の枠名で最多（同数は先頭）・希望が無ければ全日で有効な枠の先頭・それも無ければ先頭 */
export function defaultPatternNameFor(choices: readonly PatternChoice[], days: readonly string[], wishNamesByDay: ReadonlyMap<string, readonly string[]>): string | null {
  const score = new Map<string, number>();
  for (const d of days) for (const n of wishNamesByDay.get(d) ?? []) if (choices.some((c) => c.name === n)) score.set(n, (score.get(n) ?? 0) + 1);
  let best: string | null = null, bestN = 0;
  for (const c of choices) { const n = score.get(c.name) ?? 0; if (n > bestN) { best = c.name; bestN = n; } }
  if (best) return best;
  return choices.find((c) => c.days === days.length)?.name ?? choices[0]?.name ?? null;
}
export type DayPlan = { day: string; pattern: PatternLike | null; startHm: string; endHm: string; adjusted: boolean; wishId: string | null };
/** 日ごとの投入内容＝その日に有効な同名の枠（無ければ pattern null＝失敗行）・時刻は 1 回だけ選んだ値（null＝枠の時刻のまま）・adjusted＝枠の時刻と違う（override を続けて呼ぶ） */
export function dayPlansOf(days: readonly string[], patternName: string | null, times: { startHm: string; endHm: string } | null, effectiveByDay: ReadonlyMap<string, readonly PatternLike[]>, wishes: readonly StaffWishLike[], staffId: string): DayPlan[] {
  return days.map((day) => {
    const pattern = patternName ? (effectiveByDay.get(day) ?? []).find((p) => p.name === patternName) ?? null : null;
    const startHm = times?.startHm ?? pattern?.start_hm ?? "";
    const endHm = times?.endHm ?? pattern?.end_hm ?? "";
    return { day, pattern, startHm, endHm, adjusted: !!pattern && (startHm !== pattern.start_hm || endHm !== pattern.end_hm), wishId: pattern ? wishIdFor(wishes, staffId, day, pattern.id) : null };
  });
}
export type PlaceResult = { day: string; error: string | null };
/** 一括配置の結果＝成功した日（選択から外す）と失敗した日（赤で残す・全取消はしない） */
export function partitionResults(results: readonly PlaceResult[]): { ok: string[]; failed: PlaceResult[] } {
  return { ok: results.filter((r) => r.error === null).map((r) => r.day), failed: results.filter((r) => r.error !== null) };
}
/** 配置ボタンの文言＝「N 日に配置」（0 日は disabled・文言は「配置」） */
export const placeLabelOf = (n: number, busy: boolean): string => (busy ? "配置中…" : n > 0 ? `${n} 日に配置` : "配置");
