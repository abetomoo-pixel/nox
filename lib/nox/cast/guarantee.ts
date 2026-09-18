// ★夜間便 N4（裁定282-2／282-3／287-3・2026-09-18）: キャスト個別・期限つきの保証時給（cast_plan.overrides_json.guarantee=true の行）の表示用純関数。
//   DB を知らない。行は cast_plan の { valid_from, valid_to, overrides_json } をそのまま受ける（'YYYY-MM-DD'・valid_to null＝期限なし）。
export type PlanRowLike = { valid_from: string; valid_to: string | null; overrides_json?: unknown };
export type GuaranteeRow = { from: string; to: string | null; base: number };
export type GuaranteeState = {
  current: GuaranteeRow | null;   // today を含む保証行
  upcoming: GuaranteeRow | null;  // today より後に始まる最初の保証行
  history: GuaranteeRow[];        // 終了済み（to < today）・新しい順
  daysLeft: number | null;        // current の残り日数（今日を含まない・to null は null）
};

const DAY = 86_400_000;
const utc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (ymd: string, n: number): string => new Date(utc(ymd) + n * DAY).toISOString().slice(0, 10);

/** overrides_json.guarantee === true かつ base が数値の行だけを保証行として取り出す */
export function guaranteeRowsOf(rows: readonly PlanRowLike[]): GuaranteeRow[] {
  const out: GuaranteeRow[] = [];
  for (const r of rows) {
    const ov = (r.overrides_json ?? {}) as Record<string, unknown>;
    if (ov.guarantee === true && typeof ov.base === "number") out.push({ from: r.valid_from, to: r.valid_to ?? null, base: ov.base as number });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** 残り日数＝to − today（今日を含まない）。to null は null・過去は負 */
export function daysLeftOf(to: string | null, today: string): number | null {
  if (!to) return null;
  return Math.round((utc(to) - utc(today)) / DAY);
}

export function guaranteeStateOf(rows: readonly PlanRowLike[], today: string): GuaranteeState {
  const gs = guaranteeRowsOf(rows);
  const current = gs.find((g) => g.from <= today && (g.to === null || today <= g.to)) ?? null;
  const upcoming = gs.find((g) => g.from > today) ?? null;
  const history = gs.filter((g) => g.to !== null && g.to < today).reverse();
  return { current, upcoming, history, daysLeft: current ? daysLeftOf(current.to, today) : null };
}

/** 282-3／N4-2: 残りが 7 日以内（0〜7）のとき印を出す。期限切れ当日以降（残り < 0）と期限なしは出さない */
export function guaranteeBadgeOf(state: GuaranteeState, withinDays = 7): { daysLeft: number } | null {
  if (!state.current || state.daysLeft === null) return null;
  if (state.daysLeft < 0 || state.daysLeft > withinDays) return null;
  return { daysLeft: state.daysLeft };
}

/** N4-3 ホームのお知らせ用: 「保証時給がまもなく終了: 名前（あと n 日）」の行（残り 0〜7 日・名前順） */
export function guaranteeNoticesOf(items: readonly { name: string; rows: readonly PlanRowLike[] }[], today: string, withinDays = 7): { name: string; daysLeft: number; to: string }[] {
  const out: { name: string; daysLeft: number; to: string }[] = [];
  for (const it of items) {
    const st = guaranteeStateOf(it.rows, today);
    const b = guaranteeBadgeOf(st, withinDays);
    if (b && st.current?.to) out.push({ name: it.name, daysLeft: b.daysLeft, to: st.current.to });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, "ja"));
}

/** 'YYYY-MM-DD' → 'M/D' */
export const mdOf = (ymd: string): string => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
