// ★2026-11-18 夜 2（相談役 ①）: 日報の「締め確定」で締められないときの窓（中央）の文言＝純関数。
//   理由は押した時点の未会計の件数（daily_report_close の 'open checks remain' と同じ open の伝票）と実査（数えた現金）の未入力。
//   強行（p_force）は窓の「未会計のまま締める」だけ＝店長・オーナー（旧「未会計があっても強行」のチェックは外した）。
export type CloseGuard = { openN: number; countedMissing: boolean };

export const closeGuardTitleOf = (g: CloseGuard): string => (g.openN > 0 ? "まだ締められません" : "実査が未入力です");

export function closeGuardReasonsOf(g: CloseGuard): string[] {
  return [
    ...(g.openN > 0 ? [`未会計の伝票が ${g.openN} 件あります`] : []),
    ...(g.countedMissing ? ["実査（数えた現金）が未入力です。このまま締めますか"] : []),
  ];
}

/** ボタンのすぐ上の 1 行（押す前から） */
export const closeBlockedLineOf = (openN: number): string => `未会計 ${openN} 件のため、このままでは締められません`;
