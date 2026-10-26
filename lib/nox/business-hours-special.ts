// ★便 W-10 #10（2026-10-26・0186）: 特別営業日・臨時休業の純関数（DB を知らない）。
export type SpecialDay = { day: string; kind: "closed" | "open"; open_hm: string | null; close_hm: string | null; note: string | null };
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const hm47 = (hm: string | null) => { if (!hm) return "—"; const h = Number(hm.slice(0, 2)); return h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${hm.slice(3, 5)}` : hm.slice(0, 5); };
/** 一覧の 1 行「12/31 臨時休業（年末年始）」「1/1 特別営業 19:00〜翌02:00」 */
export function specialDayLineOf(r: SpecialDay): string {
  const head = r.kind === "closed" ? "臨時休業" : `特別営業 ${hm47(r.open_hm)}〜${hm47(r.close_hm)}`;
  return `${md(r.day)} ${head}${r.note ? `（${r.note}）` : ""}`;
}
/** 入力の検査（RPC の鏡）＝日付必須・特別営業は開店（0〜23 時）と閉店（開店より後・47:59 まで） */
export function specialDayErrorOf(v: { day: string; kind: "closed" | "open"; open_hm: string; close_hm: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return "日付を選んでください";
  if (v.kind === "closed") return null;
  const re = /^(\d{2}):(\d{2})$/;
  const a = re.exec(v.open_hm), b = re.exec(v.close_hm);
  if (!a || !b) return "時刻は「20:00」の形で入力してください（翌日は 26:00）";
  const s = Number(a[1]) * 60 + Number(a[2]), e = Number(b[1]) * 60 + Number(b[2]);
  if (Number(a[1]) > 23 || Number(a[2]) > 59 || Number(b[2]) > 59 || Number(b[1]) > 47) return "時刻の範囲が正しくありません";
  if (e <= s) return "閉店は開店より後にしてください（翌日は 26:00 の形）";
  return null;
}
/** シフト・予約の定休日判定（SQL の鏡）＝特別日があればそれ（closed＝休み・open＝営業）・無ければ曜日の設定 */
export const isClosedDayOf = (special: SpecialDay | null | undefined, weekdayClosed: boolean): boolean => (special ? special.kind === "closed" : weekdayClosed);
