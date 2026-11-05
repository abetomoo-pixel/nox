// ★便 E（2026-11-05・0197 用＝裁定455）: 打刻の 3 択目「打刻しない（店が勤怠を付ける）」＝settings_json.punch_mode（'punch'＝既定／'store'）の純関数（DB を知らない）。
//   1 初期設定 ⑦・マスタ › 店舗設定の 3 択（店の端末だけ／本人のスマホからも／打刻しない）＝punch_methods（self／kiosk）と punch_mode の組み合わせに写す。
//   2 'store' の店＝実働は確定シフトの時間（当欠／休みは 0・時刻の上書きがあれば punches＝従来の式）・キオスクの punch タイル／mine の打刻ボタン／スマホの打刻を出さない。
//   3 スマホのレジの柵＝確定シフトの開始 −before 〜 終了 ＋after（settings_json の 2 キー・既定 30／60）か「今日だけ許可」（register_day_grants）。
//   MIG_0197_APPLIED が false の間はどれも従来どおり（punchModeOf は常に 'punch' を返す）。
import { mig0197On } from "@/lib/nox/rules-0175/flag";
import { hm2min } from "@/lib/nox/shift-time";
import { hmLabelOf } from "@/lib/nox/time/hhmm";

export type PunchMode = "punch" | "store";
export type PunchChoice = "device" | "any" | "store";
export const PUNCH_CHOICE_OPTIONS: ReadonlyArray<readonly [PunchChoice, string]> = [["device", "店の端末（キオスク）だけ"], ["any", "本人のスマホからも"], ["store", "打刻しない（店が勤怠を付ける）"]];
export const PUNCH_CHOICE_NOTE: Record<PunchChoice, string> = {
  device: "出勤・退勤は店の端末（キオスク）で打刻します。",
  any: "店の端末のほか、本人のスマホのマイページからも打刻できます。",
  store: "キャストもスタッフも打刻しません。実働は確定シフトの時間になり、遅刻・当欠・時刻の違いは店が勤怠で直します。スマホのレジは確定シフトの時間内（前後の窓）か「今日だけ許可」で開けます。",
};
export const REGISTER_WINDOW_DEFAULT = { before: 30, after: 60 } as const;
export const REGISTER_WINDOW_MAX = 240;

/** 店設定 → punch_mode（フラグ false＝常に 'punch'） */
export function punchModeOf(settings: Record<string, unknown> | null | undefined): PunchMode {
  if (!mig0197On()) return "punch";
  return settings?.punch_mode === "store" ? "store" : "punch";
}
export const storeDecidesPunchOf = (settings: Record<string, unknown> | null | undefined): boolean => punchModeOf(settings) === "store";
/** 3 択の値 ← punch_mode＋punch_methods.self */
export function punchChoiceOf(settings: Record<string, unknown> | null | undefined, punchMethods: { self: boolean } | null | undefined): PunchChoice {
  if (punchModeOf(settings) === "store") return "store";
  return punchMethods?.self === false ? "device" : "any";
}
/** 3 択 → set_store_profile の patch（'store'＝punch_mode だけ・punch_methods は触らない／それ以外＝punch_mode 'punch'＋self の on／off・proxy／kiosk は今のまま） */
export function punchChoicePatchOf(choice: PunchChoice, cur: { self: boolean; proxy: boolean; kiosk: boolean }): Record<string, unknown> {
  if (choice === "store") return { punch_mode: "store" };
  return { punch_mode: "punch", punch_methods: { self: choice === "any", proxy: cur.proxy, kiosk: cur.kiosk } };
}
/** 窓（分）＝settings_json の 2 キー（欠損・範囲外は既定） */
export function registerWindowOf(settings: Record<string, unknown> | null | undefined): { before: number; after: number } {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= REGISTER_WINDOW_MAX ? v : d);
  return { before: n(settings?.register_window_before_min, REGISTER_WINDOW_DEFAULT.before), after: n(settings?.register_window_after_min, REGISTER_WINDOW_DEFAULT.after) };
}
export function registerWindowErrorOf(v: number): string | null { return Number.isInteger(v) && v >= 0 && v <= REGISTER_WINDOW_MAX ? null : `0〜${REGISTER_WINDOW_MAX} 分の整数で入力してください`; }
/** スマホのレジの柵の文言（打刻しない店）＝「確定シフトの時間内に開けます（20:00〜翌02:00・前 30 分・後 60 分）」／シフトが無い日＝「今日の確定シフトがありません（店長の「今日だけ許可」で開けます）」 */
export function storeRegisterWindowTextOf(shift: { start_hm: string; end_hm: string } | null, win: { before: number; after: number }): string {
  if (!shift) return "今日の確定シフトがありません（店長の「今日だけ許可」があれば開けます）";
  return `確定シフトの時間内に開けます（${hmLabelOf(shift.start_hm)}〜${hmLabelOf(shift.end_hm)}・前 ${win.before} 分・後 ${win.after} 分）`;
}
/** 今（営業時計の分）が窓の中か＝on_duty_of の 'store' 分岐と同じ式（client の表示用・真の防御は RPC） */
export function inRegisterWindowOf(shift: { start_hm: string; end_hm: string } | null, win: { before: number; after: number }, nowBizMin: number): boolean {
  if (!shift) return false;
  return nowBizMin >= hm2min(shift.start_hm) - win.before && nowBizMin <= hm2min(shift.end_hm) + win.after;
}
export const PUNCH_STORE_OFF_NOTE = "この店では出勤・退勤を店が記録します（打刻はありません）";
export const OFF_DUTY_TEXT_STORE = "確定シフトの時間内（前後の窓）か、店長の「今日だけ許可」でレジを開けます";
/** 営業時計の今（分・0〜47 時）＝JST の時刻が cutoff より前なら +24h */
export function bizNowMinOf(nowMs: number, cutoffHm: string): number {
  const d = new Date(nowMs + 9 * 3600_000); const h = d.getUTCHours(), m = d.getUTCMinutes();
  const cut = hm2min(cutoffHm);
  const cur = h * 60 + m;
  return cur < cut ? cur + 24 * 60 : cur;
}
export const REGISTER_DAY_GRANT_LABEL = "今日だけ許可";
export const REGISTER_DAY_GRANT_NOTE = "確定シフトの時間外でも、この営業日だけスマホのレジを開けます（取り消せます）。";

/** 実働（打刻しない店）＝その日の打刻があれば従来の式（店の時刻の上書き）・無ければ確定シフトの時間（当欠／休み／未来日は 0） */
export function storeModeHoursOf(input: { rawHours: number; shiftHours: number | undefined; attStatus: string | null | undefined; future: boolean }): number {
  if (input.rawHours > 0) return input.rawHours;
  if (input.future || input.shiftHours === undefined) return 0;
  if (input.attStatus === "absent" || input.attStatus === "off") return 0;
  return input.shiftHours;
}
/** 打刻しない店の区分＝勤怠（attendance）の記録だけで決める（打刻の有無は見ない） */
export function storeModeFinalOf(attStatus: string | null | undefined, hasShift: boolean): "ok" | "late" | "absent" | "no_shift" {
  if (!hasShift) return "no_shift";
  if (attStatus === "absent" || attStatus === "off") return "absent";
  if (attStatus === "late") return "late";
  return "ok";
}
