// ★便 P174 T-1（裁定390・0174 ★1＝comp_plan_slide_check 上限 10）: 売上／ポイント（件数）スライドの段数を可変（1〜10 行）。
//   DB を知らない純関数（SlideInput・plan-editor の保存前検査・suite で共用）。保存形は従来どおり [{at, wage}]（at=0 の行は送信時に除外）。
//   検査は RPC（comp_plan_slide_check＝配列・10 段まで・要素 2 キー・整数 ≥0・at 昇順 strict）と同じ条件を先回り。時給の単調増加は警告のみ。

export type SlideRow = { at: number; wage: number };

export const SLIDE_ROWS_MAX = 10;
export const SLIDE_ROWS_INITIAL = 3;

/** 表示する行＝保存済みの段（空なら初期 3 行の空欄） */
export function slideRowsOf(slide: SlideRow[] | null | undefined): SlideRow[] {
  const s = (slide ?? []).map((r) => ({ at: r.at, wage: r.wage }));
  return s.length > 0 ? s : Array.from({ length: SLIDE_ROWS_INITIAL }, () => ({ at: 0, wage: 0 }));
}

/** 送信する段＝at>0 の行だけ（従来の clean と同じ） */
export function slideToSave(rows: SlideRow[]): SlideRow[] {
  return rows.filter((r) => r.at > 0).map((r) => ({ at: r.at, wage: r.wage }));
}

/** 保存前の検査（RPC と同じ条件）。null＝OK */
export function slideErrOf(rows: SlideRow[]): string | null {
  const s = slideToSave(rows);
  if (s.length > SLIDE_ROWS_MAX) return `段は ${SLIDE_ROWS_MAX} 段までです`;
  for (const r of s) if (!Number.isInteger(r.at) || !Number.isInteger(r.wage) || r.at < 0 || r.wage < 0) return "段の値は 0 以上の整数で入れてください";
  for (let i = 1; i < s.length; i++) if (s[i].at <= s[i - 1].at) return "段の判定基準は上の段より大きくしてください（昇順・重複なし）";
  return null;
}

/** 警告（保存は止めない）＝時給が上の段より下がる段がある */
export function slideWarnOf(rows: SlideRow[]): string | null {
  const s = slideToSave(rows);
  for (let i = 1; i < s.length; i++) if (s[i].wage < s[i - 1].wage) return `${i + 1} 段目の時給が上の段より低くなっています（保存はできます）`;
  return null;
}

/** 行の追加（最大 10）＝最後の行の判定基準を少し上げた空欄 */
export function slideAddRow(rows: SlideRow[]): SlideRow[] {
  if (rows.length >= SLIDE_ROWS_MAX) return rows;
  return [...rows, { at: 0, wage: 0 }];
}

/** 行の削除（最低 1 行） */
export function slideRemoveRow(rows: SlideRow[], i: number): SlideRow[] {
  if (rows.length <= 1) return rows;
  return rows.filter((_, j) => j !== i);
}
