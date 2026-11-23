// ★0206（起票146 案・相談役 11/23 23:10 の ■2）: 給与の期に効く契約区分を、履歴の行（cast_employment）から選ぶ純関数。
//   決まり＝待遇プランの選び方（collect の loadMasters・裁定97）と同じ形:
//     a. 期首（periodStart）に有効な行（valid_from ≤ 期首 かつ valid_to が無いか ≥ 期首）
//     b. 無ければ、期の中で始まる最も早い行（期首 < valid_from ≤ 期末）
//     c. それも無ければ fallback（casts.employment＝今の値）＝履歴が無い人は今と同じ（未設定は null＝下流は今までどおり）
//   期首に有効な行が 2 つ以上は不正データとして throw（cast_plan と同じ・黙って片方を採らない）。
export type Employment = "委託" | "雇用";
export type EmploymentRow = { employment: Employment; validFrom: string; validTo: string | null };

export function employmentAtPeriodOf(rows: readonly EmploymentRow[], periodStart: string, periodEnd: string, fallback: Employment | null): Employment | null {
  const atStart = rows.filter((r) => r.validFrom <= periodStart && (r.validTo === null || r.validTo >= periodStart));
  if (atStart.length >= 2) throw new Error(`cast_employment: 期首時点の有効行が複数（期首=${periodStart}）`);
  if (atStart[0]) return atStart[0].employment;
  const inPeriod = rows.filter((r) => r.validFrom > periodStart && r.validFrom <= periodEnd).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  if (inPeriod[0]) return inPeriod[0].employment;
  return fallback;
}

/** cast 別の行の束から、cast 別の契約区分を作る（collect が使う形・行が無い cast は fallback） */
export function employmentByCastOf(castRows: readonly { id: string; employment: Employment | null }[], empRows: readonly ({ cast_id: string; employment: string; valid_from: string; valid_to: string | null })[], periodStart: string, periodEnd: string): Map<string, Employment | null> {
  const byCast = new Map<string, EmploymentRow[]>();
  for (const r of empRows) {
    if (r.employment !== "委託" && r.employment !== "雇用") throw new Error(`cast_employment: 区分が不正（${r.employment}）`);
    (byCast.get(r.cast_id) ?? byCast.set(r.cast_id, []).get(r.cast_id)!).push({ employment: r.employment, validFrom: r.valid_from, validTo: r.valid_to });
  }
  const out = new Map<string, Employment | null>();
  for (const c of castRows) out.set(c.id, employmentAtPeriodOf(byCast.get(c.id) ?? [], periodStart, periodEnd, c.employment ?? null));
  return out;
}
