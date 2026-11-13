// ★便 W-10 #10（2026-10-26・0186）: 特別営業日・臨時休業の純関数（DB を知らない）。
export type SpecialDay = { day: string; kind: "closed" | "open"; open_hm: string | null; close_hm: string | null; note: string | null; /** ★0201d: 臨時営業の料金の曜日（0＝日..6＝土・null＝その日の曜日） */ price_dow?: number | null };
/** ★0201d: 曜日の名前（0＝日..6＝土＝store_business_hours.dow と同じ） */
export const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
/** ★0201d: 料金の曜日の 1 句「土曜の料金」（null は空） */
export const priceDowLabelOf = (d: number | null | undefined): string => (d === null || d === undefined || d < 0 || d > 6 ? "" : `${DOW_JA[d]}曜の料金`);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const hm47 = (hm: string | null) => { if (!hm) return "—"; const h = Number(hm.slice(0, 2)); return h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${hm.slice(3, 5)}` : hm.slice(0, 5); };
/** 一覧の 1 行「12/31 臨時休業（年末年始）」「1/1 特別営業 19:00〜翌02:00」 */
export function specialDayLineOf(r: SpecialDay): string {
  const pd = r.kind === "open" ? priceDowLabelOf(r.price_dow) : ""; // ★0201d: 「料金＝土曜と同じ」
  const head = r.kind === "closed" ? "臨時休業" : `特別営業 ${hm47(r.open_hm)}〜${hm47(r.close_hm)}${pd ? `・料金＝${DOW_JA[r.price_dow as number]}曜と同じ` : ""}`;
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

// ═══ ★0201d（裁定478・2026-11-13）: 開卓のときの臨時営業の問い（文は相談役の固定） ═══
export const SPECIAL_OPEN_ASK = "今日は定休日です。臨時営業にしますか？";
export const SPECIAL_OPEN_DOW_ASK = "料金は何曜日と同じにしますか？";
export const SPECIAL_OPEN_STAFF = "今日は定休日です。店長に臨時営業の設定を頼んでください。";
export const SPECIAL_CLOSED_NOTE = "今日は臨時休業です。";
/** check_open の失敗 → 開卓のモーダルで出すもの（ask＝店長以上に問う・note＝案内だけ・null＝この便の対象外） */
export function specialOpenStepOf(errMsg: string | null | undefined, isManagerUp: boolean): { kind: "ask"; closed: boolean } | { kind: "note"; text: string } | null {
  const m = (errMsg ?? "").trim();
  if (m === "needs special open") return isManagerUp ? { kind: "ask", closed: false } : { kind: "note", text: SPECIAL_OPEN_STAFF };
  if (m === "closed day") return isManagerUp ? { kind: "ask", closed: true } : { kind: "note", text: SPECIAL_CLOSED_NOTE };
  return null;
}
/** 料金の曜日の候補＝定休でない曜日（営業時間の行が無い曜日は営業として出す＝DB の is_closed の既定 false と同じ）・既定の選択なし */
export function priceDowChoicesOf(hours: readonly { dow: number; is_closed: boolean }[]): number[] {
  const closed = new Set(hours.filter((h) => h.is_closed).map((h) => h.dow));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.has(d));
}
