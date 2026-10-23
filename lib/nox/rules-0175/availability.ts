// ★便 P175-prep P-4（裁定397＋413・I-2 ③(a)(b)・0175 v2 ★9 availability／availability_terms）: 基本の働き方の純関数。
//   曜日ごと 可／不可／相談＋時間帯（分・翌日またぎ）・週の出勤日数の目安・固定休・適用開始日。雇用キャストの時間帯は店のみ。
//   希望提出の既定値（その曜日の時間帯）・固定休と矛盾する希望の注意の印。フラグ false のとき UI は出ず、既定値も従来（20:00〜26:00）。
export type Avail = "ok" | "ng" | "ask";
export type AvailRow = { dow: number; avail: Avail; from_min: number | null; to_min: number | null; memo: string | null };
export type AvailTerms = { week_days_target: number | null; fixed_off_dows: number[]; effective_from: string | null; memo: string | null };
export type AvailForm = { rows: AvailRow[]; terms: AvailTerms };
export const AVAIL_LABEL: Record<Avail, string> = { ok: "可", ng: "不可", ask: "相談" };
export const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const emptyAvailForm = (): AvailForm => ({ rows: Array.from({ length: 7 }, (_, dow) => ({ dow, avail: "ok", from_min: null, to_min: null, memo: null })), terms: { week_days_target: null, fixed_off_dows: [], effective_from: null, memo: null } });

/** DB の行（無い曜日＝制限なし＝可）と terms → フォーム */
export function availFormOf(rows: readonly Partial<AvailRow>[] | null | undefined, terms: Partial<AvailTerms> | null | undefined): AvailForm {
  const f = emptyAvailForm();
  for (const r of rows ?? []) { if (typeof r.dow === "number" && r.dow >= 0 && r.dow <= 6) f.rows[r.dow] = { dow: r.dow, avail: (r.avail as Avail) ?? "ok", from_min: r.from_min ?? null, to_min: r.to_min ?? null, memo: r.memo ?? null }; }
  if (terms) f.terms = { week_days_target: terms.week_days_target ?? null, fixed_off_dows: [...(terms.fixed_off_dows ?? [])].sort(), effective_from: terms.effective_from ?? null, memo: terms.memo ?? null };
  // 固定休＝その曜日は不可（413 追補1＝固定休は曜日の「不可」）
  for (const d of f.terms.fixed_off_dows) if (f.rows[d]) f.rows[d] = { ...f.rows[d], avail: "ng" };
  return f;
}

/** フォーム → availability_set の引数（p_rows＝7 行・p_terms） */
export function availPatchOf(f: AvailForm): { p_rows: AvailRow[]; p_terms: AvailTerms } {
  return { p_rows: f.rows.map((r) => ({ ...r, from_min: r.avail === "ng" ? null : r.from_min, to_min: r.avail === "ng" ? null : r.to_min, memo: r.memo && r.memo.trim() ? r.memo.trim().slice(0, 200) : null })), p_terms: { ...f.terms, fixed_off_dows: f.rows.filter((r) => r.avail === "ng").map((r) => r.dow) } };
}

const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** 希望提出の既定値＝その曜日の基本の時間帯（無ければ呼び出し側の既定 20:00〜26:00）。不可の曜日は null（提出の対象外） */
export function wishDefaultOf(f: AvailForm | null | undefined, dow: number, fallback: { start: string; end: string }): { start: string; end: string } | null {
  const r = f?.rows[dow]; if (!r) return fallback;
  if (r.avail === "ng") return null;
  if (r.from_min !== null && r.to_min !== null) return { start: hm(r.from_min), end: hm(r.to_min) };
  return fallback;
}
/** 固定休（不可）の日に出勤希望を出そうとしている＝注意の印（提出は止めない） */
export function fixedOffConflictOf(f: AvailForm | null | undefined, ymd: string): string | null {
  if (!f) return null; const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return f.rows[dow]?.avail === "ng" ? `${DOW_JA[dow]}曜は基本の働き方で「不可（固定休）」です` : null;
}
/** 雇用キャストの時間帯は店のみ編集可（本人は表示と「変更を希望する」のメモ） */
export const canEditTimeOf = (employment: string | null | undefined, bySelf: boolean): boolean => !(bySelf && employment === "雇用");
/** 一覧カードの曜日チップ＝「月火水 可／木 相談／金土日 不可」 */
export function availChipsOf(f: AvailForm): string {
  const g = (a: Avail) => f.rows.filter((r) => r.avail === a).map((r) => DOW_JA[r.dow]).join("");
  return [g("ok") && `${g("ok")} 可`, g("ask") && `${g("ask")} 相談`, g("ng") && `${g("ng")} 不可`].filter(Boolean).join("／");
}
