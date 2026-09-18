// ★裁定272-2／追補 2（案 Q・R11・2026-09-18）: 紹介料（kind='referral'）はレジの明細・合計に載せず「店負担の手当」として別掲する純関数。
//   DB（check_group_due）・check-calc.ts（groupDueFull）・receipt.ts の三面鏡と同じ除外規則を UI の明細一覧に写す＝4 面目にしない
//   （合計の権威は checks.total＝DB。ここは表示の並べ替えと Σ だけ）。
export type ReferralLineLike = { kind: string; line_total: number };

/** 明細一覧に出す行＝紹介料を除く（合計の鏡像 groupDueFull と同じ除外） */
export function detailLinesOf<T extends ReferralLineLike>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.kind !== "referral");
}

/** 紹介料の行（紹介料節の一覧・別掲の Σ の元） */
export function referralRowsOf<T extends ReferralLineLike>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.kind === "referral");
}

/** 紹介料（店負担）の合計＝合計の下に別掲する値。行が無ければ 0 */
export function referralTotalOf(lines: readonly ReferralLineLike[]): number {
  return referralRowsOf(lines).reduce((a, l) => a + l.line_total, 0);
}
