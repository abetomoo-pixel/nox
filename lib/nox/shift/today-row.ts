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

/** ★便 AY1（2026-09-24・裁定291 追補1 A-3）: 出勤区分を押したあとに punch_proxy('in') を呼ぶか。
 *  出勤区分（出勤・遅刻・同伴）で、同営業日に in 打刻が無いときだけ true。休み・当欠は false。既に in があれば区分の変更で増やさない。 */
export const punchInAfterAtt = (input: { status: string | null | undefined; hasIn: boolean }): boolean => isArrivedStatus(input.status) && !input.hasIn;

/** ★裁定353（便 N1014 A-2）: キャストカードの「今日の状態」1 行＝今日タブと同じ材料（確定シフトの時間・出勤区分 attendance・最初の in／最後の out＝firstInLastOut／punchTimeLabel）から導く。
 *   予定なし／出勤予定 HH:MM〜翌HH:MM／出勤中 HH:MM〜（予定 翌HH:MM）／退勤 HH:MM〜HH:MM／未出勤 HH:MM 予定／休み希望・当欠（attendance off／absent）。
 *   「〜翌HH:MM」＝end_hm が 24:00 以上なら翌日表記（fmtWin と同じ読み替え・24 を引く）。now は使わない（判定は材料の有無だけ＝今日タブと同じ） */
export type TodayState = { key: "none" | "planned" | "working" | "done" | "absentPlanned" | "off" | "absent"; label: string };
const hmNext = (hm: string | null | undefined): string => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${String(m).padStart(2, "0")}` : hm; };
export function todayStateOf(input: { shift: { start_hm: string; end_hm: string; status: string } | null; attStatus: string | null | undefined; inHm: string | null; outHm: string | null }): TodayState {
  const { shift, attStatus, inHm, outHm } = input;
  if (attStatus === "off") return { key: "off", label: "休み希望" };
  if (attStatus === "absent") return { key: "absent", label: "当欠" };
  if (inHm && outHm) return { key: "done", label: `退勤 ${punchTimeLabel(inHm, outHm) ?? `${inHm}〜${outHm}`}` };
  if (inHm) return { key: "working", label: `出勤中 ${inHm}〜${shift ? `（予定 ${hmNext(shift.end_hm)}）` : ""}` };
  if (shift && shift.status === "confirmed") return { key: isArrivedStatus(attStatus) ? "planned" : "absentPlanned", label: isArrivedStatus(attStatus) ? `出勤予定 ${shift.start_hm}〜${hmNext(shift.end_hm)}` : `未出勤 ${shift.start_hm} 予定` };
  if (shift) return { key: "planned", label: `出勤予定 ${shift.start_hm}〜${hmNext(shift.end_hm)}（${shift.status === "proposed" ? "確認待ち" : "予定"}）` };
  return { key: "none", label: "予定なし" };
}
/** ★裁定357（GV-5・便 N1014 A-6）: 今日タブの「送り」＝送り実費の店で、出勤区分の行かつ in 打刻あり・**退勤後も営業日の終了まで有効**。disabled は「方式が実費でない」「当日発行済み」のみ（out 済みでは止めない） */
export function okuriButtonOf(input: { canRecord: boolean; okuriActual: boolean; attStatus: string | null | undefined; hasIn: boolean; issuedToday: boolean }): { show: boolean; enabled: boolean; title: string } {
  if (!input.canRecord || !input.okuriActual) return { show: false, enabled: false, title: "送りの方式が実費の店だけ発行できます" };
  if (!isArrivedStatus(input.attStatus)) return { show: true, enabled: false, title: "出勤（出勤・遅刻・同伴）を記録すると押せます" };
  if (input.issuedToday) return { show: true, enabled: false, title: "本日の送りは発行済みです（訂正は時刻修正と同じ扱い＝理由必須）" };
  if (!input.hasIn) return { show: true, enabled: false, title: "出勤（in）の打刻がありません" };
  return { show: true, enabled: true, title: "送り実費を発行します（退勤後でも営業日内は発行できます）" };
}
/** ★裁定357: 「退勤」を押したときにダイアログ（送りを発行して退勤／退勤のみ）を出すか＝実費の店で当日未発行のときだけ。実費以外の店はダイアログなし */
export const outDialogNeeded = (input: { okuriActual: boolean; issuedToday: boolean }): boolean => input.okuriActual && !input.issuedToday;

/** 「今日出勤」フィルタ＝確定シフトあり／出勤中／退勤 */
export const isTodayWorking = (s: TodayState): boolean => s.key === "planned" || s.key === "working" || s.key === "done" || s.key === "absentPlanned";
