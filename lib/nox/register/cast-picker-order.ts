// ★裁定322（2026-09-29・便 X-11-5）: レジのキャスト選択の共通の並びと表示（純関数・DB を知らない）。
//   ①接客中／場内／着卓中 → ②出勤中（in 打刻あり・out なし） → ③未出勤（シフトあり） → ④未出勤。各群は名前順。
//   ①②は「出勤中」側（バッジ）・③④は「未出勤」側（グレー＋ラベル・既定は折りたたみ「未出勤を表示（n 人）」）。
//   判定の材料（当日の punches・確定シフト・伝票の名簿）は呼び出し側が Set で渡す＝金額には一切関与しない。
//   裁定107（名前順固定）はこの裁定で置き換え＝群の中だけ名前順。
export type CastPickGroup = 1 | 2 | 3 | 4;
export type CastPickSets = {
  /** この伝票の名簿（着卓中・場内ほか種別バッジのある id を含む） */
  seatedIds?: ReadonlySet<string>;
  /** 他卓の open 伝票の名簿（接客中） */
  servingIds?: ReadonlySet<string>;
  /** 当日の最終打刻が in（in 打刻あり・out なし） */
  punchedInIds?: ReadonlySet<string>;
  /** 当日の確定シフトがある */
  shiftIds?: ReadonlySet<string>;
};
export type OrderedCast<T> = T & { group: CastPickGroup; working: boolean };

export function castPickGroupOf(id: string, s: CastPickSets): CastPickGroup {
  if (s.seatedIds?.has(id) || s.servingIds?.has(id)) return 1;
  if (s.punchedInIds?.has(id)) return 2;
  if (s.shiftIds?.has(id)) return 3;
  return 4;
}

/** 群（①→④）→ 名前順。working＝①②（出勤中側） */
export function castPickerOrder<T extends { id: string; name: string }>(casts: readonly T[], s: CastPickSets): OrderedCast<T>[] {
  return casts
    .map((c) => { const group = castPickGroupOf(c.id, s); return { ...c, group, working: group <= 2 }; })
    .sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, "ja"));
}

export const CAST_PICK_GROUP_LABEL: Record<CastPickGroup, string> = { 1: "接客中", 2: "出勤中", 3: "未出勤（シフトあり）", 4: "未出勤" };
/** 折りたたみの文言 */
export const offDutyToggleLabelOf = (n: number, open: boolean): string => (open ? `未出勤を隠す（${n} 人）` : `未出勤を表示（${n} 人）`);
