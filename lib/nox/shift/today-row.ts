// ★便 AT2（2026-09-24・週末バックログ 1）: /shift 今日タブの行＝退勤ボタンの出し分けと出退勤時刻の表示文字列（純関数・DB を知らない）。
//   仮決め（docs/tmp/0924_at_decisions.md）: 時刻は punches（実打刻）だけから作る。attendance（出勤／遅刻／同伴＝区分）は時刻を持たないため、
//   打刻の無い行は区分だけを出し偽の時刻は作らない。退勤ボタンは「出勤区分が押された行」に出し、in 打刻が無ければ押せない（orphan_out を作らない＝裁定257 R20-b）。
export type AttStatus = "shukkin" | "dohan" | "late" | "off" | "absent";

/** 出勤区分（出勤・遅刻・同伴）＝店に来る区分。休み・当欠・未記録は false */
export const isArrivedStatus = (status: string | null | undefined): boolean => status === "shukkin" || status === "late" || status === "dohan";

/** 退勤ボタンを出すか・押せるか（canRecord＝manager 以上かつ表示日が今日） */
export function outButtonOf(input: { canRecord: boolean; attStatus: string | null | undefined; hasIn: boolean; hasOut: boolean }): { show: boolean; enabled: boolean; title: string } {
  if (!input.canRecord || !isArrivedStatus(input.attStatus)) return { show: false, enabled: false, title: "" };
  if (input.hasOut) return { show: true, enabled: false, title: "退勤は記録済みです（訂正・削除はできません）" };
  if (!input.hasIn) return { show: true, enabled: false, title: "出勤（in）の打刻がありません（キオスクまたは本人の打刻が必要です）" };
  return { show: true, enabled: true, title: "退勤を代理で打刻します（訂正・削除はできません）" };
}

/** 出退勤時刻の表示: in のみ→「出勤 HH:MM」・in と out→「HH:MM → HH:MM」・打刻なし→null（区分のみ表示＝偽の時刻を作らない）。out のみ（orphan）は「退勤 HH:MM」 */
export function punchTimeLabel(inHm: string | null | undefined, outHm: string | null | undefined): string | null {
  if (inHm && outHm) return `${inHm} → ${outHm}`;
  if (inHm) return `出勤 ${inHm}`;
  if (outHm) return `退勤 ${outHm}`;
  return null;
}

/** ISO timestamptz → 'HH:MM'（JST・表示専用） */
export function hmJstOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** 表示日の punches（時刻昇順）→ cast ごとの最初の in／最後の out（punch-match と同じ採用規則＝S1） */
export function firstInLastOut(rows: readonly { cast_id: string; type: "in" | "out"; punched_at: string }[]): Map<string, { inHm: string | null; outHm: string | null }> {
  const m = new Map<string, { inHm: string | null; outHm: string | null }>();
  const sorted = [...rows].sort((a, b) => Date.parse(a.punched_at) - Date.parse(b.punched_at));
  for (const p of sorted) {
    const e = m.get(p.cast_id) ?? { inHm: null, outHm: null };
    if (p.type === "in") { if (e.inHm === null) e.inHm = hmJstOf(p.punched_at); }
    else e.outHm = hmJstOf(p.punched_at);
    m.set(p.cast_id, e);
  }
  return m;
}
